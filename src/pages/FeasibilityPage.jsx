import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { actOnFeasibilityFact, addFeasibilityHypothesis, archiveFeasibility, createFeasibility, createFeasibilityVersion, extractFeasibility, generateFeasibilityNotice, getFeasibility, getFeasibilityAudit, getFeasibilityBrief, listFeasibilityVersions,
  patchFeasibilityChecklist, refreshFeasibilityChecklist, getFeasibilityChecklist, saveFeasibilityAnswers, saveFeasibilityEstimate, setFeasibilityConclusion, submitFeasibility, uploadAttachment, validateFeasibility } from "../api/client";
import { chapters } from "../data/chapters";

const STATUS_LABEL = { DRAFT: "En cours", TO_REVIEW: "À relire", VALIDATED: "Validée", ARCHIVED: "Archivée" };
const FACT_STATUS = { CONFIRMED: "Confirmé", PROPOSED: "À vérifier", HYPOTHESIS: "Hypothèse", MISSING: "Manquant", CONFLICT: "Conflit" };
const SEVERITY = { INFO: "Information", VIGILANCE: "Vigilance", IMPORTANT: "Important" };
const CHECK_STATUS = { TO_OBTAIN: "À obtenir", REQUESTED: "Demandé", RECEIVED: "Reçu", NOT_REQUIRED: "Non nécessaire" };
const TABS = [["cadrage", "Cadrage"], ["donnees", "Données"], ["estimation", "Estimation"], ["notice", "Notice"], ["obtenir", "À obtenir"]];
const DOC_CATEGORIES = [["plans", "Plans"], ["programme", "Programme MOA"], ["doe", "DOE"], ["diagnostics", "Diagnostics"], ["etudes", "Études techniques"], ["topographie", "Topographie"], ["geotechnique", "Géotechnique"], ["urbanisme", "Documents urbanisme"], ["photos", "Photos"], ["notices", "Notices"], ["anciennes_pieces", "Anciennes pièces marché"], ["autres", "Autres"]];
const SECTIONS = [["Nature du projet", ["nature", "destination"]], ["Programme", ["need", "area_m2", "levels", "capacity"]], ["Budget", ["budget_amount", "budget_nature"]], ["Délais", ["delivery", "calendar_constraints"]], ["Site", ["address", "parcel", "land_area", "existing_area"]], ["Contraintes connues", ["constraints"]], ["Notes MOE", ["moe_notes"]]];
const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const show = (value) => (Array.isArray(value) ? value.join(", ") : typeof value === "number" ? value.toLocaleString("fr-FR") : String(value ?? ""));

/** Projet › Faisabilité : étude initiale. Cadrage → données structurées (statut + provenance) → estimation V1, notice sommaire, points à obtenir. Le MOE décide : rien n'est confirmé ni conclu sans lui. */
export function FeasibilityPage({ project, onNavigate }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [tab, setTab] = useState("cadrage"), [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null); // validate | brief | versions | audit
  const id = project.id;
  const load = useCallback(() => getFeasibility(id).then((value) => { setData(value); setError(""); }).catch((reason) => setError(reason.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (action) => { setError(""); try { const result = await action(); if (result && result.exists) setData(result); else await load(); return result; } catch (reason) { setError(reason.message); return null; } };
  if (!data) return <main className="feasibility-page layout-work" data-feasibility-page><p className="panel-empty">{error || "Chargement…"}</p></main>;
  if (!data.exists) return <main className="feasibility-page layout-work" data-feasibility-page data-feasibility-empty>
    <header className="feas-head"><div><span className="eyebrow">FAISABILITÉ</span><h1>Étude initiale du projet</h1></div></header>
    {error && <div className="err" role="alert">{error}</div>}
    <p className="feas-empty" data-feasibility-none>Aucune étude de faisabilité n’a été créée pour ce projet.</p>
    {data.canCreate && <p><button type="button" className="primary" data-feasibility-create onClick={() => run(() => createFeasibility(id))}>Créer la faisabilité</button></p>}
  </main>;
  const editable = data.canEdit;
  return <main className="feasibility-page layout-work" data-feasibility-page data-feasibility-status={data.status}>
    <header className="feas-head">
      <div><span className="eyebrow">FAISABILITÉ</span><h1>Étude initiale du projet</h1>
        <p className="feas-status" data-feasibility-state><b>{STATUS_LABEL[data.status]}</b>{data.conclusionLabel ? ` · ${data.conclusionLabel}` : ""}{data.validatedAt ? ` · validée par ${data.validatedBy} le ${new Date(data.validatedAt).toLocaleDateString("fr-FR")}` : ""}</p></div>
      <div className="feas-actions">
        {data.canValidate && data.status !== "VALIDATED" && <button type="button" className="primary" data-feasibility-validate onClick={() => setModal("validate")}>Valider la faisabilité</button>}
        {!data.canValidate && editable && data.status === "DRAFT" && <button type="button" className="primary" data-feasibility-submit onClick={() => run(() => submitFeasibility(id))}>Proposer à la validation</button>}
        <div className="row-more"><button type="button" className="row-quick-edit" data-feasibility-more aria-haspopup="menu" aria-expanded={menu} aria-label="Plus d’actions" onClick={() => setMenu(!menu)}><MoreHorizontal size={17} /></button>
          {menu && <div className="sel-bar-menu row-more-menu" role="menu" data-feasibility-menu onClick={() => setMenu(false)}>
            <button type="button" role="menuitem" data-feasibility-brief onClick={() => setModal("brief")}>Aperçu de la fiche de cadrage</button>
            {editable && <button type="button" role="menuitem" data-feasibility-version onClick={() => setModal("version")}>Nouvelle version</button>}
            <button type="button" role="menuitem" data-feasibility-versions onClick={() => setModal("versions")}>Historique des versions</button>
            <button type="button" role="menuitem" data-feasibility-audit onClick={() => setModal("audit")}>Journal des modifications</button>
            {data.canValidate && <button type="button" role="menuitem" className="danger" onClick={() => run(() => archiveFeasibility(id))}>Archiver la faisabilité</button>}
          </div>}</div>
      </div>
    </header>
    {error && <div className="err" role="alert" data-feasibility-error>{error}</div>}
    <nav className="feas-tabs" role="tablist" aria-label="Faisabilité" data-feasibility-tabs>{TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} data-feasibility-tab={key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === "cadrage" && <Cadrage data={data} id={id} editable={editable} run={run} onNavigate={onNavigate} />}
    {tab === "donnees" && <Donnees data={data} id={id} editable={editable} run={run} />}
    {tab === "estimation" && <Estimation data={data} id={id} editable={editable} run={run} />}
    {tab === "notice" && <Notice data={data} id={id} editable={editable} run={run} />}
    {tab === "obtenir" && <Obtenir id={id} editable={editable} data={data} />}
    {modal === "validate" && <ValidateModal data={data} id={id} onClose={() => setModal(null)} onDone={(next) => { setData(next); setModal(null); }} />}
    {modal === "brief" && <BriefModal id={id} onClose={() => setModal(null)} />}
    {modal === "version" && <VersionModal id={id} onClose={() => setModal(null)} onDone={() => { setModal(null); setModal("versions"); }} />}
    {modal === "versions" && <ListModal title="Historique des versions" load={() => listFeasibilityVersions(id)} render={(value) => <ol data-feasibility-version-list>{value.versions.map((row) => <li key={row.version}><b>V{row.version} — {row.label}</b><small>{new Date(row.createdAt).toLocaleDateString("fr-FR")} · {row.author}{row.conclusion ? ` · ${data.conclusions[row.conclusion]}` : ""} · {row.facts} informations</small></li>)}{!value.versions.length && <li>Aucune version enregistrée pour l’instant.</li>}</ol>} onClose={() => setModal(null)} />}
    {modal === "audit" && <ListModal title="Journal des modifications" load={() => getFeasibilityAudit(id)} render={(value) => <ul className="feas-audit" data-feasibility-audit-list>{value.events.map((event, index) => <li key={index}><b>{event.action}</b> {event.key} <small>{event.author} · {new Date(event.at).toLocaleString("fr-FR")}</small>{event.previous || event.new ? <small>{JSON.stringify(event.previous)} → {JSON.stringify(event.new)}</small> : null}</li>)}</ul>} onClose={() => setModal(null)} />}
  </main>;
}

function Provenance({ fact }) {
  if (!fact) return null;
  return <small className={`feas-provenance s-${fact.status}`} data-fact-provenance><span className={`feas-badge s-${fact.status}`}>{fact.status === "CONFIRMED" ? "✓ " : ""}{FACT_STATUS[fact.status]}</span>{fact.sourceLabel ? ` Source : ${fact.sourceLabel}` : ""}</small>;
}

function Cadrage({ data, id, editable, run, onNavigate }) {
  const byKey = useMemo(() => Object.fromEntries(data.facts.map((fact) => [fact.key, fact])), [data.facts]);
  const initial = useMemo(() => Object.fromEntries(Object.keys(data.definitions).filter((key) => data.definitions[key].category && !["existing_structure", "asbestos_present"].includes(key)).map((key) => [key, { value: byKey[key]?.status === "MISSING" ? "" : (byKey[key]?.value ?? (data.definitions[key].type === "multi" ? [] : "")), unknown: byKey[key]?.status === "MISSING" }])), [data.facts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(initial), [saved, setSaved] = useState(""), [busy, setBusy] = useState(false), [category, setCategory] = useState("plans");
  useEffect(() => setForm(initial), [initial]);
  const set = (key, patch) => setForm((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const save = async () => {
    setBusy(true);
    const answers = Object.fromEntries(Object.entries(form).filter(([key, field]) => field.unknown || !(field.value === "" || (Array.isArray(field.value) && !field.value.length)) || byKey[key]).map(([key, field]) => [key, { value: field.value, unknown: field.unknown }]));
    const result = await run(() => saveFeasibilityAnswers(id, answers));
    setBusy(false); if (result) setSaved("Cadrage enregistré.");
  };
  const upload = async (files) => { for (const file of files) await uploadAttachment(id, "", file, category, "FEASIBILITY").catch(() => {}); await run(() => getFeasibility(id)); };
  const field = (key) => {
    const definition = data.definitions[key], state = form[key] || { value: "", unknown: false }, options = data.options[key];
    const disabled = !editable || state.unknown;
    return <label key={key} className="feas-field" data-feasibility-field={key}><span>{definition.label}</span>
      {definition.type === "select" && <select value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })}><option value="">—</option>{options.map((option) => <option key={option}>{option}</option>)}</select>}
      {definition.type === "text" && (key === "need" || key === "moe_notes" || key === "calendar_constraints" ? <textarea rows={2} value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })} /> : <input value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })} />)}
      {definition.type === "number" && <input type="number" min="0" step="any" value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })} />}
      {definition.type === "multi" && <span className="feas-multi">{options.map((option) => <label key={option} className="inline-check"><input type="checkbox" disabled={disabled} data-fact-option={option} checked={(state.value || []).includes(option)} onChange={(event) => set(key, { value: event.target.checked ? [...(state.value || []), option] : (state.value || []).filter((item) => item !== option) })} /> {option}</label>)}</span>}
      <span className="feas-field-foot"><label className="inline-check"><input type="checkbox" data-fact-unknown={key} disabled={!editable} checked={state.unknown} onChange={(event) => set(key, { unknown: event.target.checked })} /> Non connu à ce stade</label><Provenance fact={byKey[key]} /></span>
    </label>;
  };
  return <section className="feas-panel" data-feasibility-panel="cadrage">
    <p className="feas-intro">Renseignez ce que vous savez aujourd’hui. Tout peut rester « non connu à ce stade » : rien n’est obligatoire pour continuer.</p>
    {SECTIONS.map(([title, keys]) => <fieldset key={title} className="feas-section"><legend>{title}</legend>{keys.map(field)}</fieldset>)}
    <div className="feas-save">{editable && <button type="button" className="secondary" data-feasibility-save disabled={busy} onClick={save}>Enregistrer le cadrage</button>}{saved && <span className="price-message" data-feasibility-saved role="status">{saved}</span>}</div>
    <section className="feas-documents" data-feasibility-documents><h3>Documents du projet</h3>
      <p>{data.documents.count} document{data.documents.count > 1 ? "s" : ""} disponible{data.documents.count > 1 ? "s" : ""}{Object.keys(data.documents.byCategory).length ? ` · ${Object.entries(data.documents.byCategory).map(([category, count]) => `${data.documents.categories[category] || category} (${count})`).join(", ")}` : ""}</p>
      <div className="feas-doc-actions">
        {editable && <><label className="inline-select">Catégorie<select data-feasibility-doc-category value={category} onChange={(event) => setCategory(event.target.value)}>{DOC_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="secondary feas-upload" data-feasibility-add-docs><Plus size={14} /> Ajouter des documents<input type="file" multiple hidden data-feasibility-doc-file accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => { upload([...event.target.files]); event.target.value = ""; }} /></label></>}
        <button type="button" className="secondary" data-feasibility-all-docs onClick={() => onNavigate?.("documents")}>Voir tous les documents</button>
      </div>
    </section>
  </section>;
}

function FactRow({ fact, id, editable, run }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(show(fact.value)), [other, setOther] = useState("");
  const act = (body) => run(() => actOnFeasibilityFact(id, fact.id, body));
  const candidates = [{ value: fact.value, sourceLabel: fact.sourceLabel, choice: -1 }, ...(fact.alternatives || []).map((alt, index) => ({ ...alt, choice: index }))];
  return <li className={`feas-fact s-${fact.status}`} data-fact={fact.key} data-fact-status={fact.status}>
    <div className="feas-fact-main"><b>{fact.label}</b>{fact.status !== "CONFLICT" && <span className="feas-value" data-fact-value>{fact.value === null || fact.value === "" ? "—" : show(fact.value)}</span>}<Provenance fact={fact} /></div>
    {fact.status === "CONFLICT" && <div className="feas-conflict" data-fact-conflict><b>CONFLIT</b>{candidates.map((candidate) => <div key={candidate.choice} className="feas-candidate"><span>{show(candidate.value)} <small>— {candidate.sourceLabel || "valeur actuelle"}</small></span>{editable && <button type="button" data-fact-keep={candidate.choice} onClick={() => act({ action: "resolve", choice: candidate.choice })}>Retenir {show(candidate.value)}</button>}</div>)}
      {editable && <div className="feas-candidate"><input value={other} placeholder="Autre valeur" data-fact-other onChange={(event) => setOther(event.target.value)} /><button type="button" data-fact-resolve-other disabled={!other.trim()} onClick={() => act({ action: "resolve", value: other })}>Saisir une autre valeur</button></div>}</div>}
    {editable && fact.status !== "CONFLICT" && <span className="feas-fact-actions">
      {(fact.status === "PROPOSED" || fact.status === "HYPOTHESIS") && <button type="button" data-fact-confirm onClick={() => act({ action: "confirm" })}>Confirmer</button>}
      {fact.status !== "MISSING" && <button type="button" data-fact-edit onClick={() => setEditing(!editing)}>Modifier</button>}
      {fact.status === "PROPOSED" && <button type="button" data-fact-ignore onClick={() => act({ action: "ignore" })}>Ignorer</button>}
      {fact.status === "HYPOTHESIS" && <button type="button" data-fact-delete onClick={() => act({ action: "delete" })}>Supprimer</button>}
    </span>}
    {editing && <div className="feas-edit"><input value={value} data-fact-edit-input onChange={(event) => setValue(event.target.value)} /><button type="button" className="secondary" data-fact-edit-save onClick={() => { setEditing(false); act({ action: "edit", value }); }}>Enregistrer</button></div>}
  </li>;
}

function Donnees({ data, id, editable, run }) {
  const [hyp, setHyp] = useState({ label: "", value: "" }), [info, setInfo] = useState("");
  const groups = [["CONFLICT", "Conflits"], ["PROPOSED", "À vérifier"], ["HYPOTHESIS", "Hypothèses"], ["CONFIRMED", "Confirmées"], ["MISSING", "Manquantes"]];
  const missing = Object.keys(data.definitions).filter((key) => ["nature", "destination", "area_m2", "budget_amount", "address", "delivery"].includes(key) && !data.facts.some((fact) => fact.key === key && fact.status !== "MISSING"));
  return <section className="feas-panel" data-feasibility-panel="donnees">
    <div className="feas-toolbar">{editable && <button type="button" className="secondary" data-feasibility-extract onClick={async () => { const result = await run(() => extractFeasibility(id)); if (result?.extracted) setInfo(`${result.extracted.proposals} proposition${result.extracted.proposals > 1 ? "s" : ""} créée${result.extracted.proposals > 1 ? "s" : ""} · ${result.extracted.conflicts} conflit${result.extracted.conflicts > 1 ? "s" : ""} — rien n’est confirmé sans votre accord.`); }}>Analyser les documents</button>}{info && <span className="price-message" data-feasibility-extracted role="status">{info}</span>}</div>
    {groups.map(([status, title]) => { const rows = data.facts.filter((fact) => fact.status === status); const extra = status === "MISSING" ? missing : []; if (!rows.length && !extra.length) return null;
      return <section key={status} className="feas-group" data-fact-group={status}><h3>{title} <small>{rows.length + extra.length}</small></h3><ul>{rows.map((fact) => <FactRow key={fact.id} fact={fact} id={id} editable={editable} run={run} />)}{extra.map((key) => <li key={key} className="feas-fact s-MISSING" data-fact-missing={key}><div className="feas-fact-main"><b>{data.definitions[key].label}</b><small className="feas-provenance">Non renseigné — à confirmer avec le MOA</small></div></li>)}</ul></section>; })}
    {editable && <form className="feas-hypothesis" data-feasibility-hypothesis-form onSubmit={(event) => { event.preventDefault(); run(() => addFeasibilityHypothesis(id, { label: hyp.label, value: hyp.value })).then(() => setHyp({ label: "", value: "" })); }}>
      <h3>Ajouter une hypothèse</h3><div className="feas-edit"><input required minLength={2} value={hyp.label} data-hypothesis-label placeholder="Ex. Conservation de la structure existante" onChange={(event) => setHyp({ ...hyp, label: event.target.value })} /><input value={hyp.value} data-hypothesis-value placeholder="Valeur (facultatif)" onChange={(event) => setHyp({ ...hyp, value: event.target.value })} /><button className="secondary" data-hypothesis-add>Ajouter</button></div></form>}
    <section className="feas-group" data-feasibility-vigilance><h3>Points de vigilance <small>{data.vigilance.length}</small></h3>
      {data.vigilance.length === 0 ? <p className="panel-empty">Aucun point de vigilance à ce stade.</p> : <ul>{data.vigilance.map((point) => <li key={point.id} className={`feas-vigilance sev-${point.severity}`} data-vigilance={point.id}><span className="feas-badge">{SEVERITY[point.severity]}</span> {point.message}</li>)}</ul>}
      <p className="feas-note">Ces points sont déterministes : ils aident à ne rien oublier, ils ne décident de rien.</p></section>
  </section>;
}

function Estimation({ data, id, editable, run }) {
  const [lines, setLines] = useState(data.estimate.lines), [saved, setSaved] = useState("");
  useEffect(() => setLines(data.estimate.lines), [data.estimate.lines]);
  const total = lines.reduce((sum, line) => sum + (Number(line.amountHt) || 0), 0), budget = data.estimate.budget, gap = budget !== null && lines.length ? total - budget : null;
  const patch = (index, change) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));
  const save = async () => { const result = await run(() => saveFeasibilityEstimate(id, lines.filter((line) => String(line.label).trim()).map((line) => ({ lotId: line.lotId || "", label: line.label, amountHt: line.amountHt === "" || line.amountHt === null ? null : Number(line.amountHt), comment: line.comment || "" })))); if (result) setSaved("Estimation enregistrée."); };
  return <section className="feas-panel" data-feasibility-panel="estimation">
    <h2>Estimation de faisabilité</h2><p className="feas-intro">Première estimation par lot, saisie à la main : aucun CCTP ni DPGF n’est nécessaire, aucun prix n’est injecté.</p>
    <table className="feas-table" data-feasibility-estimate><thead><tr><th>Lot</th><th>Montant HT</th><th /></tr></thead><tbody>
      {lines.map((line, index) => <tr key={line.id || index} data-estimate-line><td><input value={line.label} disabled={!editable} data-estimate-label list="feas-lots" placeholder="Lot" onChange={(event) => patch(index, { label: event.target.value })} /></td><td><input type="number" min="0" step="any" value={line.amountHt ?? ""} disabled={!editable} data-estimate-amount onChange={(event) => patch(index, { amountHt: event.target.value })} /></td><td>{editable && <button type="button" className="doc-action" aria-label="Supprimer le lot" onClick={() => setLines(lines.filter((_, i) => i !== index))}><Trash2 size={14} /></button>}</td></tr>)}
    </tbody><tfoot><tr><td><b>TOTAL HT</b></td><td data-estimate-total><b>{money.format(total)}</b></td><td /></tr></tfoot></table>
    <datalist id="feas-lots">{chapters.map((chapter) => <option key={chapter.id} value={chapter.title} />)}</datalist>
    {editable && <p><button type="button" className="secondary" data-estimate-add onClick={() => setLines([...lines, { label: "", amountHt: "" }])}><Plus size={14} /> Ajouter un lot</button> <button type="button" className="secondary" data-estimate-save onClick={save}>Enregistrer l’estimation</button> {saved && <span className="price-message" role="status" data-estimate-saved>{saved}</span>}</p>}
    {budget !== null && <dl className="feas-gap" data-estimate-gap><dt>Budget MOA</dt><dd>{money.format(budget)}</dd><dt>Estimation</dt><dd>{money.format(total)}</dd><dt>Écart</dt><dd>{gap === null ? "—" : `${gap > 0 ? "+" : ""}${money.format(gap)}`}</dd></dl>}
    <p className="feas-note">L’écart est un repère : Calepin n’en déduit aucune conclusion. La décision de faisabilité appartient au MOE.</p>
  </section>;
}

function Notice({ data, id, editable, run }) {
  const notice = data.notice || {};
  return <section className="feas-panel" data-feasibility-panel="notice">
    <h2>Notice descriptive sommaire</h2><p className="feas-intro">Document beaucoup plus léger qu’un CCTP. Elle n’utilise que les informations confirmées et les hypothèses marquées comme telles — jamais une proposition non validée ni une donnée en conflit.</p>
    {editable && <p><button type="button" className="secondary" data-notice-generate onClick={() => run(() => generateFeasibilityNotice(id))}>{notice.text ? "Régénérer la notice" : "Générer la notice"}</button></p>}
    {notice.text ? <><pre className="feas-notice" data-notice-text>{notice.text}</pre><p className="feas-note" data-notice-meta>Générée le {new Date(notice.generatedAt).toLocaleDateString("fr-FR")} à partir de {notice.basedOn.length} information{notice.basedOn.length > 1 ? "s" : ""}{notice.excluded?.length ? ` · ${notice.excluded.length} information${notice.excluded.length > 1 ? "s" : ""} non validée${notice.excluded.length > 1 ? "s" : ""} ou en conflit exclue${notice.excluded.length > 1 ? "s" : ""}` : ""}.</p></> : <p className="panel-empty">La génération est explicite : cliquez sur « Générer la notice ».</p>}
  </section>;
}

function Obtenir({ id, editable, data }) {
  const [state, setState] = useState(null), [error, setError] = useState("");
  useEffect(() => { getFeasibilityChecklist(id).then(setState).catch((reason) => setError(reason.message)); }, [id, data.facts.length]);
  const act = async (action) => { try { setState(await action()); } catch (reason) { setError(reason.message); } };
  const KINDS = [["DOCUMENT", "Documents à obtenir"], ["STUDY", "Études à vérifier"], ["CONFIRM", "À confirmer avec le MOA"]];
  return <section className="feas-panel" data-feasibility-panel="obtenir">
    <h2>Pour poursuivre le projet</h2>{error && <div className="err" role="alert">{error}</div>}
    {editable && <p><button type="button" className="secondary" data-checklist-refresh onClick={() => act(() => refreshFeasibilityChecklist(id))}>Actualiser la liste</button></p>}
    {!state ? <p className="panel-empty">Chargement…</p> : state.items.length === 0 ? <p className="panel-empty" data-checklist-empty>Liste vide : cliquez sur « Actualiser la liste » pour la construire à partir de vos informations et des points de vigilance.</p> :
      KINDS.map(([kind, title]) => { const rows = state.items.filter((item) => item.kind === kind); return rows.length ? <section key={kind} className="feas-group"><h3>{title}</h3><ul>{rows.map((item) => <li key={item.id} className="feas-check" data-checklist-item={item.key} data-checklist-status={item.status}>
        <div><b>{item.label}</b><small>{item.reason}</small>{item.attachmentName && <small data-checklist-attached>Document rattaché : {item.attachmentName}</small>}</div>
        <span className="feas-check-actions"><select value={item.status} disabled={!state.canEdit} data-checklist-select onChange={(event) => act(() => patchFeasibilityChecklist(id, item.id, { status: event.target.value }))}>{state.statuses.map((status) => <option key={status} value={status}>{CHECK_STATUS[status]}</option>)}</select>
          {state.canEdit && item.kind !== "CONFIRM" && <select value={item.attachmentId || ""} data-checklist-attach onChange={(event) => event.target.value && act(() => patchFeasibilityChecklist(id, item.id, { attachmentId: event.target.value }))}><option value="">Rattacher un document…</option>{state.documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.filename}</option>)}</select>}</span>
      </li>)}</ul></section> : null; })}
  </section>;
}

function Modal({ title, onClose, children, wide }) {
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`estimate-documents ${wide ? "clause-modal" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header>{children}</section></div>;
}

function ValidateModal({ data, id, onClose, onDone }) {
  const [conclusion, setConclusion] = useState(data.conclusion || ""), [comment, setComment] = useState(data.conclusionComment || ""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const confirm = async () => { setBusy(true); setError(""); try { await setFeasibilityConclusion(id, { conclusion, comment }); onDone(await validateFeasibility(id)); } catch (reason) { setError(reason.message); setBusy(false); } };
  return <Modal title="Valider la faisabilité" onClose={onClose} wide>
    {data.conclusionHints.length > 0 && <div className="feas-hints" data-conclusion-hints><b>Points à considérer</b><ul>{data.conclusionHints.map((hint) => <li key={hint}>{hint}</li>)}</ul><small>Ces points sont des repères : Calepin ne choisit pas la conclusion.</small></div>}
    {error && <div className="err" role="alert" data-validate-error>{error}</div>}
    <fieldset className="feas-conclusions" data-conclusion-options><legend>Conclusion du MOE</legend>{Object.entries(data.conclusions).map(([key, label]) => <label key={key} className="inline-check"><input type="radio" name="conclusion" data-conclusion={key} checked={conclusion === key} onChange={() => setConclusion(key)} /> {label}</label>)}</fieldset>
    <label>Commentaires / réserves<textarea rows={3} data-conclusion-comment value={comment} onChange={(event) => setComment(event.target.value)} /></label>
    <p className="price-modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button type="button" className="primary" data-validate-confirm disabled={busy || !conclusion} onClick={confirm}>Valider</button></p>
  </Modal>;
}

function BriefModal({ id, onClose }) {
  const [brief, setBrief] = useState(null);
  useEffect(() => { getFeasibilityBrief(id).then(setBrief).catch(() => setBrief({ text: "Fiche indisponible." })); }, [id]);
  return <Modal title="Fiche de cadrage" onClose={onClose} wide><pre className="feas-notice" data-brief-text>{brief ? brief.text : "Chargement…"}</pre><p className="feas-note">Aperçu produit depuis l’état structuré du projet (export Word / PDF non disponible dans cette version).</p></Modal>;
}

function VersionModal({ id, onClose, onDone }) {
  const [label, setLabel] = useState(""), [busy, setBusy] = useState(false);
  return <Modal title="Nouvelle version" onClose={onClose}>
    <p className="consult-hint">Enregistre un instantané de la faisabilité (informations, estimation, conclusion). Les versions précédentes ne sont jamais modifiées.</p>
    <label>Nom de la version<input data-version-label value={label} placeholder="Ex. Après réception du diagnostic structure" onChange={(event) => setLabel(event.target.value)} /></label>
    <p className="price-modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button type="button" className="primary" data-version-save disabled={busy} onClick={async () => { setBusy(true); await createFeasibilityVersion(id, label).catch(() => {}); onDone(); }}>Enregistrer la version</button></p>
  </Modal>;
}

function ListModal({ title, load, render, onClose }) {
  const [value, setValue] = useState(null);
  useEffect(() => { load().then(setValue).catch(() => setValue(null)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Modal title={title} onClose={onClose} wide>{value ? render(value) : <p className="panel-empty">Chargement…</p>}</Modal>;
}
