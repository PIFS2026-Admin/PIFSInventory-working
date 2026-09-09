"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import styles from "./DtiProcedureMenu.module.css";

type Procedure = { documentNumber: string; label: string };

export default function DtiProcedureMenu({ procedures }: { procedures: Procedure[] }) {
  const [opening, setOpening] = useState(false);

  async function openProcedure(documentNumber: string) {
    if (!documentNumber) return;
    const newWindow = window.open("about:blank", "_blank");
    setOpening(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { newWindow?.close(); window.location.assign("/login"); return; }
      const request = await fetch(`/api/dti/documents?documentNumber=${encodeURIComponent(documentNumber)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await request.json() as { url?: string; error?: string };
      if (!request.ok || !body.url) throw new Error(body.error || "TITAN could not open this procedure.");
      if (newWindow) newWindow.location.href = body.url;
      else window.location.assign(body.url);
    } catch (error) {
      newWindow?.close();
      window.alert(error instanceof Error ? error.message : "TITAN could not open this procedure.");
    } finally { setOpening(false); }
  }

  return <label className={styles.menu}>
    <span className={styles.srOnly}>Controlled procedures</span>
    <select aria-label="Controlled procedures" disabled={opening} value="" onChange={(event) => void openProcedure(event.target.value)}>
      <option value="">{opening ? "Opening..." : "Procedures"}</option>
      {procedures.map((procedure) => <option key={procedure.documentNumber} value={procedure.documentNumber}>{procedure.documentNumber} / {procedure.label}</option>)}
    </select>
  </label>;
}
