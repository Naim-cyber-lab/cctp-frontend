import { useCallback, useEffect, useRef, useState } from "react";
import { BookmarkPlus, Check, Columns2, Copy, FileInput, Replace, Search, X } from "lucide-react";
import { findSimilarPassages, getOrganization } from "../api/client";
import { ClauseEditor } from "./AgencyClauses";
import { barPosition } from "../utils/selectionBar";
import "../similar-passages.css";

const MIN_SELECTION = 25;
const STEPS = ["Lecture de vos autres CCTP…", "Découpage en passages…", "Comparaison du sens avec votre sélection…", "Classement des passages les plus proches…"];
const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sélectionnez un passage dans le texte : un bouton propose de retrouver, dans vos autres CCTP, les passages les plus proches (recherche
 *  sémantique). Chaque résultat se copie ou s'insère en un clic sous la sélection. */
export function SimilarPassages({ cctpId, chapterId = null, rootSelector, readOnly = false }) {
  const [clauseOf, setClauseOf] = useState(null), [canPublishClause, setCanPublishClause] = useState(false), [clauseSaved, setClauseSaved] = useState("");
  const saveAsClause = (result) => { getOrganization().then((team) => setCanPublishClause(Boolean(team?.canManageLibrary))).catch(() => {}); setClauseOf({ text: result.text, label: String(result.text).slice(0, 60), lotId: chapterId || "" }); };
  const [launch, setLaunch] = useState(null); // { text, top, left }
  const [modal, setModal] = useState(null); // { text }
  const [state, setState] = useState({ loading: false, results: [], method: "", searched: 0, error: "" });
  const [copied, setCopied] = useState("");
  const [compared, setCompared] = useState({}); // résultats dont la comparaison est dépliée
  const [confirmReplace, setConfirmReplace] = useState(null); // résultat pour lequel le remplacement attend une validation
  const saved = useRef({ range: null, root: null });
  const [step, setStep] = useState(0);
  const requestId = useRef(0);

  // Échap ferme la barre d'actions et annule la sélection (un clic sur ses boutons, lui, la garde le temps de l'action)
  useEffect(() => {
    if (!launch) return undefined;
    const escape = (event) => { if (event.key === "Escape") { setLaunch(null); window.getSelection()?.removeAllRanges(); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [launch]);

  // bouton flottant près d'une sélection suffisamment longue, dans le texte du CCTP
  useEffect(() => {
    let frame;
    const check = (keepWhenCollapsed = false) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        // Le moteur collaboratif peut reconstruire le bloc et réduire techniquement la
        // sélection juste après pointerup. La proposition capturée doit rester visible.
        if (!keepWhenCollapsed) setLaunch(null);
        return;
      }
      const text = selection.toString().replace(/\s+/g, " ").trim();
      const range = selection.getRangeAt(0);
      const anchor = range.commonAncestorContainer?.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer?.parentElement;
      const root = anchor?.closest?.(rootSelector);
      if (!root || anchor?.closest?.("[data-similar-modal]") || text.length < MIN_SELECTION) { setLaunch(null); return; }
      const rect = range.getBoundingClientRect();
      setLaunch({ text, ...barPosition(rect, 0) });
    };
    // La collaboration peut reconstruire le contenteditable juste après le relâchement de la souris.
    // Lire la sélection 250 ms plus tard la perdait donc avant même d'afficher le bouton.
    const selectionChanged = () => { cancelAnimationFrame(frame); check(true); };
    const commitSelection = () => { cancelAnimationFrame(frame); check(false); };
    const afterInput = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => check(false)); };
    document.addEventListener("selectionchange", selectionChanged);
    document.addEventListener("pointerup", commitSelection, true);
    document.addEventListener("mouseup", commitSelection, true);
    document.addEventListener("keyup", afterInput, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", selectionChanged);
      document.removeEventListener("pointerup", commitSelection, true);
      document.removeEventListener("mouseup", commitSelection, true);
      document.removeEventListener("keyup", afterInput, true);
    };
  }, [rootSelector]);

  const search = useCallback(async (text) => {
    const id = ++requestId.current;
    setState({ loading: true, results: [], method: "", searched: 0, error: "" });
    try {
      const data = await findSimilarPassages(cctpId, { text: text.slice(0, 3500), chapterId, limit: 8 });
      if (id === requestId.current) setState({ loading: false, results: data.results || [], method: data.method, searched: data.searched || 0, error: "" });
    } catch (reason) {
      if (id === requestId.current) setState({ loading: false, results: [], method: "", searched: 0, error: reason.message || "La recherche a échoué." });
    }
  }, [cctpId, chapterId]);

  const open = () => {
    if (!launch) return;
    const selection = window.getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const anchor = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement;
    saved.current = { range, root: anchor?.closest?.(rootSelector) || null };
    setCompared({}); setConfirmReplace(null);
    setModal({ text: launch.text });
    setLaunch(null);
    search(launch.text);
  };

  // pendant la recherche : le message change d'étape, pour montrer que le travail avance
  useEffect(() => {
    if (!state.loading) { setStep(0); return undefined; }
    const timer = setInterval(() => setStep((value) => Math.min(value + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(timer);
  }, [state.loading]);
  const close = useCallback(() => { requestId.current += 1; setModal(null); }, []);
  useEffect(() => {
    if (!modal) return undefined;
    const escape = (event) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [modal, close]);

  const copy = async (result, index) => {
    try { await navigator.clipboard.writeText(result.text); } catch {
      const area = document.createElement("textarea");
      area.value = result.text; document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
    }
    setCopied(String(index)); setTimeout(() => setCopied(""), 1800);
  };

  // remplacement : la sélection est remplacée par le passage choisi, uniquement après validation explicite
  const replaceSelection = (result) => {
    const { range, root } = saved.current;
    if (!range || !root) return;
    root.focus();
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    document.execCommand("insertText", false, result.text);
    root.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  };

  // insertion : un nouveau paragraphe sous le bloc sélectionné
  const insert = (result) => {
    const { range, root } = saved.current;
    if (!range || !root) return;
    root.focus();
    const selection = window.getSelection();
    const container = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    let block = container;
    while (block && block.parentElement !== root) block = block.parentElement;
    const target = document.createRange();
    if (block) { target.selectNodeContents(block); target.collapse(false); } else { target.setStart(range.endContainer, range.endOffset); target.collapse(true); }
    selection.removeAllRanges(); selection.addRange(target);
    document.execCommand("insertParagraph");
    document.execCommand("insertText", false, result.text);
    root.dispatchEvent(new Event("input", { bubbles: true }));
    close();
  };

  return <>
    {launch && !modal && <button type="button" className="similar-launch sel-bar-btn" data-similar-launch title="Voir des formulations proches dans vos autres CCTP." style={{ top: launch.top, left: launch.left }}
      onMouseDown={(event) => event.preventDefault()} onClick={open}><Search size={14} /> Passages similaires</button>}
    {modal && <div className="similar-backdrop" data-similar-backdrop onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <aside className="similar-modal" data-similar-modal role="dialog" aria-label="Passages similaires dans vos autres CCTP">
        <header>
          <div><small>PASSAGES SIMILAIRES</small><b>Formulations trouvées dans vos autres CCTP</b></div>
          <button type="button" aria-label="Fermer" data-similar-close onClick={close}><X size={16} /></button>
        </header>
        <blockquote data-similar-selection>{modal.text.length > 260 ? `${modal.text.slice(0, 260)}…` : modal.text}</blockquote>
        {state.loading && <div className="similar-searching" data-similar-loading role="status" aria-live="polite">
          <div className="similar-radar" aria-hidden="true"><i /><i /><i /><Search size={18} /></div>
          <div className="similar-searching-text"><b data-similar-step>{STEPS[step]}</b><small>La recherche compare le sens des passages, pas seulement les mots.</small><div className="similar-progress" aria-hidden="true"><i /></div></div>
        </div>}
        {state.loading && <ul className="similar-skeletons" aria-hidden="true">{[0, 1, 2].map((index) => <li key={index}><span /><span /><span /></li>)}</ul>}
        {state.error && <p className="similar-state error" role="alert">{state.error}</p>}
        {!state.loading && !state.error && state.results.length === 0 && <p className="similar-state" data-similar-empty>Aucun passage proche trouvé dans vos autres CCTP.</p>}
        {!state.loading && state.method === "lexical" && state.results.length > 0 && <p className="similar-note">Recherche par mots (la recherche sémantique n'est pas disponible pour le moment).</p>}
        {clauseSaved && <p className="similar-note" data-similar-clause-saved role="status">{clauseSaved}</p>}
        <ul>
          {state.results.map((result, index) => <li key={`${result.cctpId}-${index}`} data-similar-result>
            <div className="similar-meta"><span>{result.cctpName}{result.chapterTitle ? ` · ${result.chapterTitle}` : ""}</span><em data-similar-score>{Math.round(result.score * 100)} %</em></div>
            <p data-similar-text>{result.text}</p>
            {compared[index] && <div className="similar-compare" data-similar-compare><div><small>Votre sélection</small><p>{modal.text}</p></div><div><small>Dans « {result.cctpName} »</small><p>{result.text}</p></div></div>}
            <div className="similar-actions">
              <button type="button" data-similar-compare-toggle aria-pressed={Boolean(compared[index])} onClick={() => setCompared((current) => ({ ...current, [index]: !current[index] }))}><Columns2 size={13} /> {compared[index] ? "Masquer la comparaison" : "Comparer"}</button>
              <button type="button" data-similar-copy onClick={() => copy(result, index)}>{copied === String(index) ? <><Check size={13} /> Copié</> : <><Copy size={13} /> Copier</>}</button>
              {!readOnly && <button type="button" className="primary" data-similar-insert onClick={() => insert(result)}><FileInput size={13} /> Insérer sous ma sélection</button>}
              <button type="button" data-similar-save-clause onClick={() => saveAsClause(result)}><BookmarkPlus size={13} /> Enregistrer comme clause agence</button>
              {!readOnly && <button type="button" data-similar-replace onClick={() => setConfirmReplace(confirmReplace === index ? null : index)}><Replace size={13} /> Remplacer ma sélection</button>}
            </div>
            {!readOnly && confirmReplace === index && <div className="similar-confirm" data-similar-confirm role="alertdialog"><span>Remplacer votre sélection par ce passage ? Le texte actuel sera écrasé (vous pourrez annuler avec Ctrl+Z).</span><button type="button" className="primary" data-similar-replace-confirm onClick={() => replaceSelection(result)}>Confirmer le remplacement</button><button type="button" onClick={() => setConfirmReplace(null)}>Annuler</button></div>}
          </li>)}
        </ul>
        {clauseOf && <ClauseEditor mode="create" initial={clauseOf} canPublish={canPublishClause} onClose={() => setClauseOf(null)} onSaved={() => { setClauseOf(null); setClauseSaved(canPublishClause ? "Clause ajoutée à la bibliothèque agence." : "Clause proposée : un administrateur la validera."); }} />}
        {!state.loading && state.searched > 0 && <footer>{state.searched} passage{state.searched > 1 ? "s" : ""} comparé{state.searched > 1 ? "s" : ""} dans vos autres CCTP.</footer>}
      </aside>
    </div>}
  </>;
}
