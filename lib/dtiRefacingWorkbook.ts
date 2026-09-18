import "server-only";

import JSZip from "jszip";
import { dtiComponentLabel, resolveDtiReportComponentType } from "./dtiInspectionReport";
import { dtiRefacingFields, getDtiRefacingData, getDtiRefacingRows, type DtiRefacingItem } from "./dtiRefacingReport";

type Report = Record<string, unknown>;

function text(value: unknown) { return String(value ?? "").trim(); }
function escapeXml(value: unknown) {
  return text(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}
function cell(address: string, value: unknown, style = 0) {
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}
function columnName(index: number) {
  let value = index + 1; let output = "";
  while (value) { const remainder = (value - 1) % 26; output = String.fromCharCode(65 + remainder) + output; value = Math.floor((value - 1) / 26); }
  return output;
}
function rowXml(number: number, values: Array<{ value: unknown; style?: number }>, height?: number) {
  const heightAttributes = height ? ` ht="${height}" customHeight="1"` : "";
  return `<row r="${number}"${heightAttributes}>${values.map((entry, index) => cell(`${columnName(index)}${number}`, entry.value, entry.style)).join("")}</row>`;
}

export async function buildDtiRefacingWorkbook(report: Report, items: DtiRefacingItem[]) {
  const componentType = resolveDtiReportComponentType(report.inspection_scope as Record<string, unknown> | null, items);
  const componentLabel = dtiComponentLabel(componentType);
  const rows = getDtiRefacingRows(items, componentType);
  const reportNumber = `${text(report.report_number) || "DTI"}-RFX`;
  const worksheetRows = [
    rowXml(1, [{ value: `${componentLabel} Refacing Report`, style: 1 }], 28),
    rowXml(2, [{ value: `Report: ${reportNumber}`, style: 2 }, ...Array.from({ length: 5 }, () => ({ value: "", style: 2 })), { value: `Report Date: ${text(report.report_date) || "-"}`, style: 2 }, ...Array.from({ length: 5 }, () => ({ value: "", style: 2 })), { value: `Status: ${text(report.status) || "-"}`, style: 2 }]),
    rowXml(4, [
      { value: "Operator", style: 3 }, { value: report.operator_name, style: 4 }, { value: "Contractor", style: 3 }, { value: report.contractor_name, style: 4 },
      { value: "Rig Number", style: 3 }, { value: report.rig_number, style: 4 }, { value: "Field Invoice", style: 3 }, { value: report.field_invoice, style: 4 },
      { value: "Inspection Crew", style: 3 }, { value: report.inspection_crew, style: 4 }, { value: "Connection Size", style: 3 }, { value: report.connection_size, style: 4 },
      { value: "Connection Type", style: 3 }, { value: report.connection_type, style: 4 }, { value: "Grade", style: 3 }, { value: report.grade, style: 4 }, { value: "State", style: 3 }, { value: report.state, style: 4 },
    ], 24),
    rowXml(6, [
      { value: "No.", style: 5 }, { value: "Serial #", style: 5 }, { value: "Present", style: 5 }, { value: "Initial Class", style: 5 }, { value: "Final Class", style: 5 }, { value: "Class Reject", style: 5 },
      { value: "Box Repair Req.", style: 5 }, { value: "Box Depth", style: 5 }, { value: "", style: 5 }, { value: "Box Tong", style: 5 }, { value: "", style: 5 }, { value: "Box", style: 5 },
      { value: "Pin Repair Req.", style: 5 }, { value: "Pin Length", style: 5 }, { value: "", style: 5 }, { value: "Pin Tong", style: 5 }, { value: "", style: 5 }, { value: "Pin", style: 5 },
    ], 24),
    rowXml(7, [
      ...Array.from({ length: 7 }, () => ({ value: "", style: 5 })), { value: "Before", style: 5 }, { value: "After", style: 5 }, { value: "Before", style: 5 }, { value: "After", style: 5 }, { value: "Results", style: 5 },
      { value: "", style: 5 }, { value: "Before", style: 5 }, { value: "After", style: 5 }, { value: "Before", style: 5 }, { value: "After", style: 5 }, { value: "Results", style: 5 },
    ], 22),
    ...rows.map((item, index) => {
      const row = getDtiRefacingData(item);
      const values = [item.sequence_number, row.serialNumber, ...dtiRefacingFields.map(([key]) => row[key])];
      return rowXml(8 + index, values.map((value) => ({ value, style: 6 })), 21);
    }),
  ].join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="7" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/><col min="3" max="18" width="15" customWidth="1"/></cols><sheetData>${worksheetRows}</sheetData><mergeCells count="18"><mergeCell ref="A1:R1"/><mergeCell ref="A2:F2"/><mergeCell ref="G2:L2"/><mergeCell ref="M2:R2"/><mergeCell ref="A6:A7"/><mergeCell ref="B6:B7"/><mergeCell ref="C6:C7"/><mergeCell ref="D6:D7"/><mergeCell ref="E6:E7"/><mergeCell ref="F6:F7"/><mergeCell ref="G6:G7"/><mergeCell ref="H6:I6"/><mergeCell ref="J6:K6"/><mergeCell ref="L6:L7"/><mergeCell ref="M6:M7"/><mergeCell ref="N6:O6"/><mergeCell ref="P6:Q6"/><mergeCell ref="R6:R7"/></mergeCells><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Refacing Report" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="auto"/></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111820"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  const now = new Date().toISOString();
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(reportNumber)}</dc:title><dc:creator>TITAN</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>TITAN</Application></Properties>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
