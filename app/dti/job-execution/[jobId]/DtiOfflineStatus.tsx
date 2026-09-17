"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushDtiMutationQueue, getQueuedDtiMutations, subscribeToDtiQueue } from "../../../../lib/dtiOfflineQueue";
import styles from "./jobExecution.module.css";

type Props = { jobId: string; onSynced: () => void };

export default function DtiOfflineStatus({ jobId, onSynced }: Props) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [attention, setAttention] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const syncingRef = useRef(false);
  const onSyncedRef = useRef(onSynced);
  useEffect(() => { onSyncedRef.current = onSynced; }, [onSynced]);

  const refresh = useCallback(async () => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const queued = await getQueuedDtiMutations(jobId).catch(() => []);
    setPending(queued.length);
    setAttention(queued.filter((item) => item.status === "needs_attention").length);
  }, [jobId]);

  const sync = useCallback(async () => {
    if (syncingRef.current || typeof navigator === "undefined" || !navigator.onLine) return;
    syncingRef.current = true; setSyncing(true); setMessage("");
    try {
      const result = await flushDtiMutationQueue(jobId);
      await refresh();
      if (result.synced) { setMessage(`${result.synced} offline inspection${result.synced === 1 ? "" : "s"} synced.`); onSyncedRef.current(); }
      else if (result.remaining && result.lastError) setMessage(result.lastError);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Offline inspections could not be synced.");
    } finally { syncingRef.current = false; setSyncing(false); }
  }, [jobId, refresh]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); void sync(); };
    const onOffline = () => setOnline(false);
    const unsubscribe = subscribeToDtiQueue(() => void refresh());
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = window.setTimeout(() => void refresh().then(() => { if (navigator.onLine) void sync(); }), 0);
    return () => { window.clearTimeout(timer); unsubscribe(); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [refresh, sync]);

  return <section className={styles.offlineStatus} data-online={online} data-attention={attention > 0}>
    <div><span>{online ? "Online" : "Offline"}</span><strong>{online ? (pending ? `${pending} waiting to sync` : "All field records synced") : "Saving inspections on this device"}</strong>{attention ? <small>{attention} record{attention === 1 ? " needs" : "s need"} attention before syncing.</small> : null}{message ? <small>{message}</small> : null}</div>
    {pending && online ? <button type="button" onClick={() => void sync()} disabled={syncing}>{syncing ? "Syncing" : "Sync Now"}</button> : null}
  </section>;
}
