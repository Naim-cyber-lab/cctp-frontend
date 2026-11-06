import { useState } from "react";

// Vocabulaire de l'interface : jamais « agent », « modèle local », « pipeline », « cible » (termes internes).
export const friendly = (text) => String(text || "")
  .replace(/L[’']agent travaille en local/gi, "Calepin prépare une réponse")
  .replace(/\bl[’']agent\b/gi, "Calepin").replace(/\bagent\b/gi, "Calepin")
  .replace(/le modèle local/gi, "Calepin").replace(/\bmodèle local\b/gi, "Calepin")
  .replace(/\bpipeline\b/gi, "analyse").replace(/\bcible\b/gi, "passage");

/** Indicateur de travail : une seule ligne dans le fil (jamais une carte ni une fenêtre), détail replié par défaut. */
export function InlineStatus({ activity, label = "Calepin prépare une réponse…" }) {
  const [open, setOpen] = useState(false);
  return <div className="ai-activity ai-inline-status" data-ai-working role="status" aria-live="polite">
    <span className="ai-working-line"><i className="ai-dot" aria-hidden="true" /><span data-ai-working-label>{label}</span>
      {activity.length > 1 && <button type="button" className="link-button" data-ai-detail-toggle aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Masquer le détail" : "Voir le détail"}</button>}</span>
    {open && <ol className="ai-detail" data-ai-detail>{activity.map((item, index) => <li key={`${item.step}-${index}`}>{friendly(item.message)}</li>)}</ol>}
  </div>;
}

/** Première ouverture (conversation vide) : disparaît dès que la conversation commence. */
export function EmptyState({ topic, onExample }) {
  return <div className="ai-empty" data-ai-empty>
    <h3>Comment puis-je vous aider ?</h3>
    <p>Posez une question technique sur {topic} ou demandez-moi de modifier un passage du CCTP.</p>
    <span className="ai-empty-label">Exemples</span>
    <button type="button" data-ai-example="technical" onClick={() => onExample("Quelle différence entre M1 et A2-s1,d0 ?")}>Quelle différence entre M1 et A2-s1,d0 ?</button>
    <button type="button" data-ai-example="edit" onClick={() => onExample("Reformule ce passage de façon plus contractuelle")}>Reformule ce passage de façon plus contractuelle</button>
  </div>;
}

/** Suggestions de suite : libellé explicite, trois au maximum, jamais plus longues que la réponse elle-même. */
export function Suggestions({ items, onPick }) {
  const shown = [...new Set(items.filter(Boolean))].slice(0, 3);
  if (!shown.length) return null;
  return <div className="ai-suggestions" data-ai-suggestions><span className="ai-suggestions-label">Vous pouvez aussi demander :</span>
    <span className="ai-suggestion-chips">{shown.map((text) => <button type="button" key={text} data-ai-suggestion onClick={() => onPick(text)}>{text.length > 90 ? `${text.slice(0, 88)}…` : text}</button>)}</span></div>;
}

// « Sources » d'une réponse technique : repliées (Sources · 2) au lieu de consommer de la hauteur en permanence
export const splitSources = (content) => {
  const text = String(content || "");
  const match = text.match(/\n\s*Sources\s*\n([\s\S]*)$/);
  if (!match) return { body: text, sources: [] };
  return { body: text.slice(0, match.index).trim(), sources: match[1].split("\n").map((line) => line.trim()).filter((line) => /^\[\d+\]/.test(line)) };
};

const SYSTEM_MESSAGE = /^(La modification|Modification appliquée|Proposition annulée|Retour enregistré)/;
const LONG_ANSWER = 3200;

/** Message du fil : l'utilisateur à droite (léger), Calepin sans carte ; les messages système restent des lignes discrètes. Aucun ascenseur interne, jamais. */
export function ChatMessage({ item, body, technical, children }) {
  const [more, setMore] = useState(false);
  if (item.role === "user") return <div className="chapter-chat-message user" data-chat-role="user" data-chat-status={item.pending ? "SENT_PENDING" : "SENT"} {...(item.pending ? { "data-pending": "" } : {})}><p data-chat-message-text>{item.content}</p></div>;
  if (SYSTEM_MESSAGE.test(String(item.content || "").trim())) return <div className="chapter-chat-message assistant system" data-chat-role="system"><small data-chat-message-text>✓ {item.content}</small></div>;
  const { body: main, sources } = splitSources(body);
  const long = main.length > LONG_ANSWER && !more;
  return <div className="chapter-chat-message assistant" data-chat-role="assistant">
    <p data-chat-message-text>{long ? `${main.slice(0, LONG_ANSWER - 200)}…` : main}</p>
    {main.length > LONG_ANSWER && <button type="button" className="link-button" data-chat-more onClick={() => setMore(!more)}>{more ? "Réduire" : "Afficher la suite"}</button>}
    {sources.length > 0 && <details className="ai-sources" data-ai-sources><summary>Sources · {sources.length}</summary><ul>{sources.map((line) => <li key={line}>{line}</li>)}</ul></details>}
    {children}
  </div>;
}
