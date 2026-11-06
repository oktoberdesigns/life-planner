import { query, getKV, setKV } from "./db";
import { env } from "./env";

interface Vapid { publicKey: string; privateKey: string }

/** VAPID keys are generated once and stored, so there is nothing to configure. */
export async function vapid(): Promise<Vapid> {
  const { default: webpush } = await import("web-push");
  let keys = await getKV<Vapid>("vapid");
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await setKV("vapid", keys);
  }
  return keys;
}

export async function sendPush(payload: { title: string; body?: string; url?: string; tag?: string }) {
  const { default: webpush } = await import("web-push");
  const keys = await vapid();
  webpush.setVapidDetails(`mailto:${env("OWNER_EMAIL") || "owner@example.com"}`, keys.publicKey, keys.privateKey);
  const subs = await query<{ endpoint: string; p256dh: string; auth: string }>("select endpoint, p256dh, auth from push_subscriptions");
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await query("delete from push_subscriptions where endpoint = $1", [s.endpoint]);
        else console.error("push failed", e?.statusCode ?? e);
      }
    }),
  );
  return subs.length;
}

/** Send once per key. Returns true if it was sent. */
export async function sendPushOnce(key: string, payload: Parameters<typeof sendPush>[0]) {
  const claimed = await query("insert into notification_log (key) values ($1) on conflict do nothing returning key", [key]);
  if (!claimed.length) return false;
  await sendPush(payload);
  return true;
}
