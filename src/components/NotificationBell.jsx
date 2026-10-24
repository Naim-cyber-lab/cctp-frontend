import { AtSign, BadgeCheck, Bell, BellRing, Check, CheckCheck, CircleCheckBig, CornerDownRight, Handshake, MessageSquare, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { disablePush, enablePush, isSubscribed, pushPermission, testPush } from "../utils/push";
import "../notifications.css";

const COPY = {
  mention: { icon: AtSign, text: "vous a mentionné" },
  reply: { icon: CornerDownRight, text: "a répondu à une discussion" },
  comment: { icon: MessageSquare, text: "a commenté votre CCTP" },
  resolved: { icon: Check, text: "a résolu une discussion" },
  consult: { icon: Handshake, text: "" },
  task_assigned: { icon: CircleCheckBig, text: "" }, permission_changed: { icon: ShieldCheck, text: "" }, validation: { icon: BadgeCheck, text: "" },
  devis_shared: { icon: Handshake, text: "" }, devis_role: { icon: Handshake, text: "" }, devis_changed: { icon: Handshake, text: "" }, devis_access: { icon: Handshake, text: "" }, devis_mention: { icon: AtSign, text: "" },
};
const TITLES = { task_assigned: "Tâche assignée", permission_changed: "Droits de modification", validation: "Validation demandée" };
export const notificationLabel = (item) => TITLES[item.kind] || (item.kind === "consult" ? "Consultation des entreprises" : String(item.kind).startsWith("devis_") ? "DPGF" : `${(item.actorEmail || "Quelqu’un").split("@")[0]} ${(COPY[item.kind] || COPY.comment).text}`);
const relative = (value) => {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "à l’instant";
  if (Math.abs(seconds) < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
};

/** Notifications système (comme celles d'un téléphone) : activer, tester ou désactiver sur cet appareil, même quand Calepin est fermé. */
function DevicePush() {
  const [permission, setPermission] = useState(pushPermission());
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async () => { setPermission(pushPermission()); setSubscribed(await isSubscribed()); };
  useEffect(() => { refresh(); }, []);
  const turnOn = async () => { setMessage(""); const result = await enablePush(); await refresh(); if (result !== "granted") setMessage("Autorisation refusée : activez-la dans les réglages du navigateur."); };
  const test = async () => { setMessage(""); try { await testPush(); setMessage("Notification envoyée : elle doit apparaître dans quelques secondes."); } catch (reason) { setMessage(reason.message || "L'essai a échoué."); } };
  const turnOff = async () => { await disablePush(); await refresh(); setMessage("Notifications désactivées sur cet appareil."); };
  return <section className="notification-device" data-push-settings>
    <b><BellRing size={14} /> Notifications sur cet appareil</b>
    {permission === "unsupported" && <p>Ce navigateur ne gère pas les notifications système.</p>}
    {permission === "denied" && <p data-push-state="denied">Elles sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur (cadenas à gauche de l'adresse), puis revenez ici.</p>}
    {permission === "default" && <><p>Recevez une alerte sur votre écran quand on vous mentionne, vous assigne une tâche ou partage un CCTP, même si Calepin est fermé.</p><button type="button" data-push-enable onClick={turnOn}>Activer les notifications</button></>}
    {permission === "granted" && !subscribed && <><p>L'autorisation est donnée, mais cet appareil n'est pas encore enregistré.</p><button type="button" data-push-enable onClick={turnOn}>Enregistrer cet appareil</button></>}
    {permission === "granted" && subscribed && <div data-push-state="on"><p>Activées sur cet appareil.</p><div className="notification-device-actions"><button type="button" data-push-test onClick={test}>Envoyer un test</button><button type="button" data-push-disable onClick={turnOff}>Désactiver</button></div></div>}
    {message && <small role="status" data-push-message>{message}</small>}
  </section>;
}

/** Cloche des notifications (mentions, réponses, discussions résolues) : pastille de non-lus, liste, un clic ouvre le commentaire. */
export function NotificationBell({ items = [], unread = 0, onOpen, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return <div className="notification-bell" ref={ref}>
    <button type="button" className="icon-button" data-notification-bell aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`} aria-expanded={open} title="Notifications" onClick={() => setOpen((value) => !value)}>
      <Bell size={17} />{unread > 0 && <em data-notification-count>{unread > 99 ? "99+" : unread}</em>}
    </button>
    {open && <div className="notification-panel" role="dialog" aria-label="Notifications" data-notification-panel>
      <header><b>Notifications</b>{unread > 0 && <button type="button" data-notification-read-all onClick={onMarkAllRead}><CheckCheck size={13} /> Tout marquer comme lu</button>}<button type="button" aria-label="Fermer" onClick={() => setOpen(false)}><X size={14} /></button></header>
      {!items.length && <p className="notification-empty">Aucune notification pour l’instant. Vous serez prévenu quand quelqu’un vous mentionne, répond à votre commentaire ou résout une discussion.</p>}
      <ul>{items.map((item) => {
        const Icon = (COPY[item.kind] || COPY.comment).icon;
        return <li key={item.id} className={item.read ? "" : "unread"} data-notification={item.id} data-notification-kind={item.kind}>
          <button type="button" onClick={() => { setOpen(false); onOpen?.(item); }}>
            <span className="notification-icon"><Icon size={14} /></span>
            <span className="notification-text"><b>{notificationLabel(item)}</b><small>{item.cctpName} · {relative(item.createdAt)}</small><q>{item.excerpt}</q></span>
            {!item.read && <i aria-label="Non lue" />}
          </button>
        </li>;
      })}</ul>
      <DevicePush />
    </div>}
  </div>;
}

/** Bulles de notification en direct (en bas à droite). */
export function NotificationToasts({ toasts, onOpen, onDismiss }) {
  if (!toasts?.length) return null;
  return <div className="mention-toasts notification-toasts" role="region" aria-label="Nouvelles notifications" aria-live="polite">
    {toasts.map((toast) => {
      const Icon = (COPY[toast.kind] || COPY.comment).icon;
      return <article key={toast.id} className="mention-toast" data-toast-notification={toast.kind} onClick={() => onOpen(toast)}>
        <span className="mention-toast-icon"><Icon size={16} /></span>
        <span className="mention-toast-text"><b>{notificationLabel(toast)}</b><small>{toast.cctpName}</small><q>{toast.excerpt}</q></span>
        <button type="button" aria-label="Fermer la notification" data-toast-close onClick={(event) => { event.stopPropagation(); onDismiss(toast.id); }}><X size={14} /></button>
      </article>;
    })}
  </div>;
}
