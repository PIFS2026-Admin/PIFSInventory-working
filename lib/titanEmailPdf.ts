import { readFileSync } from "fs";
import { join } from "path";
import { deflateSync, inflateSync } from "zlib";

export type TitanEmailAttachment = {
  name: string;
  contentType: string;
  contentBytes: string;
};

type PdfField = {
  label: string;
  value: unknown;
};

type PdfTable = {
  title: string;
  headers: string[];
  rows: unknown[][];
};

type PdfOptions = {
  filename: string;
  title: string;
  subtitle?: string;
  fields?: PdfField[];
  note?: string;
  tables?: PdfTable[];
  footer?: string[];
};

type DtiSummaryPdfOptions = {
  filename: string;
  summary: Record<string, any>;
};

type PdfRasterImage = {
  width: number;
  height: number;
  rgbStream: Buffer;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 44;
const contentWidth = pageWidth - margin * 2;
const ascii = "latin1";

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export function safePdfFilename(value: unknown, fallback = "titan-document") {
  const base = String(value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || fallback;
}

function cleanPdfText(value: unknown) {
  return asText(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\r\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return cleanPdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value: unknown, maxChars: number) {
  const text = cleanPdfText(value);
  if (!text) return [""];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }

    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      return;
    }

    lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines;
}

function pdfMoney(value: unknown) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function dtiValue(summary: Record<string, any>, key: string) {
  const value = summary[key];
  if (value === null || value === undefined) return "";
  return String(value);
}

function dtiCount(summary: Record<string, any>, key: string) {
  const value = Number(summary[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function dtiDisplay(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function cleanDtiPdfText(value: unknown) {
  return dtiDisplay(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\r\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeDtiPdfText(value: unknown) {
  return cleanDtiPdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function dtiCountDisplay(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? String(number) : "0";
}

function wrapPdfLines(value: unknown, maxChars: number, maxLines = 6) {
  const source = dtiDisplay(value);
  if (!source.trim()) return [""];

  const lines = source
    .split(/\r?\n/)
    .flatMap((line) => wrapText(line, maxChars));

  if (lines.length <= maxLines) return lines;

  const clipped = lines.slice(0, maxLines);
  clipped[clipped.length - 1] = `${clipped[clipped.length - 1].replace(/\.+$/, "")}...`;
  return clipped;
}

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngAsRgb(buffer: Buffer): PdfRasterImage | null {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) return null;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0 || !idatChunks.length) return null;

  const channelsByColorType: Record<number, number> = {
    0: 1,
    2: 3,
    4: 2,
    6: 4,
  };
  const channels = channelsByColorType[colorType];
  if (!channels) return null;

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowLength = width * channels;
  const rgb = Buffer.alloc(width * height * 3);
  let inputOffset = 0;
  let outputOffset = 0;
  let previous = Buffer.alloc(rowLength);

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const raw = inflated.subarray(inputOffset, inputOffset + rowLength);
    inputOffset += rowLength;

    const reconstructed = Buffer.alloc(rowLength);
    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= channels ? reconstructed[index - channels] : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= channels ? previous[index - channels] ?? 0 : 0;
      let predictor = 0;

      if (filter === 1) predictor = left;
      if (filter === 2) predictor = up;
      if (filter === 3) predictor = Math.floor((left + up) / 2);
      if (filter === 4) predictor = paethPredictor(left, up, upLeft);

      reconstructed[index] = (raw[index] + predictor) & 255;
    }

    for (let pixel = 0; pixel < width; pixel += 1) {
      const source = pixel * channels;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 255;

      if (colorType === 0 || colorType === 4) {
        red = reconstructed[source];
        green = reconstructed[source];
        blue = reconstructed[source];
        alpha = colorType === 4 ? reconstructed[source + 1] : 255;
      } else {
        red = reconstructed[source];
        green = reconstructed[source + 1];
        blue = reconstructed[source + 2];
        alpha = colorType === 6 ? reconstructed[source + 3] : 255;
      }

      const opacity = alpha / 255;
      rgb[outputOffset] = Math.round(red * opacity + 255 * (1 - opacity));
      rgb[outputOffset + 1] = Math.round(green * opacity + 255 * (1 - opacity));
      rgb[outputOffset + 2] = Math.round(blue * opacity + 255 * (1 - opacity));
      outputOffset += 3;
    }

    previous = reconstructed;
  }

  return {
    width,
    height,
    rgbStream: deflateSync(rgb),
  };
}

let cachedPathfinderLogo: PdfRasterImage | null | undefined;

function getPathfinderLogo() {
  if (cachedPathfinderLogo !== undefined) return cachedPathfinderLogo;

  try {
    const logoPath = join(process.cwd(), "public", "pathfinder-logo.png");
    cachedPathfinderLogo = decodePngAsRgb(readFileSync(logoPath));
  } catch {
    cachedPathfinderLogo = null;
  }

  return cachedPathfinderLogo;
}

function buildSinglePagePdf(commands: string[], image?: PdfRasterImage | null) {
  const objects: Buffer[] = [];
  const addObject = (body: string | Buffer) => {
    objects.push(typeof body === "string" ? Buffer.from(body, ascii) : body);
    return objects.length;
  };

  const addStreamObject = (dictionary: string, stream: Buffer) => {
    return addObject(Buffer.concat([
      Buffer.from(`<< ${dictionary} /Length ${stream.length} >>\nstream\n`, ascii),
      stream,
      Buffer.from("\nendstream", ascii),
    ]));
  };

  const catalogId = addObject("");
  const pagesId = addObject("");
  const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const imageId = image
    ? addStreamObject(
        `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`,
        image.rgbStream,
      )
    : null;
  const content = Buffer.from(commands.join("\n"), ascii);
  const contentId = addStreamObject("", content);
  const imageResource = imageId ? `/XObject << /PathfinderLogo ${imageId} 0 R >>` : "";
  const pageId = addObject(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> ${imageResource} >> /Contents ${contentId} 0 R >>`,
  );

  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, ascii);
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Count 1 /Kids [${pageId} 0 R] >>`, ascii);

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", ascii)];
  const offsets = [0];
  let length = parts[0].length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = Buffer.from(`${index + 1} 0 obj\n`, ascii);
    const suffix = Buffer.from("\nendobj\n", ascii);
    parts.push(prefix, object, suffix);
    length += prefix.length + object.length + suffix.length;
  });

  const xrefOffset = length;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n `),
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
  ];
  parts.push(Buffer.from(xrefLines.join("\n"), ascii));

  return Buffer.concat(parts);
}

function buildDtiSummaryPdf(summary: Record<string, any>) {
  const commands: string[] = [
    "1 1 1 rg 0 0 612 792 re f",
    "0 0 0 rg",
    "0 0 0 RG",
  ];
  const logo = getPathfinderLogo();

  function textAt(value: unknown, x: number, y: number, size = 9, bold = false) {
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapeDtiPdfText(value)}) Tj ET`);
  }

  function line(x1: number, y1: number, x2: number, y2: number, width = 0.75, gray = 0.62) {
    commands.push(`${gray} ${gray} ${gray} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S 0 0 0 RG`);
  }

  function rect(x: number, y: number, width: number, height: number, strokeWidth = 1.4) {
    commands.push(`0.18 0.18 0.18 RG ${strokeWidth} w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S 0 0 0 RG`);
  }

  function field(label: string, value: unknown, x: number, y: number, width: number, labelWidth = 64, size = 9) {
    textAt(label, x, y, size, true);
    textAt(value, x + labelWidth, y, size, true);
    line(x + labelWidth - 2, y - 2, x + width, y - 2, 0.55, 0.56);
  }

  function countField(label: string, value: unknown, x: number, y: number, width: number, labelWidth = 74) {
    field(label, dtiCountDisplay(value), x, y, width, labelWidth, 8.5);
  }

  function splitCounts(label: string, boxValue: unknown, pinValue: unknown, x: number, y: number, width: number) {
    textAt(label, x, y, label.length > 16 ? 7.8 : 8.5, true);
    countField("Box", boxValue, x + width * 0.38, y, width * 0.27, 28);
    countField("Pin", pinValue, x + width * 0.68, y, width * 0.27, 24);
  }

  function ruledNotes(value: unknown, x: number, topY: number, width: number, height: number, maxChars: number, maxLines: number) {
    for (let ruleY = topY - 13; ruleY > topY - height; ruleY -= 14) {
      line(x, ruleY, x + width, ruleY, 0.35, 0.78);
    }

    wrapPdfLines(value, maxChars, maxLines).forEach((noteLine, index) => {
      textAt(noteLine, x, topY - 10 - index * 13, 8.3, false);
    });
  }

  function countBox(x: number, topY: number, width: number, height: number, title: "damages" | "dbr" | "refaces" | "hardbands") {
    rect(x, topY - height, width, height, 2);
    const innerX = x + 8;
    const innerW = width - 16;
    let y = topY - 20;

    if (title === "damages") {
      countField("Total Damages", dtiCount(summary, "total_damages"), innerX, y, innerW, 78);
      y -= 17;
      splitCounts("Damage Seal", dtiCount(summary, "damage_seat_box"), dtiCount(summary, "damage_seat_pin"), innerX, y, innerW);
      y -= 17;
      splitCounts("Damage Threads", dtiCount(summary, "damage_threads_box"), dtiCount(summary, "damage_threads_pin"), innerX, y, innerW);
      y -= 17;
      splitCounts("Damaged Hardband", dtiCount(summary, "damaged_hardband_box") || dtiCount(summary, "short_box"), dtiCount(summary, "damaged_hardband_pin"), innerX, y, innerW);
      y -= 17;
      countField("Bent Tube", dtiCount(summary, "bent_tube"), innerX, y, innerW, 60);
      y -= 17;
      textAt("Other", innerX, y, 8.5, true);
      field("Description", dtiValue(summary, "damage_other_description") || dtiValue(summary, "damage_other"), innerX + 72, y, 120, 58, 8);
      countField("Qty", dtiCount(summary, "damage_other_quantity"), innerX + 188, y, innerW - 188, 24);
      ruledNotes(dtiValue(summary, "damage_notes"), innerX, y - 8, innerW, 54, 48, 4);
      return;
    }

    if (title === "dbr") {
      const calculatedDbr =
        dtiCount(summary, "min_tong_box") +
        dtiCount(summary, "min_tong_pin") +
        dtiCount(summary, "tstr_box") +
        dtiCount(summary, "tstr_pin") +
        dtiCount(summary, "emi") +
        dtiCount(summary, "damaged_tube") +
        dtiCount(summary, "min_wall") +
        dtiCount(summary, "dbr_other_quantity");
      countField("Total DBR", dtiCount(summary, "total_dbr") || calculatedDbr, innerX, y, innerW, 66);
      y -= 17;
      splitCounts("Min Tong", dtiCount(summary, "min_tong_box"), dtiCount(summary, "min_tong_pin"), innerX, y, innerW);
      y -= 17;
      splitCounts("TSTR", dtiCount(summary, "tstr_box"), dtiCount(summary, "tstr_pin"), innerX, y, innerW);
      y -= 17;
      countField("EMI", dtiCount(summary, "emi"), innerX, y, innerW, 28);
      y -= 17;
      countField("Damaged Tube", dtiCount(summary, "damaged_tube"), innerX, y, innerW, 78);
      y -= 17;
      countField("MIN Wall", dtiCount(summary, "min_wall"), innerX, y, innerW, 54);
      y -= 17;
      textAt("Other", innerX, y, 8.5, true);
      field("Description", dtiValue(summary, "dbr_other_description") || dtiValue(summary, "dbr_other"), innerX + 72, y, 120, 58, 8);
      countField("Qty", dtiCount(summary, "dbr_other_quantity"), innerX + 188, y, innerW - 188, 24);
      ruledNotes(dtiValue(summary, "dbr_notes"), innerX, y - 8, innerW, 42, 48, 3);
      return;
    }

    if (title === "refaces") {
      countField("Total Refaces", dtiCount(summary, "total_refaces"), innerX, y, innerW, 74);
      y -= 19;
      countField("Pin", dtiCount(summary, "reface_pin"), innerX, y, innerW, 24);
      y -= 19;
      countField("Box", dtiCount(summary, "reface_box"), innerX, y, innerW, 26);
      return;
    }

    countField("Total Hardbands", dtiCount(summary, "total_hardbands"), innerX, y, innerW, 94);
    y -= 19;
    countField("Pin", dtiCount(summary, "hardband_pin"), innerX, y, innerW, 24);
    y -= 19;
    countField("Box", dtiCount(summary, "hardband_box"), innerX, y, innerW, 26);
  }

  if (logo) {
    const logoWidth = 150;
    const logoHeight = Math.min(72, logoWidth * (logo.height / logo.width));
    commands.push(`q ${logoWidth.toFixed(2)} 0 0 ${logoHeight.toFixed(2)} 38 ${(681).toFixed(2)} cm /PathfinderLogo Do Q`);
  } else {
    textAt("PATHFINDER", 42, 724, 18, true);
    textAt("INSPECTIONS & FIELD SERVICES", 43, 709, 7, false);
  }

  textAt("Inspection Summary", 238, 738, 23, false);
  field("Date", dtiValue(summary, "summary_date"), 238, 707, 320, 36, 9);
  field("Field Invoice", dtiValue(summary, "field_invoice"), 238, 690, 320, 72, 9);
  field("Page", dtiValue(summary, "page_number") || "1", 238, 673, 142, 36, 9);
  field("of", dtiValue(summary, "page_total") || "1", 390, 673, 168, 18, 9);

  field("Operator", dtiValue(summary, "operator"), 206, 642, 170, 56, 9);
  field("Contractor", dtiValue(summary, "contractor"), 390, 642, 168, 66, 9);
  field("Location", dtiValue(summary, "location"), 206, 622, 352, 54, 9);

  line(34, 603, 578, 603, 1, 0.62);
  field("Type of Inspection", dtiValue(summary, "inspection_type"), 34, 585, 544, 96, 9);
  field("Connection Size and Type", dtiValue(summary, "connection_size_type"), 34, 563, 544, 126, 9);
  field("Total # of Joints Inspected", dtiCount(summary, "total_joints_inspected"), 34, 541, 544, 142, 9);

  const leftX = 34;
  const rightX = 316;
  const boxW = 262;
  countBox(leftX, 512, boxW, 184, "damages");
  countBox(rightX, 512, boxW, 184, "dbr");
  countBox(leftX, 318, boxW, 72, "refaces");
  countBox(rightX, 318, boxW, 72, "hardbands");

  countField("Repair Joints", dtiCount(summary, "repair_joints"), 34, 226, 126, 76);
  countField("DBR Joints", dtiCount(summary, "dbr_joints"), 170, 226, 116, 66);
  countField("HB Joints", dtiCount(summary, "hb_joints"), 300, 226, 116, 58);
  countField("Repair / HB Joints", dtiCount(summary, "repair_hb_joints"), 430, 226, 148, 98);

  textAt("Remarks", 34, 199, 9, true);
  ruledNotes(dtiValue(summary, "remarks"), 34, 188, 544, 70, 96, 5);

  textAt("Inspections done per TH-Hill DS-1 5th Edition", 34, 96, 8.2, false);
  field("Inspected by", dtiValue(summary, "inspected_by"), 330, 96, 248, 68, 8.2);
  textAt("* All damages marked in yellow with stencil or damaged at upset.", 154, 66, 8.2, true);

  return buildSinglePagePdf(commands, logo);
}

function buildPdf(options: PdfOptions) {
  const pages: string[][] = [[]];
  let y = pageHeight - margin;

  function currentPage() {
    return pages[pages.length - 1];
  }

  function addPage() {
    pages.push([]);
    y = pageHeight - margin;
  }

  function ensureSpace(height = 18) {
    if (y - height < margin) addPage();
  }

  function textLine(text: unknown, size = 10, bold = false, gap = 13) {
    ensureSpace(gap);
    const font = bold ? "F2" : "F1";
    currentPage().push(`BT /${font} ${size} Tf ${margin} ${y} Td (${escapePdfText(asText(text))}) Tj ET`);
    y -= gap;
  }

  function rule(gap = 12) {
    ensureSpace(gap);
    currentPage().push(`${margin} ${y + 3} m ${pageWidth - margin} ${y + 3} l S`);
    y -= gap;
  }

  textLine("TITAN by Pathfinder Inspections", 10, true, 14);
  textLine(options.title, 20, true, 25);
  if (options.subtitle) textLine(options.subtitle, 11, false, 18);
  rule(15);

  if (options.fields?.length) {
    options.fields.forEach((field) => {
      wrapText(`${field.label}: ${asText(field.value)}`, 94).forEach((line, index) => {
        textLine(line, 10, index === 0, 13);
      });
    });
    rule(15);
  }

  if (options.note) {
    textLine("Message / Notes", 12, true, 16);
    wrapText(options.note, 94).forEach((line) => textLine(line, 10, false, 13));
    rule(15);
  }

  options.tables?.forEach((table) => {
    textLine(table.title, 12, true, 16);
    textLine(table.headers.join(" | "), 8, true, 11);
    rule(8);

    if (!table.rows.length) {
      textLine("No line items found.", 9, false, 12);
      rule(12);
      return;
    }

    table.rows.forEach((row) => {
      const line = row.map((cell) => cleanPdfText(cell)).join(" | ");
      wrapText(line, Math.max(72, Math.floor(contentWidth / 5.8))).forEach((wrappedLine) => {
        textLine(wrappedLine, 8, false, 10);
      });
    });
    rule(14);
  });

  const footer = options.footer ?? [
    "Pathfinder Inspections & Field Services",
    "7501 Groening St., Odessa, TX 79765",
    "(432) 233-3600 | pifstitan.com",
  ];

  footer.forEach((line) => textLine(line, 8, false, 10));

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];

  pages.forEach((commands) => {
    const stream = [
      "0.95 0.45 0.16 RG",
      "0.12 w",
      ...commands,
    ].join("\n");
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

export function createTitanPdfAttachment(options: PdfOptions): TitanEmailAttachment {
  const filename = options.filename.toLowerCase().endsWith(".pdf")
    ? options.filename
    : `${options.filename}.pdf`;

  return {
    name: filename,
    contentType: "application/pdf",
    contentBytes: buildPdf(options).toString("base64"),
  };
}

export function createDtiSummaryPdfAttachment(options: DtiSummaryPdfOptions): TitanEmailAttachment {
  const filename = options.filename.toLowerCase().endsWith(".pdf")
    ? options.filename
    : `${options.filename}.pdf`;

  return {
    name: filename,
    contentType: "application/pdf",
    contentBytes: buildDtiSummaryPdf(options.summary).toString("base64"),
  };
}

export function toMicrosoftGraphAttachments(attachments?: TitanEmailAttachment[]) {
  if (!attachments?.length) return undefined;

  return attachments.map((attachment) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: attachment.name,
    contentType: attachment.contentType,
    contentBytes: attachment.contentBytes,
  }));
}

export { pdfMoney };
