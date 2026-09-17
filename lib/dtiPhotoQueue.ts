"use client";

import { getValidAccessToken } from "./clientSession";

const DATABASE_NAME = "titan-dti-photo-offline";
const DATABASE_VERSION = 1;
const STORE_NAME = "photoUploads";
const QUEUE_EVENT = "titan:dti-photo-queue";
const endpoint = "/api/dti/inspection-reports/photos";

export type DtiPhotoUpload = {
  id: string;
  reportId: string;
  itemId: string;
  findingKey: string;
  findingLabel: string;
  jointNumber: string;
  serialNumber: string;
  caption: string;
  fileName: string;
  mimeType: string;
  file: Blob;
  queuedAt: string;
  attempts: number;
  lastError: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("TITAN could not open photo storage."));
  });
}

function emitChange() { window.dispatchEvent(new CustomEvent(QUEUE_EVENT)); }

async function writeUpload(upload: DtiPhotoUpload) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(upload);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("TITAN could not retain this photo.")); };
  });
}

async function deleteUpload(id: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("TITAN could not update photo storage.")); };
  });
}

export async function getQueuedDtiPhotos(reportId?: string) {
  if (typeof window === "undefined" || !("indexedDB" in window)) return [];
  const database = await openDatabase();
  return new Promise<DtiPhotoUpload[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as DtiPhotoUpload[]).filter((item) => !reportId || item.reportId === reportId).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt)));
    request.onerror = () => reject(request.error ?? new Error("TITAN could not read retained photos."));
    transaction.oncomplete = () => database.close();
  });
}

async function uploadPhoto<T>(upload: DtiPhotoUpload) {
  const token = await getValidAccessToken();
  if (!token) throw Object.assign(new Error("Your TITAN session expired. Sign in again to upload photos."), { retryable: true });
  const form = new FormData();
  form.set("reportId", upload.reportId);
  form.set("itemId", upload.itemId);
  form.set("findingKey", upload.findingKey);
  form.set("findingLabel", upload.findingLabel);
  form.set("jointNumber", upload.jointNumber);
  form.set("serialNumber", upload.serialNumber);
  form.set("caption", upload.caption);
  form.set("file", upload.file, upload.fileName);
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(body.error || "TITAN could not upload this photo."), { retryable: response.status === 401 || response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500 });
  return body;
}

export async function sendOrQueueDtiPhoto<T>(values: Omit<DtiPhotoUpload, "id" | "queuedAt" | "attempts" | "lastError">) {
  const upload: DtiPhotoUpload = { ...values, id: crypto.randomUUID(), queuedAt: new Date().toISOString(), attempts: 0, lastError: "" };
  if (navigator.onLine) {
    try { return { status: "uploaded" as const, data: await uploadPhoto<T>(upload) }; }
    catch (error) {
      if (!(error as Error & { retryable?: boolean }).retryable && !(error instanceof TypeError)) throw error;
    }
  }
  await writeUpload(upload); emitChange();
  return { status: "queued" as const, upload };
}

export async function flushDtiPhotoQueue(reportId?: string) {
  if (!navigator.onLine) return { uploaded: 0, remaining: (await getQueuedDtiPhotos(reportId)).length, lastError: "" };
  const queued = await getQueuedDtiPhotos(reportId); let uploaded = 0; let lastError = "";
  for (const item of queued) {
    try { await uploadPhoto(item); await deleteUpload(item.id); uploaded += 1; }
    catch (error) {
      lastError = error instanceof Error ? error.message : "Photo upload failed.";
      await writeUpload({ ...item, attempts: item.attempts + 1, lastError });
      break;
    }
  }
  emitChange();
  return { uploaded, remaining: (await getQueuedDtiPhotos(reportId)).length, lastError };
}

export async function removeQueuedDtiPhoto(id: string) {
  await deleteUpload(id); emitChange();
}

export function subscribeToDtiPhotoQueue(listener: () => void) {
  window.addEventListener(QUEUE_EVENT, listener);
  return () => window.removeEventListener(QUEUE_EVENT, listener);
}
