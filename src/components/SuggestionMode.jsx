import { Check, ChevronDown, MessageSquareDiff, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colorFor } from "../hooks/useLiveDocumentCollaboration";
import { handleSuggestInput, listSuggestions, resolveAll, resolveSuggestion } from "../utils/suggestions";
import "../suggestions.css";

const initials = (email = "") => email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
const relative = (ts) => {
  if (!ts) return "";
  const seconds = Math.round((ts - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "à l’instant";
  if (Math.abs(seconds) < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
};
const short = (text) => (text.length > 120 ? `${text.slice(0, 120)}…` : text);

/** Mode « Suggestion » façon Google Docs : on propose au lieu de modifier ; le créateur (ou un rédacteur) accepte ou refuse chaque proposition. */
export function SuggestionMode({ rootRef, readOnly, currentEmail, mode, onModeChange }) {
  const [host, setHost] = useState(null);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => { setHost(document.querySelector(".editor-actions")); }, []);

  const scan = useCallback(() => { const root = rootRef.current; if (root) setItems(listSuggestions(root).map(({ id, author, ts, color, ins, del }) => ({ id, author, ts, color, ins, del }))); }, [rootRef]);
  useEffect(() => {
    scan();
    const root = rootRef.current;
    if (!root) return undefined;
    let timer;
    const later = () => { clearTimeout(timer); timer = setTimeout(scan, 180); };
    const observer = new MutationObserver(later);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("collab:remote-edit", later);
    return () => { clearTimeout(timer); observer.disconnect(); root.removeEventListener("collab:remote-edit", later); };
  }, [rootRef, scan]);

  // en mode suggestion, la frappe devient une proposition
  useEffect(() => {
    const root = rootRef.current;
    document.body.dataset.editMode = mode === "suggest" && !readOnly ? "suggest" : "edit";
    if (!root || readOnly || mode !== "suggest") return undefined;
    const ctx = { email: currentEmail, color: colorFor(currentEmail) };
    const onBeforeInput = (event) => { if (!root.contains(event.target)) return; handleSuggestInput(event, ctx); };
    root.addEventListener("beforeinput", onBeforeInput, true);
    return () => { root.removeEventListener("beforeinput", onBeforeInput, true); delete document.body.dataset.editMode; };
  }, [rootRef, readOnly, mode, currentEmail]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const find = (id) => listSuggestions(rootRef.current).find((group) => group.id === id);
  const decide = (id, accept) => { const group = find(id); if (group) resolveSuggestion(group, accept); scan(); };
  const goTo = (id) => {
    const group = find(id);
    const element = group?.elements[0];
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
    group.elements.forEach((node) => { node.classList.add("sg-pulse"); setTimeout(() => node.classList.remove("sg-pulse"), 1400); });
  };

  const labelOf = (item) => (item.ins.length && item.del.length ? "Remplacer" : item.ins.length ? "Ajouter" : "Supprimer");
  const toggles = <div className="suggest-controls" data-suggest-controls>
    {/* plus de bouton « Édition / Suggestion » : on modifie toujours directement le document */}
    {/* Rien à l'écran tant qu'il n'y a aucune suggestion en attente : le bouton apparaît avec son compteur dès qu'il y en a une */}
    {(items.length > 0 || open) && <button type="button" className={`secondary suggest-toggle ${open ? "active" : ""}`} data-suggestions-toggle title="Suggestions en attente" onClick={() => setOpen((value) => !value)}>
      <MessageSquareDiff size={16} /> Suggestions{items.length > 0 && <b data-suggestions-count>{items.length}</b>}
    </button>}
  </div>;

  return <>
    {host && createPortal(toggles, host)}
    {open && <aside className="suggestions-panel" data-suggestions-panel role="complementary" aria-label="Suggestions">
      <header><b>Suggestions</b>
        {!readOnly && items.length > 1 && <span className="suggest-bulk"><button type="button" data-suggest-accept-all onClick={() => { resolveAll(rootRef.current, true); scan(); }}><Check size={12} /> Tout accepter</button><button type="button" data-suggest-reject-all onClick={() => { resolveAll(rootRef.current, false); scan(); }}><X size={12} /> Tout refuser</button></span>}
        <button type="button" aria-label="Fermer" onClick={() => setOpen(false)}><X size={16} /></button></header>
      {!items.length && <p className="suggest-empty">Aucune suggestion en attente.{!readOnly && " Passez en mode « Suggestion » pour proposer une modification sans toucher au texte."}</p>}
      {items.map((item) => <section key={item.id} className="suggest-card" data-suggestion={item.id} style={{ "--sg": item.color || colorFor(item.author) }} onClick={() => goTo(item.id)}>
        <header><span className="suggest-avatar">{initials(item.author)}</span><div><b>{item.author.split("@")[0]}</b><small>{relative(item.ts)}</small></div><em>{labelOf(item)}</em></header>
        {item.del.length > 0 && <p className="suggest-del">{short(item.del.join(" … "))}</p>}
        {item.ins.length > 0 && <p className="suggest-ins">{short(item.ins.join(" … "))}</p>}
        {!readOnly && <div className="suggest-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="accept" data-suggest-accept onClick={() => decide(item.id, true)}><Check size={13} /> Accepter</button>
          <button type="button" className="reject" data-suggest-reject onClick={() => decide(item.id, false)}><X size={13} /> Refuser</button>
        </div>}
      </section>)}
    </aside>}
  </>;
}
