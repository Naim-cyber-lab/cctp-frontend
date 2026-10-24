import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, Plus, RotateCcw, Search, X } from "lucide-react";
import { archiveTeamClause, deleteTeamClause, getQuestionnaireCatalog, getTeamClause, listTeamClauses, proposeClauseVersion, proposeTeamClause, editTeamClause, rejectClauseVersion, rejectTeamClause, restoreTeamClause, submitTeamClause, validateClauseVersion, validateTeamClause } from "../api/client";
import { chapters } from "../data/chapters";
import { SECTION_TYPES, WORKFLOW, clauseMeta, lotLabel } from "../utils/clauses";

const dateFr = (value) => (value ? new Date(value).toLocaleDateString("fr-FR") : "");

/** Bibliothèque agence › CCTP › Clauses : de vrais objets (titre, texte, lot, famille, section, étiquettes, version, statut), pas un simple formulaire titre + texte.
 *  Une clause est un TEXTE contractuel réutilisable ; un modèle d'ouvrage est un ensemble de RÉPONSES au questionnaire : deux objets distincts. */
export function AgencyClauses({ canPropose, canPublish, userEmail, query = "", insertContext = null, onUseInCctp }) {
  const [items, setItems] = useState([]), [error, setError] = useState(""), [lot, setLot] = useState("all"), [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState(null); // { mode: "create" | "version", clause? }
  const [view, setView] = useState(null);
  const load = useCallback(() => listTeamClauses(showArchived).then(setItems).catch((reason) => setError(reason.message)), [showArchived]);
  useEffect(() => { load(); }, [load]);
  const act = async (action) => { setError(""); try { await action(); await load(); } catch (reason) { setError(reason.message); } };
  const lots = useMemo(() => [...new Set(items.map((item) => item.lotId))].sort(), [items]);
  const shown = items.filter((item) => (lot === "all" || item.lotId === lot) && (!query.trim() || `${item.label} ${item.text} ${(item.tags || []).join(" ")} ${item.workFamily}`.toLowerCase().includes(query.trim().toLowerCase())));
  const mine = (item) => item.author === userEmail;
  return <section className="settings-section agency-clauses" data-agency-clauses>
    <header className="clauses-head"><div><h2>Clauses agence</h2>
      <p>Textes contractuels validés par l’agence, réutilisables dans tous ses CCTP. <small>Une clause est un texte ; un modèle d’ouvrage regroupe des réponses au questionnaire : ce sont deux objets différents.</small></p></div>
      {canPropose && <button type="button" className="primary" data-clause-new onClick={() => setEditor({ mode: "create" })}><Plus size={15} /> {canPublish ? "Ajouter une clause" : "Proposer une clause"}</button>}</header>
    {error && <div className="login-error" role="alert">{error}</div>}
    <nav className="clause-lots" data-clause-lots aria-label="Lots">
      <button type="button" className={lot === "all" ? "active" : ""} data-clause-lot="all" onClick={() => setLot("all")}>Tous <b>{items.length}</b></button>
      {lots.map((id) => <button key={id || "tous"} type="button" className={lot === id ? "active" : ""} data-clause-lot={id || "none"} onClick={() => setLot(id)}>{id ? lotLabel(id) : "Tous lots"} <b>{items.filter((item) => item.lotId === id).length}</b></button>)}
      {canPublish && <label className="inline-check"><input type="checkbox" data-clause-show-archived checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archivées</label>}
    </nav>
    {shown.length === 0 ? <p className="panel-empty" data-clause-empty>{items.length === 0 ? "Aucune clause pour l’instant : proposez la première." : "Aucune clause ne correspond."}</p> : <ul className="clause-list" data-clause-list>
      {shown.map((item) => <li key={item.id} data-clause={item.id} data-clause-status={item.workflowStatus} className={item.archived ? "archived" : ""}>
        <div className="clause-main">
          <b>{item.label || item.text.slice(0, 60)}</b>
          <small className="clause-meta">{clauseMeta(item)}</small>
          {item.trigger?.questionId && <small className="clause-reco-flag" data-clause-has-trigger>Recommandée selon le questionnaire ({item.trigger.questionId}{(item.trigger.values || []).length ? ` = ${item.trigger.values.join(" / ")}` : ""})</small>}
          <small className="clause-status"><span className={`clause-badge s-${item.workflowStatus}`} data-clause-badge>{WORKFLOW[item.workflowStatus]}</span> Version {item.version}{item.pendingVersions > 0 && canPublish ? ` · ${item.pendingVersions} modification${item.pendingVersions > 1 ? "s" : ""} proposée${item.pendingVersions > 1 ? "s" : ""}` : ""} · {item.author || "—"}</small>
          {(item.tags || []).length > 0 && <small className="clause-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</small>}
        </div>
        <span className="actions">
          <button type="button" data-clause-view onClick={() => getTeamClause(item.id).then(setView).catch((reason) => setError(reason.message))}>Voir</button>
          {insertContext && item.workflowStatus === "VALIDATED" && <button type="button" className="primary" data-clause-use-in-cctp onClick={() => onUseInCctp?.(item)}>Utiliser dans le CCTP courant</button>}
          {canPublish && item.workflowStatus === "PENDING_VALIDATION" && <><button type="button" data-clause-validate onClick={() => act(() => validateTeamClause(item.id))}><Check size={13} /> Valider</button><button type="button" onClick={() => act(() => rejectTeamClause(item.id))}><X size={13} /> Refuser</button></>}
          {item.workflowStatus === "DRAFT" && mine(item) && <button type="button" data-clause-submit onClick={() => act(() => submitTeamClause(item.id))}>Soumettre</button>}
          {item.workflowStatus === "VALIDATED" && canPublish && <button type="button" data-clause-edit onClick={() => setEditor({ mode: "version", clause: item })}>Modifier</button>}
          {item.workflowStatus === "VALIDATED" && !canPublish && canPropose && <button type="button" data-clause-propose-edit onClick={() => setEditor({ mode: "version", clause: item })}>Proposer une modification</button>}
          {canPublish && item.workflowStatus === "ARCHIVED" && <button type="button" data-clause-restore onClick={() => act(() => restoreTeamClause(item.id))}><RotateCcw size={13} /> Restaurer</button>}
          {canPublish && item.workflowStatus !== "ARCHIVED" && item.workflowStatus === "VALIDATED" && <button type="button" data-clause-archive onClick={() => act(() => archiveTeamClause(item.id))}><Archive size={13} /> Archiver</button>}
          {(canPublish ? item.workflowStatus !== "VALIDATED" : mine(item) && item.workflowStatus !== "VALIDATED") && <button type="button" data-clause-delete onClick={() => act(() => deleteTeamClause(item.id))}>Supprimer</button>}
        </span>
      </li>)}
    </ul>}
    {editor && <ClauseEditor mode={editor.mode} clause={editor.clause} canPublish={canPublish} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
    {view && <ClauseView clause={view} canPublish={canPublish} onClose={() => setView(null)} onChanged={() => { load(); getTeamClause(view.id).then(setView).catch(() => setView(null)); }} />}
  </section>;
}

export function ClauseEditor({ mode = "create", clause = null, canPublish, initial = null, onClose, onSaved }) {
  const base = clause || initial || {};
  const [form, setForm] = useState({ label: base.label || "", text: base.text || "", lotId: base.lotId || "", workFamily: base.workFamily || "", sectionType: base.sectionType || "", tags: (base.tags || []).join(", "), triggerQuestion: base.trigger?.questionId || "", triggerValues: (base.trigger?.values || []).join(", ") });
  const [questions, setQuestions] = useState([]);
  useEffect(() => { getQuestionnaireCatalog().then((catalog) => setQuestions(catalog.questions || [])).catch(() => {}); }, []);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const body = { label: form.label.trim(), text: form.text.trim(), lotId: form.lotId, workFamily: form.workFamily.trim(), sectionType: form.sectionType, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean), trigger: form.triggerQuestion ? { questionId: form.triggerQuestion, values: form.triggerValues.split(",").map((value) => value.trim()).filter(Boolean) } : {} };
  const save = async (asDraft = false) => {
    if (form.text.trim().length < 3) { setError("Saisissez le texte de la clause."); return; }
    setBusy(true); setError("");
    try {
      if (mode === "version") await proposeClauseVersion(clause.id, body);
      else await proposeTeamClause({ ...body, asDraft });
      onSaved(mode, asDraft);
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  const title = mode === "version" ? (canPublish ? "Modifier la clause (nouvelle version)" : "Proposer une modification") : (canPublish ? "Créer une clause agence" : "Proposer une clause agence");
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="estimate-documents price-modal clause-modal" role="dialog" aria-modal="true" aria-label={title} data-clause-editor onSubmit={(event) => { event.preventDefault(); save(false); }}>
      <header><h2>{title}</h2><button type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header>
      {error && <div className="err" role="alert" data-clause-editor-error>{error}</div>}
      <label>Titre<input data-clause-title maxLength={160} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Ex. Sujétions générales de mise en œuvre" /></label>
      <div className="price-modal-row">
        <label>Lot<select data-clause-lot-select value={form.lotId} onChange={(event) => setForm({ ...form, lotId: event.target.value })}><option value="">Tous les lots</option>{chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Contexte (section)<select data-clause-section-select value={form.sectionType} onChange={(event) => setForm({ ...form, sectionType: event.target.value })}><option value="">Non précisé</option>{Object.entries(SECTION_TYPES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Famille d’ouvrage<input data-clause-family maxLength={80} value={form.workFamily} onChange={(event) => setForm({ ...form, workFamily: event.target.value })} placeholder="Ex. Cloisons" /></label>
      </div>
      <label>Étiquettes <small>séparées par des virgules</small><input data-clause-tags value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Ex. site occupé, protection" /></label>
      <fieldset className="clause-trigger" data-clause-trigger><legend>Recommandation automatique <small>(facultatif)</small></legend>
        <p className="consult-hint">Proposer cette clause dans l’éditeur quand une réponse du questionnaire correspond. Elle n’est jamais insérée toute seule.</p>
        <div className="price-modal-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <label>Quand la question…<select data-clause-trigger-question value={form.triggerQuestion} onChange={(event) => setForm({ ...form, triggerQuestion: event.target.value })}><option value="">Aucune</option>{questions.map((question) => <option key={question.id} value={question.id}>{question.label.length > 90 ? `${question.label.slice(0, 90)}…` : question.label}</option>)}</select></label>
          <label>…a pour réponse<input data-clause-trigger-values disabled={!form.triggerQuestion} value={form.triggerValues} onChange={(event) => setForm({ ...form, triggerValues: event.target.value })} placeholder="Ex. oui, partiellement" /></label>
        </div>
      </fieldset>
      <label>Texte<textarea data-clause-text rows={7} required value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} /></label>
      {mode === "create" && !canPublish && <p className="consult-hint">Votre proposition sera soumise à validation par un administrateur de la bibliothèque.</p>}
      <p className="price-modal-actions">
        <button type="button" className="secondary" onClick={onClose}>Annuler</button>
        {mode === "create" && <button type="button" className="secondary" data-clause-save-draft disabled={busy} onClick={() => save(true)}>Enregistrer en brouillon</button>}
        <button className="primary" data-clause-save disabled={busy}>{mode === "version" ? (canPublish ? "Publier la nouvelle version" : "Proposer la modification") : (canPublish ? "Ajouter la clause" : "Proposer à la bibliothèque")}</button>
      </p>
    </form>
  </div>;
}

function ClauseView({ clause, canPublish, onClose, onChanged }) {
  const [error, setError] = useState("");
  const run = async (action) => { setError(""); try { await action(); onChanged(); } catch (reason) { setError(reason.message); } };
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="estimate-documents clause-modal" role="dialog" aria-modal="true" aria-label={clause.label} data-clause-view-modal>
      <header><h2>{clause.label}</h2><button type="button" aria-label="Fermer" data-clause-view-close onClick={onClose}><X size={18} /></button></header>
      <p className="clause-meta">{clauseMeta(clause)} · Version {clause.version} · {WORKFLOW[clause.workflowStatus]}</p>
      {error && <div className="err" role="alert">{error}</div>}
      <blockquote className="clause-text" data-clause-text-view>{clause.text}</blockquote>
      <h3>Historique des versions</h3>
      <ol className="clause-versions" data-clause-versions>{(clause.versions || []).map((entry) => <li key={entry.version} data-clause-version={entry.version} className={entry.status}>
        <b>V{entry.version}</b> <span>{entry.status === "validated" ? (entry.version === clause.version ? "Version actuelle" : "Validée") : entry.status === "proposed" ? "Modification proposée" : "Refusée"}</span>
        <small>{dateFr(entry.createdAt)}{entry.author ? ` · ${entry.author}` : ""}</small>
        <p>{entry.text}</p>
        {canPublish && entry.status === "proposed" && entry.version > 1 && <span className="actions"><button type="button" data-clause-version-validate onClick={() => run(() => validateClauseVersion(clause.id, entry.version))}><Check size={13} /> Valider cette version</button><button type="button" onClick={() => run(() => rejectClauseVersion(clause.id, entry.version))}>Refuser</button></span>}
      </li>)}</ol>
    </section>
  </div>;
}
