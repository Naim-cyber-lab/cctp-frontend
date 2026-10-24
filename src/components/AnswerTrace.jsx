import { ChevronDown, CornerDownRight, FileQuestion, Pencil, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../answer-trace.css";
import { TOKEN, deriveTemplate, fillTemplate } from "../utils/ruleTemplate";
import { RuleEditor, RuleModal } from "./RuleEditor";
import { getRuleDefault, getRuleHistory } from "../api/client";

const HIGHLIGHT = "answer-trace";
const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
const plain = (value) => String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^[\s\-•–]+/, "").replace(/[^a-z0-9%≥≤+/.,]+/g, " ").replace(/\s+/g, " ").trim();
const asText = (value) => (Array.isArray(value) ? value.join(" ; ") : String(value ?? ""));
const bulletOf = (text) => (String(text).match(/^\s*[-•–]\s*/) || [""])[0];
export { TOKEN, fillTemplate, deriveTemplate };

/** Le bloc de texte (ligne du chapitre) qui correspond à un fragment tracé : égalité du texte normalisé, sinon inclusion d'un texte assez long. */
export const matchBlocks = (blocks, fragments) => {
  const found = new Map();
  const remaining = blocks.map((block) => ({ block, text: plain(block.textContent) })).filter((item) => item.text);
  for (const fragment of fragments) {
    const target = plain(fragment.text);
    if (!target) continue;
    const exact = remaining.find((item) => item.text === target && !found.has(item.block));
    const loose = exact || (target.length >= 18 ? remaining.find((item) => !found.has(item.block) && (item.text.includes(target) || (item.text.length >= 18 && target.includes(item.text)))) : null);
    if (loose) found.set(loose.block, fragment);
  }
  return found;
};

const optionsOf = (question) => String(question?.options || "").split(";").map((item) => item.trim()).filter(Boolean);
/** Saisie d'une réponse selon la question : liste de choix, plusieurs choix, texte court ou long. */
function AnswerInput({ question, value, onChange }) {
  const options = optionsOf(question);
  const type = question?.answer_type;
  if (options.length && type === "single") {
    return <select value={value || ""} aria-label="Nouvelle réponse" data-trace-answer-input onChange={(event) => onChange(event.target.value)}><option value="">Sélectionner…</option>{[...new Set([...options, ...(value && !options.includes(value) ? [value] : [])])].map((option) => <option key={option}>{option}</option>)}</select>;
  }
  if (options.length && (type === "multi" || type === "multi_text")) {
    const chosen = String(value || "").split(" ; ").map((item) => item.trim()).filter(Boolean);
    const toggle = (option) => onChange((chosen.includes(option) ? chosen.filter((item) => item !== option) : [...chosen, option]).join(" ; "));
    return <div className="answer-trace-chips" role="group" aria-label="Nouvelle réponse" data-trace-answer-input>{[...options, ...chosen.filter((item) => !options.includes(item))].map((option) => <button type="button" key={option} className={chosen.includes(option) ? "on" : ""} aria-pressed={chosen.includes(option)} onClick={() => toggle(option)}>{option}</button>)}</div>;
  }
  if (["textarea", "multi_text", "responsibility_matrix"].includes(type)) return <textarea rows={3} value={value || ""} aria-label="Nouvelle réponse" data-trace-answer-input onChange={(event) => onChange(event.target.value)} />;
  return <input value={value || ""} aria-label="Nouvelle réponse" data-trace-answer-input onChange={(event) => onChange(event.target.value)} />;
}

/** « Voir mes réponses » : surligne dans le chapitre les passages issus des réponses au questionnaire (rien n'est écrit dans le document : le
 *  surlignage disparaît à l'export) ; un clic sur un passage affiche la question, la réponse, et permet de modifier la réponse ou la règle métier. */
export function AnswerTrace({ rootRef, enabled, trace, sources: sourcesProp, manifest, qState, overrides, onEditAnswer, onSaveRule, onSaveAnswer, onApplied, onTraceTextChange, cctpId = null, mode = "cctp", listOpen = false, onListClose, readOnly = false }) {
  const [popover, setPopover] = useState(null); // { block, fragment, top, left }
  const [ruleText, setRuleText] = useState("");
  const [ruleQuestion, setRuleQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { qid, value } : réponse en cours de modification, DANS la fenêtre
  const [applied, setApplied] = useState("");
  const [ruleOpen, setRuleOpen] = useState(false);
  const [standard, setStandard] = useState({ state: "idle", template: "" });
  const [history, setHistory] = useState(null); // { current, versions } de la question réglée
  const matches = useRef(new Map());
  const questions = useMemo(() => Object.fromEntries((manifest?.questions || []).map((question) => [question.id, question])), [manifest]);

  // Une ou plusieurs zones de texte (un chapitre, ou tous les chapitres rédigés d'un document), chacune avec ses lignes tracées.
  const sources = useMemo(() => sourcesProp || [{ getRoot: () => rootRef?.current, trace }], [sourcesProp, rootRef, trace]);
  const paint = useCallback(() => {
    if (!supported()) return;
    const all = new Map();
    if (enabled) {
      for (const source of sources) {
        const root = source.getRoot();
        if (!root || !source.trace?.length) continue;
        const blocks = [...root.children].filter((node) => node.textContent.trim());
        for (const [block, fragment] of matchBlocks(blocks, source.trace)) all.set(block, fragment);
      }
    }
    matches.current = all;
    const ranges = [...all.keys()].map((block) => { const range = document.createRange(); range.selectNodeContents(block); return range; });
    ranges.length ? CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges)) : CSS.highlights.delete(HIGHLIGHT);
  }, [enabled, sources]);

  useEffect(() => {
    paint();
    const roots = sources.map((source) => source.getRoot()).filter(Boolean);
    let timer;
    const later = () => { clearTimeout(timer); timer = setTimeout(paint, 250); };
    const observer = new MutationObserver(later);
    for (const root of roots) { root.addEventListener("input", later); observer.observe(root, { childList: true, subtree: true, characterData: true }); }
    // les zones peuvent n'exister qu'après le premier affichage : une seconde passe les rattrape
    const retry = setTimeout(paint, 600);
    return () => { clearTimeout(timer); clearTimeout(retry); observer.disconnect(); for (const root of roots) root.removeEventListener("input", later); };
  }, [paint, sources]);
  useEffect(() => () => { if (supported()) CSS.highlights.delete(HIGHLIGHT); }, []);
  useEffect(() => { if (!enabled) setPopover(null); }, [enabled]);
  // un clic n'importe où en dehors de la fenêtre (ou Échap) la ferme, pas seulement la croix
  useEffect(() => {
    if (!popover) return undefined;
    const outside = (event) => { if (!event.target.closest?.("[data-answer-trace-popover], [data-rule-modal-backdrop]")) setPopover(null); };
    const escape = (event) => { if (event.key === "Escape" && !document.querySelector("[data-rule-modal-backdrop]")) setPopover(null); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [Boolean(popover)]);

  const answerOf = useCallback((fragment, qid) => {
    const work = qState?.works?.find((item) => item.id === fragment.workId);
    const value = work?.answers?.[qid] ?? qState?.project?.[qid] ?? qState?.works?.flatMap((item) => (item.answers?.[qid] != null ? [item.answers[qid]] : []))?.[0];
    return asText(value);
  }, [qState]);

  // clic sur un passage surligné -> fenêtre « d'où ça vient »
  useEffect(() => {
    if (!enabled) return;
    const onClick = (event) => {
      const root = event.currentTarget;
      const block = event.target.closest?.("div, p, li");
      const host = block && [...root.children].includes(block) ? block : block?.parentElement && [...root.children].includes(block.parentElement) ? block.parentElement : null;
      const fragment = host && matches.current.get(host);
      if (!fragment || window.getSelection()?.toString()) return;
      const rect = host.getBoundingClientRect();
      const main = fragment.q.find((item) => item[1] === "direct")?.[0] || fragment.q[0][0];
      const known = overrides?.[main];
      const value = answerOf(fragment, main);
      const originTemplate = deriveTemplate(fragment.originText || fragment.text, value);
      const suggested = known || originTemplate;
      setRuleQuestion(main); setRuleText(suggested.replace(/^\s*[-•–]\s*/, "")); setError(""); setEditing(null); setApplied(""); setRuleOpen(false);
      setPopover({ host, fragment, originTemplate, top: Math.max(70, Math.min(window.innerHeight - 420, rect.top)), left: Math.max(8, Math.min(window.innerWidth - 480, rect.right + 12)) });
    };
    const roots = sources.map((source) => source.getRoot()).filter(Boolean);
    for (const root of roots) root.addEventListener("click", onClick);
    return () => { for (const root of roots) root.removeEventListener("click", onClick); };
  }, [sources, enabled, overrides, answerOf]);

  // Règle du moteur (standard) et historique des versions : lus quand on déplie la règle d'une question
  const loadHistory = useCallback((qid) => getRuleHistory(qid).then(setHistory).catch(() => setHistory(null)), []);
  useEffect(() => {
    if (!popover || !ruleOpen || !ruleQuestion) return undefined;
    let cancelled = false;
    setStandard({ state: "loading", template: "" });
    const fragment = popover.fragment;
    getRuleDefault({ questionId: ruleQuestion, value: answerOf(fragment, ruleQuestion), cctpId, workId: fragment.workId, mode })
      .then((data) => {
        if (cancelled) return;
        const words = (text) => new Set(String(text).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((word) => word.length > 2));
        const target = words(fragment.text);
        const score = (item) => { const mine = words(item.template); let hit = 0; for (const word of mine) if (target.has(word)) hit += 1; return (item.direct ? 1 : 0) + hit / Math.max(1, mine.size); };
        const best = [...(data.sentences || [])].sort((a, b) => score(b) - score(a))[0];
        setStandard({ state: best ? "ok" : "none", template: best?.template || "" });
      })
      .catch(() => { if (!cancelled) setStandard({ state: "none", template: "" }); });
    return () => { cancelled = true; };
  }, [popover?.host, ruleOpen, ruleQuestion, cctpId, mode, answerOf]);
  // versions de la règle : lues dès l'ouverture de la fenêtre (le nombre s'affiche sur le bouton)
  useEffect(() => { if (popover && ruleQuestion) loadHistory(ruleQuestion); }, [popover?.host, ruleQuestion, loadHistory]);

  // Remplace, dans TOUS les passages issus de cette question, l'ancienne valeur par la nouvelle (la casse de la phrase est respectée).
  const applyToText = (qid, before, after) => {
    if (!before || before === after) return 0;
    const escaped = before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let count = 0;
    for (const [block, fragment] of matches.current) {
      if (!fragment.q.some(([id]) => id === qid)) continue; // tout passage issu de cette question qui reprend l'ancienne valeur
      const text = block.textContent;
      const next = text.replace(new RegExp(escaped, "i"), (found) => (found[0] === found[0].toLowerCase() && found[0] !== found[0].toUpperCase() ? after[0].toLowerCase() + after.slice(1) : after));
      if (next !== text) { block.textContent = next; count += 1; onTraceTextChange?.(fragment, { ...fragment, text: next }); }
    }
    if (count) onApplied?.();
    return count;
  };
  // Liste des endroits du chapitre qui viennent d'une réponse : un clic renvoie vers la question, « Voir le passage » vers le texte.
  const listPanel = listOpen ? (() => {
    const entries = [...matches.current.entries()];
    return <aside className="answer-trace-list" data-trace-list role="dialog" aria-label="Endroits issus de vos réponses">
      <header><b><FileQuestion size={15} /> Endroits issus de vos réponses <em data-trace-list-count>{entries.length}</em></b><button type="button" aria-label="Fermer la liste" data-trace-list-close onClick={() => onListClose?.()}><X size={15} /></button></header>
      {entries.length === 0 && <p className="answer-trace-list-empty">Aucun passage n'est encore issu de vos réponses.</p>}
      <ul>
        {entries.map(([block, fragment], index) => {
          const main = fragment.q.find((item) => item[1] === "direct")?.[0] || fragment.q[0][0];
          const text = block.textContent.replace(/^\s*[-•–]\s*/, "").trim();
          return <li key={index} data-trace-list-item data-trace-list-question={main}>
            <button type="button" className="answer-trace-list-go" data-trace-list-go onClick={() => (onEditAnswer ? onEditAnswer({ workId: fragment.workId, questionId: main }) : block.scrollIntoView({ block: "center", behavior: "smooth" }))}>
              <span>{text.length > 110 ? `${text.slice(0, 110)}…` : text}</span>
              <small>{main} · {questions[main]?.label || main} → <em>{answerOf(fragment, main) || "—"}</em></small>
            </button>
            <button type="button" className="answer-trace-list-see" data-trace-list-see title="Voir ce passage dans le texte" onClick={() => { block.scrollIntoView({ block: "center", behavior: "smooth" }); block.classList.add("toc-target-flash"); setTimeout(() => block.classList.remove("toc-target-flash"), 1600); }}>Voir le passage</button>
          </li>;
        })}
      </ul>
    </aside>;
  })() : null;
  if (!popover) return listPanel;
  const { fragment, host, originTemplate } = popover;
  const kindLabel = { direct: "La valeur saisie figure dans le texte", derive: "Cette réponse déclenche la prescription" };
  const saveAnswer = async () => {
    if (!editing) return;
    const before = answerOf(fragment, editing.qid), after = String(editing.value ?? "").trim();
    setBusy(true); setError("");
    try {
      // d'abord le texte du lot (visible tout de suite), puis l'enregistrement de la réponse ET du texte
      const count = applyToText(editing.qid, before, after);
      await onSaveAnswer({ workId: fragment.workId, questionId: editing.qid, value: after });
      setApplied(count ? `Réponse enregistrée : ${count} passage${count > 1 ? "s" : ""} mis à jour dans le lot.` : "Réponse enregistrée. Les passages déduits de cette réponse seront mis à jour à la prochaine rédaction du lot.");
      setEditing(null);
    } catch (reason) { setError(reason.message || "La réponse n'a pas pu être enregistrée."); }
    finally { setBusy(false); }
  };
  const save = async (template) => {
    setBusy(true); setError("");
    try {
      const value = answerOf(fragment, ruleQuestion);
      const restored = standard.template || originTemplate;
      await onSaveRule(ruleQuestion, template, host, bulletOf(host.textContent), value, restored);
      // le passage garde sa surbrillance : on suit sa nouvelle phrase ; la fenêtre reste ouverte pour pouvoir revenir sur la règle
      const patched = { ...fragment, text: host.textContent };
      onTraceTextChange?.(fragment, patched);
      setPopover((current) => (current ? { ...current, fragment: patched } : current));
      setRuleText(template || deriveTemplate(host.textContent, value));
      setApplied(template ? "Règle enregistrée : le passage est mis à jour." : restored ? "Règle d'origine rétablie : le passage reprend immédiatement la phrase du moteur." : "Règle d'origine rétablie. Le passage reprendra la phrase du moteur à la prochaine rédaction du lot.");
      loadHistory(ruleQuestion);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  return <>{listPanel}<aside className="answer-trace-popover" data-answer-trace-popover role="dialog" aria-label="Origine de ce passage" style={{ top: popover.top, left: popover.left, maxHeight: Math.max(240, window.innerHeight - popover.top - 16) }}>
    <header><b><FileQuestion size={15} /> D’où vient ce passage ?</b><button type="button" aria-label="Fermer" onClick={() => setPopover(null)}><X size={15} /></button></header>
    {applied && <div className="answer-trace-applied" role="status" data-trace-applied>{applied}</div>}
    <ul>
      {fragment.q.map(([qid, kind]) => <li key={qid} data-trace-question={qid} data-trace-kind={kind}>
        <small>{qid} · {kindLabel[kind]}</small>
        <b>{questions[qid]?.label || qid}</b>
        <p data-trace-answer>Votre réponse : <em>{answerOf(fragment, qid) || "—"}</em></p>
        {!readOnly && editing?.qid !== qid && <button type="button" data-trace-edit-answer onClick={() => { setApplied(""); if (onSaveAnswer) setEditing({ qid, value: answerOf(fragment, qid) }); else { setPopover(null); onEditAnswer({ workId: fragment.workId, questionId: qid }); } }}><Pencil size={13} /> Modifier ma réponse</button>}
        {!readOnly && editing?.qid === qid && <div className="answer-trace-edit" data-trace-answer-editor>
          <AnswerInput question={questions[qid]} value={editing.value} onChange={(value) => setEditing({ qid, value })} />
          <div className="answer-trace-actions">
            <button type="button" data-trace-answer-cancel disabled={busy} onClick={() => setEditing(null)}>Annuler</button>
            <button type="button" className="primary" data-trace-answer-save disabled={busy} onClick={saveAnswer}><Save size={13} /> {busy ? "Enregistrement…" : "Enregistrer la réponse"}</button>
          </div>
        </div>}
      </li>)}
    </ul>
    {!readOnly && <section className="answer-trace-rule" data-trace-rule>
      <button type="button" className="answer-trace-rule-toggle" data-trace-rule-toggle aria-haspopup="dialog" aria-expanded={ruleOpen} onClick={() => setRuleOpen(true)}>
        <CornerDownRight size={14} /> <b>Règle métier appliquée</b>
        {overrides?.[ruleQuestion] && <em>Votre version</em>}
        {(history?.versions?.length || 0) > 0 && <em className="ghost" data-trace-rule-versions>{history.versions.length} version{history.versions.length > 1 ? "s" : ""}</em>}
        <span className="answer-trace-rule-open">Voir et modifier</span>
      </button>
    </section>}
  </aside>
    {!readOnly && ruleOpen && (() => {
      const value = answerOf(fragment, ruleQuestion);
      const versions = (history?.versions || []).map((item, index) => ({ ...item, isCurrent: index === 0 && (item.template || "") === (history.current || "") }));
      const shown = versions.length ? [...versions, { template: "", at: undefined, isCurrent: !history?.current && !versions.some((item) => item.isCurrent) }] : [];
      return <RuleModal title={questions[ruleQuestion]?.label || ruleQuestion} subtitle={`${ruleQuestion} · votre réponse : ${value || "—"}`} onClose={() => setRuleOpen(false)}>
        {fragment.q.length > 1 && <label className="answer-trace-rule-question">Question concernée
          <select value={ruleQuestion} onChange={(event) => { const qid = event.target.value; setRuleQuestion(qid); setRuleText(overrides?.[qid] || deriveTemplate(fragment.text, answerOf(fragment, qid))); }}>{fragment.q.map(([qid]) => <option key={qid} value={qid}>{qid} · {questions[qid]?.label || qid}</option>)}</select></label>}
        {applied && <div className="answer-trace-applied" role="status" data-trace-applied>{applied}</div>}
        <RuleEditor value={value} standard={standard.template} standardState={standard.state} current={overrides?.[ruleQuestion] || ""}
          text={ruleText} onText={setRuleText} busy={busy} error={error} history={shown}
          onSave={() => save(ruleText.trim())} onReset={() => save("")} onRestore={(version) => save(version.template || "")} />
      </RuleModal>;
    })()}
  </>;
}
