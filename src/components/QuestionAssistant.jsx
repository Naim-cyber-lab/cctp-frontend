import { useEffect, useState } from "react";
import { MessageCircleQuestion, X } from "lucide-react";
import { apiFetch } from "../api/client";

const QUICK = [["QUESTION_EXPLANATION", "Pourquoi cette question ?"], ["DOCUMENT_SEARCH", "Que dit le programme ?"], ["ANSWER_RECOMMENDATION", "Que dois-je répondre ?"], ["CONSISTENCY_CHECK", "Est-ce cohérent ?"]];
const BASIS = { FACT: ["Fait sourcé", "ok"], INFERENCE: ["À interpréter", "warn"], UNKNOWN: ["Information insuffisante", "bad"] };
const errorText = (reason) => reason?.detail?.message || reason?.message || "L’assistant est indisponible.";

/** Assistant du questionnaire (carte 688) : disponible dès l'écran Questionnaire, sans sélection de texte. Il lit la question courante, les réponses du projet et les documents ; il propose, il n'écrit jamais :
 *  « Utiliser cette réponse » est le seul geste qui modifie le questionnaire. Aucune réponse n'est inventée : sans source, « Information insuffisante ». */
export function QuestionAssistant({ projectId, workId, onUse }) {
  const [open, setOpen] = useState(false), [questionId, setQuestionId] = useState(null), [text, setText] = useState("");
  const [thread, setThread] = useState([]), [busy, setBusy] = useState(false), [used, setUsed] = useState({});
  // la question courante = la dernière sur laquelle l'utilisateur a cliqué ou saisi
  useEffect(() => {
    const track = (event) => { const node = event.target?.closest?.("[data-question-id]"); if (node) setQuestionId(node.getAttribute("data-question-id")); };
    document.addEventListener("focusin", track); document.addEventListener("click", track);
    return () => { document.removeEventListener("focusin", track); document.removeEventListener("click", track); };
  }, []);
  const ask = async (message, quick = null) => {
    setBusy(true); setOpen(true);
    const asked = message || QUICK.find(([id]) => id === quick)?.[1] || "";
    try {
      const result = await apiFetch(`/cctps/${projectId}/assistant/questionnaire`, { method: "POST", body: JSON.stringify({ message: asked, question_id: questionId, work_id: workId || null, quick }) });
      setThread((current) => [...current, { id: crypto.randomUUID(), asked, questionId, result }]);
    } catch (reason) { setThread((current) => [...current, { id: crypto.randomUUID(), asked, questionId, error: errorText(reason) }]); } finally { setBusy(false); setText(""); }
  };
  const addAction = async (entry) => {
    try {
      await apiFetch(`/cctps/${projectId}/feasibility/canonical/studies`, { method: "PUT", body: JSON.stringify({ item: { label: `À renseigner : ${entry.result.rules?.label || entry.asked}`, status: "TO_DO", item_type: "ACTION", origin: "ASSISTANT" } }) });
      setUsed((current) => ({ ...current, [entry.id]: "action" }));
    } catch (reason) { setUsed((current) => ({ ...current, [entry.id]: `error:${errorText(reason)}` })); }
  };
  if (!open) return <button type="button" className="secondary qa-open" data-qa-open onClick={() => setOpen(true)}><MessageCircleQuestion size={15} /> Assistant du questionnaire</button>;
  return <aside className="qa-panel" data-question-assistant aria-label="Assistant du questionnaire" style={{ border: "1px solid var(--border, #d8dee4)", borderRadius: 8, padding: 12, margin: "8px 0", display: "grid", gap: 8 }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b>Assistant du questionnaire</b><button type="button" className="link-button" aria-label="Fermer l’assistant" data-qa-close onClick={() => setOpen(false)}><X size={14} /></button></header>
    <small className="muted" data-qa-context>{questionId ? `Question en cours : ${questionId}` : "Cliquez sur une question pour que l’assistant sache laquelle vous regardez."}</small>
    <div className="qa-quick" data-qa-quick style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{QUICK.map(([id, label]) => <button key={id} type="button" className="secondary" data-qa-quick-question={id} disabled={busy} onClick={() => ask("", id)}>{label}</button>)}</div>
    <form onSubmit={(event) => { event.preventDefault(); if (text.trim()) ask(text.trim()); }} style={{ display: "flex", gap: 6 }}>
      <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Votre question sur ce point…" aria-label="Question à l’assistant" data-qa-input style={{ flex: 1 }} />
      <button type="submit" className="primary" data-qa-send disabled={busy || !text.trim()}>Envoyer</button></form>
    <div className="qa-thread" data-qa-thread>{thread.map((entry) => <article key={entry.id} data-qa-answer data-qa-basis={entry.result?.basis || "ERROR"}>
      <small className="muted">« {entry.asked} »{entry.questionId ? ` · ${entry.questionId}` : ""}</small>
      {entry.error ? <p className="err" role="alert">{entry.error}</p> : <>
        <p><span className={`pln-badge ${BASIS[entry.result.basis][1]}`} data-qa-basis-label>{BASIS[entry.result.basis][0]}</span> <span data-qa-message>{entry.result.message}</span></p>
        {entry.result.sources.map((source, index) => <blockquote key={index} data-qa-source style={{ margin: "4px 0", fontSize: 13 }}><b>{source.documentName}</b> — page {source.page} <small className="muted">(pertinence {Math.round(source.score * 100)} %)</small><br />{source.text}</blockquote>)}
        {entry.result.proposal && (used[entry.id] === "applied" ? <small data-qa-applied>✓ Réponse utilisée ({entry.result.proposal.value}) — vous pouvez encore la modifier.</small>
          : <button type="button" className="primary" data-qa-use onClick={() => { onUse(entry.result.proposal.questionId, entry.result.proposal.value); setUsed((current) => ({ ...current, [entry.id]: "applied" })); }}>Utiliser cette réponse : {entry.result.proposal.value}</button>)}
        {entry.result.basis === "UNKNOWN" && entry.result.rules && (used[entry.id] === "action" ? <small data-qa-action-added>✓ Ajouté aux études &amp; actions.</small>
          : <button type="button" className="link-button" data-qa-add-action onClick={() => addAction(entry)}>Ajouter aux études &amp; actions</button>)}
        {String(used[entry.id] || "").startsWith("error:") && <small className="err" role="alert">{used[entry.id].slice(6)}</small>}</>}
    </article>)}</div>
    <small className="muted">L’assistant ne remplit jamais le questionnaire à votre place : il cite ses sources ou dit qu’il ne sait pas.</small>
  </aside>;
}
