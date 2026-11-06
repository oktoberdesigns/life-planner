import { api } from "./api";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushStatus(): Promise<"unsupported" | "denied" | "on" | "off"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

export async function enablePush(label: string) {
  if (!pushSupported()) throw new Error("This browser doesn't support notifications. On iPhone/iPad, add the app to your Home Screen first.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications were blocked. Allow them in your browser settings.");
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api<{ key: string }>("/push/key");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
  await api("/push/subscribe", "POST", { ...sub.toJSON(), label });
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api("/push/unsubscribe", "POST", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  return `${os} · ${br}`;
}
