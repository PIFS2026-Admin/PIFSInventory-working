import json
import math
import re
import sys

import pdfplumber


GRADE_ALIASES = {
    "E": "E-75",
    "X": "X-95",
    "G": "G-105",
    "G105": "G-105",
    "G-105": "G-105",
    "S": "S-135",
    "S135": "S-135",
    "S-135": "S-135",
    "V150": "V-150",
    "V150TM": "V-150",
    "V-150": "V-150",
}

PROPRIETARY_TABLES = [
    ("3.7.2", "Grant Prideco HI TORQUE", 167, 170, 15),
    ("3.7.3", "Grant Prideco eXtreme Torque", 171, 174, 15),
    ("3.7.4", "Grant Prideco eXtreme Torque-M", 175, 177, 14),
    ("3.7.5", "Grant Prideco Double Shoulder", 178, 180, 15),
    ("3.7.6", "Grant Prideco TurboTorque", 181, 183, 15),
    ("3.7.7", "Grant Prideco TurboTorque-M", 184, 186, 14),
    ("3.7.8", "Grant Prideco uXT", 187, 188, 15),
    ("3.7.9", "Grant Prideco uGPDS", 189, 190, 15),
    ("3.7.10", "Grant Prideco Express", 191, 192, 14),
    ("3.7.11", "Grant Prideco EIS", 193, 194, 14),
    ("3.7.12", "Grant Prideco TM2", 195, 195, 13),
    ("3.7.13", "Grant Prideco Delta", 196, 198, 15),
    ("3.7.14", "Grant Prideco X-Force", 199, 201, 14),
    ("3.7.16", "Hilong HLIDS", 205, 207, 17),
    ("3.7.17", "Hilong HLMT", 208, 209, 17),
    ("3.7.18", "Hilong HLST", 210, 213, 17),
    ("3.7.19", "Hilong HLIST", 214, 216, 17),
    ("3.7.21", "DP-Master DPM-DS", 220, 221, 15),
    ("3.7.22", "DP-Master DPM-MT", 222, 225, 15),
    ("3.7.23", "DP-Master DPM-ST", 226, 227, 15),
    ("3.7.24", "DP-Master DPM-HighTorque", 228, 228, 15),
    ("3.7.25", "Command Tubular CET", 229, 232, 15),
]


def lines(page):
    words = page.extract_words(x_tolerance=1, y_tolerance=2, keep_blank_chars=False)
    grouped = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        if not grouped or abs(grouped[-1][0]["top"] - word["top"]) > 1.8:
            grouped.append([word])
        else:
            grouped[-1].append(word)
    return grouped


def cell(row, low, high):
    return " ".join(word["text"] for word in row if low <= (word["x0"] + word["x1"]) / 2 < high).strip()


def cells(row, centers):
    boundaries = [-math.inf] + [(left + right) / 2 for left, right in zip(centers, centers[1:])] + [math.inf]
    return [cell(row, boundaries[index], boundaries[index + 1]) for index in range(len(centers))]


def number(value):
    text = value.strip().replace("–", "-").replace("—", "-")
    if not text or text.upper() in {"N/A", "NA", "--"} or "NOTE" in text.upper():
        return None
    if " - " in text:
        return None
    match = re.fullmatch(r"(-?\d+)\s+(\d+)/(\d+)", text)
    if match:
        whole, numerator, denominator = map(int, match.groups())
        return whole + numerator / denominator
    match = re.fullmatch(r"(-?\d+)/(\d+)", text)
    if match:
        numerator, denominator = map(int, match.groups())
        return numerator / denominator
    try:
        return float(text)
    except ValueError:
        return None


def normalized_size(value):
    value = re.sub(r"\s+", " ", value.strip())
    parsed = number(value)
    if parsed is None:
        return value
    common = {
        2.375: "2-3/8",
        2.875: "2-7/8",
        3.5: "3-1/2",
        4.0: "4",
        4.5: "4-1/2",
        5.0: "5",
        5.5: "5-1/2",
        5.875: "5-7/8",
        6.625: "6-5/8",
    }
    return common.get(round(parsed, 3), value.replace(" ", "-"))


def identity_measure(value):
    match = re.match(r"^\s*(\d+\s+\d+/\d+|\d+(?:\.\d+)?)", value)
    return match.group(1) if match else ""


def normalized_grade(value):
    compact = value.upper().replace("™", "TM").replace("®", "").replace(" ", "")
    if compact == "G105/HL105AS":
        return "G105 / HL105AS"
    if compact == "S135/HL135AS":
        return "S135 / HL135AS"
    return GRADE_ALIASES.get(compact, re.sub(r"\s+", " ", value.strip()))


def split_connection_grade(row, left):
    prefix_words = [word for word in row if 95 <= (word["x0"] + word["x1"]) / 2 < left]
    prefix = " ".join(word["text"] for word in prefix_words).strip()
    grade_patterns = [
        r"G105\s*/\s*HL105AS", r"S135\s*/\s*HL135AS",
        r"DPM\s+150", r"DPM\s+140", r"V-?150(?:™)?", r"SS-105", r"G-?105", r"S-?135",
        r"HL95SS", r"HL105SS", r"HL105AS", r"HL120S", r"HL135AS", r"[EXGS]",
    ]
    for pattern in grade_patterns:
        match = re.search(rf"(?:^|\s)({pattern})$", prefix, flags=re.IGNORECASE)
        if match:
            grade = normalized_grade(match.group(1))
            connection = prefix[:match.start(1)].strip(" /-")
            return connection, grade
    return prefix, ""


def infer_numeric_centers(document, first_page, last_page, value_count):
    candidates = []
    for page_index in range(first_page, last_page + 1):
        for row in lines(document.pages[page_index]):
            numeric_words = [
                word for word in row
                if re.fullmatch(r"-?\d+(?:\.\d+)?", word["text"]) and word["x0"] > 150
            ]
            if len(numeric_words) < value_count:
                continue
            candidate = numeric_words[-value_count:]
            candidate_centers = [(word["x0"] + word["x1"]) / 2 for word in candidate]
            gaps = [right - left for left, right in zip(candidate_centers, candidate_centers[1:])]
            if gaps and min(gaps) > 12:
                candidates.append(candidate_centers)
    if not candidates:
        raise ValueError(f"Could not infer {value_count} numeric columns from PDF pages {first_page + 1}-{last_page + 1}.")
    return candidates[0]


def grade_rank(value):
    compact = value.upper().replace(" ", "")
    ranks = {
        "E-75": 0, "X-95": 1, "G-105": 2, "S-135": 3, "V-150": 4,
        "HL95SS": 0, "HL105SS": 1, "G105/HL105AS": 2, "HL120S": 3, "S135/HL135AS": 4,
        "SS-105": 0, "DPM140": 4, "DPM150": 5,
    }
    return ranks.get(compact, 0)


def extract_tubes(document):
    page = document.pages[161]
    centers = [75, 116, 156, 197, 242, 278, 314, 357, 393, 429, 472, 508, 544, 590, 630, 678, 718]
    current_size = ""
    carried = {}
    result = []
    for row in lines(page):
        values = cells(row, centers)
        weight = number(values[1])
        if weight is None or number(values[3]) is None:
            continue
        if values[0]:
            current_size = normalized_size(values[0])
            carried = {}
        if current_size not in {"2-3/8", "2-7/8", "3-1/2", "4", "4-1/2", "5", "5-1/2", "5-7/8", "6-5/8"}:
            continue
        for index in (5, 6, 8, 9, 11, 12):
            parsed = number(values[index])
            if parsed is not None:
                carried[index] = parsed
        result.append({
            "pipeSize": current_size,
            "weightPpf": weight,
            "nominalId": number(values[2]),
            "nominalWall": number(values[3]),
            "ultraMinWall": number(values[4]),
            "ultraOdMin": carried.get(5),
            "ultraOdMax": carried.get(6),
            "premiumMinWall": number(values[7]),
            "premiumOdMin": carried.get(8),
            "premiumOdMax": carried.get(9),
            "class2MinWall": number(values[10]),
            "class2OdMin": carried.get(11),
            "class2OdMax": carried.get(12),
            "sourceTable": "3.6.1",
        })
    return result


def extract_api_connections(document):
    centers = [74, 119, 157] + [185 + 36 * index for index in range(16)]
    result = []
    current_size = ""
    current_weight = None
    block = []

    def flush():
        nonlocal block
        if current_weight is not None:
            for item in block:
                item["weightPpf"] = current_weight
                result.append(item)
        block = []

    for page_index in range(163, 167):
        for row in lines(document.pages[page_index]):
            values = cells(row, centers)
            grade = normalized_grade(values[2])
            numeric = [number(value) for value in values[3:]]
            if sum(value is not None for value in numeric) < 13 or not grade:
                continue
            size_or_weight = values[0]
            parsed_identity = number(size_or_weight)
            if size_or_weight and ("/" in size_or_weight or (parsed_identity is not None and parsed_identity in {4.0, 5.0})):
                flush()
                current_size = normalized_size(size_or_weight)
                current_weight = None
            elif parsed_identity is not None:
                current_weight = parsed_identity
                for item in block:
                    item["weightPpf"] = current_weight
            connection = re.sub(r"\s+", " ", values[1]).strip()
            if not current_size or not connection:
                continue
            block.append({
                "pipeSize": current_size,
                "weightPpf": current_weight,
                "connection": connection,
                "grade": grade,
                "values": numeric,
                "schema": "api",
                "sourceTable": "3.7.1",
            })
    flush()
    return result


def extract_dstj_connections(document):
    centers = [70, 120, 175, 218, 262, 304, 353, 401, 445, 488, 536, 590, 630, 666, 708]
    result = []
    current_size = ""
    current_weight = None
    block = []

    def flush():
        nonlocal block
        if current_weight is not None:
            for item in block:
                item["weightPpf"] = current_weight
                result.append(item)
        block = []

    for page_index in range(202, 205):
        for row in lines(document.pages[page_index]):
            values = cells(row, centers)
            numeric = [number(value) for value in values[3:]]
            grade = normalized_grade(values[2])
            if sum(value is not None for value in numeric) < 12 or not grade:
                continue
            identity = identity_measure(values[0])
            parsed_identity = number(identity)
            if identity and ("/" in identity or parsed_identity in {4.0, 5.0}):
                flush()
                current_size = normalized_size(identity)
                current_weight = None
            elif parsed_identity is not None:
                current_weight = parsed_identity
                for item in block:
                    item["weightPpf"] = current_weight
            connection = re.sub(r"\s+", " ", values[1]).strip()
            if current_size and connection:
                block.append({
                    "pipeSize": current_size,
                    "weightPpf": current_weight,
                    "connection": connection,
                    "grade": grade,
                    "values": numeric,
                    "schema": "api_class2",
                    "family": "NK DSTJ",
                    "sourceTable": "3.7.15",
                })
    flush()
    return result


def numeric_range(value):
    parts = re.split(r"\s+-\s+", value.strip())
    if len(parts) == 2:
        return number(parts[0]), number(parts[1])
    parsed = number(value)
    return parsed, parsed


def extract_wedge_connections(document):
    centers = [77, 135, 185, 241, 303, 357, 393, 438, 514]
    result = []
    current_size = ""
    current_weight = None
    current_connection = ""
    block = []

    def flush():
        nonlocal block
        if current_weight is not None:
            for item in block:
                item["weightPpf"] = current_weight
                result.append(item)
        block = []

    for page_index in range(217, 220):
        for row in lines(document.pages[page_index]):
            values = cells(row, centers)
            grade = normalized_grade(values[2])
            box_min, box_max = numeric_range(values[3])
            numeric = [box_min, box_max] + [number(value) for value in values[4:]]
            if sum(value is not None for value in numeric) < 6 or not grade:
                continue
            identity = identity_measure(values[0])
            parsed_identity = number(identity)
            if identity and ("/" in identity or parsed_identity in {4.0, 5.0}):
                flush()
                current_size = normalized_size(identity)
                current_weight = None
            elif parsed_identity is not None:
                current_weight = parsed_identity
                for item in block:
                    item["weightPpf"] = current_weight
            if values[1]:
                current_connection = re.sub(r"\s+", " ", values[1]).strip()
            if current_size and current_connection:
                block.append({
                    "pipeSize": current_size,
                    "weightPpf": current_weight,
                    "connection": current_connection,
                    "grade": grade,
                    "values": numeric,
                    "schema": "wedge",
                    "family": "Hydril Wedge Thread",
                    "sourceTable": "3.7.20",
                })
    flush()
    return result


def extract_reduced_tsr_connections(document):
    centers = [72, 104, 136, 171, 200, 239, 269, 305, 342, 373, 401, 439, 483, 526, 560]
    result = []
    current_size = ""
    current_weight = None
    current_connection = ""
    for page_index in range(233, 235):
        for row in lines(document.pages[page_index]):
            values = cells(row, centers)
            numeric = [number(value) for value in values[4:]]
            grade = normalized_grade(values[3])
            if sum(value is not None for value in numeric) < 9 or not grade:
                continue
            size = identity_measure(values[0])
            weight = number(identity_measure(values[1]))
            if size:
                current_size = normalized_size(size)
            if weight is not None:
                current_weight = weight
            if values[2]:
                current_connection = re.sub(r"\s+", " ", values[2]).strip()
            if current_size and current_weight is not None and current_connection:
                result.append({
                    "pipeSize": current_size,
                    "weightPpf": current_weight,
                    "connection": f"{current_connection} - Reduced TSR",
                    "grade": grade,
                    "values": numeric,
                    "schema": "reduced_tsr",
                    "family": "Premium Class-Reduced TSR",
                    "sourceTable": "3.7.26",
                })
    return result


def extract_proprietary_table(document, table_number, family, first_page, last_page, value_count):
    numeric_centers = infer_numeric_centers(document, first_page, last_page, value_count)
    left = numeric_centers[0] - (numeric_centers[1] - numeric_centers[0]) / 2
    separate_weight = table_number == "3.7.25"
    centers = ([75, 112, 150, 185] if separate_weight else [78, 128, 2 * left - numeric_centers[0]]) + numeric_centers
    data_rows = []
    identity_rows = []
    for page_index in range(first_page, last_page + 1):
        for row in lines(document.pages[page_index]):
            identity = identity_measure(cell(row, -math.inf, 95))
            identity_value = number(identity)
            if identity_value is not None and 0 < identity_value < 50 and 100 < row[0]["top"] < 530:
                identity_rows.append({"page": page_index, "top": row[0]["top"], "value": identity})
            values = cells(row, centers)
            numeric = [number(value) for value in values[4 if separate_weight else 3:]]
            if sum(value is not None for value in numeric) < value_count - 2:
                continue
            if separate_weight:
                connection_part = values[2]
                grade = normalized_grade(values[3])
            else:
                connection_part, grade = split_connection_grade(row, left)
            if not grade:
                continue
            data_rows.append({
                "page": page_index,
                "top": row[0]["top"],
            "sizeWeight": identity_measure(values[0]),
                "separateWeight": values[1] if separate_weight else "",
                "connectionPart": connection_part,
                "grade": grade,
                "values": numeric,
            })

    groups = []
    for row in data_rows:
        prior = groups[-1][-1] if groups else None
        same_page = prior and prior["page"] == row["page"]
        sequence_reset = prior and grade_rank(row["grade"]) <= grade_rank(prior["grade"])
        if not prior or not same_page or sequence_reset:
            groups.append([row])
        else:
            groups[-1].append(row)

    result = []
    current_size = ""
    current_weight = None
    for group_index, group in enumerate(groups):
        next_group = groups[group_index + 1] if group_index + 1 < len(groups) else None
        interval_end = next_group[0]["top"] - 1 if next_group and next_group[0]["page"] == group[0]["page"] else math.inf
        identities = ([group[0]["sizeWeight"], group[0]["separateWeight"]] if separate_weight else [
            item["value"] for item in identity_rows
            if item["page"] == group[0]["page"] and group[0]["top"] - 2 <= item["top"] < interval_end
        ])
        if not identities:
            identities = [item["sizeWeight"] for item in group if item["sizeWeight"]]
        identity_numbers = [number(value) for value in identities]
        identity_numbers = [value for value in identity_numbers if value is not None and 0 < value < 50]
        size_candidates = [value for value in identities if "/" in value]
        if size_candidates:
            current_size = normalized_size(size_candidates[0])
            size_value = number(size_candidates[0])
            current_weight = next((value for value in identity_numbers if size_value is None or abs(value - size_value) > 0.001), current_weight)
        elif len(identity_numbers) >= 2:
            current_size = normalized_size(str(identity_numbers[0]))
            current_weight = identity_numbers[1]
        elif identity_numbers:
            value = identity_numbers[0]
            if value > 6.7:
                current_weight = value
            elif not current_size:
                current_size = normalized_size(str(value))
        connection_parts = []
        for item in group:
            part = item["connectionPart"]
            if part and part not in connection_parts:
                connection_parts.append(part)
        connection = re.sub(r"\s+", " ", " ".join(connection_parts)).strip()
        for item in group:
            if not current_size or current_weight is None or not connection or not item["grade"]:
                continue
            result.append({
                "pipeSize": current_size,
                "weightPpf": current_weight,
                "connection": connection,
                "grade": item["grade"],
                "values": item["values"],
                "schema": "proprietary",
                "family": family,
                "sourceTable": table_number,
            })
    return result


def disambiguate_connections(records):
    grouped = {}
    for record in records:
        key = (record["pipeSize"], record["weightPpf"], record["connection"], record["grade"])
        grouped.setdefault(key, []).append(record)
    result = []
    for matches in grouped.values():
        unique = []
        signatures = set()
        for record in matches:
            signature = tuple(record["values"])
            if signature in signatures:
                continue
            signatures.add(signature)
            unique.append(record)
        if len(unique) == 1:
            result.extend(unique)
            continue
        used_names = set()
        for index, record in enumerate(unique, start=1):
            first, second = record["values"][:2]
            if record["sourceTable"] == "3.7.25":
                suffix = f"OD {first:g} / ID {second:g}"
            else:
                suffix = f"ID {first:g} / OD {second:g}"
            name = f'{record["connection"]} ({suffix})'
            if name in used_names:
                name = f"{name} Variant {index}"
            used_names.add(name)
            result.append({**record, "connection": name})
    return result


def reconcile_identities(tubes, records):
    sizes = {tube["pipeSize"] for tube in tubes}
    weight_sizes = {}
    for tube in tubes:
        weight_sizes.setdefault(round(tube["weightPpf"], 3), set()).add(tube["pipeSize"])
    result = []
    for record in records:
        if record["pipeSize"] not in sizes:
            continue
        weight = round(record["weightPpf"], 3)
        valid_sizes = weight_sizes.get(weight, set())
        if valid_sizes and record["pipeSize"] not in valid_sizes and len(valid_sizes) == 1:
            record = {**record, "pipeSize": next(iter(valid_sizes))}
        result.append(record)
    return result


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: extract-ds1-nwdp.py <Ds1.pdf>")
    with pdfplumber.open(sys.argv[1]) as document:
        tubes = extract_tubes(document)
        connections = extract_api_connections(document)
        connections.extend(extract_dstj_connections(document))
        connections.extend(extract_wedge_connections(document))
        connections.extend(extract_reduced_tsr_connections(document))
        for table in PROPRIETARY_TABLES:
            connections.extend(extract_proprietary_table(document, *table))
        connections = reconcile_identities(tubes, connections)
        connections = disambiguate_connections(connections)
    print(json.dumps({"tubes": tubes, "connections": connections}, separators=(",", ":")))


if __name__ == "__main__":
    main()
