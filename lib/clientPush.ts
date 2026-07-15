import { supabase } from "./supabase";

export type TitanPushState = {
  supported: boolean;
  configured: boolean;
  hasSession: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  reason?: string;
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getReadyRegistration() {
  await navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  return navigator.serviceWorker.ready;
}

async function fetchVapidPublicKey() {
  const response = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Push notifications are not configured.");
  }

  return String(result.publicKey || "");
}

async function getUserAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

async function saveSubscription(subscription: PushSubscription) {
  const token = await getUserAccessToken();
  if (!token) throw new Error("Sign in before enabling push notifications.");

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      userAgent: navigator.userAgent,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Push subscription could not be saved.");
}

export async function getTitanPushState(): Promise<TitanPushState> {
  if (!pushSupported()) {
    return {
      supported: false,
      configured: false,
      hasSession: false,
      permission: "unsupported",
      subscribed: false,
      reason: "This browser does not support web push notifications.",
    };
  }

  const token = await getUserAccessToken();
  let publicKey = "";

  try {
    publicKey = await fetchVapidPublicKey();
  } catch (error) {
    return {
      supported: true,
      configured: false,
      hasSession: Boolean(token),
      permission: Notification.permission,
      subscribed: false,
      reason: error instanceof Error ? error.message : "Push notifications are not configured.",
    };
  }

  const registration = await getReadyRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription && token) {
    await saveSubscription(subscription).catch(() => undefined);
  }

  return {
    supported: true,
    configured: Boolean(publicKey),
    hasSession: Boolean(token),
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

export async function subscribeToTitanPush() {
  if (!pushSupported()) {
    throw new Error("This browser does not support web push notifications.");
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) throw new Error("TITAN push notifications are missing a VAPID public key.");

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Push notification permission was not granted.");
  }

  await navigator.serviceWorker.register("/service-worker.js");
  const readyRegistration = await navigator.serviceWorker.ready;
  const existingSubscription = await readyRegistration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await readyRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await saveSubscription(subscription);
  return subscription;
}
