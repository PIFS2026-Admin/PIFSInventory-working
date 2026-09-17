"use client";

import { getValidAccessToken } from "./clientSession";

const DATABASE_NAME = "titan-dti-offline";
const DATABASE_VERSION = 1;
const MUTATION_STORE = "mutations";
const SNAPSHOT_STORE = "snapshots";
const QUEUE_EVENT = "titan:dti-offline-queue";

export type DtiQueueStatus = "pending" | "needs_attention";

export type DtiQueuedMutation = {
  id: string;
  endpoint?: string;
  jobId: string;
  runId: string;
  action: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
  lastError: string;
  status: DtiQueueStatus;
};

type DtiSnapshot = {
  id: string;
  jobId: string;
  savedAt: string;
  data: unknown;
};

type SendResult<T> = { status: "saved"; data: T } | { status: "queued"; mutation: DtiQueuedMutation };

function supportsOfflineStorage() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!supportsOfflineStorage()) return reject(new Error("Offline storage is not supported on this device."));
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MUTATION_STORE)) {
        const store = database.createObjectStore(MUTATION_STORE, { keyPath: "id" });
        store.createIndex("jobId", "jobId", { unique: false });
        store.createIndex("queuedAt", "queuedAt", { unique: false });
      }
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("TITAN could not open offline storage."));
  });
}

async function readAll<T>(storeName: string) {
  const database = await openDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error("TITAN could not read offline storage."));
    transaction.oncomplete = () => database.close();
  });
}

async function readOne<T>(storeName: string, key: string) {
  const database = await openDatabase();
  return new Promise<T | null>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("TITAN could not read offline storage."));
    transaction.oncomplete = () => database.close();
  });
}

async function writeOne<T>(storeName: string, value: T) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("TITAN could not update offline storage.")); };
  });
}

async function deleteOne(storeName: string, key: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("TITAN could not update offline storage.")); };
  });
}

function emitQueueChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

function mutationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dti-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRetryableStatus(status: number) {
  return status === 401 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function postMutation<T>(payload: Record<string, unknown>, endpoint = "/api/dti/job-execution") {
  const token = await getValidAccessToken();
  if (!token) {
    const error = new Error("Your TITAN session expired. Sign in again to sync saved work.") as Error & { retryable?: boolean };
    error.retryable = true;
    throw error;
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(response.status === 401 ? "Your TITAN session expired. Sign in again to sync saved work." : data.error || "TITAN could not save the queued inspection.") as Error & { retryable?: boolean };
    error.retryable = isRetryableStatus(response.status);
    throw error;
  }
  return data;
}

export async function getQueuedDtiMutations(jobId?: string, runId?: string) {
  if (!supportsOfflineStorage()) return [];
  const all = await readAll<DtiQueuedMutation>(MUTATION_STORE);
  return all
    .filter((item) => (!jobId || item.jobId === jobId) && (!runId || item.runId === runId))
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function queueDtiMutation(payload: Record<string, unknown>, endpoint = "/api/dti/job-execution") {
  const mutation: DtiQueuedMutation = {
    id: mutationId(),
    endpoint,
    jobId: String(payload.jobId ?? payload.reportId ?? ""),
    runId: String(payload.runId ?? ""),
    action: String(payload.action ?? ""),
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    status: "pending",
  };
  await writeOne(MUTATION_STORE, mutation);
  emitQueueChange();
  return mutation;
}

export async function sendOrQueueDtiMutation<T>(payload: Record<string, unknown>, endpoint = "/api/dti/job-execution"): Promise<SendResult<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { status: "queued", mutation: await queueDtiMutation(payload, endpoint) };
  }
  try {
    return { status: "saved", data: await postMutation<T>(payload, endpoint) };
  } catch (error) {
    const retryable = (error as Error & { retryable?: boolean }).retryable;
    if (retryable || (typeof navigator !== "undefined" && !navigator.onLine) || error instanceof TypeError) {
      return { status: "queued", mutation: await queueDtiMutation(payload, endpoint) };
    }
    throw error;
  }
}

export async function flushDtiMutationQueue(jobId?: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, remaining: (await getQueuedDtiMutations(jobId)).length };
  const queued = await getQueuedDtiMutations(jobId);
  let synced = 0;
  for (const mutation of queued) {
    if (mutation.status === "needs_attention") continue;
    try {
      await postMutation(mutation.payload, mutation.endpoint);
      await deleteOne(MUTATION_STORE, mutation.id);
      synced += 1;
    } catch (error) {
      const next: DtiQueuedMutation = {
        ...mutation,
        attempts: mutation.attempts + 1,
        lastError: error instanceof Error ? error.message : "Sync failed.",
        status: (error as Error & { retryable?: boolean }).retryable ? "pending" : "needs_attention",
      };
      await writeOne(MUTATION_STORE, next);
      if (next.status === "pending") break;
    }
  }
  emitQueueChange();
  return { synced, remaining: (await getQueuedDtiMutations(jobId)).length };
}

export async function removeQueuedDtiMutation(id: string) {
  if (!supportsOfflineStorage()) return;
  await deleteOne(MUTATION_STORE, id);
  emitQueueChange();
}

export async function saveDtiExecutionSnapshot(jobId: string, data: unknown) {
  return saveDtiOfflineSnapshot(jobId, data);
}

export async function saveDtiOfflineSnapshot(id: string, data: unknown) {
  if (!supportsOfflineStorage()) return;
  const snapshot: DtiSnapshot = { id, jobId: id, savedAt: new Date().toISOString(), data };
  await writeOne(SNAPSHOT_STORE, snapshot);
}

export async function getDtiExecutionSnapshot<T>(jobId: string) {
  return getDtiOfflineSnapshot<T>(jobId);
}

export async function getDtiOfflineSnapshot<T>(id: string) {
  if (!supportsOfflineStorage()) return null;
  return readOne<DtiSnapshot>(SNAPSHOT_STORE, id).then((snapshot) => snapshot ? { data: snapshot.data as T, savedAt: snapshot.savedAt } : null);
}

export function subscribeToDtiQueue(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(QUEUE_EVENT, listener);
  return () => window.removeEventListener(QUEUE_EVENT, listener);
}
