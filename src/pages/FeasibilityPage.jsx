import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { actOnFeasibilityFact, addFeasibilityHypothesis, archiveFeasibility, createFeasibility, createFeasibilityVersion, extractFeasibility, getFeasibility, getFeasibilityAudit, getFeasibilityBrief, listFeasibilityVersions, markFeasibilityStep, saveFeasibilityAnswers, submitFeasibility, uploadAttachment } from "../api/client";
import { DecisionForm, GlobalEstimation } from "../components/FeasibilityV2";
import { UseDocuments } from "../components/UseDocuments";
import { DemoNotice } from "../components/DemoNotice";
import { FeasibilityCanonical } from "../components/FeasibilityCanonical";
import "../feasibility-canonical.css";

const STATUS_LABEL = { DRAFT: "En cours", TO_REVIEW: "À relire", VALIDATED: "Validée", ARCHIVED: "Archivée" };
const FACT_STATUS = { CONFIRMED: "Confirmé", PROPOSED: "À vérifier", HYPOTHESIS: "Hypothèse", MISSING: "Manquant", CONFLICT: "Conflit" };
const SEVERITY = { INFO: "Information", VIGILANCE: "Vigilance", IMPORTANT: "Important" };
const CHECK_STATUS = { TO_OBTAIN: "À obtenir", REQUESTED: "Demandé", RECEIVED: "Reçu", NOT_REQUIRED: "Non nécessaire" };
// l'ordre des onglets est l'ordre réel du travail : définir le projet → ordre de grandeur → analyser et conclure → ce qu'il reste à obtenir → livrable
const TABS = [["cadrage", "Cadrage"], ["points", "Points à traiter"], ["estimation", "Estimation"], ["notice", "Notice"]];
// V2.4 : « Analyse » et « Études & actions » ne forment plus qu'un écran ; les anciens noms d'étape (serveur, liens, tests) pointent vers lui
const TAB_ALIAS = { analyse: "points", obtenir: "points" };
const SUBTITLE = { cadrage: "Décrivez le projet avec les informations disponibles aujourd’hui.", points: "Les éléments qui doivent encore être vérifiés, obtenus ou décidés.", estimation: "Les postes de travaux identifiés et leur première estimation.", notice: "La synthèse de l’étude de faisabilité." };
const mergeStatus = (a, b) => (a === "COMPLETED" && b === "COMPLETED" ? "COMPLETED" : a === "NOT_STARTED" && b === "NOT_STARTED" ? "NOT_STARTED" : "IN_PROGRESS");
const STEP_MARK = { NOT_STARTED: "○", IN_PROGRESS: "●", COMPLETED: "✓" };
const STEP_TEXT = { NOT_STARTED: "pas commencée", IN_PROGRESS: "en cours", COMPLETED: "terminée" };
const IMPORTANT_KEYS = ["nature", "destination", "area_m2", "budget_amount", "address", "delivery"];
const DOC_CATEGORIES = [["plans", "Plans"], ["programme", "Programme MOA"], ["doe", "DOE"], ["diagnostics", "Diagnostics"], ["etudes", "Études techniques"], ["topographie", "Topographie"], ["geotechnique", "Géotechnique"], ["urbanisme", "Documents urbanisme"], ["photos", "Photos"], ["notices", "Notices"], ["anciennes_pieces", "Anciennes pièces marché"], ["autres", "Autres"]];
// Cadrage unique (V2.4) : nature, destination, besoin, surfaces, niveaux, budget, échéance, adresse, amiante et site occupé se saisissent UNE fois, dans les cartes du cadrage ; ces informations sont reportées automatiquement
// dans les « informations du projet ». Ne restent ici que les compléments qui n'existent pas ailleurs.
const MIRRORED_KEYS = ["nature", "destination", "need", "area_m2", "existing_area", "levels", "budget_amount", "delivery", "address", "asbestos_status"];
const SECTIONS = [["Programme", ["capacity"]], ["Nature du budget", ["budget_nature"]], ["Calendrier", ["calendar_constraints"]], ["Terrain", ["parcel", "land_area"]], ["Repères sur les contraintes", ["constraints"]],
  ["Existant à rénover", ["existing_structure", "plans_reliable", "asbestos_notes", "lead_status", "lead_notes", "diagnostics_available", "elements_kept"]], ["Site occupé", ["activity_maintained", "phasing", "accessible_zones"]], ["Notes MOE", ["moe_notes"]]];
const LEGACY_NATURE = { RENOVATION: "Rénovation", RESTRUCTURING: "Réhabilitation" };
const LEGACY_ASBESTOS = { PRESENT: "Présence connue", TO_DIAGNOSE: "Diagnostic à consulter", DIAGNOSED: "Diagnostic à consulter" };
const LONG_TEXT = ["need", "moe_notes", "calendar_constraints", "diagnostics_available", "elements_kept", "phasing", "accessible_zones", "existing_structure", "asbestos_notes", "lead_notes"];
const AXIS_STATUS = { NOT_ASSESSED: "Non analysé", OK_AT_THIS_STAGE: "Rien à signaler à ce stade", POINTS_TO_CONFIRM: "Points à confirmer", RESERVATIONS: "Réserves à examiner", INSUFFICIENT_INFORMATION: "Informations insuffisantes" };
const ISSUE_SEVERITY = { INFO: "Information", ATTENTION: "À surveiller", IMPORTANT: "Important" };
const ISSUE_TYPE = { MISSING_INFORMATION: "Information manquante", VIGILANCE: "Vigilance", RESERVATION: "Réserve", CONFLICT: "Incohérence", BUDGET_GAP: "Écart budgétaire", TO_VERIFY: "À vérifier" };
const ISSUE_STATE = { OPEN: "Ouvert", RESOLVED: "Résolu", ACCEPTED_AS_RESERVATION: "Retenu comme réserve", NOT_APPLICABLE: "Non applicable" };
const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const show = (value) => (Array.isArray(value) ? value.join(", ") : typeof value === "number" ? value.toLocaleString("fr-FR") : String(value ?? ""));

/** Navigation de fin d'étape : étape précédente, action primaire « Continuer », et ce que l'étape suivante apporte (elle explique POURQUOI on avance). Jamais bloquante. */
function StepNavigation({ previous, primary, note, why, error, busy, onPrevious, onNext, onRetry, extra }) {
  return <footer className="feas-step-nav" data-step-nav>
    {why && <p className="feas-step-why" data-step-why>{why}</p>}
    {note && <p className="feas-note" data-step-note>{note}</p>}
    {error && <div className="err" role="alert" data-step-error>{error} <button type="button" className="secondary" data-step-retry onClick={onRetry}>Réessayer</button></div>}
    <div className="feas-step-nav-buttons">
      {previous ? <button type="button" className="link-button" data-step-previous onClick={onPrevious}>← {previous}</button> : <span />}
      {extra}
      {primary && <button type="button" className="primary" data-step-next disabled={busy} onClick={onNext}>{primary} →</button>}
    </div>
  </footer>;
}

/** Projet › Faisabilité : étude initiale. Parcours guidé Cadrage → Estimation → Analyse (conclusion du MOE) → À obtenir → Notice ; chaque étape s'enregistre seule et se termine par « Continuer ». Le MOE décide : rien n'est confirmé ni conclu sans lui. */
export function FeasibilityPage({ project, onNavigate, initialTab }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [tab, setTab] = useState(initialTab || ""), [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(null); // validate | brief | versions | audit
  const [navError, setNavError] = useState(""), [navBusy, setNavBusy] = useState(false), [premature, setPremature] = useState(false);
  const flushers = useRef({});
  const register = useCallback((key, fn) => { if (fn) flushers.current[key] = fn; else delete flushers.current[key]; }, []);
  const id = project.id;
  const load = useCallback(() => getFeasibility(id).then((value) => { setData(value); setError(""); }).catch((reason) => setError(reason.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const rawTab = tab || data?.steps?.resume || "cadrage";
  const current = TAB_ALIAS[rawTab] || rawTab; // on reprend à l'étape logique suivante, sauf si l'utilisateur a choisi un onglet
  const goTab = (key) => { setTab(TAB_ALIAS[key] || key); setNavError(""); window.scrollTo?.({ top: 0 }); };
  // « Voir la notice » : ouvre l'écran Notice ET amène le document à l'écran (déjà sur l'écran Notice, le bouton ne doit pas sembler inerte)
  const showNotice = () => { goTab("notice"); setTimeout(() => (document.querySelector("[data-feasibility-panel=notice]") || document.querySelector("[data-canon-notice]"))?.scrollIntoView({ behavior: "smooth", block: "start" }), 250); };
  const toDecision = () => { setTab("notice"); setModal(null); setTimeout(() => document.getElementById("feas-decision")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350); };
  const run = async (action) => { setError(""); try { const result = await action(); if (result && result.exists) setData(result); else await load(); return result; } catch (reason) { setError(reason.message); return null; } };
  // enregistre tout ce qui attend AVANT de changer d'étape ; en cas d'échec on ne navigue pas en silence
  const goStep = async (from, to, mark = true) => {
    setNavBusy(true); setNavError("");
    try { await Promise.all(Object.values(flushers.current).map((fn) => fn())); }
    catch { setNavBusy(false); setNavError("Certaines modifications n’ont pas pu être enregistrées."); return; }
    if (mark) { const result = from === "points" ? (await run(() => markFeasibilityStep(id, "analyse")), await run(() => markFeasibilityStep(id, "obtenir"))) : await run(() => markFeasibilityStep(id, from)); if (!result) { setNavBusy(false); setNavError("Certaines modifications n’ont pas pu être enregistrées."); return; } }
    setNavBusy(false); goTab(to);
  };
  const clickTab = (key) => {
    if (key === "notice" && current !== "notice" && data?.steps) {
      const open = data.analysis.counts.open, estimationDone = data.steps.statuses.estimation === "COMPLETED";
      if (data.notice.status === "NOT_GENERATED" && (open > 0 || !estimationDone)) { setPremature(true); return; }
    }
    goTab(key);
  };
  if (!data) return <main className="feasibility-page layout-work" data-feasibility-page><p className="panel-empty">{error || "Chargement…"}</p></main>;
  if (!data.exists) return <main className="feasibility-page layout-work" data-feasibility-page data-feasibility-empty>
    <header className="feas-head"><div><span className="eyebrow">FAISABILITÉ</span><h1>Étude initiale du projet</h1></div></header>
    {error && <div className="err" role="alert">{error}</div>}
    <p className="feas-empty" data-feasibility-none>Aucune étude de faisabilité n’a été créée pour ce projet.</p>
    {data.canCreate && <p><button type="button" className="primary" data-feasibility-create onClick={() => run(() => createFeasibility(id))}>Créer la faisabilité</button></p>}
  </main>;
  const editable = data.canEdit;
  const factsSig = data.facts.filter((fact) => MIRRORED_KEYS.includes(fact.key) || fact.key === "constraints").map((fact) => `${fact.key}:${fact.status}:${JSON.stringify(fact.value)}`).join("|");
  const totals = data.estimate.totals, counts = data.analysis.counts;
  const rawStatuses = data.steps.statuses, statuses = { ...rawStatuses, points: mergeStatus(rawStatuses.analyse, rawStatuses.obtenir) };
  const missingInfo = IMPORTANT_KEYS.filter((key) => !data.facts.some((fact) => fact.key === key && fact.status !== "MISSING" && fact.value !== null && fact.value !== "")).length;
  const nav = {
    cadrage: { primary: "Continuer vers les points à traiter", note: missingInfo ? `${missingInfo} information${missingInfo > 1 ? "s" : ""} important${missingInfo > 1 ? "es restent" : "e reste"} à renseigner. Vous pourrez les compléter plus tard.` : "Vous pourrez encore modifier ces informations plus tard.", why: "Étape suivante : voir ce qu’il reste à vérifier, obtenir ou décider.", next: "points" },
    points: { previous: ["Retour au cadrage", "cadrage"], primary: "Continuer vers l’estimation", next: "estimation", why: "Étape suivante : établir une première estimation des postes de travaux.", note: `${counts.open} point${counts.open > 1 ? "s" : ""} ${counts.open > 1 ? "restent ouverts" : "reste ouvert"}. Vous pourrez revenir les traiter plus tard.` },
    estimation: { previous: ["Retour aux points à traiter", "points"], primary: "Préparer la notice", next: "notice", why: "Étape suivante : produire la notice, synthèse de l’étude de faisabilité.", note: totals.counts.estimated ? `Estimation globale actuelle : ${money.format(totals.central)} HT.` : "L’estimation peut rester non renseignée à ce stade." },
    notice: { previous: ["Retour à l’estimation", "estimation"] },
  }[current];
  return <main className="feasibility-page layout-work" data-feasibility-page data-feasibility-status={data.status} data-feasibility-step={current}>
    <header className="feas-head">
      <div><span className="eyebrow">FAISABILITÉ</span><h1>Étude initiale du projet</h1>
        <p className="feas-status" data-feasibility-state><b>{STATUS_LABEL[data.status]}</b>{data.conclusionLabel ? ` · ${data.conclusionLabel}` : ""}{data.validatedAt ? ` · validée par ${data.validatedBy} le ${new Date(data.validatedAt).toLocaleDateString("fr-FR")}` : ""}</p></div>
      <div className="feas-actions">
        {data.status !== "VALIDATED" && <button type="button" className="secondary" data-feasibility-cta={data.cta.id} data-overall-status={data.analysis.overall.status} onClick={() => (data.cta.id === "conclude" ? setModal("ready") : data.cta.target === "notice" ? showNotice() : goTab(data.cta.target))}>{data.cta.label}</button>}
        {!data.canValidate && editable && data.status === "DRAFT" && <button type="button" className="primary" data-feasibility-submit onClick={() => run(() => submitFeasibility(id))}>Proposer à la validation</button>}
        <div className="row-more"><button type="button" className="row-quick-edit" data-feasibility-more aria-haspopup="menu" aria-expanded={menu} aria-label="Plus d’actions" onClick={() => setMenu(!menu)}><MoreHorizontal size={17} /></button>
          {menu && <div className="sel-bar-menu row-more-menu" role="menu" data-feasibility-menu onClick={() => setMenu(false)}>
            {data.status !== "VALIDATED" && <button type="button" role="menuitem" data-feasibility-synthesis data-overall-status={data.analysis.overall.status} onClick={() => setModal("ready")}>Conclure la faisabilité</button>}
            <button type="button" role="menuitem" data-feasibility-brief onClick={() => setModal("brief")}>Aperçu de la fiche de cadrage</button>
            {editable && <button type="button" role="menuitem" data-feasibility-version onClick={() => setModal("version")}>Nouvelle version</button>}
            <button type="button" role="menuitem" data-feasibility-versions onClick={() => setModal("versions")}>Historique des versions</button>
            <button type="button" role="menuitem" data-feasibility-audit onClick={() => setModal("audit")}>Journal des modifications</button>
            {data.canValidate && <button type="button" role="menuitem" className="danger" onClick={() => run(() => archiveFeasibility(id))}>Archiver la faisabilité</button>}
          </div>}</div>
      </div>
    </header>
    <DemoNotice projectId={id} kind="feasibility" />
    {error && <div className="err" role="alert" data-feasibility-error>{error}</div>}
    <nav className="feas-tabs" role="tablist" aria-label="Faisabilité" data-feasibility-tabs>{TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={current === key} aria-label={`${label} — ${STEP_TEXT[statuses[key]]}`} className={`${current === key ? "active" : ""} step-${statuses[key]}`} data-feasibility-tab={key} data-step-status={statuses[key]} onClick={() => clickTab(key)}><span className="step-mark" aria-hidden="true">{STEP_MARK[statuses[key]]}</span> {label}</button>)}</nav>
    <p className="feas-subtitle" data-feasibility-subtitle>{SUBTITLE[current]}</p>
    {current === "cadrage" && <p className="feas-intro">Renseignez ce que vous savez aujourd’hui. Chaque information se saisit une seule fois ; tout peut rester « non connu à ce stade » : rien n’est obligatoire pour continuer.</p>}
    {current === "cadrage" && <FeasibilityCanonical id={id} editable={editable} view="cadrage" goTab={goTab} onSaved={load}
      legacy={{ factsSig, renderExtras: (ctx) => <Cadrage data={data} id={id} editable={editable} run={run} onNavigate={onNavigate} register={register} ctx={ctx} /> }} />}
    {current === "estimation" && <FeasibilityCanonical id={id} editable={editable} view="estimation" goTab={goTab} />}
    {current === "estimation" && <details className="canon-card" data-legacy-estimation><summary>Repère global au ratio (facultatif)</summary><GlobalEstimation data={data} id={id} editable={editable} run={run} register={register} /></details>}
    {current === "points" && <FeasibilityCanonical id={id} editable={editable} view="points" goTab={goTab} legacy={{ data, id, editable, run, goTab, factsSig: (data.analysis?.issues || []).map((issue) => `${issue.id}:${issue.status}`).join("|") }} />}
    {current === "notice" && <FeasibilityCanonical id={id} editable={editable} view="notice" goTab={goTab} legacy={{ renderDecision: () => <DecisionForm data={data} id={id} editable={editable} onData={setData} register={register} /> }} />}
    {current === "notice" && <footer className="feas-step-nav" data-step-nav><div className="feas-step-nav-buttons"><button type="button" className="link-button" data-step-previous onClick={() => goTab("estimation")}>← {nav.previous[0]}</button></div></footer>}
    {current !== "notice" && nav && <StepNavigation previous={nav.previous?.[0]} primary={nav.primary} note={nav.note} why={nav.why} error={navError} busy={navBusy} onPrevious={() => goStep(current, nav.previous[1], false)} onNext={() => goStep(current, nav.next)} onRetry={() => goStep(current, nav.next)} />}
    {premature && <Modal title="La notice peut être incomplète" onClose={() => setPremature(false)}>
      <div data-notice-premature><p>La notice peut être incomplète car :</p>
        <ul>{statuses.estimation !== "COMPLETED" && <li>l’estimation n’est pas terminée ;</li>}{counts.open > 0 && <li>{counts.open} point{counts.open > 1 ? "s restent" : " reste"} ouvert{counts.open > 1 ? "s" : ""}.</li>}</ul>
        <p className="price-modal-actions"><button type="button" className="secondary" onClick={() => setPremature(false)}>Annuler</button><button type="button" className="primary" data-notice-premature-continue onClick={() => { setPremature(false); goTab("notice"); }}>Continuer quand même</button></p></div></Modal>}
    {modal === "ready" && <ReadyModal data={data} onClose={() => setModal(null)} onExamine={() => { goTab("analyse"); setModal(null); }} onContinue={toDecision} />}
    {modal === "brief" && <BriefModal id={id} onClose={() => setModal(null)} />}
    {modal === "version" && <VersionModal id={id} onClose={() => setModal(null)} onDone={() => { setModal(null); setModal("versions"); }} />}
    {modal === "versions" && <ListModal title="Historique des versions" load={() => listFeasibilityVersions(id)} render={(value) => <ol data-feasibility-version-list>{value.versions.map((row) => <li key={row.version}><b>V{row.version} — {row.label}</b><small>{new Date(row.createdAt).toLocaleDateString("fr-FR")} · {row.author}{row.conclusion ? ` · ${data.conclusions[row.conclusion]}` : ""} · {row.facts} informations</small></li>)}{!value.versions.length && <li>Aucune version enregistrée pour l’instant.</li>}</ol>} onClose={() => setModal(null)} />}
    {modal === "audit" && <ListModal title="Journal des modifications" load={() => getFeasibilityAudit(id)} render={(value) => <ul className="feas-audit" data-feasibility-audit-list>{value.events.map((event, index) => <li key={index}><b>{event.action}</b> {event.key} <small>{event.author} · {new Date(event.at).toLocaleString("fr-FR")}</small>{event.previous || event.new ? <small>{JSON.stringify(event.previous)} → {JSON.stringify(event.new)}</small> : null}</li>)}</ul>} onClose={() => setModal(null)} />}
  </main>;
}

function Provenance({ fact }) {
  if (!fact) return null;
  const extracted = fact.sourceType && !["USER", "MANUAL"].includes(fact.sourceType);
  if (fact.status === "CONFIRMED" && !extracted) return null;
  const label = fact.status === "PROPOSED" ? "À confirmer" : extracted ? "Trouvé dans les documents" : FACT_STATUS[fact.status];
  return <small className={`feas-provenance s-${fact.status}`} data-fact-provenance><span className={`feas-badge s-${fact.status}`}>{label}</span>{extracted && fact.sourceLabel ? ` · ${fact.sourceLabel}` : ""}</small>;
}

function Cadrage({ data, id, editable, run, onNavigate, register, ctx = {} }) {
  const byKey = useMemo(() => Object.fromEntries(data.facts.map((fact) => [fact.key, fact])), [data.facts]);
  const initial = useMemo(() => Object.fromEntries(Object.keys(data.definitions).filter((key) => data.definitions[key].category && !MIRRORED_KEYS.includes(key)).map((key) => [key, { value: byKey[key]?.status === "MISSING" ? "" : (byKey[key]?.value ?? (data.definitions[key].type === "multi" ? [] : "")), unknown: byKey[key]?.status === "MISSING" }])), [data.facts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [factsOpen, setFactsOpen] = useState(() => data.facts.some((fact) => ["PROPOSED", "CONFLICT"].includes(fact.status)));
  useEffect(() => { if (data.facts.some((fact) => ["PROPOSED", "CONFLICT"].includes(fact.status))) setFactsOpen(true); }, [data.facts]);
  const [form, setForm] = useState(initial), [saved, setSaved] = useState(""), [busy, setBusy] = useState(false), [category, setCategory] = useState("plans");
  const formRef = useRef(form), dirty = useRef(false), timer = useRef(null), inflight = useRef(null), version = useRef(0);
  formRef.current = form;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  // une réponse du serveur ne remplace jamais une saisie en cours
  useEffect(() => { if (!dirty.current && !timer.current) setForm(initial); }, [initial]);
  // enregistrement automatique : plus de bouton « Enregistrer » ; la même fonction sert au minuteur et à « Continuer » (flush)
  const save = async () => {
    const mine = version.current;
    const answers = Object.fromEntries(Object.entries(formRef.current).filter(([key, field]) => field.unknown || !(field.value === "" || (Array.isArray(field.value) && !field.value.length)) || byKey[key]).map(([key, field]) => [key, { value: key === "constraints" ? [...(field.value || []).filter((item) => item !== "Site occupé"), ...(ctxRef.current.occupied === "TRUE" ? ["Site occupé"] : [])] : field.value, unknown: field.unknown }])); // « Site occupé » vient de la carte Projet
    setBusy(true);
    const result = await run(() => saveFeasibilityAnswers(id, answers));
    setBusy(false);
    if (!result) { setSaved(""); throw new Error("Enregistrement impossible"); }
    if (mine === version.current) dirty.current = false;
    setSaved("Cadrage enregistré.");
  };
  const flush = async () => {
    clearTimeout(timer.current); timer.current = null;
    if (dirty.current) { const job = save(); inflight.current = job; try { await job; } finally { if (inflight.current === job) inflight.current = null; } }
    else if (inflight.current) await inflight.current;
  };
  useEffect(() => { register?.("cadrage", flush); });
  useEffect(() => () => { clearTimeout(timer.current); register?.("cadrage", null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key, patch) => {
    setForm((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
    version.current += 1; dirty.current = true; setSaved("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; flush().catch(() => {}); }, 900);
  };
  const upload = async (files) => { for (const file of files) await uploadAttachment(id, "", file, category, "FEASIBILITY").catch(() => {}); await run(() => getFeasibility(id)); };
  // question conditionnelle : affichée seulement quand sa condition est remplie (selon la saisie en cours), jamais exigée
  const visible = (key) => {
    const when = data.definitions[key]?.when; if (!when) return true;
    return Object.entries(when).every(([source, wanted]) => {
      const current = source === "nature" ? LEGACY_NATURE[ctx.nature] : source === "constraints" ? (ctx.occupied === "TRUE" ? ["Site occupé"] : []) : source === "asbestos_status" ? LEGACY_ASBESTOS[ctx.asbestos] : form[source]?.value;
      return (Array.isArray(current) ? current : [current]).some((item) => wanted.includes(item));
    });
  };
  const field = (key) => {
    const definition = data.definitions[key], state = form[key] || { value: "", unknown: false }, options = key === "constraints" ? data.options[key].filter((option) => option !== "Site occupé") : data.options[key]; // « Site occupé » = carte Projet
    const disabled = !editable || state.unknown;
    return <div key={key} className={`feas-field${byKey[key]?.needsClarification ? " needs-clarification" : ""}`} data-feasibility-field={key}><label htmlFor={`fact-${key}`}>{definition.label}</label>
      {definition.type === "select" && <select id={`fact-${key}`} value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })}><option value="">—</option>{options.map((option) => <option key={option}>{option}</option>)}</select>}
      {definition.type === "text" && (LONG_TEXT.includes(key) ? <textarea id={`fact-${key}`} rows={2} value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })} /> : <input id={`fact-${key}`} value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })} />)}
      {definition.type === "number" && <input id={`fact-${key}`} type="number" min="0" step="any" value={state.value} disabled={disabled} data-fact-input={key} onChange={(event) => set(key, { value: event.target.value })} />}
      {definition.type === "multi" && <span className="feas-multi">{options.map((option) => <label key={option} className="inline-check"><input type="checkbox" disabled={disabled} data-fact-option={option} checked={(state.value || []).includes(option)} onChange={(event) => set(key, { value: event.target.checked ? [...(state.value || []), option] : (state.value || []).filter((item) => item !== option) })} /> {option}</label>)}</span>}
      <span className="feas-field-foot"><label className="inline-check"><input type="checkbox" data-fact-unknown={key} disabled={!editable} checked={state.unknown} onChange={(event) => set(key, { unknown: event.target.checked })} /> Non connu à ce stade</label><Provenance fact={byKey[key]} />{byKey[key]?.sourceType && !["USER", "MANUAL"].includes(byKey[key].sourceType) && <FieldDetails fact={byKey[key]} id={id} />}</span>
      {byKey[key]?.needsClarification && <small className="feas-clarify" data-fact-clarify role="status">{byKey[key].clarification}</small>}
    </div>;
  };
  return <section className="feas-panel" data-feasibility-panel="cadrage">
    {SECTIONS.map(([title, keys]) => { const shown = keys.filter(visible); return shown.length ? <fieldset key={title} className="feas-section" data-feasibility-section={title}><legend>{title}</legend>{shown.map(field)}</fieldset> : null; })}
    <div className="feas-save"><span className="feas-autosave" data-cadrage-autosave role="status">{busy ? "Enregistrement…" : saved ? "✓ Enregistré automatiquement" : "Enregistrement automatique"}</span>{saved && <span className="price-message" data-feasibility-saved role="status">{saved}</span>}</div>
    <details className="feas-facts-box" data-feasibility-facts open={factsOpen} onToggle={(event) => setFactsOpen(event.currentTarget.open)}><summary>Informations extraites, hypothèses et conflits <small>{data.facts.filter((fact) => ["PROPOSED", "CONFLICT", "HYPOTHESIS"].includes(fact.status)).length}</small></summary>
      <Donnees data={data} id={id} editable={editable} run={run} /></details>
    <section className="feas-documents" data-feasibility-documents><h3>Documents du projet</h3>
      <p>{data.documents.count} document{data.documents.count > 1 ? "s" : ""} disponible{data.documents.count > 1 ? "s" : ""}{Object.keys(data.documents.byCategory).length ? ` · ${Object.entries(data.documents.byCategory).map(([category, count]) => `${data.documents.categories[category] || category} (${count})`).join(", ")}` : ""}</p>
      <div className="feas-doc-actions">
        {editable && <><label className="inline-select">Catégorie<select data-feasibility-doc-category value={category} onChange={(event) => setCategory(event.target.value)}>{DOC_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="secondary feas-upload" data-feasibility-add-docs><Plus size={14} /> Ajouter des documents<input type="file" multiple hidden data-feasibility-doc-file accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => { upload([...event.target.files]); event.target.value = ""; }} /></label></>}
        <UseDocuments projectId={id} module="FEASIBILITY" editable={editable} onChange={() => run(() => getFeasibility(id))} />
        <button type="button" className="secondary" data-feasibility-all-docs onClick={() => onNavigate?.("documents")}>Voir tous les documents</button>
      </div>
    </section>
  </section>;
}

function FieldDetails({ fact, id }) {
  const [open, setOpen] = useState(false), [events, setEvents] = useState(null);
  if (!fact || fact.status === "MISSING") return null;
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && events === null) { try { setEvents((await getFeasibilityAudit(id, fact.key)).events); } catch { setEvents([]); } }
  };
  return <span className="feas-details">
    <button type="button" className="link-button" data-fact-details-toggle={fact.key} aria-expanded={open} onClick={toggle}>Voir les détails</button>
    {open && <span className="feas-details-box" data-fact-details>
      <span>Source : {fact.sourceLabel || "—"}{fact.sourcePage ? ` (p. ${fact.sourcePage})` : ""}</span><span>Auteur : {fact.author || "—"}</span><span>Dernière modification : {fact.updatedAt ? new Date(fact.updatedAt).toLocaleDateString("fr-FR") : "—"}</span>
      {events && events.length > 0 && <ol className="feas-history" data-fact-history>{events.map((event, index) => <li key={index}>{new Date(event.at).toLocaleDateString("fr-FR")} · {event.author} · {event.action}</li>)}</ol>}
    </span>}
  </span>;
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
  return <section className="feas-panel feas-facts-panel" data-feasibility-facts-panel>
    <div className="feas-toolbar">{editable && <button type="button" className="secondary" data-feasibility-extract onClick={async () => { const result = await run(() => extractFeasibility(id)); if (result?.extracted) setInfo(`${result.extracted.proposals} proposition${result.extracted.proposals > 1 ? "s" : ""} créée${result.extracted.proposals > 1 ? "s" : ""} · ${result.extracted.conflicts} conflit${result.extracted.conflicts > 1 ? "s" : ""} — rien n’est confirmé sans votre accord.`); }}>Analyser les documents</button>}{info && <span className="price-message" data-feasibility-extracted role="status">{info}</span>}</div>
    {groups.map(([status, title]) => { const rows = data.facts.filter((fact) => fact.status === status); const extra = status === "MISSING" ? missing : []; if (!rows.length && !extra.length) return null;
      return <section key={status} className="feas-group" data-fact-group={status}><h3>{title} <small>{rows.length + extra.length}</small></h3><ul>{rows.map((fact) => <FactRow key={fact.id} fact={fact} id={id} editable={editable} run={run} />)}{extra.map((key) => <li key={key} className="feas-fact s-MISSING" data-fact-missing={key}><div className="feas-fact-main"><b>{data.definitions[key].label}</b><small className="feas-provenance">Non renseigné — à confirmer avec le MOA</small></div></li>)}</ul></section>; })}
    {editable && <form className="feas-hypothesis" data-feasibility-hypothesis-form onSubmit={(event) => { event.preventDefault(); run(() => addFeasibilityHypothesis(id, { label: hyp.label, value: hyp.value })).then(() => setHyp({ label: "", value: "" })); }}>
      <h3>Ajouter une hypothèse</h3><div className="feas-edit"><input required minLength={2} value={hyp.label} data-hypothesis-label placeholder="Ex. Conservation de la structure existante" onChange={(event) => setHyp({ ...hyp, label: event.target.value })} /><input value={hyp.value} data-hypothesis-value placeholder="Valeur (facultatif)" onChange={(event) => setHyp({ ...hyp, value: event.target.value })} /><button className="secondary" data-hypothesis-add>Ajouter</button></div></form>}
  </section>;
}

/** « Prêt à conclure ? » : résumé des axes et des points ouverts. Il n'est jamais bloquant : on peut conclure avec des points ouverts, qui deviennent des réserves. */
function ReadyModal({ data, onClose, onExamine, onContinue }) {
  const { axes, overall, counts } = data.analysis;
  return <Modal title="Prêt à conclure ?" onClose={onClose} wide>
    <div data-ready-modal data-overall-status={overall.status}>
      <p>{overall.status === "READY_FOR_MOE_DECISION" ? "Les cinq axes ont été analysés. Vous pouvez conclure, même s’il reste des points ouverts : ils pourront devenir des réserves." : "L’analyse est incomplète : certains axes n’ont encore aucune information. Vous pouvez tout de même consulter la synthèse ou conclure."}</p>
      <ul className="feas-ready-axes">{axes.map((axis) => <li key={axis.key} data-ready-axis={axis.key} data-axis-status={axis.status}><b>{axis.label}</b><span className={`feas-badge ax-${axis.status}`}>{AXIS_STATUS[axis.status]}</span>{axis.open > 0 && <small>{axis.open} ouvert{axis.open > 1 ? "s" : ""}</small>}</li>)}</ul>
      <p className="feas-note" data-ready-counts>{counts.open} point{counts.open > 1 ? "s" : ""} ouvert{counts.open > 1 ? "s" : ""} · {counts.important} important{counts.important > 1 ? "s" : ""} · {counts.missing} information{counts.missing > 1 ? "s" : ""} manquante{counts.missing > 1 ? "s" : ""} · {counts.reserved} retenu{counts.reserved > 1 ? "s" : ""} comme réserve</p>
      <p className="price-modal-actions"><button type="button" className="secondary" data-ready-examine onClick={onExamine}>Examiner les points ouverts</button><button type="button" className="primary" data-ready-continue onClick={onContinue}>Continuer</button></p>
    </div>
  </Modal>;
}

function Modal({ title, onClose, children, wide }) {
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`estimate-documents ${wide ? "clause-modal" : ""}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header>{children}</section></div>;
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
