import Image from "next/image";
import { dtiComponentLabel, dtiInspectionFields, normalizeDtiRefaceCode, resolveDtiReportComponentType, summarizeDtiInspection, type DtiComponentType } from "../../../../lib/dtiInspectionReport";
import styles from "../reports.module.css";

export type DtiPrintReport = {
  report_number: string;
  operator_name: string;
  contractor_name: string | null;
  rig_number: string | null;
  report_date: string;
  field_invoice: string | null;
  inspection_crew: string | null;
  connection_size: string | null;
  connection_type: string | null;
  grade: string | null;
  state: string | null;
  inspection_scope: Record<string, unknown>;
  machine_shop: Record<string, unknown>;
  remarks: Record<string, unknown>;
  status: string;
};
export type DtiPrintItem = { id: string; component_type: DtiComponentType; sequence_number: number; row_data: Record<string, unknown> };
export type DtiPrintProveUp = { id: string; sequence_number: number; joint_number: string | null; serial_number: string | null; flaw: string | null; depth_inches: number | null; adjacent_wall_inches: number | null; remaining_body_wall_inches: number | null; distance_from_end: string | null; prove_up_result: string | null };

function value(source: Record<string, unknown>, key: string) {
  const raw = source[key];
  if (raw === true) return "X";
  if (raw === false || raw === null || raw === undefined || raw === "") return "-";
  if (key === "percentNominalWall") return `${(Number(raw) * 100).toFixed(1)}%`;
  if (key.endsWith("RefaceType")) return normalizeDtiRefaceCode(raw) || "-";
  return String(raw);
}

function scopePrefix(component: DtiComponentType) {
  return component === "Drill Pipe" ? "drillPipe" : component === "HWDP" ? "hwdp" : "subs";
}

export default function DtiInspectionPrintView({ report, items, proveUps, preview = false }: { report: DtiPrintReport; items: DtiPrintItem[]; proveUps: DtiPrintProveUp[]; preview?: boolean }) {
  const reportComponentType = resolveDtiReportComponentType(report.inspection_scope, items);
  const reportComponentLabel = dtiComponentLabel(reportComponentType);
  const components = [reportComponentType];
  return <article className={`${styles.printOnly} ${preview ? styles.printPreview : ""}`}>
    <header className={styles.printLetterhead}>
      <Image src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" width={220} height={70} />
      <div><strong>Pathfinder Inspections &amp; Field Services</strong><span>7501 Groening St., Odessa, TX 79765</span><span>(432) 233-3600</span></div>
    </header>
    <section className={styles.printTitle}><div><span>{report.report_number}</span><h1>{reportComponentLabel} Inspection Report</h1></div><div><span>Report Date</span><strong>{report.report_date}</strong><span>Status</span><strong>{report.status}</strong></div></section>
    <section className={styles.printInfo}>
      {([['Operator',report.operator_name],['Contractor',report.contractor_name],['Rig Number',report.rig_number],['Field Invoice',report.field_invoice],['Inspection Crew',report.inspection_crew],['Connection Size',report.connection_size],['Connection Type',report.connection_type],['Grade',report.grade],['State',report.state]] as const).map(([label,entry]) => <div key={label}><span>{label}</span><strong>{entry || "-"}</strong></div>)}
    </section>

    {components.map((component) => {
      const componentItems = items.filter((item) => item.component_type === component).sort((a, b) => a.sequence_number - b.sequence_number);
      const summary = summarizeDtiInspection(componentItems, component);
      const prefix = scopePrefix(component);
      const scope = report.inspection_scope;
      const remarks = String(report.remarks[prefix] ?? "");
      const fields = dtiInspectionFields[component];
      const groups = [...new Set(fields.map((field) => field.group))].map((group) => ({ group, count: fields.filter((field) => field.group === group).length }));
      return <section className={styles.printComponent} key={component}>
        <div className={styles.printSectionTitle}><div><span>{String(scope.inspectionCategory ?? "") === "HDLS" ? "HDLS" : scope.inspectionCategory ? `Category ${String(scope.inspectionCategory)}` : String(scope[`${prefix}Category`] ?? "") || "Inspection"}</span><h2>{dtiComponentLabel(component)} Summary</h2></div><strong>{componentItems.length} {component === "Subs" ? "tools" : "joints"}</strong></div>
        <div className={styles.printScope}><span>{String(scope[`${prefix}Additional1`] ?? "") || "-"}</span><span>{String(scope[`${prefix}Additional2`] ?? "") || "-"}</span></div>
        <div className={styles.printSummary}>
          {([['Inspected',summary.inspected],['Premium',summary.premium],['Rig Ready',summary.rigReady],['Machine Shop',summary.machineShop],['DBR',summary.dbr],['Box Refaces',summary.boxRefaces],['Pin Refaces',summary.pinRefaces],['Damaged Boxes',summary.damagedBoxes],['Damaged Pins',summary.damagedPins],['Hardband Boxes',summary.hardbandBoxes],['Hardband Pins',summary.hardbandPins],['Hardbands',summary.hardbands],['Damaged Hardbands',summary.damagedHardbands],['DBR Hardbands',summary.dbrHardbands]] as const).map(([label,total]) => <div key={label}><span>{label}</span><strong>{total}</strong></div>)}
          {component === "HWDP" ? <><div><span>Center Pad 1</span><strong>{summary.centerPad1}</strong></div><div><span>Center Pad 2</span><strong>{summary.centerPad2}</strong></div></> : null}
        </div>
        <div className={styles.printRemarks}><strong>Remarks</strong><span>{remarks || "No remarks."}</span></div>

        <section className={`${styles.printTableSection} ${styles.printMatrix}`}>
          <h3>{dtiComponentLabel(component)} Inspection Detail</h3>
          <table>
            <thead>
              <tr className={styles.printGroupRow}><th rowSpan={2}><span>Row</span></th>{groups.map(({ group, count }) => <th colSpan={count} key={group}>{group}</th>)}</tr>
              <tr>{fields.map((field) => <th key={field.key}><span>{field.label}{field.end ? ` / ${field.end}` : ""}</span></th>)}</tr>
            </thead>
            <tbody>{componentItems.map((item) => <tr key={item.id}><td>{item.sequence_number}</td>{fields.map((field) => <td key={field.key}>{value(item.row_data, field.key)}</td>)}</tr>)}{!componentItems.length ? <tr><td colSpan={fields.length + 1}>No {dtiComponentLabel(component)} rows recorded.</td></tr> : null}</tbody>
          </table>
        </section>
      </section>;
    })}

    <section className={styles.printComponent}>
      <div className={styles.printSectionTitle}><div><span>EMI</span><h2>Prove-Up Register</h2></div><strong>{proveUps.length} rows</strong></div>
      <section className={styles.printTableSection}><table><thead><tr>{["Row", "Joint", "Serial", "Flaw", "Depth", "Adjacent Wall", "Remaining Body Wall", "Distance From End (B/P)", "Prove-Up Result"].map((label) => <th key={label}><span>{label}</span></th>)}</tr></thead><tbody>{proveUps.map((item) => <tr key={item.id}><td>{item.sequence_number}</td><td>{item.joint_number || "-"}</td><td>{item.serial_number || "-"}</td><td>{item.flaw || "-"}</td><td>{item.depth_inches ?? "-"}</td><td>{item.adjacent_wall_inches ?? "-"}</td><td>{item.remaining_body_wall_inches ?? "-"}</td><td>{item.distance_from_end || "-"}</td><td>{item.prove_up_result || "-"}</td></tr>)}{!proveUps.length ? <tr><td colSpan={9}>No EMI prove-up rows recorded.</td></tr> : null}</tbody></table></section>
    </section>

    <footer className={styles.printFooter}><div><strong>Machine Shop</strong><span>{String(report.machine_shop.name ?? "N/A")}</span><span>{String(report.machine_shop.address ?? "")}</span></div><div><strong>Contact</strong><span>{String(report.machine_shop.contact ?? "N/A")}</span><span>{String(report.machine_shop.phone ?? "")}</span></div></footer>
  </article>;
}
