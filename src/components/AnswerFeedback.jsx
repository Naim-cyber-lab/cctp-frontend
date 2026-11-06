import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { giveAssistantFeedback } from "../api/client";

const REASONS = [["MISSING_SOURCE", "Il manquait une source"], ["OFF_TARGET", "Réponse à côté de la question"], ["WRONG", "Réponse fausse"], ["OTHER", "Autre"]];

/** Réponse de l'assistant qui s'appuie (ou devrait s'appuyer) sur la documentation : question technique, réponse documentaire, « sources insuffisantes ». */
export const isAnswerMessage = (content) => /Sources insuffisantes|Élément vérifié dans la documentation|RÉPONSE TECHNIQUE|RÉPONSE ISSUE DES DOCUMENTS|dépend du système exact|Source de définition|\nSources\n\[\d+\]/.test(String(content || ""));

/** 👍 / 👎 sous une réponse : le 👎 demande le motif (« il manquait une source »…). Les retours alimentent le jeu de référence de la recherche documentaire. */
export function AnswerFeedback({ cctpId, chapterId, message, saved, onSaved }) {
  const [mode, setMode] = useState(""), [reason, setReason] = useState("MISSING_SOURCE"), [comment, setComment] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const send = async (rating, extra = {}) => {
    setBusy(true); setError("");
    try { onSaved(message.id, await giveAssistantFeedback(cctpId, chapterId, message.id, { rating, ...extra })); setMode(""); }
    catch (failure) { setError(failure.message); }
    setBusy(false);
  };
  if (saved && mode === "") {
    return <p className="answer-feedback" data-answer-feedback data-feedback-rating={saved.rating}>
      <small data-feedback-thanks>{saved.rating === "UP" ? "Merci : réponse jugée utile." : `Merci : retour enregistré${saved.reason ? ` (${REASONS.find(([key]) => key === saved.reason)?.[1] || ""})` : ""}.`}</small>
      <button type="button" className="link-button" data-feedback-change onClick={() => setMode("choose")}>Modifier</button>
    </p>;
  }
  return <div className="answer-feedback" data-answer-feedback>
    {mode !== "form" ? <>
      <small>Cette réponse vous a-t-elle aidé ?</small>
      <span className="feedback-actions" data-feedback-actions>
        <button type="button" className="secondary" data-feedback-up disabled={busy} onClick={() => send("UP")}><ThumbsUp size={14} /> Oui</button>
        <button type="button" className="secondary" data-feedback-down disabled={busy} onClick={() => setMode("form")}><ThumbsDown size={14} /> Non</button>
      </span>
    </> : <div className="answer-feedback-form" data-feedback-form>
      <fieldset><legend>Pourquoi ?</legend>{REASONS.map(([key, label]) => <label key={key} className="inline-check"><input type="radio" name={`feedback-${message.id}`} data-feedback-reason={key} checked={reason === key} onChange={() => setReason(key)} /> {label}</label>)}</fieldset>
      <textarea rows={2} value={comment} data-feedback-comment placeholder="Précision (facultatif) : la page ou le document où se trouve l’information" onChange={(event) => setComment(event.target.value)} />
      <span><button type="button" className="primary" data-feedback-send disabled={busy} onClick={() => send("DOWN", { reason, comment })}>Envoyer</button> <button type="button" className="secondary" onClick={() => setMode(saved ? "choose" : "")}>Annuler</button></span>
    </div>}
    {error && <small className="login-error" role="alert">{error}</small>}
  </div>;
}
