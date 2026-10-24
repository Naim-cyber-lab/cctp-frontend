import { useEffect, useRef } from "react";
import { History, RotateCcw, Save, X } from "lucide-react";
import { TOKEN, fillParts, fillTemplate } from "../utils/ruleTemplate";
import "../answer-trace.css";

const dateLabel = (at) => {
  if (at === undefined) return "Au départ";
  if (!at) return "Avant l'historique";
  return new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/** La phrase telle qu'elle s'écrit dans le CCTP, la réponse injectée étant surlignée (comme dans « D'où vient ce passage ? »). */
function Rendered({ template, value, active = false }) {
  return <p className="rule-rendered" data-rule-result>
    {fillParts(template, value).map((part, index) => (part.filled
      ? <mark key={index} {...(active ? { "data-team-rule-value": "" } : {})}>{part.text}</mark>
      : <span key={index}>{part.text}</span>))}
  </p>;
}

/** Changer une règle métier : ce que la règle écrit aujourd'hui dans le CCTP, la variable, votre version, ce que ça donne, et l'historique
 *  des versions (un clic pour revenir à l'une d'elles). Utilisé dans la fenêtre « D'où vient ce passage ? » (aperçu et génération) et dans la
 *  bibliothèque de l'équipe. */
export function RuleEditor({
  value, standard, standardState, current, text, onText, onSave, onReset, busy = false, error = "", saveLabel = "Enregistrer la règle",
  resetLabel = "Revenir à la règle d’origine", currentLabel = "Votre version", history = null, onRestore = null, samples = null, onSample = null, hideActions = false,
}) {
  const area = useRef(null);
  const active = current || standard || "";
  const changed = text.trim() !== active.trim();
  const insertToken = () => {
    const node = area.current;
    const start = node?.selectionStart ?? text.length, end = node?.selectionEnd ?? text.length;
    onText(text.slice(0, start) + TOKEN + text.slice(end));
  };
  const noStandard = standardState === "loading" ? "Lecture de la règle du moteur…" : "Le moteur n’écrit pas de phrase propre à cette question (elle dépend d’autres réponses).";
  return <div className="rule-editor" data-rule-editor data-trace-rule-body data-team-rule-steps>
    <section className="rule-step" data-trace-step="current" data-team-rule-step="current">
      <h4><i>1</i> Règle actuelle <small>comment elle s’écrit dans le CCTP</small></h4>
      {active
        ? <Rendered template={active} value={value} active />
        : <p className="rule-rendered muted" data-rule-result>{noStandard}</p>}
      <p className="rule-tag">{current ? `${currentLabel} — utilisée à la place de celle du moteur` : "Règle du moteur (standard Calepin)"}</p>
      {active && <p className="rule-template" data-trace-rule-current data-team-rule-current><span>Phrase-modèle</span> {active}</p>}
      {current && standard && <div className="rule-engine" data-rule-standard>
        <p className="rule-tag">Pour comparer — règle du moteur</p>
        <Rendered template={standard} value={value} />
      </div>}
      {!active && <span hidden data-trace-rule-current data-team-rule-current />}
    </section>

    <section className="rule-step" data-trace-step="variable" data-team-rule-step="variable">
      <h4><i>2</i> Variable <small>la réponse qui remplace {TOKEN}</small></h4>
      <p className="rule-variable"><code>{TOKEN}</code> <span>sera remplacé par</span> <mark data-trace-rule-value>{value || "—"}</mark></p>
      {samples && <label className="rule-sample">Exemple de réponse
        {samples.length > 0
          ? <select value={value} data-team-rule-sample onChange={(event) => onSample(event.target.value)}>{samples.map((choice) => <option key={choice}>{choice}</option>)}</select>
          : <input value={value} data-team-rule-sample placeholder="Ex. 47 dB" onChange={(event) => onSample(event.target.value)} />}</label>}
    </section>

    <section className="rule-step" data-trace-step="edit" data-team-rule-step="edit">
      <h4><i>3</i> Votre version <small>la phrase écrite dans le CCTP</small></h4>
      <textarea ref={area} rows={4} maxLength={600} value={text} aria-label="Règle métier" data-trace-rule-text data-team-rule-text onChange={(event) => onText(event.target.value)} placeholder="Ex. Les cloisons séparatives présenteront un affaiblissement acoustique de {{réponse}}." />
      <button type="button" className="rule-insert" data-trace-rule-insert data-team-rule-insert onClick={insertToken}>Insérer la variable {TOKEN}</button>
    </section>

    <section className="rule-step" data-trace-step="preview" data-team-rule-step="preview">
      <h4><i>4</i> Ce que ça donne <small>avec la réponse « {value || "—"} »</small></h4>
      {active && <div className="rule-before" data-rule-before><span>Avant</span>{fillTemplate(active, value) || "—"}</div>}
      <div className={`rule-after ${changed ? "changed" : ""}`} data-trace-rule-preview data-team-rule-preview><span>Après</span>{text.trim() ? fillTemplate(text, value) : "—"}</div>
      {text.trim() && !text.includes(TOKEN) && <small className="rule-warn">Cette phrase ne contient pas la variable : elle sera identique quelle que soit la réponse.</small>}
      {!changed && text.trim() && <small>Identique à la règle actuelle : modifiez la phrase pour voir la différence.</small>}
    </section>

    {history && <section className="rule-step rule-history" data-rule-history>
      <h4><i><History size={11} /></i> Versions précédentes <small>un clic pour revenir à l’une d’elles : le CCTP change aussitôt</small></h4>
      {history.length === 0 && <p className="muted" data-rule-history-empty>Aucune version enregistrée pour l’instant : elles apparaissent ici dès que vous modifiez la règle.</p>}
      <ul>
        {history.map((version, index) => <li key={`${version.at}-${index}`} data-rule-version className={version.isCurrent ? "current" : ""}>
          <div>
            <small>{dateLabel(version.at)}{version.isCurrent ? " · version en cours" : ""}</small>
            {version.template ? <Rendered template={version.template} value={value} /> : <p className="rule-rendered muted">Règle d’origine (celle du moteur)</p>}
          </div>
          {!version.isCurrent && onRestore && <button type="button" data-rule-restore disabled={busy} onClick={() => onRestore(version)}><RotateCcw size={12} /> Revenir à cette version</button>}
        </li>)}
      </ul>
    </section>}
    {error && <div className="share-error" role="alert">{error}</div>}
    {!hideActions && <div className="rule-actions">
      {current && onReset && <button type="button" data-trace-rule-reset disabled={busy} onClick={onReset}><RotateCcw size={13} /> {resetLabel}</button>}
      <button type="button" className="primary" data-trace-rule-save disabled={busy || !text.trim() || !changed} onClick={onSave}><Save size={13} /> {saveLabel}</button>
    </div>}
  </div>;
}

/** Fenêtre centrée, plus large que la fenêtre d'origine d'un passage : la règle s'y lit et s'y modifie sans défiler dans un petit encadré. */
export function RuleModal({ title, subtitle, onClose, children, footer = null, formProps = {} }) {
  useEffect(() => {
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  return <div className="rule-modal-backdrop" data-rule-modal-backdrop onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="rule-modal" data-rule-modal role="dialog" aria-modal="true" aria-label="Règle métier" {...formProps}>
      <header><div><small>RÈGLE MÉTIER</small><b>{title}</b>{subtitle && <span>{subtitle}</span>}</div><button type="button" aria-label="Fermer" data-rule-modal-close onClick={onClose}><X size={17} /></button></header>
      <div className="rule-modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}
