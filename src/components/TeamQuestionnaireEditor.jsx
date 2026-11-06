import { Check, ChevronDown, History, Pencil, Plus, Search, ShieldCheck, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RuleEditor, RuleModal } from "./RuleEditor";
import { deleteQuestionChange, getQuestionnaireCatalog, getRuleDefault, listQuestionChanges, proposeQuestionChange, rejectQuestionChange, restoreQuestionChange, validateQuestionChange } from "../api/client";

const optionsOf = (value) => String(value || "").split(";").map((item) => item.trim()).filter(Boolean);
/** Bibliothèque de l'équipe : on y modifie les questions du questionnaire et les règles métier (phrase du CCTP) associées.
 *  Une modification est proposée à l'équipe ; une fois validée, elle s'applique à tous les CCTP de ses membres. */
export function TeamQuestionnaireEditor({ canPropose, canPublish, refreshKey, externalQuery = "" }) {
  const [catalog, setCatalog] = useState(null);
  const [changes, setChanges] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(externalQuery);
  useEffect(() => { setSearch(externalQuery); }, [externalQuery]);
  const [openStep, setOpenStep] = useState("");
  const [editing, setEditing] = useState(null); // { questionId, kind, label, options, template }
  const [busy, setBusy] = useState(false);
  const [lotClosed, setLotClosed] = useState(false);
  const [sample, setSample] = useState("");
  const [standard, setStandard] = useState({ state: "idle", template: "" });
  const [openHistory, setOpenHistory] = useState("");
  const [allHistoryOpen,setAllHistoryOpen]=useState(false);

  const load = useCallback(async () => {
    try {
      const [questionnaire, list] = await Promise.all([getQuestionnaireCatalog(), listQuestionChanges()]);
      setCatalog(questionnaire);
      setChanges(list);
      setError("");
    } catch (reason) {
      setError(reason.message || "Impossible de charger le questionnaire.");
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const validatedBy = useMemo(() => {
    const map = {};
    for (const change of changes) if (change.status === "validated") map[`${change.questionId}:${change.kind}`] = change;
    return map;
  }, [changes]);
  const pending = changes.filter((change) => change.status === "proposed");
  const lotId = catalog?.chapterId || catalog?.lot?.id || "06";
  const lotTitle = catalog?.lot?.title || "Plâtrerie – Isolation";
  const questionById = useMemo(() => Object.fromEntries((catalog?.questions || []).map((question) => [question.id, question])), [catalog]);

  const steps = useMemo(() => {
    if (!catalog) return [];
    const needle = search.trim().toLowerCase();
    const matches = (question) => !needle || `${question.id} ${question.label} ${question.options || ""}`.toLowerCase().includes(needle);
    const grouped = new Map();
    for (const widget of catalog.widgets || []) {
      const questions = widget.questions.map((id) => questionById[id]).filter(Boolean).filter(matches);
      if (!questions.length) continue;
      if (!grouped.has(widget.step)) grouped.set(widget.step, []);
      grouped.get(widget.step).push({ widget, questions });
    }
    return [...grouped.entries()];
  }, [catalog, questionById, search]);
  const lotTotal = steps.reduce((sum, [, widgets]) => sum + widgets.reduce((inner, item) => inner + item.questions.length, 0), 0);
  const lotOpen = !lotClosed || Boolean(search.trim());

  // règle standard du moteur pour la question éditée et l'exemple de réponse choisi : ce que le moteur écrit, pour comparer
  const editingRule = editing?.kind === "rule" ? editing.questionId : "";
  useEffect(() => {
    if (!editingRule) { setStandard({ state: "idle", template: "" }); return undefined; }
    let cancelled = false;
    setStandard((current) => ({ ...current, state: "loading" }));
    getRuleDefault({ questionId: editingRule, value: sample })
      .then((data) => {
        if (cancelled) return;
        const best = (data.sentences || [])[0];
        setStandard({ state: best ? "ok" : "none", template: best?.template || "" });
        // la phrase de départ est celle du moteur : on la modifie plutôt que d'écrire à vide
        if (best) setEditing((current) => (current && current.kind === "rule" && !current.template.trim() ? { ...current, template: best.template } : current));
      })
      .catch(() => { if (!cancelled) setStandard({ state: "none", template: "" }); });
    return () => { cancelled = true; };
  }, [editingRule, sample]);
  const run = async (action, message) => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await load(); if (message) setNotice(message); }
    catch (reason) { setError(reason.message || "Action impossible."); }
    finally { setBusy(false); }
  };
  const startEdit = (question, kind) => {
    const current = validatedBy[`${question.id}:${kind}`];
    const currentSample = optionsOf(question.options)[0] || "exemple de réponse";
    const baseTemplate = current?.template || "";
    setSample(currentSample);
    setEditing({
      questionId: question.id, kind,
      label: current?.label || question.label, options: current?.options || question.options || "", template: kind === "rule" ? baseTemplate : "",
      answerType: current?.config?.answer_type || question.answer_type || "text", required: Boolean(current?.config?.required ?? question.required),
      scope: current?.config?.scope || question.scope || "work", generation: current?.config?.generation || question.generation || { default: "", byAnswer: {} },
      operation: "update", custom: Boolean(question.agency_custom),
    });
  };
  const startNew = () => setEditing({ questionId: "", kind: "question", label: "", options: "", template: "", answerType: "single", required: false,
    scope: "work", generation: { default: "", byAnswer: {} }, operation: "add", custom: true, step: "Personnalisation agence", widgetTitle: "Questions de votre agence" });
  const submit = (event) => {
    event.preventDefault();
    const edit = editing;
    const base = questionById[edit.questionId];
    const config = edit.kind === "question" ? { operation: edit.operation || "update", answer_type: edit.answerType, required: Boolean(edit.required), scope: edit.scope,
      generation: edit.generation || { default: "", byAnswer: {} }, ...(edit.operation === "add" ? { step: edit.step, widget_title: edit.widgetTitle } : {}) } : {};
    const payload = { questionId: edit.questionId, kind: edit.kind,
      label: edit.kind === "question" && (edit.operation === "add" || edit.label.trim() !== base?.label) ? edit.label.trim() : "",
      options: edit.kind === "question" && (edit.operation === "add" || edit.options.trim() !== (base?.options || "")) ? edit.options.trim() : "",
      template: edit.kind === "rule" ? edit.template.trim() : "", config };
    if (edit.kind === "question" && !payload.label && !payload.options) { setError("Modifiez le libellé ou les choix avant d'envoyer."); return; }
    run(async () => { await proposeQuestionChange(payload); setEditing(null); }, canPublish ? "Modification publiée : elle s'applique à tous les CCTP de l'équipe." : "Modification proposée : un valideur de l'équipe la relira.");
  };

  if (!catalog) return <section className="team-questions" data-team-questions>{error ? <div className="login-error" role="alert">{error}</div> : <p className="team-shared-empty">Chargement du questionnaire…</p>}</section>;

  const kindLabel = (change) => (change.kind === "rule" ? "Règle métier" : "Question");
  const describe = (change) => {
    const base = questionById[change.questionId];
    if (change.kind === "rule") return <><small>Phrase du CCTP</small><p className="team-q-after">{change.template}</p></>;
    return <>
      {change.label && <><small>Libellé : avant → après</small><p className="team-q-before">{base?.label}</p><p className="team-q-after">{change.label}</p></>}
      {change.options && <><small>Choix : avant → après</small><p className="team-q-before">{optionsOf(base?.options).join(" · ") || "—"}</p><p className="team-q-after">{optionsOf(change.options).join(" · ")}</p></>}
    </>;
  };

  return <section className="team-questions" data-team-questions>
    <header>
      <div>
        <h2><ShieldCheck size={18} /> Questionnaire et règles métier de l’équipe</h2>
        <p>Modifiez une question ou la règle qui en découle dans le CCTP. Une fois la modification validée par un valideur, <b>tous les CCTP de l’équipe</b> appliquent la nouvelle question et la nouvelle règle.</p>
      </div>
      <label className="team-q-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une question…" aria-label="Rechercher une question" /></label>
      {canPropose && <button type="button" className="primary" data-question-add onClick={startNew}><Plus size={14}/> Ajouter une question</button>}
      <button type="button" className="secondary" onClick={()=>setAllHistoryOpen(!allHistoryOpen)}><History size={14}/> Historique complet</button>
    </header>
    {error && <div className="login-error" role="alert">{error}</div>}
    {notice && <div className="team-notice" role="status" data-question-notice>{notice}</div>}
    {allHistoryOpen&&<section className="team-pending"><h3><History size={15}/> Versions du questionnaire</h3>{changes.filter(change=>change.status!=="proposed").map(change=><article key={change.id}><header><b>{change.questionId} · {kindLabel(change)}</b><span className="pill org">{change.status==="validated"?"Version actuelle":change.status==="replaced"?"Version remplacée":"Refusée"}</span></header>{describe(change)}<small>{change.author||"Équipe"} · {new Date(change.validatedAt||change.createdAt).toLocaleString("fr-FR")}</small>{canPublish&&change.status!=="validated"&&<div className="team-actions"><button className="secondary" disabled={busy} onClick={()=>run(()=>restoreQuestionChange(change.id),"Cette version a été restaurée et publiée pour l’équipe.")}><Undo2 size={13}/> Restaurer cette version</button></div>}</article>)}</section>}

    {canPublish && pending.length > 0 && <div className="team-pending" data-question-pending>
      <h3><ShieldCheck size={15} /> À valider ({pending.length})</h3>
      {pending.map((change) => <article key={change.id} data-question-change={change.id}>
        <header><b>{change.questionId} · {kindLabel(change)}</b><span className="pill org">À valider</span></header>
        {describe(change)}
        <small>Proposée par {change.author || "—"}</small>
        <div className="team-actions">
          <button className="primary" data-question-validate disabled={busy} onClick={() => run(() => validateQuestionChange(change.id), "Modification validée : elle s’applique à tous les CCTP de l’équipe.")}><Check size={13} /> Valider pour l’équipe</button>
          <button disabled={busy} onClick={() => run(() => rejectQuestionChange(change.id), "Modification refusée.")}><X size={13} /> Refuser</button>
        </div>
      </article>)}
    </div>}

    {steps.length === 0 && <p className="team-shared-empty">Aucune question ne correspond à « {search} ».</p>}
    {steps.length > 0 && <div className="team-q-lot" data-question-lot={lotId}>
      <button type="button" className="team-q-lot-title" data-question-lot-toggle aria-expanded={lotOpen} onClick={() => setLotClosed((value) => !value)}>
        <b>Lot {lotId} · {lotTitle}</b><span>{lotTotal} question{lotTotal > 1 ? "s" : ""}</span><ChevronDown size={16} />
      </button>
    {lotOpen && steps.map(([step, widgets]) => {
      const total = widgets.reduce((sum, item) => sum + item.questions.length, 0);
      const open = openStep === step || Boolean(search.trim());
      const modified = widgets.reduce((sum, item) => sum + item.questions.filter((question) => validatedBy[`${question.id}:question`] || validatedBy[`${question.id}:rule`]).length, 0);
      return <div className={`team-q-step ${open ? "open" : ""}`} key={step} data-question-step={step}>
        <button type="button" className="team-q-step-title" aria-expanded={open} onClick={() => setOpenStep(openStep === step ? "" : step)}>
          <b>{step}</b><span>{total} question{total > 1 ? "s" : ""}{modified > 0 && <em data-modified-count>{modified} modifiée{modified > 1 ? "s" : ""} par l’équipe</em>}</span><ChevronDown size={15} />
        </button>
        {open && widgets.map(({ widget, questions }) => <div key={widget.id} className="team-q-widget">
          <h4>{widget.title}</h4>
          {questions.map((question) => {
            const qChange = validatedBy[`${question.id}:question`]; const rChange = validatedBy[`${question.id}:rule`];
            const history = changes.filter((change) => change.questionId === question.id && change.status !== "proposed");
            const label = qChange?.label || question.label; const options = optionsOf(qChange?.options || question.options);
            const mineWaiting = changes.filter((change) => change.questionId === question.id && change.status === "proposed" && !canPublish);
            return <article className="team-q" key={question.id} data-team-question={question.id}>
              <header><small>{question.id}</small>{(qChange || rChange) && <em className="pill grn">Modifiée par l’équipe</em>}</header>
              <b>{label}</b>
              {options.length > 0 && <p className="team-q-options">{options.join(" · ")}</p>}
              <p className="team-q-rule">{rChange ? <><span>Règle de l’équipe :</span> {rChange.template}</> : <span>Règle métier : standard (générée par le moteur)</span>}</p>
              {history.length > 0 && <button type="button" className="team-q-history-toggle" data-question-history-toggle onClick={() => setOpenHistory(openHistory === question.id ? "" : question.id)}><History size={13} /> Voir la modification et son historique ({history.length}) <ChevronDown size={13} /></button>}
              {openHistory === question.id && <ol className="team-q-history" data-question-history>{history.map((change) => <li key={change.id}><span>{change.status === "validated" ? "Version actuelle" : change.status === "replaced" ? "Version remplacée" : "Proposition refusée"}</span><b>{kindLabel(change)} · {change.author || "Équipe"}</b><small>{new Date(change.validatedAt || change.createdAt).toLocaleString("fr-FR")}</small>{describe(change)}{canPublish&&change.status!=="validated"&&<button type="button" className="secondary" disabled={busy} onClick={()=>run(()=>restoreQuestionChange(change.id),"Cette version a été restaurée.")}><Undo2 size={12}/> Restaurer</button>}</li>)}</ol>}
              {mineWaiting.length > 0 && <small className="team-q-waiting">{mineWaiting.length} modification{mineWaiting.length > 1 ? "s" : ""} en attente de validation</small>}
              {canPropose && <div className="team-actions">
                <button type="button" data-question-edit={question.id} disabled={busy} onClick={() => startEdit(question, "question")}><Pencil size={13} /> Modifier la question</button>
                <button type="button" data-rule-edit={question.id} disabled={busy} onClick={() => startEdit(question, "rule")}><Pencil size={13} /> Modifier la règle</button>
                {canPublish && qChange && <button type="button" disabled={busy} onClick={() => run(() => deleteQuestionChange(qChange.id), "Question rétablie telle que dans le standard.")}><Undo2 size={13} /> Rétablir la question</button>}
                {canPublish && rChange && <button type="button" disabled={busy} onClick={() => run(() => deleteQuestionChange(rChange.id), "Règle rétablie telle que dans le standard.")}><Undo2 size={13} /> Rétablir la règle</button>}
                {question.agency_custom && <button type="button" className="delete" disabled={busy} onClick={() => run(() => proposeQuestionChange({ questionId: question.id, kind: "question", config: { operation: "delete" } }), canPublish ? "Question retirée du questionnaire de l’agence." : "Suppression proposée à un valideur.")}><Trash2 size={13}/> Retirer</button>}
              </div>}
              {editing?.questionId === question.id && editing.kind === "question" && <form className="team-q-form" data-question-form onSubmit={submit}>
                <label>Libellé de la question<input value={editing.label} maxLength={300} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /></label>
                <label>Choix proposés (séparés par « ; »)<textarea rows={3} value={editing.options} onChange={(event) => setEditing({ ...editing, options: event.target.value })} placeholder="Laissez vide si la question n’a pas de choix prédéfinis" /></label>
                <div className="team-q-form-grid">
                  <label>Type de réponse<select value={editing.answerType} onChange={(event) => setEditing({ ...editing, answerType: event.target.value })}><option value="single">Un seul choix</option><option value="multi">Plusieurs choix</option><option value="text">Texte court</option><option value="textarea">Texte long</option><option value="number">Nombre</option><option value="boolean">Oui / Non</option></select></label>
                  <label>Périmètre<select value={editing.scope} onChange={(event) => setEditing({ ...editing, scope: event.target.value })}><option value="work">Par ouvrage</option><option value="project">Pour tout le projet</option></select></label>
                  <label className="check"><input type="checkbox" checked={editing.required} onChange={(event) => setEditing({ ...editing, required: event.target.checked })}/> Réponse obligatoire</label>
                </div>
                {editing.operation === "add" && <div className="team-q-form-grid"><label>Étape<input value={editing.step} onChange={(event) => setEditing({ ...editing, step: event.target.value })}/></label><label>Groupe<input value={editing.widgetTitle} onChange={(event) => setEditing({ ...editing, widgetTitle: event.target.value })}/></label></div>}
                <fieldset className="team-q-generation"><legend>Texte généré dans le CCTP</legend><p className="consult-hint">Utilisez <code>{"{{réponse}}"}</code> pour reprendre la valeur. Un texte spécifique peut remplacer le texte par défaut pour chaque choix.</p>
                  <label>Texte par défaut<textarea rows={2} value={editing.generation?.default || ""} onChange={(event) => setEditing({ ...editing, generation: { ...editing.generation, default: event.target.value } })} placeholder="Ex. La prestation devra respecter : {{réponse}}."/></label>
                  {optionsOf(editing.options).map((option) => <label key={option}>Si la réponse est « {option} »<textarea rows={2} value={editing.generation?.byAnswer?.[option] || ""} onChange={(event) => setEditing({ ...editing, generation: { ...editing.generation, byAnswer: { ...(editing.generation?.byAnswer || {}), [option]: event.target.value } } })} placeholder="Laisser vide pour utiliser le texte par défaut"/></label>)}
                </fieldset>
                <div className="team-actions">
                  <button className="primary" data-question-send disabled={busy}>{canPublish ? "Publier pour l’équipe" : "Proposer à l’équipe"}</button>
                  <button type="button" onClick={() => setEditing(null)}>Annuler</button>
                </div>
              </form>}
            </article>;
          })}
        </div>)}
      </div>;
    })}
    </div>}
    {editing?.kind === "question" && editing.operation === "add" && <form className="team-q-form team-q-new" data-question-form data-question-new onSubmit={submit}>
      <h3><Plus size={15}/> Nouvelle question de l’agence</h3>
      <label>Libellé de la question<input autoFocus value={editing.label} maxLength={300} onChange={(event) => setEditing({ ...editing, label: event.target.value })}/></label>
      <label>Réponses proposées (séparées par « ; »)<textarea rows={2} value={editing.options} onChange={(event) => setEditing({ ...editing, options: event.target.value })}/></label>
      <div className="team-q-form-grid"><label>Type<select value={editing.answerType} onChange={(event) => setEditing({ ...editing, answerType: event.target.value })}><option value="single">Un choix</option><option value="multi">Plusieurs choix</option><option value="text">Texte court</option><option value="textarea">Texte long</option><option value="number">Nombre</option><option value="boolean">Oui / Non</option></select></label><label>Périmètre<select value={editing.scope} onChange={(event) => setEditing({ ...editing, scope: event.target.value })}><option value="work">Par ouvrage</option><option value="project">Projet entier</option></select></label></div>
      <div className="team-q-form-grid"><label>Étape<input value={editing.step} onChange={(event) => setEditing({ ...editing, step: event.target.value })}/></label><label>Groupe<input value={editing.widgetTitle} onChange={(event) => setEditing({ ...editing, widgetTitle: event.target.value })}/></label></div>
      <label className="check"><input type="checkbox" checked={editing.required} onChange={(event) => setEditing({ ...editing, required: event.target.checked })}/> Réponse obligatoire</label>
      <fieldset className="team-q-generation"><legend>Texte généré selon la réponse</legend><label>Texte par défaut<textarea rows={2} value={editing.generation.default} onChange={(event) => setEditing({ ...editing, generation: { ...editing.generation, default: event.target.value } })} placeholder="Ex. L’entreprise devra prévoir {{réponse}}."/></label>{optionsOf(editing.options).map((option) => <label key={option}>Si « {option} »<textarea rows={2} value={editing.generation.byAnswer?.[option] || ""} onChange={(event) => setEditing({ ...editing, generation: { ...editing.generation, byAnswer: { ...(editing.generation.byAnswer || {}), [option]: event.target.value } } })}/></label>)}</fieldset>
      <div className="team-actions"><button className="primary" disabled={busy || !editing.label.trim()}>{canPublish ? "Publier pour l’équipe" : "Proposer à l’équipe"}</button><button type="button" onClick={() => setEditing(null)}>Annuler</button></div>
    </form>}
    {editing?.kind === "rule" && (() => {
      const question = questionById[editing.questionId];
      return <RuleModal title={validatedBy[`${editing.questionId}:question`]?.label || question?.label || editing.questionId} subtitle={`${editing.questionId} · règle de l’équipe`} onClose={() => setEditing(null)} formProps={{ "data-question-form": "" }}
        footer={<>
          <button type="button" onClick={() => setEditing(null)}>Annuler</button>
          <button type="button" className="primary" data-question-send disabled={busy || !editing.template.trim()} onClick={() => submit({ preventDefault() {} })}>{canPublish ? "Publier pour l’équipe" : "Proposer à l’équipe"}</button>
        </>}>
        <RuleEditor value={sample} standard={standard.template} standardState={standard.state} current={validatedBy[`${editing.questionId}:rule`]?.template || ""}
          currentLabel="Règle de l’équipe" text={editing.template} onText={(template) => setEditing({ ...editing, template })} hideActions
          samples={optionsOf(question?.options)} onSample={setSample} />
      </RuleModal>;
    })()}
  </section>;
}
