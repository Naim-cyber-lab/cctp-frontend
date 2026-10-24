import { Share2, X } from "lucide-react";
import "../mention-toasts.css";

const ROLE = { read: "en lecture seule", write: "en écriture" };

/** Notification « un CCTP a été partagé avec vous » (bulle en bas à droite) : un clic l'ouvre. */
export function ShareToasts({ toasts, onOpen, onDismiss }) {
  if (!toasts?.length) return null;
  return (
    <div className="mention-toasts share-toasts" role="region" aria-label="Notifications de partage" aria-live="polite">
      {toasts.map((toast) => (
        <article key={toast.id} className="mention-toast" data-toast-share={toast.cctpId} onClick={() => onOpen(toast)}>
          <span className="mention-toast-icon"><Share2 size={16} /></span>
          <span className="mention-toast-text">
            <b>{toast.by || "Un collègue"} a partagé un CCTP avec vous</b>
            <small>{toast.name} · {ROLE[toast.role] || ROLE.read}</small>
            <q>Cliquez pour l’ouvrir</q>
          </span>
          <button type="button" aria-label="Fermer la notification" data-toast-close onClick={(event) => { event.stopPropagation(); onDismiss(toast.id); }}><X size={14} /></button>
        </article>
      ))}
    </div>
  );
}
