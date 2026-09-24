export type InvoiceExtraction = {
  vendorName: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  confidence: number | null;
  source: "pdf-text" | "ocr";
  rawText: string;
};

type VendorOption = { id: string; vendor_name: string };

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalized(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function dateValue(value: string) {
  const cleaned = value.replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  const numeric = cleaned.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  if (numeric) {
    const year = numeric[3].length === 2 ? Number(`20${numeric[3]}`) : Number(numeric[3]);
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }
  const named = cleaned.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})\b/i);
  if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(named[1].slice(0, 3).toLowerCase()) + 1;
    return `${named[3]}-${String(month).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
  }
  return "";
}

function labeledValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return compact(match[1]);
  }
  return "";
}

function amountValue(text: string) {
  const labels = [
    /(?:total\s+amount\s+due|amount\s+due|balance\s+due)\s*[:#-]?\s*\$?\s*([\d,]+\.\d{2})/i,
    /(?:invoice\s+total|grand\s+total|total)\s*[:#-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  ];
  const labeled = labeledValue(text, labels);
  if (labeled) return labeled.replace(/,/g, "");
  const money = [...text.matchAll(/\$\s*([\d,]+\.\d{2})/g)].map((match) => Number(match[1].replace(/,/g, ""))).filter(Number.isFinite);
  return money.length ? Math.max(...money).toFixed(2) : "";
}

function vendorValue(text: string, vendors: VendorOption[]) {
  const haystack = normalized(text);
  const match = vendors
    .filter((vendor) => normalized(vendor.vendor_name).length >= 3 && haystack.includes(normalized(vendor.vendor_name)))
    .sort((a, b) => normalized(b.vendor_name).length - normalized(a.vendor_name).length)[0];
  if (match) return { vendorName: match.vendor_name, vendorId: match.id };

  const blocked = /^(invoice|tax invoice|bill to|ship to|remit to|statement|date|page|phone|fax|email|www\.|amount due|account)/i;
  const lines = text.split(/\r?\n/).map(compact).filter((line) => line.length >= 3 && line.length <= 90);
  const candidate = lines.find((line) => !blocked.test(line) && !/^\d/.test(line) && !/@|https?:|\b(invoice|purchase order)\b/i.test(line));
  return { vendorName: candidate || "", vendorId: "" };
}

function parseInvoice(text: string, vendors: VendorOption[], confidence: number | null, source: InvoiceExtraction["source"]): InvoiceExtraction {
  const invoiceNumber = labeledValue(text, [
    /invoice\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{1,40})/i,
    /inv\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{1,40})/i,
  ]).replace(/[.,;:]$/, "");
  const dueRaw = labeledValue(text, [/(?:due\s+date|payment\s+due)\s*[:#-]?\s*([^\n\r]{4,30})/i]);
  const invoiceDateRaw = labeledValue(text, [/(?:invoice\s+date|date\s+of\s+invoice)\s*[:#-]?\s*([^\n\r]{4,30})/i, /(?:^|\n)\s*date\s*[:#-]?\s*([^\n\r]{4,30})/im]);
  const vendor = vendorValue(text, vendors);
  return {
    ...vendor,
    invoiceNumber,
    invoiceDate: dateValue(invoiceDateRaw),
    dueDate: dateValue(dueRaw),
    totalAmount: amountValue(text),
    confidence,
    source,
    rawText: text,
  };
}

async function ocrImages(images: Array<File | Blob>, progress?: (message: string) => void) {
  const { createWorker } = await import("tesseract.js");
  progress?.("Loading invoice reader...");
  const worker = await createWorker("eng");
  try {
    const texts: string[] = [];
    const confidences: number[] = [];
    for (let index = 0; index < images.length; index += 1) {
      progress?.(`Reading invoice page ${index + 1} of ${images.length}...`);
      const result = await worker.recognize(images[index]);
      texts.push(result.data.text || "");
      if (Number.isFinite(result.data.confidence)) confidences.push(result.data.confidence);
    }
    return { text: texts.join("\n"), confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null };
  } finally {
    await worker.terminate();
  }
}

async function pdfTextAndImages(file: File, progress?: (message: string) => void) {
  progress?.("Opening invoice PDF...");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const textPages: string[] = [];
  const pages = Math.min(pdf.numPages, 3);
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    textPages.push(content.items.map((item) => {
      if (!("str" in item)) return "";
      return `${item.str}${item.hasEOL ? "\n" : " "}`;
    }).join(""));
  }
  const text = textPages.join("\n");
  if (text.replace(/\s/g, "").length >= 80) return { text, confidence: 100, source: "pdf-text" as const };

  const images: Blob[] = [];
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    progress?.(`Preparing scanned page ${pageNumber} of ${pages}...`);
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.65 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser could not prepare the invoice image.");
    await page.render({ canvasContext: context, viewport }).promise;
    const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Invoice page conversion failed.")), "image/png"));
    images.push(image);
  }
  const result = await ocrImages(images, progress);
  return { ...result, source: "ocr" as const };
}

export async function readInvoiceDocument(file: File, vendors: VendorOption[], progress?: (message: string) => void) {
  if (file.type === "application/pdf") {
    const result = await pdfTextAndImages(file, progress);
    return parseInvoice(result.text, vendors, result.confidence, result.source);
  }
  if (file.type.startsWith("image/")) {
    const result = await ocrImages([file], progress);
    return parseInvoice(result.text, vendors, result.confidence, "ocr");
  }
  throw new Error("Upload a PDF, JPG, or PNG invoice.");
}
