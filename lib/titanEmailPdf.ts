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

const pageWidth = 612;
const pageHeight = 792;
const margin = 44;
const contentWidth = pageWidth - margin * 2;

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
