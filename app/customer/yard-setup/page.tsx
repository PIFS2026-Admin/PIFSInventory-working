"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";
import styles from "./yard-setup.module.css";

type Yard = { id: string; name: string; code: string; is_active: boolean };
type Rack = { id: string; yard_id: string; rack_code: string; capacity_joints: number; is_active: boolean };
type Zone = { id: string; yard_id: string; name: string; code: string; sort_order: number; is_active: boolean };

export default function CustomerYardSetupPage() {
  const [yards, setYards] = useState<Yard[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedYardId, setSelectedYardId] = useState("");
  const [yardName, setYardName] = useState("");
  const [yardCode, setYardCode] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [message, setMessage] = useState("Loading your yard setup...");
  const [saving, setSaving] = useState(false);

  const selectedYard = useMemo(
    () => yards.find((yard) => yard.id === selectedYardId) ?? yards[0] ?? null,
    [selectedYardId, yards]
  );
  const selectedRacks = useMemo(() => racks.filter((rack) => rack.yard_id === selectedYard?.id), [racks, selectedYard]);
  const selectedZones = useMemo(() => zones.filter((zone) => zone.yard_id === selectedYard?.id), [zones, selectedYard]);

  function applyResult(result: any) {
    const nextYards = Array.isArray(result?.yards) ? result.yards : [];
    setYards(nextYards);
    setRacks(Array.isArray(result?.racks) ? result.racks : []);
    setZones(Array.isArray(result?.zones) ? result.zones : []);
    setSelectedYardId((current) => {
      if (nextYards.some((yard: Yard) => yard.id === current)) return current;
      return result?.yard?.id ?? nextYards[0]?.id ?? "";
    });
  }

  async function request(action?: string, body: Record<string, unknown> = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      window.location.href = "/login";
      return null;
    }

    const response = await fetch("/api/customer-yards", {
      method: action ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(action ? { "Content-Type": "application/json" } : {}),
      },
      body: action ? JSON.stringify({ action, ...body }) : undefined,
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Yard setup could not be saved.");
    applyResult(result);
    return result;
  }

  useEffect(() => {
    request()
      .then(() => setMessage(""))
      .catch((error) => setMessage(error.message));
  }, []);

  async function createYard(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await request("create-yard", { name: yardName, code: yardCode });
      setYardName("");
      setYardCode("");
      setMessage("Yard created. Add work zones here, then open the rack map to arrange racks.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function addZone(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedYard) return;
    setSaving(true);
    setMessage("");
    try {
      await request("save-zone", {
        yardId: selectedYard.id,
        name: zoneName,
        sortOrder: selectedZones.length + 1,
      });
      setZoneName("");
      setMessage("Work zone added.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function renameZone(zone: Zone) {
    const name = window.prompt("Work-zone name", zone.name)?.trim();
    if (!name || !selectedYard) return;
    try {
      await request("save-zone", { yardId: selectedYard.id, zoneId: zone.id, name, code: zone.code, sortOrder: zone.sort_order });
      setMessage("Work zone updated.");
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  async function deleteZone(zone: Zone) {
    if (!selectedYard || !window.confirm(`Delete ${zone.name}?`)) return;
    try {
      await request("delete-zone", { yardId: selectedYard.id, zoneId: zone.id });
      setMessage("Work zone deleted.");
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>Customer Inventory</span>
          <h1>Yard Setup</h1>
        </div>
        <div className={styles.actions}>
          <button className="button" onClick={() => window.history.back()}>Back</button>
          <button className="button" onClick={() => (window.location.href = "/customer")}>Customer Home</button>
        </div>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span>01</span>
            <h2>Create a Yard</h2>
          </div>
        </div>
        <form className={styles.form} onSubmit={createYard}>
          <label>
            Yard Name
            <input value={yardName} onChange={(event) => setYardName(event.target.value)} placeholder="Example: Acme Odessa Yard" required />
          </label>
          <label>
            Yard Code
            <input value={yardCode} onChange={(event) => setYardCode(event.target.value)} placeholder="Example: ODESSA" />
          </label>
          <button className="button primary" disabled={saving}>Create Yard</button>
        </form>
      </section>

      {yards.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span>02</span>
              <h2>Configure Your Yard</h2>
            </div>
            <button className="button primary" onClick={() => (window.location.href = `/?yard=${selectedYard?.id ?? ""}`)}>
              Open Rack Map
            </button>
          </div>

          <label className={styles.yardPicker}>
            Yard
            <select value={selectedYard?.id ?? ""} onChange={(event) => setSelectedYardId(event.target.value)}>
              {yards.map((yard) => <option key={yard.id} value={yard.id}>{yard.name}</option>)}
            </select>
          </label>

          <div className={styles.summary}>
            <div><strong>{selectedRacks.length}</strong><span>Racks</span></div>
            <div><strong>{selectedZones.length}</strong><span>Work Zones</span></div>
          </div>

          <div className={styles.zonePanel}>
            <div className={styles.zoneHeader}>
              <h3>Work Zones</h3>
              <form onSubmit={addZone}>
                <input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="New work-zone name" required />
                <button className="button" disabled={saving}>Add Zone</button>
              </form>
            </div>
            <div className={styles.zoneList}>
              {selectedZones.map((zone) => (
                <div key={zone.id}>
                  <strong>{zone.name}</strong>
                  <span>{zone.code}</span>
                  <button className="button" onClick={() => renameZone(zone)}>Rename</button>
                  <button className="button" onClick={() => deleteZone(zone)}>Delete</button>
                </div>
              ))}
              {!selectedZones.length && <p>No work zones yet.</p>}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
