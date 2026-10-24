import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Search, X } from "lucide-react";
import { createWorkTemplate, getQuestionnaireCatalog, getWorkTemplateEligibility } from "../api/client";
import { chapters } from "../data/chapters";
import "../consultations.css";

const FAMILIES = ["Cloison distributive", "Cloison séparative", "Doublage", "Faux plafond", "Gaine / coffre", "Habillage"];
const SUPPORTED = new Set(["single", "multi", "text", "textarea"]);
const optionsOf = (value) => String(value || "").split(";").map((item) => item.trim()).filter(Boolean);

/** Création manuelle d'un modèle d'ouvrage : étape 1 (nom, lot, famille, description), étape 2 (le VRAI questionnaire du lot ; on ne renseigne que ce que l'on veut standardiser,
 *  toute réponse peut rester vide). Les réponses sont enregistrées avec les identifiants de questions du questionnaire existant. */
export function WorkTemplateEditor({ onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", lotId: "06", workFamily: "", description: "" });
  const [answers, setAnswers] = useState({});
  const [catalog, setCatalog] = useState(null);
  const [projectOnly, setProjectOnly] = useState(new Set()); // questions qui dépendent du projet : jamais standardisées
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasQuestionnaire = form.lotId === "06";

  useEffect(() => {
    if (step !== 2 || !hasQuestionnaire || catalog) return;
    getWorkTemplateEligibility(form.lotId).then((data) => setProjectOnly(new Set(data.projectSpecific || []))).catch(() => {});
    getQuestionnaireCatalog().then(setCatalog).catch((reason) => setError(reason.message || "Impossible de charger le questionnaire."));
  }, [step, hasQuestionnaire, catalog]);

  // Questions de l'ouvrage (étapes « Ouvrages » et suivantes) regroupées par bloc du questionnaire ; les questions de projet dépendent du chantier et ne se standardisent pas ici
  const groups = useMemo(() => {
    if (!catalog) return [];
    const byId = new Map(catalog.questions.map((question) => [question.id, question]));
    const needle = search.trim().toLowerCase();
    return (catalog.widgets || []).filter((widget) => !String(widget.step).startsWith("01"))
      .map((widget) => ({ id: widget.id, title: widget.title, step: widget.step,
        questions: (widget.questions || []).map((id) => byId.get(id)).filter(Boolean).filter((question) => !needle || question.label.toLowerCase().includes(needle)) }))
      .filter((group) => group.questions.length);
  }, [catalog, search]);

  const setAnswer = (id, value) => setAnswers((current) => ({ ...current, [id]: value }));
  const filled = Object.entries(answers).filter(([id]) => !projectOnly.has(id)).filter(([, value]) => (Array.isArray(value) ? value.length : String(value ?? "").trim() !== ""));
  const next = () => {
    if (!form.name.trim() || !form.workFamily.trim()) { setError("Indiquez le nom du modèle et sa famille d’ouvrage."); return; }
    setError(""); setStep(2);
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      const created = await createWorkTemplate({ name: form.name.trim(), description: form.description.trim(), lotId: form.lotId, workFamily: form.workFamily.trim(),
        questionnaireVersion: hasQuestionnaire ? catalog?.version || null : null, answers: filled.map(([questionId, value]) => ({ questionId, value })) });
      onSaved?.(created);
    } catch (reason) { setError(reason.message); setBusy(false); }
  };

  return <div className="consult-modal-backdrop" data-template-editor onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="consult-modal wide template-editor" role="dialog" aria-modal="true" aria-label="Créer un modèle d’ouvrage">
      <header className="template-editor-head"><div><small>Étape {step} sur 2</small><h3>Créer un modèle d’ouvrage</h3></div><button type="button" className="icon close" aria-label="Fermer" data-template-editor-close onClick={onClose}><X size={18} /></button></header>
      {error && <div className="login-error" role="alert" data-template-editor-error>{error}</div>}
      {step === 1 && <div className="template-editor-step" data-template-step="1">
        <label>Nom<input data-template-name autoFocus maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex. Cloison bureaux standard" /></label>
        <label>Lot<select data-template-lot-select value={form.lotId} onChange={(event) => setForm({ ...form, lotId: event.target.value })}>{chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Famille d’ouvrage<input data-template-family-input list="template-families" maxLength={80} value={form.workFamily} onChange={(event) => setForm({ ...form, workFamily: event.target.value })} placeholder="Ex. Cloison distributive" /><datalist id="template-families">{FAMILIES.map((item) => <option key={item} value={item} />)}</datalist></label>
        <label>Description<textarea data-template-description rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex. Standard utilisé pour les bureaux courants" /></label>
      </div>}
      {step === 2 && <div className="template-editor-step" data-template-step="2">
        <p className="consult-hint">Renseignez uniquement ce que vous souhaitez standardiser : <b>une réponse peut rester vide</b> (hauteur, quantité, localisation… dépendent du projet).</p>
        {!hasQuestionnaire ? <p className="panel-empty" data-template-no-questionnaire>Le questionnaire de ce lot n’est pas encore disponible : le modèle sera créé sans réponses.</p>
          : !catalog ? <p className="panel-empty">Chargement du questionnaire…</p> : <>
            <label className="library-search"><Search size={15} /><input type="search" data-template-question-search value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une question…" aria-label="Rechercher une question" /></label>
            <div className="template-questions" data-template-questions>
              {groups.map((group) => <details key={group.id} open={Boolean(search) || group.step.startsWith("02")}><summary>{group.step.replace(/^\d+\s*/, "")} · {group.title} <em>({group.questions.length})</em></summary>
                {group.questions.map((question) => <div key={question.id} className="template-question" data-template-question={question.id}>
                  <b>{question.label}</b>
                  {projectOnly.has(question.id) && <small className="template-project-only" data-template-project-only>Dépend du projet : non standardisé dans un modèle.</small>}
                  {!projectOnly.has(question.id) && question.answer_type === "single" && <select data-template-answer={question.id} value={answers[question.id] || ""} onChange={(event) => setAnswer(question.id, event.target.value)}><option value="">— non standardisé —</option>{optionsOf(question.options).map((option) => <option key={option} value={option}>{option}</option>)}</select>}
                  {!projectOnly.has(question.id) && question.answer_type === "multi" && <div className="template-multi">{optionsOf(question.options).map((option) => <label key={option}><input type="checkbox" data-template-answer={question.id} checked={(answers[question.id] || []).includes(option)} onChange={(event) => setAnswer(question.id, event.target.checked ? [...(answers[question.id] || []), option] : (answers[question.id] || []).filter((item) => item !== option))} /> {option}</label>)}</div>}
                  {!projectOnly.has(question.id) && question.answer_type === "text" && <input data-template-answer={question.id} maxLength={300} value={answers[question.id] || ""} onChange={(event) => setAnswer(question.id, event.target.value)} />}
                  {!projectOnly.has(question.id) && question.answer_type === "textarea" && <textarea data-template-answer={question.id} rows={2} maxLength={2000} value={answers[question.id] || ""} onChange={(event) => setAnswer(question.id, event.target.value)} />}
                  {!projectOnly.has(question.id) && !SUPPORTED.has(question.answer_type) && <small className="template-unsupported">Ce type de question ne peut pas encore être standardisé dans un modèle.</small>}
                </div>)}
              </details>)}
              {groups.length === 0 && <p className="panel-empty">Aucune question ne correspond.</p>}
            </div></>}
      </div>}
      <div className="consult-buttons template-editor-actions">
        {step === 2 && <button type="button" data-template-back onClick={() => setStep(1)}><ArrowLeft size={14} /> Retour</button>}
        <button type="button" onClick={onClose}>Annuler</button>
        {step === 1 && <button type="button" className="primary" data-template-next onClick={next}>Continuer <ArrowRight size={14} /></button>}
        {step === 2 && <button type="button" className="primary" data-template-save disabled={busy} onClick={save}><Check size={14} /> {busy ? "Enregistrement…" : `Enregistrer le modèle${filled.length ? ` (${filled.length} réponse${filled.length > 1 ? "s" : ""})` : ""}`}</button>}
      </div>
    </div>
  </div>;
}
