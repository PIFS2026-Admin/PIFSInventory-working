"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getDtiOfflineSnapshot, saveDtiOfflineSnapshot } from "../../../../../lib/dtiOfflineQueue";
import { supabase } from "../../../../../lib/supabase";
import DtiInspectionPrintView, { type DtiPrintItem, type DtiPrintProveUp, type DtiPrintReport } from "../DtiInspectionPrintView";
import styles from "../../reports.module.css";

type ApiData = { report?: DtiPrintReport; items?: DtiPrintItem[]; proveUps?: DtiPrintProveUp[]; error?: string };

export default function DtiInspectionPrintPreviewPage() {
  const params = useParams<{ reportId: string }>(); const reportId = String(params.reportId ?? ""); const snapshotKey = `inspection-report:${reportId}`;
  const [data, setData] = useState<ApiData | null>(null); const [message, setMessage] = useState("Loading print preview...");
  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getSession(); const token = auth.session?.access_token;
      if (!token) throw new Error("Your TITAN session is not available.");
      const request = await fetch(`/api/dti/inspection-reports?reportId=${encodeURIComponent(reportId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await request.json() as ApiData; if (!request.ok) throw new Error(body.error || "TITAN could not load the print preview.");
      setData(body); setMessage(""); await saveDtiOfflineSnapshot(snapshotKey, body).catch(() => undefined);
    } catch (error) {
      const cached = await getDtiOfflineSnapshot<ApiData>(snapshotKey).catch(() => null);
      if (cached?.data.report) { setData(cached.data); setMessage("Offline report copy loaded for printing."); }
      else setMessage(error instanceof Error ? error.message : "TITAN could not load the print preview.");
    }
  }, [reportId, snapshotKey]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  return <main className={styles.previewPage}>
    <div className={styles.previewToolbar}><button type="button" onClick={() => window.history.back()}>Back to Report</button><strong>{data?.report?.report_number || "DTI Inspection Report"}</strong><button type="button" onClick={() => window.print()} disabled={!data?.report}>Print / Save PDF</button></div>
    {message ? <div className={styles.previewMessage}>{message}</div> : null}
    {data?.report ? <DtiInspectionPrintView report={data.report} items={data.items ?? []} proveUps={data.proveUps ?? []} preview /> : null}
  </main>;
}
