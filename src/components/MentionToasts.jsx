import { AtSign, X } from "lucide-react";
import "../mention-toasts.css";

const LABEL = { user: "vous a mentionné", all: "a mentionné toute l’équipe", here: "a mentionné les membres en ligne" };

/** Bulles de notification de mention (en bas à droite) : un clic ouvre la discussion concernée. */
export function MentionToasts({ toasts, onOpen, onDismiss }) {
  if (!toasts?.length) return null;
  return (
    <div className="mention-toasts" role="region" aria-label="Notifications de mention" aria-live="polite">
      {toasts.map((toast) => (
        <article key={toast.id} className="mention-toast" data-toast-mention={toast.scope} onClick={() => onOpen(toast)}>
          <span className="mention-toast-icon"><AtSign size={16} /></span>
          <span className="mention-toast-text">
            <b>{toast.senderName} {LABEL[toast.scope] || LABEL.user}</b>
            <small>{toast.conversationTitle}</small>
            <q>{toast.snippet}</q>
          </span>
          <button type="button" aria-label="Fermer la notification" data-toast-close onClick={(event) => { event.stopPropagation(); onDismiss(toast.id); }}><X size={14} /></button>
        </article>
      ))}
    </div>
  );
}
