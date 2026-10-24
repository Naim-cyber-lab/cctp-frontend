import { getPushKey, subscribePush, testPush, unsubscribePush } from "../api/client";

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : "unsupported");

const toKey = (base64) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing || navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => navigator.serviceWorker.ready);
}

/** Abonne cet appareil (si la permission est déjà accordée) et l'enregistre côté serveur. Silencieux : à appeler à chaque connexion. */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const { publicKey } = await getPushKey();
      subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
    }
    const json = subscription.toJSON();
    await subscribePush({ endpoint: json.endpoint, keys: json.keys });
    return true;
  } catch {
    return false;
  }
}

/** Demande l'autorisation puis abonne l'appareil. Retourne « granted », « denied » ou « default ». */
export async function enablePush() {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "granted") await syncPush();
  return permission;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await unsubscribePush({ endpoint: subscription.endpoint }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  }
}

export async function isSubscribed() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return Boolean(await reg?.pushManager.getSubscription());
}

export { testPush };

/** Un clic sur une notification système ouvre l'adresse du CCTP concerné dans l'onglet déjà ouvert. */
export function listenNotificationClicks() {
  if (!pushSupported()) return () => {};
  const handler = (event) => { if (event.data?.type === "open-url" && event.data.url) window.location.assign(event.data.url); };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
