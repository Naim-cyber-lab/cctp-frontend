import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, X } from "lucide-react";
import { getQuestionnaireCatalog, getTeamClause, listRelevantClauses, useTeamClause } from "../api/client";
import { SECTION_TYPES, WORKFLOW, clauseMeta, lotLabel, sectionFromHeading, triggerMatches } from "../utils/clauses";

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const toHtml = (text) => escapeHtml(text).replace(/\n/g, "<br>");

/** Type de section du chapitre à l'endroit du curseur : on remonte jusqu'au titre le plus proche (« 1.1 GÉNÉRALITÉS »…). */
export function sectionAtCursor(root, range) {
  if (!root) return "";
  let block = range?.startContainer || null;
  while (block && block.parentNode !== root) block = block.parentNode;
  if (!block) block = root.lastElementChild;
  for (let node = block, steps = 0; node && steps < 80; node = node.previousElementSibling, steps += 1) {
    const text = (node.innerText || "").trim();
    if (text && text.length < 90 && !/[.;:]$/.test(text)) { const found = sectionFromHeading(text); if (found) return found; }
  }
  return "";
}

/** Insère une COPIE de la version actuelle de la clause (texte contractuel du CCTP). La provenance (clause, version, auteur, date) reste dans le document, jamais dans l'export final. */
export function insertClauseAtCursor(root, savedRange, clause, email) {
  if (!root) return false;
  root.focus();
  // Insertion par le DOM (pas par execCommand, qui supprime les attributs de provenance) : nouveau bloc juste après le paragraphe du curseur, sinon en fin de chapitre.
  let anchor = savedRange && root.contains(savedRange.startContainer) ? savedRange.startContainer : null;
  while (anchor && anchor.parentNode !== root) anchor = anchor.parentNode;
  const block = document.createElement("div");
  const span = document.createElement("span");
  span.setAttribute("data-agency-clause", clause.id);
  span.setAttribute("data-clause-version", String(clause.version));
  span.setAttribute("data-clause-title", clause.label);
  span.setAttribute("data-clause-inserted-by", email || "");
  span.setAttribute("data-clause-inserted-at", new Date().toISOString());
  String(clause.text).split(/\r?\n/).forEach((line, index) => { if (index) span.appendChild(document.createElement("br")); span.appendChild(document.createTextNode(line)); });
  block.appendChild(span);
  if (anchor) anchor.after(block); else root.appendChild(block);
  const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  root.dispatchEvent(new Event("input", { bubbles: true }));
  useTeamClause(clause.id).catch(() => {});
  return true;
}

/** Tiroir « Clauses de l'agence » : clauses pertinentes pour le chapitre (lot, type de section, étiquettes), puis les autres ; seules les clauses validées sont proposées (plus vos brouillons). */
export function ClauseDrawer({ lotId, sectionType, answers = {}, insertedIds = [], onInsert, onClose, onOpenLibrary }) {
  const [query, setQuery] = useState(""), [data, setData] = useState(null), [error, setError] = useState(""), [open, setOpen] = useState(""), [labels, setLabels] = useState({});
  useEffect(() => { getQuestionnaireCatalog().then((catalog) => setLabels(Object.fromEntries((catalog.questions || []).map((question) => [question.id, question.label])))).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => listRelevantClauses({ lot: lotId, section: sectionType, q: query.trim() }).then((value) => { if (alive) setData(value); }).catch((reason) => alive && setError(reason.message)), 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [lotId, sectionType, query]);
  const recommended = data ? [...data.relevant, ...data.others].filter((clause) => clause.workflowStatus === "VALIDATED" && !insertedIds.includes(clause.id)).map((clause) => ({ clause, hit: triggerMatches(clause.trigger, answers) })).filter((entry) => entry.hit !== null) : [];
  const recommendedIds = new Set(recommended.map((entry) => entry.clause.id));
  const row = (clause) => <li key={clause.id} data-clause-item={clause.id} data-clause-status={clause.workflowStatus}>
    <b>{clause.label}</b>
    <small>Version {clause.version}{clause.workflowStatus !== "VALIDATED" ? <span className={`clause-badge s-${clause.workflowStatus}`}> {WORKFLOW[clause.workflowStatus]}</span> : null}</small>
    <small>{clauseMeta(clause)}</small>
    {open === clause.id && <p className="clause-text" data-clause-item-text>{clause.text}</p>}
    <span className="actions"><button type="button" data-clause-item-view onClick={() => setOpen(open === clause.id ? "" : clause.id)}>{open === clause.id ? "Masquer" : "Voir"}</button><button type="button" className="primary" data-clause-item-insert onClick={() => onInsert(clause)}>Insérer</button></span>
  </li>;
  return <aside className="clause-drawer" role="dialog" aria-label="Clauses de l’agence" data-clause-drawer>
    <header><h2>Clauses de l’agence</h2><button type="button" aria-label="Fermer" data-clause-drawer-close onClick={onClose}><X size={18} /></button></header>
    <label className="library-search"><input type="search" data-clause-drawer-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une clause…" aria-label="Rechercher une clause" /></label>
    {error && <div className="err" role="alert">{error}</div>}
    {!data ? <p className="panel-empty">Chargement…</p> : <div className="clause-drawer-body">
      {recommended.length > 0 && <section data-clause-recommended><h3>Clause agence recommandée</h3><p className="clause-reco-note">D’après vos réponses au questionnaire — rien n’est inséré sans votre accord.</p>
        <ul>{recommended.map(({ clause, hit }) => <li key={clause.id} data-clause-item={clause.id} data-clause-reco><b>{clause.label}</b><small data-clause-reco-reason>Parce que : {labels[clause.trigger.questionId] || clause.trigger.questionId} → « {hit} »</small><span className="actions"><button type="button" data-clause-item-view onClick={() => setOpen(open === clause.id ? "" : clause.id)}>{open === clause.id ? "Masquer" : "Voir"}</button><button type="button" className="primary" data-clause-item-insert onClick={() => onInsert(clause)}>Insérer</button></span>{open === clause.id && <p className="clause-text">{clause.text}</p>}</li>)}</ul></section>}
      {data.relevant.filter((clause) => !recommendedIds.has(clause.id)).length > 0 && <section data-clause-relevant><h3>Pertinentes pour ce chapitre</h3><ul>{data.relevant.filter((clause) => !recommendedIds.has(clause.id)).map(row)}</ul></section>}
      {data.others.length > 0 && <section data-clause-others><h3>{data.relevant.length ? "Autres clauses" : "Clauses"} · {lotLabel(lotId)} et tous lots</h3><ul>{data.others.filter((clause) => !recommendedIds.has(clause.id)).map(row)}</ul></section>}
      {data.relevant.length + data.others.length === 0 && <p className="panel-empty" data-clause-drawer-empty>Aucune clause validée pour ce chapitre. Enregistrez un passage comme clause agence pour commencer.</p>}
    </div>}
    <footer><button type="button" className="secondary" data-clause-open-library onClick={onOpenLibrary}><BookOpenCheck size={14} /> Ouvrir la bibliothèque</button></footer>
  </aside>;
}

/** Clic sur une clause insérée : provenance (clause, version) ; si une version plus récente existe, comparaison et remplacement SEULEMENT sur action explicite. */
export function ClauseProvenance({ node, root, onOpenLibrary, onChanged, onClose }) {
  const [clause, setClause] = useState(undefined), [compare, setCompare] = useState(false);
  const id = node.getAttribute("data-agency-clause"), used = Number(node.getAttribute("data-clause-version")) || 1;
  const rect = node.getBoundingClientRect();
  const popover = useRef(null), comparing = useRef(false);
  comparing.current = compare;
  useEffect(() => { getTeamClause(id).then(setClause).catch(() => setClause(null)); }, [id]);
  useEffect(() => {
    const away = (event) => { if (comparing.current) return; if (!popover.current?.contains(event.target) && !node.contains(event.target)) onClose(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [node, onClose]);
  const newer = clause && clause.version > used;
  const replace = () => {
    node.textContent = "";
    node.insertAdjacentHTML("afterbegin", toHtml(clause.text));
    node.setAttribute("data-clause-version", String(clause.version));
    node.setAttribute("data-clause-title", clause.label);
    root.dispatchEvent(new Event("input", { bubbles: true }));
    onChanged?.(); onClose();
  };
  const style = { top: Math.min(rect.bottom + 8, window.innerHeight - 220), left: Math.max(12, Math.min(rect.left, window.innerWidth - 380)) };
  return <>
    <div className="clause-popover" ref={popover} style={style} role="dialog" aria-label="Clause agence" data-clause-popover>
      <b>Clause agence</b>
      <span data-clause-popover-title>{node.getAttribute("data-clause-title") || clause?.label}</span>
      <small data-clause-popover-version>Version {used}</small>
      {clause === null && <small>Cette clause n’est plus disponible dans la bibliothèque.</small>}
      {newer && <p className="clause-newer" data-clause-newer>Ce CCTP utilise la V{used}. La V{clause.version} est disponible. <button type="button" data-clause-compare onClick={() => setCompare(true)}>Comparer</button></p>}
      <span className="actions">{clause && <button type="button" data-clause-see-library onClick={() => { onOpenLibrary?.(); onClose(); }}>Voir dans la bibliothèque</button>}<button type="button" onClick={onClose}>Fermer</button></span>
    </div>
    {compare && clause && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompare(false); }}>
      <section className="estimate-documents clause-compare" role="dialog" aria-modal="true" aria-label="Comparer les versions" data-clause-compare-dialog>
        <header><h2>{clause.label}</h2><button type="button" aria-label="Fermer" onClick={() => setCompare(false)}><X size={18} /></button></header>
        <div className="clause-compare-cols"><div><h3>Version du CCTP (V{used})</h3><p data-clause-compare-mine>{node.textContent}</p></div><div><h3>Version agence actuelle (V{clause.version})</h3><p data-clause-compare-current>{clause.text}</p></div></div>
        <p className="price-modal-actions"><button type="button" className="secondary" data-clause-keep onClick={() => { setCompare(false); onClose(); }}>Conserver ma version</button><button type="button" className="primary" data-clause-replace onClick={replace}>Remplacer par la V{clause.version}</button></p>
      </section>
    </div>}
  </>;
}

export { SECTION_TYPES };
