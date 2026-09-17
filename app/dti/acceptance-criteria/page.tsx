"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dtiComponentTypes, dtiInspectionFields, type DtiComponentType } from "../../../lib/dtiInspectionReport";
import { goBackOrFallback } from "../../../lib/navigation";
import { supabase } from "../../../lib/supabase";
import styles from "./criteria.module.css";

type CriteriaSet = { id: string; name: string; standard_type: string; component_type: DtiComponentType; customer_name: string | null; description: string | null };
type Version = { id: string; criteria_set_id: string; version_number: number; status: "Draft" | "Published" | "Retired"; effective_date: string | null; source_document_id: string | null; notes: string | null; published_at: string | null };
type Rule = { id: string; criteria_version_id: string; rule_name: string; field_key: string; field_label: string; inspection_area: string; comparison: string; minimum_value: number | null; maximum_value: number | null; expected_value: string | null; value_unit: string | null; result_classification: string; reason: string; display_order: number; is_active: boolean };
type Document = { id: string; title: string; document_number: string };
type Data = { sets?: CriteriaSet[]; versions?: Version[]; rules?: Rule[]; documents?: Document[]; error?: string };
type SetForm = { setId: string; name: string; standardType: string; componentType: DtiComponentType; customerName: string; description: string };
type RuleForm = { ruleId: string; ruleName: string; fieldKey: string; inspectionArea: string; comparison: string; minimumValue: string; maximumValue: string; expectedValue: string; valueUnit: string; resultClassification: string; reason: string; displayOrder: string; isActive: boolean };
type ImportRule = { ruleName: string; fieldKey: string; fieldLabel: string; inspectionArea: string; comparison: "Minimum"; minimumValue: number; maximumValue: null; expectedValue: null; valueUnit: "Inches"; resultClassification: string; reason: string; displayOrder: number; sourceCell: string };
type ImportPreview = { template: string; standardType: string; criteriaLabel: string; rules: ImportRule[]; warnings: string[] };
type ImportResponse = { ok?: boolean; imported?: number; preview?: ImportPreview; error?: string };

const standards = ["API", "DS-1", "Class 2 Alternate", "Customer"];
const comparisons = ["Minimum", "Maximum", "Range", "Equals", "Required"];
const classifications = ["Premium", "Class 1", "Class 2", "Class 3", "Class 4", "DBR", "NI", "NC"];
const valueUnits = ["Inches", "Percent", "Yes/No", "Count", "Text"];
const emptySet: SetForm = { setId: "", name: "", standardType: "API", componentType: "Drill Pipe", customerName: "", description: "" };
const emptyRule: RuleForm = { ruleId: "", ruleName: "", fieldKey: "", inspectionArea: "Joint", comparison: "Minimum", minimumValue: "", maximumValue: "", expectedValue: "", valueUnit: "Inches", resultClassification: "DBR", reason: "", displayOrder: "1", isActive: true };
function versionFields(version: Version | null) { return { effectiveDate: version?.effective_date || "", sourceDocumentId: version?.source_document_id || "", notes: version?.notes || "" }; }

function criteriaValue(rule: Rule) {
  const unit = rule.value_unit ? ` ${rule.value_unit}` : "";
  if (rule.comparison === "Minimum") return `>= ${rule.minimum_value}${unit}`;
  if (rule.comparison === "Maximum") return `<= ${rule.maximum_value}${unit}`;
  if (rule.comparison === "Range") return `${rule.minimum_value} - ${rule.maximum_value}${unit}`;
  if (rule.comparison === "Equals") return `${rule.expected_value || "-"}${unit}`;
  return "Required";
}

function defaultUnit(fieldKey: string, kind: string) {
  if (fieldKey === "percentNominalWall") return "Percent";
  if (kind === "flag" || kind === "yesno") return "Yes/No";
  if (kind === "number" || kind === "calculated") return "Inches";
  return "Text";
}

export default function AcceptanceCriteriaPage() {
  const [data, setData] = useState<Data | null>(null); const [message, setMessage] = useState("Loading acceptance criteria...");
  const [loadedRules, setLoadedRules] = useState<Rule[]>([]); const [rulesLoading, setRulesLoading] = useState(false);
  const [search, setSearch] = useState(""); const [selectedSetId, setSelectedSetId] = useState(""); const [selectedVersionId, setSelectedVersionId] = useState("");
  const [setForm, setSetForm] = useState<SetForm | null>(null); const [ruleForm, setRuleForm] = useState<RuleForm | null>(null); const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false); const [importFile, setImportFile] = useState<File | null>(null); const [importPreview, setImportPreview] = useState<ImportPreview | null>(null); const [importing, setImporting] = useState(false);
  const [versionForm, setVersionForm] = useState(versionFields(null));

  const loadRules = useCallback(async (versionId: string) => {
    if (!versionId) { setLoadedRules([]); return; }
    setRulesLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession(); const token = session.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch(`/api/dti/acceptance-criteria?versionId=${encodeURIComponent(versionId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as Data; if (!request.ok) throw new Error(body.error || "TITAN could not load acceptance rules.");
      setLoadedRules(body.rules ?? []);
    } catch (error) { setLoadedRules([]); setMessage(error instanceof Error ? error.message : "TITAN could not load acceptance rules."); }
    finally { setRulesLoading(false); }
  }, []);

  const load = useCallback(async () => {
    setMessage("Loading acceptance criteria...");
    try {
      const { data: session } = await supabase.auth.getSession(); const token = session.session?.access_token;
      if (!token) return window.location.assign("/login");
      const request = await fetch("/api/dti/acceptance-criteria", { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as Data; if (!request.ok) throw new Error(body.error || "TITAN could not load acceptance criteria.");
      setData(body); setMessage("");
      const nextSetId = body.sets?.[0]?.id || "";
      const nextVersions = (body.versions ?? []).filter((item) => item.criteria_set_id === nextSetId).sort((a, b) => b.version_number - a.version_number);
      const nextVersion = nextVersions[0] ?? null;
      setSelectedSetId(nextSetId); setSelectedVersionId(nextVersion?.id || ""); setVersionForm(versionFields(nextVersion));
    } catch (error) { setData(null); setMessage(error instanceof Error ? error.message : "TITAN could not load acceptance criteria."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => void loadRules(selectedVersionId), 0); return () => window.clearTimeout(timer); }, [loadRules, selectedVersionId]);

  const sets = useMemo(() => data?.sets ?? [], [data?.sets]);
  const visibleSets = useMemo(() => { const query = search.trim().toLowerCase(); return sets.filter((item) => !query || [item.name, item.standard_type, item.component_type, item.customer_name].some((value) => String(value ?? "").toLowerCase().includes(query))); }, [search, sets]);
  const selectedSet = sets.find((item) => item.id === selectedSetId) ?? null;
  const versions = useMemo(() => (data?.versions ?? []).filter((item) => item.criteria_set_id === selectedSetId).sort((a, b) => b.version_number - a.version_number), [data?.versions, selectedSetId]);
  const selectedVersion = versions.find((item) => item.id === selectedVersionId) ?? versions[0] ?? null;
  const rules = useMemo(() => loadedRules.filter((item) => item.criteria_version_id === selectedVersion?.id).sort((a, b) => a.display_order - b.display_order || a.rule_name.localeCompare(b.rule_name)), [loadedRules, selectedVersion?.id]);
  const fields = selectedSet ? dtiInspectionFields[selectedSet.component_type] : [];
  const source = (data?.documents ?? []).find((item) => item.id === selectedVersion?.source_document_id);
  const editable = selectedVersion?.status === "Draft";

  async function send(body: Record<string, unknown>, success: string) {
    setSaving(true); setMessage("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const request = await fetch("/api/dti/acceptance-criteria", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token || ""}` }, body: JSON.stringify(body) });
      const result = await request.json() as Data; if (!request.ok) throw new Error(result.error || "TITAN could not save acceptance criteria.");
      setData(result); setLoadedRules(result.rules ?? []); setSetForm(null); setRuleForm(null); setMessage(success);
      const nextVersions = (result.versions ?? []).filter((item) => item.criteria_set_id === selectedSetId).sort((a, b) => b.version_number - a.version_number);
      const nextVersion = body.action === "create-version" ? nextVersions[0] : nextVersions.find((item) => item.id === selectedVersion?.id) ?? nextVersions[0] ?? null;
      setSelectedVersionId(nextVersion?.id || ""); setVersionForm(versionFields(nextVersion));
      if (nextVersion?.id) await loadRules(nextVersion.id);
      return result;
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not save acceptance criteria."); return null; }
    finally { setSaving(false); }
  }

  async function importRtsWorkbook(mode: "preview" | "import") {
    if (!selectedVersion || !importFile) return;
    setImporting(true); setMessage("");
    try {
      if (mode === "preview") {
        const { parseDtiRtsCriteriaWorkbook } = await import("../../../lib/dtiRtsCriteriaImport");
        setImportPreview(await parseDtiRtsCriteriaWorkbook(await importFile.arrayBuffer()));
        return;
      }
      if (!importPreview) return;
      const { data: session } = await supabase.auth.getSession();
      const request = await fetch("/api/dti/acceptance-criteria/import", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token || ""}` }, body: JSON.stringify({ versionId: selectedVersion.id, preview: importPreview }) });
      const result = await request.json() as ImportResponse;
      if (!request.ok) throw new Error(result.error || "TITAN could not import the RTS workbook.");
      setImportOpen(false); setImportFile(null); setImportPreview(null); await load(); setMessage(`${result.imported || importPreview.rules.length} RTS acceptance rules imported into the draft.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "TITAN could not import the RTS workbook."); }
    finally { setImporting(false); }
  }

  function editRule(rule: Rule) { setRuleForm({ ruleId: rule.id, ruleName: rule.rule_name, fieldKey: rule.field_key, inspectionArea: rule.inspection_area, comparison: rule.comparison, minimumValue: rule.minimum_value === null ? "" : String(rule.minimum_value), maximumValue: rule.maximum_value === null ? "" : String(rule.maximum_value), expectedValue: rule.expected_value || "", valueUnit: rule.value_unit || "Inches", resultClassification: rule.result_classification, reason: rule.reason, displayOrder: String(rule.display_order), isActive: rule.is_active }); }
  function editSet(item: CriteriaSet) { setSetForm({ setId: item.id, name: item.name, standardType: item.standard_type, componentType: item.component_type, customerName: item.customer_name || "", description: item.description || "" }); }

  return <main className={styles.page}>
    <header className={`${styles.header} titan-page-header`}><div className={styles.title}><Image src="/titan_logo.jpg" alt="TITAN" width={64} height={42} priority /><div><span>DTI Controls</span><h1>Acceptance Criteria</h1></div></div><div className={styles.actions}><button type="button" onClick={() => goBackOrFallback("/service-lines/dti")}>Back</button><Link href="/dti/tubular-specs">Specifications</Link><button type="button" onClick={() => void load()}>Refresh</button></div></header>
    <section className={styles.toolbar}><label><span>Find Criteria</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Standard, customer, name, or report type..." /></label><button className={styles.primary} type="button" onClick={() => setSetForm({ ...emptySet })}>New Criteria Set</button></section>
    {message ? <div className={styles.message}>{message}</div> : null}
    <div className={styles.workspace}><section className={styles.sets}><div className={styles.sectionHead}><div><span>Controlled Sets</span><h2>Criteria Library</h2></div><strong>{visibleSets.length}</strong></div><div className={styles.setList}>{visibleSets.map((item) => <button type="button" key={item.id} data-active={item.id === selectedSetId} onClick={() => { const next = (data?.versions ?? []).filter((version) => version.criteria_set_id === item.id).sort((a, b) => b.version_number - a.version_number)[0] ?? null; setSelectedSetId(item.id); setSelectedVersionId(next?.id || ""); setVersionForm(versionFields(next)); }}><strong>{item.name}</strong><span>{item.standard_type} / {item.component_type}</span><small>{item.customer_name || "Company criteria"}</small></button>)}{!visibleSets.length ? <div className={styles.empty}>No criteria sets have been created.</div> : null}</div></section>
      <section className={styles.detail}>{selectedSet && selectedVersion ? <><div className={styles.sectionHead}><div><span>{selectedSet.standard_type} / {selectedSet.component_type}</span><h2>{selectedSet.name}</h2></div><div className={styles.versionActions}><button type="button" onClick={() => editSet(selectedSet)}>Edit Set</button><button type="button" onClick={() => void send({ action: "archive-set", setId: selectedSet.id }, "Criteria set archived.")} disabled={saving}>Archive</button></div></div><div className={styles.detailBody}>
        <div className={styles.versionBar}><label>Version<select className={styles.versionSelect} value={selectedVersion.id} onChange={(event) => { const next = versions.find((version) => version.id === event.target.value) ?? null; setSelectedVersionId(event.target.value); setVersionForm(versionFields(next)); }}>{versions.map((version) => <option key={version.id} value={version.id}>Version {version.version_number} / {version.status}</option>)}</select></label><div className={styles.versionMeta}><div><span>Status</span><strong className={styles.status} data-status={selectedVersion.status}>{selectedVersion.status}</strong></div><div><span>Effective</span><strong>{selectedVersion.effective_date || "Not set"}</strong></div><div><span>Source</span><small>{source ? `${source.document_number || "Document"} / ${source.title}` : "Not selected"}</small></div></div><div className={styles.versionActions}>{editable ? <><button type="button" onClick={() => void send({ action: "save-version", versionId: selectedVersion.id, ...versionForm }, "Draft details saved.")} disabled={saving}>Save Draft</button><button className={styles.primary} type="button" onClick={() => { if (window.confirm(`Publish version ${selectedVersion.version_number}? Published rules cannot be edited.`)) void send({ action: "publish-version", versionId: selectedVersion.id }, "Criteria version published."); }} disabled={saving}>Publish</button></> : <button className={styles.primary} type="button" onClick={() => void send({ action: "create-version", setId: selectedSet.id }, "New editable version created.")} disabled={saving}>New Version</button>}</div></div>
        {editable ? <div className={styles.formGrid}><label><span>Effective Date</span><input type="date" value={versionForm.effectiveDate} onChange={(event) => setVersionForm({ ...versionForm, effectiveDate: event.target.value })} /></label><label className={styles.full}><span>Approved Source Document</span><select value={versionForm.sourceDocumentId} onChange={(event) => setVersionForm({ ...versionForm, sourceDocumentId: event.target.value })}><option value="">Select controlled document</option>{(data?.documents ?? []).map((document) => <option key={document.id} value={document.id}>{document.document_number ? `${document.document_number} / ` : ""}{document.title}</option>)}</select></label><label className={styles.full}><span>Version Notes</span><textarea value={versionForm.notes} onChange={(event) => setVersionForm({ ...versionForm, notes: event.target.value })} /></label></div> : null}
        <div className={styles.sectionHead}><div><span>{rules.length} Rules</span><h2>Acceptance Rules</h2></div>{editable ? <div className={styles.versionActions}><button type="button" onClick={() => { setImportFile(null); setImportPreview(null); setImportOpen(true); }}>Import RTS Workbook</button><button className={styles.primary} type="button" onClick={() => setRuleForm({ ...emptyRule, displayOrder: String(rules.length + 1) })}>Add Rule</button></div> : null}</div>
        <div className={styles.ruleTable}><table><thead><tr><th>Order</th><th>Rule</th><th>Field / Area</th><th>Accepted When</th><th>Result When Not Met</th><th>Reason</th><th></th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id}><td>{rule.display_order}</td><td><strong>{rule.rule_name}</strong>{!rule.is_active ? <small> Inactive</small> : null}</td><td>{rule.field_label}<br /><small>{rule.inspection_area}</small></td><td>{criteriaValue(rule)}</td><td>{rule.result_classification}</td><td>{rule.reason}</td><td><div className={styles.ruleActions}>{editable ? <><button type="button" onClick={() => editRule(rule)}>Edit</button><button type="button" onClick={() => { if (window.confirm(`Delete ${rule.rule_name}?`)) void send({ action: "delete-rule", versionId: selectedVersion.id, ruleId: rule.id }, "Rule deleted."); }}>Delete</button></> : null}</div></td></tr>)}{!rules.length ? <tr><td colSpan={7}>{rulesLoading ? "Loading rules..." : "No rules are defined for this version."}</td></tr> : null}</tbody></table></div>
      </div></> : <div className={styles.empty}>Create or select a criteria set to begin.</div>}</section></div>

    {setForm ? <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true"><div className={styles.modalHead}><div><span>Separate By Report Type</span><h2>{setForm.setId ? "Edit Criteria Set" : "New Criteria Set"}</h2></div><button type="button" aria-label="Close" onClick={() => setSetForm(null)}>X</button></div><div className={styles.formGrid}><label><span>Name</span><input value={setForm.name} onChange={(event) => setSetForm({ ...setForm, name: event.target.value })} /></label><label><span>Standard</span><select value={setForm.standardType} onChange={(event) => setSetForm({ ...setForm, standardType: event.target.value })}>{standards.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Report Type</span><select value={setForm.componentType} disabled={Boolean(setForm.setId)} onChange={(event) => setSetForm({ ...setForm, componentType: event.target.value as DtiComponentType })}>{dtiComponentTypes.map((value) => <option key={value}>{value}</option>)}</select></label>{setForm.standardType === "Customer" ? <label className={styles.full}><span>Customer</span><input value={setForm.customerName} onChange={(event) => setSetForm({ ...setForm, customerName: event.target.value })} /></label> : null}<label className={styles.full}><span>Description</span><textarea value={setForm.description} onChange={(event) => setSetForm({ ...setForm, description: event.target.value })} /></label></div><div className={styles.modalActions}><button type="button" onClick={() => setSetForm(null)}>Cancel</button><button type="button" disabled={saving || !setForm.name || (setForm.standardType === "Customer" && !setForm.customerName)} onClick={() => void send({ action: setForm.setId ? "update-set" : "create-set", ...setForm }, setForm.setId ? "Criteria set updated." : "Criteria set created with draft version 1.")}>{saving ? "Saving..." : "Save Set"}</button></div></section></div> : null}

    {ruleForm && selectedVersion && selectedSet ? <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true"><div className={styles.modalHead}><div><span>Version {selectedVersion.version_number} Draft</span><h2>{ruleForm.ruleId ? "Edit Rule" : "Add Rule"}</h2></div><button type="button" aria-label="Close" onClick={() => setRuleForm(null)}>X</button></div><div className={styles.formGrid}><label><span>Rule Name</span><input value={ruleForm.ruleName} onChange={(event) => setRuleForm({ ...ruleForm, ruleName: event.target.value })} /></label><label><span>Inspection Field</span><select value={ruleForm.fieldKey} onChange={(event) => { const field = fields.find((item) => item.key === event.target.value); setRuleForm({ ...ruleForm, fieldKey: event.target.value, inspectionArea: field?.end || (field?.group === "Tool Joint" ? "Tool Joint" : "Joint"), valueUnit: defaultUnit(event.target.value, field?.kind || "text") }); }}><option value="">Select field</option>{fields.map((field) => <option key={field.key} value={field.key}>{field.group} / {field.label}</option>)}</select></label><label><span>Inspection Area</span><select value={ruleForm.inspectionArea} onChange={(event) => setRuleForm({ ...ruleForm, inspectionArea: event.target.value })}>{["Tube","Box","Pin","Tool Joint","Joint"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Comparison</span><select value={ruleForm.comparison} onChange={(event) => setRuleForm({ ...ruleForm, comparison: event.target.value })}>{comparisons.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Value Unit</span><select value={ruleForm.valueUnit} onChange={(event) => setRuleForm({ ...ruleForm, valueUnit: event.target.value })}>{valueUnits.map((value) => <option key={value}>{value}</option>)}</select></label>{["Minimum","Range"].includes(ruleForm.comparison) ? <label><span>Minimum Accepted Value</span><input type="number" step="any" value={ruleForm.minimumValue} onChange={(event) => setRuleForm({ ...ruleForm, minimumValue: event.target.value })} /></label> : null}{["Maximum","Range"].includes(ruleForm.comparison) ? <label><span>Maximum Accepted Value</span><input type="number" step="any" value={ruleForm.maximumValue} onChange={(event) => setRuleForm({ ...ruleForm, maximumValue: event.target.value })} /></label> : null}{ruleForm.comparison === "Equals" ? <label><span>Accepted Value</span><input value={ruleForm.expectedValue} onChange={(event) => setRuleForm({ ...ruleForm, expectedValue: event.target.value })} /></label> : null}<label><span>Result When Not Met</span><select value={ruleForm.resultClassification} onChange={(event) => setRuleForm({ ...ruleForm, resultClassification: event.target.value })}>{classifications.map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Display Order</span><input type="number" min="0" step="1" value={ruleForm.displayOrder} onChange={(event) => setRuleForm({ ...ruleForm, displayOrder: event.target.value })} /></label><label className={styles.full}><span>Classification Reason</span><textarea value={ruleForm.reason} onChange={(event) => setRuleForm({ ...ruleForm, reason: event.target.value })} /></label></div><div className={styles.modalActions}><button type="button" onClick={() => setRuleForm(null)}>Cancel</button><button type="button" disabled={saving || !ruleForm.ruleName || !ruleForm.fieldKey || !ruleForm.reason} onClick={() => void send({ action: "save-rule", versionId: selectedVersion.id, ...ruleForm }, ruleForm.ruleId ? "Rule updated." : "Rule added.")}>{saving ? "Saving..." : "Save Rule"}</button></div></section></div> : null}

    {importOpen && selectedVersion && selectedSet ? <div className={styles.backdrop}><section className={styles.modal} role="dialog" aria-modal="true"><div className={styles.modalHead}><div><span>{selectedSet.name} / Version {selectedVersion.version_number}</span><h2>Import RTS Workbook</h2></div><button type="button" aria-label="Close" onClick={() => setImportOpen(false)}>X</button></div><div className={styles.importBody}><p>Upload a completed and recalculated RTS Drill Pipe workbook. Importing replaces the rules in this draft only. It does not publish the criteria.</p><label className={styles.filePicker}><span>RTS Excel Workbook</span><input type="file" accept=".xlsx,.xlsm" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportPreview(null); }} /></label>{importPreview ? <><div className={styles.importSummary}><div><span>Template</span><strong>{importPreview.template}</strong></div><div><span>Selected Standard</span><strong>{importPreview.standardType}</strong></div><div><span>Rules Found</span><strong>{importPreview.rules.length}</strong></div></div><div className={styles.importTable}><table><thead><tr><th>Field</th><th>Minimum</th><th>Result When Not Met</th><th>Source</th></tr></thead><tbody>{importPreview.rules.map((rule) => <tr key={`${rule.sourceCell}-${rule.resultClassification}`}><td>{rule.fieldLabel}<small>{rule.inspectionArea}</small></td><td>{rule.minimumValue}</td><td>{rule.resultClassification}</td><td>{rule.sourceCell}</td></tr>)}</tbody></table></div>{importPreview.warnings.map((warning) => <div className={styles.importWarning} key={warning}>{warning}</div>)}</> : null}</div><div className={styles.modalActions}><button type="button" onClick={() => setImportOpen(false)}>Cancel</button>{importPreview ? <button type="button" disabled={importing} onClick={() => { if (window.confirm(`Replace ${rules.length} existing rule${rules.length === 1 ? "" : "s"} with ${importPreview.rules.length} imported rules?`)) void importRtsWorkbook("import"); }}>{importing ? "Importing..." : "Import Rules"}</button> : <button type="button" disabled={importing || !importFile} onClick={() => void importRtsWorkbook("preview")}>{importing ? "Reading..." : "Preview Import"}</button>}</div></section></div> : null}
  </main>;
}
