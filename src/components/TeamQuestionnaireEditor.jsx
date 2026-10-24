import { Check, ChevronDown, History, Pencil, Search, ShieldCheck, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RuleEditor, RuleModal } from "./RuleEditor";
import { deleteQuestionChange, getQuestionnaireCatalog, getRuleDefault, listQuestionChanges, proposeQuestionChange, rejectQuestionChange, validateQuestionChange } from "../api/client";

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
    });
  };
  const submit = (event) => {
    event.preventDefault();
    const edit = editing;
    const base = questionById[edit.questionId];
    const payload = { questionId: edit.questionId, kind: edit.kind, label: edit.kind === "question" && edit.label.trim() !== base.label ? edit.label.trim() : "", options: edit.kind === "question" && edit.options.trim() !== (base.options || "") ? edit.options.trim() : "", template: edit.kind === "rule" ? edit.template.trim() : "" };
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
    </header>
    {error && <div className="login-error" role="alert">{error}</div>}
    {notice && <div className="team-notice" role="status" data-question-notice>{notice}</div>}

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
              {openHistory === question.id && <ol className="team-q-history" data-question-history>{history.map((change) => <li key={change.id}><span>{change.status === "validated" ? "Version actuelle" : change.status === "replaced" ? "Version remplacée" : "Proposition refusée"}</span><b>{kindLabel(change)} · {change.author || "Équipe"}</b><small>{new Date(change.validatedAt || change.createdAt).toLocaleString("fr-FR")}</small>{describe(change)}</li>)}</ol>}
              {mineWaiting.length > 0 && <small className="team-q-waiting">{mineWaiting.length} modification{mineWaiting.length > 1 ? "s" : ""} en attente de validation</small>}
              {canPropose && <div className="team-actions">
                <button type="button" data-question-edit={question.id} disabled={busy} onClick={() => startEdit(question, "question")}><Pencil size={13} /> Modifier la question</button>
                <button type="button" data-rule-edit={question.id} disabled={busy} onClick={() => startEdit(question, "rule")}><Pencil size={13} /> Modifier la règle</button>
                {canPublish && qChange && <button type="button" disabled={busy} onClick={() => run(() => deleteQuestionChange(qChange.id), "Question rétablie telle que dans le standard.")}><Undo2 size={13} /> Rétablir la question</button>}
                {canPublish && rChange && <button type="button" disabled={busy} onClick={() => run(() => deleteQuestionChange(rChange.id), "Règle rétablie telle que dans le standard.")}><Undo2 size={13} /> Rétablir la règle</button>}
              </div>}
              {editing?.questionId === question.id && editing.kind === "question" && <form className="team-q-form" data-question-form onSubmit={submit}>
                <label>Libellé de la question<input value={editing.label} maxLength={300} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /></label>
                <label>Choix proposés (séparés par « ; »)<textarea rows={3} value={editing.options} onChange={(event) => setEditing({ ...editing, options: event.target.value })} placeholder="Laissez vide si la question n’a pas de choix prédéfinis" /></label>
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
