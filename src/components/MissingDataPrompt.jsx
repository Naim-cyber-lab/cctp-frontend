import { useEffect, useState } from "react";
import { ClipboardList, SkipForward } from "lucide-react";
import "../missing-data.css";

/** Une question à la fois : l'assistant demande la donnée manquante au lieu de l'inventer. */
export function MissingDataPrompt({ gap, onAnswer, onSkip, onStop, onCancel }) {
  const { question } = gap;
  const [text, setText] = useState("");
  const [picked, setPicked] = useState([]);
  useEffect(() => {
    setText("");
    setPicked([]);
  }, [question.id]);
  const total = Math.max(question.total || 1, question.index || 1);
  const submitText = () => {
    if (text.trim()) onAnswer(text.trim());
  };
  return (
    <section className="missing-data" role="group" aria-label="Information manquante" data-gap-prompt data-question-id={question.id}>
      <header>
        <span className="missing-data-icon"><ClipboardList size={16} /></span>
        <div>
          <small>{question.kind === "confirm" ? "Valeur lue sur une image à confirmer" : "Il me manque une information"} · question {question.index} sur {total}</small>
          <b data-gap-label>{question.label}</b>
        </div>
        <span className="missing-data-steps" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <i key={index} className={index < question.index - 1 ? "done" : index === question.index - 1 ? "current" : ""} />
          ))}
        </span>
      </header>
      <p>{question.why}</p>
      {question.kind === "confirm" && (
        <div className="missing-data-read">
          <div className="missing-data-read-value">
            <small>Valeur lue</small>
            <b data-read-value>{question.readValue}</b>
          </div>
          <small className="missing-data-read-source">
            {question.source}
            {question.page ? `, page ${question.page}` : ""}
            {question.excerpt ? ` — « ${question.excerpt} »` : ""}
          </small>
          <div className="missing-data-options">
            <button type="button" data-gap-option className="picked" onClick={() => onAnswer(question.options[0])}>{question.options[0]}</button>
          </div>
          <div className="missing-data-text">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitText()}
              placeholder="Ou saisissez la bonne valeur…"
            />
            <button type="button" className="primary" disabled={!text.trim()} onClick={submitText}>Corriger</button>
          </div>
        </div>
      )}
      {question.kind === "single" && (
        <div className="missing-data-options">
          {question.options.map((option) => (
            <button key={option} type="button" data-gap-option onClick={() => onAnswer(option)}>{option}</button>
          ))}
        </div>
      )}
      {question.kind === "multi" && (
        <>
          <div className="missing-data-options">
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                data-gap-option
                className={picked.includes(option) ? "picked" : ""}
                aria-pressed={picked.includes(option)}
                onClick={() => setPicked((items) => (items.includes(option) ? items.filter((item) => item !== option) : [...items, option]))}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="missing-data-confirm">
            <button type="button" className="primary" disabled={!picked.length} onClick={() => onAnswer(picked.join(" ; "))}>Valider</button>
          </div>
        </>
      )}
      {(question.kind === "text" || question.kind === "long") && (
        <div className="missing-data-text">
          {question.kind === "long" ? (
            <textarea autoFocus rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="Votre réponse…" />
          ) : (
            <input
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitText()}
              placeholder="Votre réponse…"
            />
          )}
          <button type="button" className="primary" disabled={!text.trim()} onClick={submitText}>Valider</button>
        </div>
      )}
      <footer>
        <button type="button" className="ghost" data-gap-skip onClick={onSkip}>
          <SkipForward size={14} /> Passer : ce sera noté « à préciser »
        </button>
        <button type="button" className="ghost" data-gap-stop onClick={onStop}>Générer avec ce que j’ai déjà</button>
        <button type="button" className="ghost" onClick={onCancel}>Annuler</button>
      </footer>
    </section>
  );
}

/** Compte rendu de la rédaction : ce que l'utilisateur a renseigné, et ce qui reste à préciser. */
export function GenerationReport({ report, citations = [], pending = false, onClose }) {
  const provided = report?.provided || [];
  const toSpecify = report?.toSpecify || [];
  if (!provided.length && !toSpecify.length && !citations.length) return null;
  return (
    <section className="generation-report" data-generation-report>
      <header>
        <b>Compte rendu de la rédaction</b>
        <button type="button" onClick={onClose} aria-label="Fermer le compte rendu">×</button>
      </header>
      {pending && <p data-report-pending><small>Rédaction en cours : le texte du chapitre apparaîtra à gauche dès que le modèle l'aura écrit (plusieurs minutes sur ce serveur).</small></p>}
      {provided.length > 0 && (
        <div>
          <small>Renseigné par vous, reporté dans le questionnaire</small>
          <ul>
            {provided.map((item) => (
              <li key={item.id}><span>{item.label}</span> <b>{item.value}</b>{item.origin && <em> · d’après {item.origin}</em>}</li>
            ))}
          </ul>
        </div>
      )}
      {citations.length > 0 && (
        <div className="corpus-sources" data-corpus-sources>
          <small>Base métier — sources fabricants consultées (document et page à vérifier)</small>
          <ul>
            {citations.map((item) => (
              <li key={item.ref} className={item.cited ? "cited" : ""} data-corpus-source={item.ref}>
                <b>{item.manufacturer}</b> — {item.title}, p. {item.page}
                <em> · preuve {item.tier}{item.table ? " · tableau" : ""}{item.expired ? " · EXPIRÉE" : ""}{item.cited ? " · citée" : ""}</em>
                {item.url && <a href={item.url} target="_blank" rel="noreferrer"> ouvrir la source</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {toSpecify.length > 0 && (
        <div className="to-specify">
          <small>Non renseigné — partie absente du texte, rien n'a été inventé</small>
          <ul>
            {toSpecify.map((item) => (
              <li key={item.id} data-to-specify>{item.label}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Texte du compte rendu enregistré dans la conversation du chapitre. */
export function reportMessage(report) {
  const provided = report?.provided || [];
  const toSpecify = report?.toSpecify || [];
  if (!provided.length && !toSpecify.length) return "";
  const lines = ["Compte rendu de la rédaction."];
  if (provided.length) lines.push(`Renseigné par vous : ${provided.map((item) => `${item.label} = ${item.value}`).join(" ; ")}.`);
  if (toSpecify.length) lines.push(`Non renseigné (partie absente du texte, rien n'a été inventé) : ${toSpecify.map((item) => item.label).join(" ; ")}.`);
  return lines.join("\n");
}
