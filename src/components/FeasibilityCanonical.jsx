import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, downloadCanonicalNotice } from "../api/client";
import { PointsToTreat } from "./FeasibilityPoints";

const getCanonical = (id) => apiFetch(`/cctps/${id}/feasibility/canonical`);
const saveCanonical = (id, state) => apiFetch(`/cctps/${id}/feasibility/canonical`, { method: "PUT", body: JSON.stringify({ state }) });
const canonicalNotice = (id, mode, state) => apiFetch(`/cctps/${id}/feasibility/canonical/notice`, { method: "POST", body: JSON.stringify({ mode, state }) });
const api231 = (id, path, method = "POST", body) => apiFetch(`/cctps/${id}/feasibility/canonical/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const errorText = (e) => e?.detail?.message || e?.message || "Une erreur est survenue";
const getCanonicalState = (id) => apiFetch(`/cctps/${id}/feasibility/canonical`);
const uid = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
const lines = (text) => String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
const toNum = (v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(",", ".")));
const asInput = (v) => (v === null || v === undefined ? "" : v);

/** État canonique V2.3 de la faisabilité : source de vérité UNIQUE des sites, scénarios, coûts, performances, investigations et de la décision MOE. Les écrans lisent et écrivent ce même objet (auto-save) :
 *  aucune entité parallèle. UNKNOWN reste visible comme tel ; une règle en échec n'empêche jamais la navigation. */
function useCanonical(id, onSaved) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useRef(0);
  const timer = useRef(null);
  const latest = useRef(null);
  const scheduled = useRef(false);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  useEffect(() => { setData(null); getCanonical(id).then((d) => { latest.current = d.state; setData(d); }).catch((e) => setError(errorText(e))); return () => clearTimeout(timer.current); }, [id]);
  const flush = useCallback(async () => {
    const mark = dirty.current;
    scheduled.current = false;
    setSaving(true);
    try {
      const result = await saveCanonical(id, latest.current);
      setData((current) => ({ ...current, issues: result.issues, summary: result.summary, persisted: true, ...(dirty.current === mark ? { state: result.state } : {}) }));
      if (dirty.current === mark) latest.current = result.state;
      setError("");
      saved.current?.();
    } catch (e) {
      setError(e?.detail?.errors ? `${errorText(e)} ${e.detail.errors.map((x) => `${x.field_path} : ${x.message}`).join(" ; ")}` : errorText(e));
    } finally { setSaving(false); }
  }, [id]);
  const update = useCallback((mutate) => {
    const next = structuredClone(latest.current);
    mutate(next);
    latest.current = next;
    dirty.current += 1;
    setData((current) => ({ ...current, state: next }));
    clearTimeout(timer.current);
    scheduled.current = true;
    timer.current = setTimeout(flush, 700);
  }, [flush]);
  // une information confirmée ailleurs (documents extraits) met le cadrage à jour, sans jamais écraser une saisie en cours
  const refresh = useCallback(async () => {
    const mark = dirty.current;
    const payload = await getCanonical(id);
    if (dirty.current !== mark || scheduled.current) return;
    if (JSON.stringify(payload.state) === JSON.stringify(latest.current)) { setData((current) => ({ ...current, issues: payload.issues, summary: payload.summary })); return; }
    latest.current = payload.state;
    setData((current) => ({ ...current, ...payload, state: payload.state }));
  }, [id]);
  const replace = useCallback((payload) => { clearTimeout(timer.current); latest.current = payload.state; setData((current) => ({ ...current, ...payload, state: payload.state })); }, []);
  const settle = useCallback(async () => { clearTimeout(timer.current); if (dirty.current) await flush(); }, [flush]);
  return { data, error, saving, update, flushNow: flush, replace, settle, refresh };
}

// V2.4 : quatre écrans. Les règles de la décision du MOE vivent dans la Notice, celles du scénario / des composants dans l'Estimation, celles des études et actions dans « Points à traiter ».
const DECISION_RULES = new Set(["F-001", "F-002b", "F-009"]);
const viewOfIssue = (issue) => { if (DECISION_RULES.has(issue.rule_id)) return "notice"; const step = (issue.deep_link.match(/^#feasibility\/(\w+)/) || [])[1]; return step === "obtenir" ? "points" : step === "analyse" ? "estimation" : step; };
function Issues({ issues, step, goTab, labels }) {
  const mine = (issues || []).filter((i) => viewOfIssue(i) === step);
  if (!mine.length) return null;
  return <section className="canon-issues" data-canon-issues={step} aria-label="Points à traiter"><b>Points à traiter ({mine.length})</b>
    <ul>{mine.map((i, n) => <li key={`${i.rule_id}-${n}`} data-canon-issue={i.rule_id} data-severity={i.severity}>
      <span className={`canon-badge ${i.severity === "BLOCKING" ? "bad" : "warn"}`}>{i.severity === "BLOCKING" ? "Bloque l’export validé" : "À vérifier"}</span> {i.message}
      <button type="button" className="link-button" data-canon-issue-link onClick={() => { const scope = i.scope_id; setTimeout(() => document.querySelector(scope ? `[data-canon-scope="${scope}"]` : `[data-canon-field="${i.field_path}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}>Voir</button></li>)}</ul>
    <small className="canon-hint">Ces points ne bloquent jamais la navigation : ils empêchent seulement l’export d’une notice validée.</small></section>;
}

/** UNKNOWN s'affiche toujours comme « Inconnu », jamais comme « Non ». */
function TriState({ value, onChange, disabled, label, ...rest }) {
  return <select value={value || "UNKNOWN"} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label} {...rest}><option value="TRUE">Oui</option><option value="FALSE">Non</option><option value="UNKNOWN">Inconnu</option></select>;
}

export function FeasibilityCanonical({ id, editable, view, goTab, legacy, extraEstimation, onSaved }) {
  const { data, error, saving, update, replace, settle, refresh } = useCanonical(id, onSaved);
  const sig = legacy?.factsSig, firstSig = useRef(true);
  useEffect(() => { if (firstSig.current) { firstSig.current = false; return; } refresh().catch(() => {}); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error && !data) return <div className="err" role="alert" data-canon-error>{error}</div>;
  if (!data) return <div className="muted" data-canon-loading>Chargement…</div>;
  const { state, issues, enums, labels } = data;
  const common = { state, update, editable, enums, labels, issues, goTab, id, replace, settle };
  return <div className="canon" data-canon={view} data-canon-status={data.summary?.status}>
    <header className="canon-head"><span data-canon-saving>{saving ? "Enregistrement…" : "Enregistré"}</span>
      <span className="canon-summary" data-canon-summary>{data.summary?.blockers ? `${data.summary.blockers} point(s) bloquant(s) pour l’export validé · ` : ""}{data.summary?.investigations_to_obtain || 0} investigation(s) à obtenir{data.summary?.retained_scenario ? ` · retenu : ${data.summary.retained_scenario.label}` : ""}</span></header>
    {error && <div className="err" role="alert" data-canon-error>{error}</div>}
    <Issues issues={issues} step={view} goTab={goTab} labels={labels} />
    {view === "cadrage" && <><CanonProject {...common} /><CanonDrivers {...common} /><CanonSites {...common} /><CanonRegulatory {...common} /><CanonFramework {...common} />{legacy?.renderExtras?.({ nature: state.project.project_nature, occupied: state.project.occupied_site, asbestos: state.project.cadrage_drivers?.asbestos_status })}</>}
    {view === "estimation" && <CanonEstimation {...common} extra={<details className="canon-card" data-canon-scenarios-details><summary>Scénarios et options</summary><CanonScenarios {...common} /></details>} />}
    {view === "points" && legacy && <PointsToTreat legacy={legacy} state={state} update={update} />}
    {view === "notice" && <NoticeScreen {...common} legacy={legacy} />}
  </div>;
}

function CanonProject({ state, update, editable, enums, labels }) {
  const p = state.project;
  return <section className="canon-card" data-canon-project><h3>Projet et programme</h3>
    <label>Nature du projet<select data-canon-field="project.project_nature" disabled={!editable} value={p.project_nature} onChange={(e) => update((s) => { s.project.project_nature = e.target.value; })}>{enums.projectNature.map((v) => <option key={v} value={v}>{v === "UNKNOWN" ? "Inconnue" : labels[v]}</option>)}</select></label>
    <label>Site occupé<TriState value={p.occupied_site} disabled={!editable} label="Site occupé" data-canon-field="project.occupied_site" onChange={(v) => update((s) => { s.project.occupied_site = v; })} /></label>
    <label>Destination du bâtiment<select data-canon-driver="building_type" disabled={!editable} value={p.cadrage_drivers?.building_type || "UNKNOWN"} onChange={(e) => update((s) => { (s.project.cadrage_drivers ||= newDrivers()).building_type = e.target.value; })}>{Object.entries(BUILDING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    <label>Échéance souhaitée de livraison (facultative)<input type="date" disabled={!editable} value={p.target_date || ""} onChange={(e) => update((s) => { s.project.target_date = e.target.value || null; })} /></label>
    <label>Programme / besoin principal<textarea rows={3} disabled={!editable} value={p.programme_summary || ""} onChange={(e) => update((s) => { s.project.programme_summary = e.target.value || null; })} /></label>
  </section>;
}


const INTERVENTIONS = [["DEMOLITION_STRIPOUT", "Démolition / curage"], ["STRUCTURE", "Structure"], ["FACADE", "Façades"], ["ROOF", "Toiture"], ["EXTERNAL_JOINERY", "Menuiseries extérieures"], ["PARTITIONS_LININGS", "Cloisons / doublages"],
  ["CEILINGS", "Plafonds"], ["FLOOR_FINISHES", "Sols"], ["PAINT_FINISHES", "Peinture"], ["INTERNAL_JOINERY", "Menuiseries intérieures"], ["PLUMBING_SANITARY", "Plomberie / sanitaires"], ["HVAC", "Chauffage / CVC"],
  ["VENTILATION", "Ventilation"], ["ELECTRICAL", "Électricité"], ["FIRE_SAFETY", "Sécurité incendie"], ["ACCESSIBILITY", "Accessibilité"], ["LIFT", "Ascenseur"], ["VRD", "VRD"], ["EXTERNAL_WORKS", "Aménagements extérieurs"],
  ["ENERGY_UPGRADE", "Amélioration énergétique"]];
const AREAS = [["existing_floor_area_m2", "Surface existante (m²)"], ["affected_floor_area_m2", "Surface concernée (m²)"], ["new_build_floor_area_m2", "Surface neuve (m²)"], ["extension_floor_area_m2", "Surface d’extension (m²)"],
  ["roof_area_m2", "Toiture (m²)"], ["facade_area_m2", "Façades (m²)"], ["external_works_area_m2", "Extérieurs (m²)"]];
const BUILDING_LABEL = { HOUSING_INDIVIDUAL: "Maison individuelle", HOUSING_COLLECTIVE: "Logement collectif", OFFICE: "Bureaux", EDUCATION: "Enseignement", HEALTHCARE: "Santé", CULTURAL: "Culture", SPORTS: "Sport", OTHER: "Autre", UNKNOWN: "Inconnu" };
const KNOWLEDGE_LABEL = { KNOWN: "Connu", PARTIAL: "Partiel", UNKNOWN: "Inconnu" };
const ASBESTOS_LABEL = { NONE: "Aucun", TO_DIAGNOSE: "À diagnostiquer", DIAGNOSED: "Diagnostiqué", PRESENT: "Présent", UNKNOWN: "Inconnu" };
const newDrivers = () => ({ building_type: "UNKNOWN", areas: {}, levels: null, existing_lift: "UNKNOWN", interventions: Object.fromEntries(INTERVENTIONS.map(([k]) => [k, "UNKNOWN"])), asbestos_status: "UNKNOWN", structural_knowledge: "UNKNOWN", soil_knowledge: "UNKNOWN" });

/** Cadrage V2.3.1 : réponses structurantes → composants de coût et études & actions. Le recalcul est idempotent, préserve les exclusions et n'inclut jamais une réponse « Inconnu ». */
function CanonDrivers({ state, update, editable }) {
  const d = state.project.cadrage_drivers || newDrivers();
  const set = (key, value) => update((s) => { (s.project.cadrage_drivers ||= newDrivers())[key] = value; });
  return <section className="canon-card" data-canon-drivers><h3>Existant, surfaces et travaux envisagés</h3>
    <p className="muted">Chaque réponse « Oui » alimente l’estimation et les points à traiter ; « Inconnu » n’ajoute jamais un poste certain. Aucune surface n’est inventée.</p>
    <div className="canon-row">
      <label>Niveaux<input type="number" min="1" disabled={!editable} data-canon-driver="levels" value={asInput(d.levels)} onChange={(e) => set("levels", toNum(e.target.value))} /></label>
      <label>Ascenseur existant<TriState value={d.existing_lift} disabled={!editable} label="Ascenseur existant" onChange={(v) => set("existing_lift", v)} /></label>
      <label>Connaissance du sol<select data-canon-driver="soil_knowledge" disabled={!editable} value={d.soil_knowledge || "UNKNOWN"} onChange={(e) => set("soil_knowledge", e.target.value)}>{Object.entries(KNOWLEDGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Connaissance de la structure<select data-canon-driver="structural_knowledge" disabled={!editable} value={d.structural_knowledge || "UNKNOWN"} onChange={(e) => set("structural_knowledge", e.target.value)}>{Object.entries(KNOWLEDGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Amiante<select data-canon-driver="asbestos_status" disabled={!editable} value={d.asbestos_status || "UNKNOWN"} onChange={(e) => set("asbestos_status", e.target.value)}>{Object.entries(ASBESTOS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
    <fieldset data-canon-areas><legend>Surfaces <small>(laissez vide si inconnu)</small></legend><div className="canon-row">{AREAS.map(([k, label]) => <label key={k}>{label}<input type="number" min="0" disabled={!editable} data-canon-area={k} value={asInput((d.areas || {})[k])} onChange={(e) => update((s) => { (s.project.cadrage_drivers ||= newDrivers()).areas[k] = toNum(e.target.value); })} /></label>)}</div></fieldset>
    <fieldset data-canon-interventions><legend>Interventions prévues</legend><div className="canon-grid">{INTERVENTIONS.map(([k, label]) => <label key={k}>{label}<TriState value={(d.interventions || {})[k]} disabled={!editable} label={label} data-canon-intervention={k} onChange={(v) => update((s) => { (s.project.cadrage_drivers ||= newDrivers()).interventions[k] = v; })} /></label>)}</div></fieldset>
  </section>;
}

function CanonSites({ state, update, editable, enums, labels }) {
  const referenced = (siteId) => state.scenarios.some((sc) => sc.site_id === siteId);
  return <section className="canon-card" data-canon-sites><h3>Sites, foncier et servitudes</h3>
    {!state.sites.length && <p className="muted" data-canon-no-site>Aucun site renseigné : ce n’est pas une réponse « non », simplement une information absente.</p>}
    {state.sites.map((site, i) => <div className="canon-site" key={site.id} data-canon-scope={site.id} data-canon-site={site.id}>
      <input aria-label="Libellé du site" disabled={!editable} value={site.label} onChange={(e) => update((s) => { s.sites[i].label = e.target.value; })} />
      <input aria-label="Adresse" placeholder="Adresse (facultative)" disabled={!editable} value={site.address || ""} onChange={(e) => update((s) => { s.sites[i].address = e.target.value || null; })} />
      <select aria-label="Maîtrise foncière" disabled={!editable} value={site.land_control} onChange={(e) => update((s) => { s.sites[i].land_control = e.target.value; })}>{enums.landControl.map((v) => <option key={v} value={v}>{v === "UNKNOWN" ? "Inconnue" : labels[v]}</option>)}</select>
      <textarea aria-label="Contraintes du site (une par ligne)" placeholder="Contraintes (une par ligne)" rows={2} disabled={!editable} value={(site.constraints || []).join("\n")} onChange={(e) => update((s) => { s.sites[i].constraints = lines(e.target.value); })} />
      <textarea aria-label="Servitudes (une par ligne)" placeholder="Servitudes (une par ligne)" rows={2} disabled={!editable} value={(site.servitudes || []).join("\n")} onChange={(e) => update((s) => { s.sites[i].servitudes = lines(e.target.value); })} />
      {editable && <button type="button" className="link-button" data-canon-remove-site onClick={() => { if (!referenced(site.id) || window.confirm("Ce site est utilisé par un scénario : le retirer créera un point à traiter. Continuer ?")) update((s) => { s.sites.splice(i, 1); }); }}>Retirer ce site</button>}
    </div>)}
    {editable && <button type="button" className="secondary" data-canon-add-site onClick={() => update((s) => { s.sites.push({ id: uid("SITE"), label: `Site ${s.sites.length + 1}`, address: null, constraints: [], servitudes: [], land_control: "UNKNOWN", source_refs: [] }); })}>Ajouter un site</button>}
  </section>;
}

const REGULATORY = [["planning_constraints", "Urbanisme"], ["heritage_constraints", "Patrimoine"], ["environmental_constraints", "Environnement"], ["operational_constraints", "Exploitation"]];
function CanonRegulatory({ state, update, editable }) {
  return <section className="canon-card" data-canon-regulatory><h3>Contraintes réglementaires et d’exploitation</h3>
    <p className="muted">Quatre catégories distinctes ; rien n’est déduit de la nature du projet.</p>
    {REGULATORY.map(([key, label]) => <label key={key}>{label} <small>(une par ligne)</small><textarea rows={2} disabled={!editable} data-canon-regulatory-field={key} value={(state.site_and_regulatory[key] || []).join("\n")} onChange={(e) => update((s) => { s.site_and_regulatory[key] = lines(e.target.value); })} /></label>)}
  </section>;
}

function CanonFramework({ state, update, editable }) {
  const f = state.financial_framework;
  return <section className="canon-card canon-budget" data-canon-framework><h3>Cadre financier</h3>
    <div className="canon-ceiling" data-canon-ceiling><b>Budget travaux annoncé</b> <small>Repère de comparaison : il ne crée aucun coût et n’est pas une estimation.</small>
      <label>Montant (€ HT) — facultatif<input type="number" min="0" disabled={!editable} data-canon-field="financial_framework.budget_ceiling_eur" value={asInput(f.budget_ceiling_eur)} onChange={(e) => update((s) => { s.financial_framework.budget_ceiling_eur = toNum(e.target.value); })} /></label>
      <label>Source du montant<input disabled={!editable} value={(f.budget_ceiling_source_refs || []).join(", ")} onChange={(e) => update((s) => { s.financial_framework.budget_ceiling_source_refs = e.target.value.split(",").map((x) => x.trim()).filter(Boolean); })} /></label></div>
    <label>Contraintes de financement <small>(une par ligne)</small><textarea rows={2} disabled={!editable} value={(f.funding_constraints || []).join("\n")} onChange={(e) => update((s) => { s.financial_framework.funding_constraints = lines(e.target.value); })} /></label>
    <label>Notes<textarea rows={2} disabled={!editable} value={f.notes || ""} onChange={(e) => update((s) => { s.financial_framework.notes = e.target.value || null; })} /></label>
  </section>;
}


const TRIGGER_NAMES = Object.fromEntries(INTERVENTIONS.map(([key, label]) => [`project.cadrage_drivers.interventions.${key}`, label.toLowerCase()]));
Object.assign(TRIGGER_NAMES, { "project.project_nature": "la nature du projet", "project.occupied_site": "le site occupé", "project.cadrage_drivers.soil_knowledge": "la connaissance du sol", "project.cadrage_drivers.structural_knowledge": "la connaissance de la structure",
  "project.cadrage_drivers.asbestos_status": "l’état de l’amiante", "project.cadrage_drivers.levels": "le nombre de niveaux", "project.cadrage_drivers.existing_lift": "l’ascenseur existant", "project.cadrage_drivers.building_type": "le type de bâtiment", "site_and_regulatory.heritage_constraints": "les contraintes patrimoniales" });
/** Déclencheur lisible : jamais une clé technique (`interventions.ROOF`) à l'écran. */
const triggerText = (ref) => TRIGGER_NAMES[ref] || (String(ref).startsWith("project.cadrage_drivers.areas.") ? "les surfaces renseignées" : "le cadrage");
const whyText = (refs) => { const names = [...new Set((refs || []).map(triggerText))]; return names.length ? `Ajouté depuis le cadrage : vous avez indiqué ${names.join(", ")}.` : "Ajouté depuis le cadrage."; };
const APPLICABILITY_LABEL = { AUTO_INCLUDED: "Inclus automatiquement", SUGGESTED: "Suggéré", USER_ADDED: "Ajouté par le MOE", USER_EXCLUDED: "Exclu par le MOE", TO_RECONSIDER: "À reconsidérer" };
const PROVENANCE_CLASS = { NONE: "none", USER: "user", CLIENT_HISTORY: "history", AGENCY_CURATED: "agency", STANDARD_REGIONAL: "standard", REFERENCE_EXTERNAL: "external" };
const eur = (v) => (v === null || v === undefined ? null : `${Math.round(v).toLocaleString("fr-FR")} €`);
const range = (c) => (c.amount_eur !== null && c.amount_eur !== undefined ? eur(c.amount_eur) : c.min_eur !== null && c.max_eur !== null && c.min_eur !== undefined ? `${eur(c.min_eur)} – ${eur(c.max_eur)}` : "à chiffrer");
const unitEur = (v) => (v === null || v === undefined ? null : Number.isInteger(v) ? eur(v) : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`);
const UNIT_LABEL = { "m²_affecté": "m²", "m²_emprise": "m² d’emprise", "m²_façade": "m² de façade", "m²_SDP": "m² SDP", "m²_baie": "m² de baies", "m²_toiture": "m² de toiture", "m²_ext": "m² extérieur", "m²_habitable": "m² habitables" };
/** Les unités internes ne sont jamais montrées au MOE (« m²_affecté » → « m² »). */
const unitLabel = (unit) => UNIT_LABEL[unit] || String(unit || "u").replace(/_.+$/, "");
const unitRange = (p) => (p.unit_price_eur === null || p.unit_price_eur === undefined ? "—" : p.min_unit_price_eur !== null && p.max_unit_price_eur !== null && p.min_unit_price_eur !== undefined ? `${eur(p.min_unit_price_eur)} – ${eur(p.max_unit_price_eur)} (central ${eur(p.unit_price_eur)})` : eur(p.unit_price_eur));

/** Estimation V2.4 : UNE seule liste de postes (automatiques et manuels ensemble). Un poste généré du cadrage n'a pas de section à part : sa provenance est une phrase (« Pourquoi ce poste ? »).
 *  Un poste existe même sans prix ; le prix standard Normandie n'est appliqué que sur demande, dans son périmètre, et reste « indicatif ». */
const emptyPricing = () => ({ source_type: "NONE", unit_price_eur: null, min_unit_price_eur: null, max_unit_price_eur: null, standard_price_id: null, region: null, department: null, economic_base_month: null, confidence: "NONE", provenance_label: "À chiffrer", source_refs: [], disclaimer: null });
function recompute(c) {
  const q = c.quantity, pu = c.pricing?.unit_price_eur;
  if (q !== null && q !== undefined && pu !== null && pu !== undefined) {
    c.amount_eur = Math.round(q * pu * 100) / 100;
    if (c.pricing.source_type === "USER") { c.min_eur = null; c.max_eur = null; } else { c.min_eur = c.pricing.min_unit_price_eur != null ? Math.round(q * c.pricing.min_unit_price_eur * 100) / 100 : null; c.max_eur = c.pricing.max_unit_price_eur != null ? Math.round(q * c.pricing.max_unit_price_eur * 100) / 100 : null; }
    c.origin = "DERIVED"; c.formula = `montant = quantité (${q}) × prix unitaire (${pu})`;
  }
}

function EstimateTable({ id, state, scenario, index, update, editable, replace, settle, enums, labels }) {
  const [drawer, setDrawer] = useState(null), [refs, setRefs] = useState([]), [department, setDepartment] = useState(""), [pick, setPick] = useState({ id: "", value: "CENTRAL" }), [msg, setMsg] = useState(""), [fail, setFail] = useState(""), [openRow, setOpenRow] = useState("");
  const comps = scenario.cost_components || [];
  const [suggest, setSuggest] = useState({}), [editPrice, setEditPrice] = useState(""), [editQty, setEditQty] = useState(""), [selRow, setSelRow] = useState("");
  // meilleur prix compatible de chaque poste : demandé au serveur dès l'ouverture (agence > historique > standard publié > benchmark), jamais appliqué sans acceptation
  const suggestKey = comps.map((c) => `${c.id}:${c.unit}:${c.pricing?.unit_price_eur ?? ""}:${c.applicability_status}`).join("|");
  useEffect(() => {
    let live = true;
    apiFetch(`/cctps/${id}/feasibility/canonical/price-suggestions${department ? `?department=${department}` : ""}`).then((result) => { if (!live) return; setSuggest(result.suggestions || {}); if (!department && result.department) setDepartment(result.department); }).catch(() => { if (live) setSuggest({}); });
    return () => { live = false; };
  }, [id, department, suggestKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = comps.filter((c) => c.applicability_status !== "USER_EXCLUDED");
  const priced = active.filter((c) => c.amount_eur !== null && c.amount_eur !== undefined || (c.min_eur != null && c.max_eur != null));
  const macro = active.filter((c) => c.category === "ALLOWANCE" && c.amount_eur != null), detail = active.filter((c) => c.category !== "ALLOWANCE" && c.amount_eur != null);
  const total = !macro.length || !detail.length ? active.reduce((sum, c) => sum + (c.amount_eur || 0), 0) : null;
  const complete = active.length > 0 && priced.length === active.length && active.every((c) => c.amount_eur != null);
  const act = async (fn) => { setFail(""); setMsg(""); try { await settle(); await fn(); } catch (e) { setFail(errorText(e)); } };
  const setStatus = (c, status, reason = null) => act(async () => { await api231(id, "components/applicability", "POST", { scenario_id: scenario.id, cost_component_id: c.id, status, reason }); replace(await getCanonicalState(id)); });
  const openPrice = (c) => act(async () => {
    setDrawer(c.id); setPick({ id: "", value: "CENTRAL" });
    const q = new URLSearchParams({ component_id: c.catalog_component_id, ...(department ? { department } : {}), unit: c.unit || "" });
    setRefs((await apiFetch(`/cctps/${id}/feasibility/canonical/price-references?${q}`)).references);
  });
  const applyPrice = (c) => act(async () => { await api231(id, "price-references/apply", "POST", { scenario_id: scenario.id, cost_component_id: c.id, standard_price_id: pick.id, selected_value: pick.value, department: department || null }); replace(await getCanonicalState(id)); setDrawer(null); setMsg("Prix appliqué : fourchette de faisabilité indicative, à confirmer par un chiffrage."); });
  const useSuggestion = (c) => act(async () => { await api231(id, "price-suggestions/accept", "POST", { scenario_id: scenario.id, cost_component_id: c.id, department: department || null }); replace(await getCanonicalState(id)); setMsg("Prix retenu : fourchette de faisabilité indicative, à confirmer par un chiffrage."); });
  const saveForAgency = (c) => act(async () => { const p = c.pricing || {}; await apiFetch("/economics/agency-references", { method: "POST", body: JSON.stringify({ item_key: c.catalog_component_id, granularity: "FEASIBILITY", unit: c.unit, unit_price_eur: p.unit_price_eur, min_unit_price_eur: p.min_unit_price_eur ?? null, max_unit_price_eur: p.max_unit_price_eur ?? null, economic_date: new Date().toISOString().slice(0, 7), note: `Enregistré depuis la faisabilité « ${scenario.label} »` }) }); setMsg("Référence agence enregistrée : elle sera proposée en priorité sur les prochains projets."); });
  const edit = (j, mutate) => update((s) => { const c = s.scenarios[index].cost_components[j]; mutate(c); });
  const setQty = (j, v) => edit(j, (c) => { c.quantity = toNum(v); c.quantity_origin = c.quantity === null ? "UNKNOWN" : "USER"; c.quantity_formula = null; c.quantity_inputs = {}; recompute(c); });
  const setPU = (j, v) => edit(j, (c) => { const pu = toNum(v); c.pricing = { ...emptyPricing(), source_type: pu === null ? "NONE" : "USER", unit_price_eur: pu, provenance_label: pu === null ? "À chiffrer" : "Prix saisi" }; if (pu === null) { c.amount_eur = null; c.min_eur = null; c.max_eur = null; } recompute(c); });
  const setTotal = (j, v) => edit(j, (c) => { c.amount_eur = toNum(v); if (c.amount_eur !== null) { c.origin = "USER"; c.formula = null; } });
  const addPost = () => update((s) => { s.scenarios[index].cost_components.push({ id: uid("CC"), label: "Nouveau poste", value_type: "WORKS", amount_eur: null, min_eur: null, max_eur: null, origin: "UNKNOWN", source_refs: [], formula: null, catalog_component_id: null, applicability_status: "USER_ADDED", generation_origin: "USER", generation_rule_ids: [], trigger_refs: [], quantity: null, unit: "u", quantity_origin: "UNKNOWN", pricing: emptyPricing(), assumptions: [] }); });
  // bordereau économique : lecture Poste → Quantité → Prix → Total → État ; provenance associée au prix, valeurs présentées comme du texte (édition au clic), actions regroupées sous ⋯
  const SOURCE_TEXT = { USER: "Saisi par vous", AGENCY_CURATED: "Agence", CLIENT_HISTORY: "Historique", STANDARD_REGIONAL: "Standard Calepin", REFERENCE_EXTERNAL: "Benchmark" };
  const SUGGEST_TEXT = { AGENCY_CURATED: "Agence", CLIENT_HISTORY: "Historique", STANDARD_NORMANDIE: "Standard Calepin", REFERENCE_EXTERNAL: "Benchmark" };
  const proposedCount = active.filter((c) => c.pricing?.unit_price_eur == null && suggest[c.id]).length;
  const excludedCount = comps.length - active.length;
  const toComplete = active.filter((c) => c.amount_eur == null && !(c.min_eur != null && c.max_eur != null)).length;
  const stateOf = (c, sug) => (c.applicability_status === "USER_EXCLUDED" ? ["EXCLUDED", "Exclu"] : c.amount_eur != null || (c.min_eur != null && c.max_eur != null) ? ["PRICED", "Chiffré"] : sug ? ["PROPOSED", "Prix proposé"] : ["TO_PRICE", "À compléter"]);
  const sumRetained = active.reduce((sum, c) => sum + (c.amount_eur || 0), 0), anyRetained = active.some((c) => c.amount_eur != null);
  const lows = active.filter((c) => c.amount_eur != null), rangeLow = lows.reduce((sum, c) => sum + (c.min_eur ?? c.amount_eur), 0), rangeHigh = lows.reduce((sum, c) => sum + (c.max_eur ?? c.amount_eur), 0);
  const k = (v) => `${Math.round(v / 1000).toLocaleString("fr-FR")} k€`;
  return <div data-feas-generated data-canon-components data-scenario={scenario.id}>
    <div className="est-header" data-feas-kpis><h4>Première estimation</h4>
      <p className="canon-kpis"><span data-kpi="applicable"><b>{active.length}</b> poste{active.length > 1 ? "s" : ""}</span> · <span data-kpi="priced"><b>{priced.length}</b> chiffré{priced.length > 1 ? "s" : ""}</span> · <span data-kpi="proposed"><b>{proposedCount}</b> prix proposé{proposedCount > 1 ? "s" : ""}</span> · <span data-kpi="unpriced"><b>{toComplete}</b> à compléter</span>
        {excludedCount > 0 && <> · <span data-kpi="excluded"><b>{excludedCount}</b> exclu{excludedCount > 1 ? "s" : ""}</span></>}{" · "}<span data-kpi="confirm"><b>{active.filter((c) => ["SUGGESTED", "TO_RECONSIDER"].includes(c.applicability_status)).length}</b> à confirmer</span></p>
      {anyRetained && <p className="est-current" data-feas-current>{complete && total !== null ? <b data-feas-total-central>{eur(total)} HT</b> : <><b data-feas-total-partial>{eur(sumRetained)} HT</b> <small>estimation actuelle (partielle : {toComplete} poste{toComplete > 1 ? "s" : ""} à compléter)</small></>}
        {rangeHigh > rangeLow && <small className="est-range"> Fourchette : {k(rangeLow)}–{k(rangeHigh)} HT</small>}</p>}</div>
    <label className="canon-dept">Département (pour les prix standard)<select data-feas-department value={department} onChange={(e) => setDepartment(e.target.value)}><option value="">—</option>{["14", "27", "50", "61", "76"].map((d) => <option key={d} value={d}>{d}</option>)}{department && !["14", "27", "50", "61", "76"].includes(department) && <option value={department}>{department} (hors Normandie)</option>}</select></label>
    {msg && <div className="ok" role="status" data-feas-msg>{msg}</div>}{fail && <div className="err" role="alert" data-feas-fail>{fail}</div>}
    {!comps.length ? <div className="canon-framework-note" data-feas-no-generated>Aucun poste pour l’instant : renseignez le cadrage (travaux envisagés) ou ajoutez un poste.</div>
      : <div className="table-scroll"><table className="canon-table est-table est-clean" data-feas-generated-table><thead><tr><th>Poste</th><th>Quantité</th><th>Prix unitaire</th><th>Total HT</th><th>État</th><th aria-label="Actions" /></tr></thead>
        <tbody>{comps.flatMap((c, j) => { const p = c.pricing || emptyPricing(); const excluded = c.applicability_status === "USER_EXCLUDED"; const auto = Boolean(c.catalog_component_id); const open = openRow === c.id; const selected = selRow === c.id;
          const retained = p.unit_price_eur != null, sug = !retained && !excluded ? suggest[c.id] : null, [stateKey, stateLabel] = stateOf(c, sug);
          const unitText = unitLabel(c.unit);
          const proposedTotal = sug && c.quantity != null ? Math.round(c.quantity * sug.unit_price_eur) : null;
          const row = <tr key={c.id} data-feas-component={c.catalog_component_id || "MANUAL"} data-canon-component={c.id} data-value-type={c.value_type} data-applicability={c.applicability_status} data-feas-state={stateKey} data-selected={selected ? "true" : undefined} className={`${excluded ? "excluded" : ""} ${selected ? "selected" : ""}`} onClick={() => setSelRow(selected ? "" : c.id)}>
            <td><b>{c.label}</b>{!auto && editable && <input className="est-label-edit" aria-label="Libellé" disabled={excluded} value={c.label} onClick={(e) => e.stopPropagation()} onChange={(e) => edit(j, (x) => { x.label = e.target.value; })} />}
              <small data-feas-why className="est-origin" title={c.trigger_refs?.length ? whyText(c.trigger_refs) : undefined}>{c.trigger_refs?.length ? "Issu du cadrage" : auto ? "" : "Ajouté manuellement"}{["SUGGESTED", "TO_RECONSIDER"].includes(c.applicability_status) && <span className="est-confirm" data-feas-to-confirm> · à confirmer</span>}</small></td>
            <td className="est-qty" onClick={(e) => e.stopPropagation()}>{editQty === c.id ? <span className="est-edit"><input type="number" min="0" step="any" autoFocus aria-label="Quantité" data-feas-qty disabled={!editable || excluded} defaultValue={asInput(c.quantity)} onBlur={(e) => { setQty(j, e.target.value); setEditQty(""); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditQty(""); }} /> <small>{unitText}</small></span>
                : <button type="button" className="est-value" data-feas-qty-text disabled={!editable || excluded} onClick={() => setEditQty(c.id)} title={editable && !excluded ? "Cliquer pour modifier" : undefined}>{c.quantity != null ? <>{c.quantity.toLocaleString("fr-FR")} <small>{unitText}</small></> : <span className="est-missing">À renseigner</span>}</button>}
              {c.quantity_origin === "DERIVED" && <small title={c.quantity_formula} className="est-derived"> calculée</small>}</td>
            <td className="est-price" data-feas-price-cell onClick={(e) => e.stopPropagation()}>
              {editPrice === c.id ? <input type="number" min="0" step="any" autoFocus aria-label="Prix unitaire" data-feas-unit-price disabled={!editable || excluded} defaultValue={asInput(p.unit_price_eur)} placeholder="À chiffrer" onBlur={(e) => { setPU(j, e.target.value); setEditPrice(""); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditPrice(""); }} />
                : retained ? <><button type="button" className="est-value est-main" data-feas-price-text disabled={!editable || excluded} onClick={() => setEditPrice(c.id)} title={editable && !excluded ? "Cliquer pour modifier" : undefined}><b data-feas-price-value>{unitEur(p.unit_price_eur)}/{unitText}</b></button>
                    <small className="est-sub" data-feas-provenance={p.source_type || "NONE"} title={p.disclaimer || p.provenance_label || ""}>{p.source_type === "USER" ? "Saisi par vous" : `Retenu · ${SOURCE_TEXT[p.source_type] || p.provenance_label}`}</small>
                    {p.min_unit_price_eur != null && p.max_unit_price_eur != null && <small className="est-sub est-range">{unitEur(p.min_unit_price_eur)}–{unitEur(p.max_unit_price_eur)} · indicatif</small>}{p.confidence === "LOW" && <small className="est-sub warn" data-feas-low>confiance faible</small>}</>
                : sug ? <><button type="button" className="est-value est-main" data-feas-price-text disabled={!editable} onClick={() => setEditPrice(c.id)} title="Cliquer pour saisir votre propre prix"><b data-feas-suggestion data-suggestion-level={sug.level}>{unitEur(sug.unit_price_eur)}/{unitText}</b></button>
                    <small className="est-sub" data-feas-provenance="SUGGESTED" data-feas-badge title={sug.label}>{sug.out_of_region ? "Benchmark Normandie · hors région · indicatif" : `${SUGGEST_TEXT[sug.level]} · indicatif`}</small>
                    {sug.min_unit_price_eur != null && sug.max_unit_price_eur != null && <small className="est-sub est-range">{unitEur(sug.min_unit_price_eur)}–{unitEur(sug.max_unit_price_eur)}</small>}
                    {sug.standard_alternative && <small className="est-sub est-range" data-feas-standard-alt>Standard Calepin : {unitEur(sug.standard_alternative.unit_price_eur)}/{unitText}</small>}
                    {editable && (selected || false) && <button type="button" className="est-use" data-feas-use-suggestion onClick={() => useSuggestion(c)}>Utiliser</button>}
                    {editable && !selected && <button type="button" className="est-use est-use-quiet" data-feas-use-suggestion onClick={() => useSuggestion(c)} title={`Utiliser ${unitEur(sug.unit_price_eur)}/${unitText}`}>Utiliser</button>}</>
                : <button type="button" className="est-value est-tochiffrer" data-feas-provenance="NONE" data-feas-price-text disabled={!editable || excluded} onClick={() => setEditPrice(c.id)}>À chiffrer</button>}</td>
            <td className="est-total" data-feas-total>{c.quantity != null && retained ? range(c) : proposedTotal != null ? <span title="Calcul basé sur le prix proposé." data-feas-total-proposed>≈ {eur(proposedTotal)}</span> : c.amount_eur != null ? eur(c.amount_eur) : "—"}</td>
            <td><span className={`est-state st-${stateKey}`} data-feas-state-badge>{stateLabel}</span>{c.user_override_reason && <small className="est-sub"> {c.user_override_reason}</small>}</td>
            <td className="est-actions" onClick={(e) => e.stopPropagation()}>{editable && <details className="row-menu" data-feas-menu><summary aria-label="Actions du poste">⋯</summary><div className="row-menu-list" role="menu">
              <button type="button" role="menuitem" data-feas-modify onClick={() => setOpenRow(open ? "" : c.id)}>{open ? "Fermer la modification" : "Modifier"}</button>
              {auto && !excluded && <button type="button" role="menuitem" data-feas-price onClick={() => openPrice(c)}>Voir les références de prix</button>}
              {c.applicability_status === "SUGGESTED" && <button type="button" role="menuitem" data-feas-accept onClick={() => setStatus(c, "USER_ADDED")}>Confirmer le poste</button>}
              {excluded ? <button type="button" role="menuitem" data-feas-reinclude onClick={() => setStatus(c, "USER_ADDED")}>Réintégrer</button> : auto && <button type="button" role="menuitem" data-feas-exclude onClick={() => setStatus(c, "USER_EXCLUDED", "Exclu par le MOE")}>Exclure</button>}
              {auto && retained && !excluded && <button type="button" role="menuitem" data-feas-save-agency onClick={() => saveForAgency(c)}>Enregistrer comme référence agence</button>}
              {!auto && <button type="button" role="menuitem" data-canon-remove-component onClick={() => update((s) => { s.scenarios[index].cost_components.splice(j, 1); })}>Supprimer</button>}</div></details>}</td></tr>;
          const detailRow = open ? <tr key={`${c.id}-detail`} data-feas-detail-row><td colSpan={6}><div className="canon-row">
            <label>Montant (€ HT)<input type="number" min="0" aria-label="Montant" data-feas-amount disabled={!editable || excluded} value={asInput(c.amount_eur)} onChange={(e) => setTotal(j, e.target.value)} /></label>
            <label>Type de valeur<select aria-label="Type de valeur" disabled={!editable} value={c.value_type} onChange={(e) => edit(j, (x) => { x.value_type = e.target.value; })}>{enums.valueType.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</select></label>
            <label>Minimum<input type="number" min="0" aria-label="Minimum" disabled={!editable} value={asInput(c.min_eur)} onChange={(e) => edit(j, (x) => { x.min_eur = toNum(e.target.value); })} /></label>
            <label>Maximum<input type="number" min="0" aria-label="Maximum" disabled={!editable} value={asInput(c.max_eur)} onChange={(e) => edit(j, (x) => { x.max_eur = toNum(e.target.value); })} /></label>
            <label>Origine<select aria-label="Origine" disabled={!editable} value={c.origin} onChange={(e) => edit(j, (x) => { x.origin = e.target.value; })}>{enums.origin.map((v) => <option key={v} value={v}>{v === "UNKNOWN" ? "Inconnue" : labels[v]}</option>)}</select></label>
            <label>Source<input aria-label="Source" disabled={!editable} value={(c.source_refs || []).join(", ")} onChange={(e) => edit(j, (x) => { x.source_refs = e.target.value.split(",").map((y) => y.trim()).filter(Boolean); })} /></label>
            <label>Formule<input aria-label="Formule" disabled={!editable || c.origin !== "DERIVED"} placeholder={c.origin === "DERIVED" ? "obligatoire" : "—"} value={c.formula || ""} onChange={(e) => edit(j, (x) => { x.formula = e.target.value || null; })} /></label>
            <button type="button" className="link-button" data-canon-duplicate onClick={() => update((s) => { const copy = { ...structuredClone(s.scenarios[index].cost_components[j]), id: uid("CC"), label: `${c.label} (copie)`, catalog_component_id: null, applicability_status: "USER_ADDED", generation_origin: "USER" }; s.scenarios[index].cost_components.splice(j + 1, 0, copy); })}>Dupliquer</button>
          </div></td></tr> : null;
          return [row, detailRow].filter(Boolean); })}</tbody></table></div>}
    {editable && <button type="button" className="secondary" data-canon-add-component onClick={addPost}>+ Ajouter un poste</button>}
    {drawer && (() => { const c = comps.find((x) => x.id === drawer); return c && <div className="canon-advanced" data-feas-price-drawer={c.catalog_component_id}><b>Références disponibles</b> pour « {c.label} » ({c.unit}) — indicatif
      {!refs.length ? <p className="muted" data-feas-no-ref>Aucune référence compatible (composant, unité, type de bâtiment, département). Aucun prix n’est appliqué hors de son périmètre.</p>
        : <>{refs.map((r) => <fieldset key={r.source_id} data-feas-ref={r.source_id}><label><input type="radio" name="feas-ref" checked={pick.id === r.source_id} onChange={() => setPick({ id: r.source_id, value: "CENTRAL" })} /> {r.label} — {unitRange(r)} {r.unit}</label>
          <small>{r.display_label} · base {r.economic_date} · confiance {r.confidence}</small></fieldset>)}
          <label>Valeur retenue<select data-feas-value value={pick.value} onChange={(e) => setPick({ ...pick, value: e.target.value })}><option value="MIN">Minimum</option><option value="CENTRAL">Central</option><option value="MAX">Maximum</option></select></label>
          <button type="button" className="primary" data-feas-apply disabled={!pick.id} onClick={() => applyPrice(c)}>Appliquer ce prix</button></>}
      <small className="muted">{refs[0]?.disclaimer || "Fourchette de faisabilité non contractuelle."}</small> <button type="button" className="link-button" onClick={() => setDrawer(null)}>Fermer</button></div>; })()}
    {macro.length > 0 && detail.length > 0 && <p className="canon-derived" data-feas-double-count>Une référence macro et des postes détaillés sont chiffrés : ce sont deux vues du même périmètre, ne les additionnez pas.</p>}
  </div>;
}

/** Estimation : choisir ou créer le scénario CANONIQUE (même objet que dans Analyse), puis éditer ses composants de coût. WORKS, TOTAL_OPERATION, REFERENCE_VALUE et ALLOWANCE restent distincts ; aucun total n'est calculé. */
function CanonEstimation({ id, state, update, editable, enums, labels, replace, settle, extra }) {
  const [selected, setSelected] = useState("");
  const current = state.scenarios.find((s) => s.id === (selected || state.scenarios[0]?.id));
  const createShell = () => { const sid = uid("SC"); update((s) => { s.scenarios.push({ id: sid, label: `Scénario ${s.scenarios.length + 1}`, kind: ({ NEW_BUILD: "NEW_BUILD", RENOVATION: "RENOVATION", EXTENSION: "EXTENSION", RESTRUCTURING: "RESTRUCTURING", MIXED: "MIXED" })[s.project.project_nature] || "OTHER", status: "DRAFT", site_id: null, scope_summary: null, cost_components: [], performance_targets: [], phasing: null, dependency_investigation_ids: [], economic_horizon: null, deconstruction_strategy: null, source_refs: [] }); }); setSelected(sid); };
  const index = current ? state.scenarios.findIndex((s) => s.id === current.id) : -1;
  return <section className="canon-card" data-canon-estimation><h3>Les postes de travaux identifiés et leur première estimation</h3>
    <div className="canon-framework-note" data-canon-ceiling-note>{state.financial_framework.budget_ceiling_eur !== null ? <>Budget plafond (cadre financier, distinct de l’estimation) : <b>{state.financial_framework.budget_ceiling_eur.toLocaleString("fr-FR")} €</b></> : "Aucun budget plafond renseigné."}</div>
    {!state.scenarios.length ? <div data-canon-no-scenario><p className="muted">Aucun scénario : l’estimation s’attache à un scénario. Créez un scénario minimal — il sera enrichi dans l’étape Analyse (même objet, aucune copie).</p>{editable && <button type="button" className="primary" data-canon-create-shell onClick={createShell}>Créer un scénario</button>}</div>
      : <>
        <div className="canon-row"><select aria-label="Scénario" data-canon-scenario-select value={current.id} onChange={(e) => setSelected(e.target.value)}>{state.scenarios.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>{editable && <button type="button" className="secondary" data-canon-create-shell onClick={createShell}>Nouveau scénario</button>}</div>
        <EstimateTable id={id} state={state} scenario={current} index={index} update={update} editable={editable} replace={replace} settle={settle} enums={enums} labels={labels} />
        {extra}
        <p className="muted">Une fourchette reste une fourchette (jamais moyennée) ; un montant absent reste « à confirmer » ; aucun total d’opération n’est calculé sans règle explicite.</p>
      </>}
  </section>;
}

function CanonScenarios({ state, update, editable, enums, labels }) {
  return <section className="canon-card" data-canon-scenarios><h3>Scénarios</h3>
    {!state.scenarios.length && <p className="muted" data-canon-no-scenario>Aucun scénario. Ajoutez-en un (ou créez-le depuis l’Estimation) : Calepin n’en invente aucun.</p>}
    {state.scenarios.map((sc, i) => <ScenarioCard key={sc.id} sc={sc} i={i} state={state} update={update} editable={editable} enums={enums} labels={labels} />)}
    {editable && <button type="button" className="secondary" data-canon-add-scenario onClick={() => update((s) => { s.scenarios.push({ id: uid("SC"), label: `Scénario ${s.scenarios.length + 1}`, kind: "OTHER", status: "DRAFT", site_id: null, scope_summary: null, cost_components: [], performance_targets: [], phasing: null, dependency_investigation_ids: [], economic_horizon: null, deconstruction_strategy: null, source_refs: [] }); })}>Ajouter un scénario</button>}
  </section>;
}

function Check({ checked, onChange, disabled, children, ...rest }) { return <label className="canon-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} {...rest} /> {children}</label>; }

function ScenarioCard({ sc, i, state, update, editable, enums, labels }) {
  const set = (key) => (e) => update((s) => { s.scenarios[i][key] = e.target.value === "" ? null : e.target.value; });
  const setH = (key, parse = (v) => v) => (e) => update((s) => { s.scenarios[i].economic_horizon[key] = e.target.value === "" ? null : parse(e.target.value); });
  const setD = (key, parse = (v) => v) => (e) => update((s) => { s.scenarios[i].deconstruction_strategy[key] = e.target.value === "" ? null : parse(e.target.value); });
  const h = sc.economic_horizon, d = sc.deconstruction_strategy;
  const [draftOpen, setDraftOpen] = useState(false), [draftYears, setDraftYears] = useState("");
  const derived = h && h.calculation_mode === "SIMPLE_UNDISCOUNTED" && h.annual_delta_eur !== null && h.horizon_years !== null;
  const toggleDep = (field, ref, on) => update((s) => { const list = s.scenarios[i][field] || []; s.scenarios[i][field] = on ? [...new Set([...list, ref])] : list.filter((x) => x !== ref); });
  return <article className="canon-scenario" data-canon-scenario={sc.id} data-canon-scope={sc.id}>
    <div className="canon-row"><input aria-label="Libellé du scénario" disabled={!editable} value={sc.label} onChange={set("label")} data-canon-scenario-label />
      <select aria-label="Type de scénario" data-canon-kind disabled={!editable} value={sc.kind} onChange={set("kind")}>{enums.scenarioKind.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</select>
      <select aria-label="Statut" disabled={!editable} value={sc.status} onChange={set("status")}>{enums.scenarioStatus.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</select>
      <select aria-label="Site" data-canon-site-select disabled={!editable} value={sc.site_id || ""} onChange={set("site_id")}><option value="">Aucun site</option>{state.sites.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
      {editable && <button type="button" className="link-button" data-canon-remove-scenario onClick={() => { if (window.confirm("Supprimer ce scénario et ses composants de coût ?")) update((s) => { s.scenarios.splice(i, 1); if (s.decision.scenario_id === sc.id) s.decision.scenario_id = null; }); }}>Supprimer</button>}</div>
    <label>Périmètre<textarea rows={2} disabled={!editable} value={sc.scope_summary || ""} onChange={set("scope_summary")} /></label>
    <div data-canon-targets><b>Performances</b> <small>un objectif n’est pas une performance atteinte</small>
      {sc.performance_targets.map((t, j) => <div className={`canon-target ${t.target_status}`} key={j} data-canon-target={t.target_status}>
        <input aria-label="Performance" disabled={!editable} value={t.label} onChange={(e) => update((s) => { s.scenarios[i].performance_targets[j].label = e.target.value; })} />
        <input aria-label="Valeur" disabled={!editable} value={t.target_value ?? ""} onChange={(e) => update((s) => { s.scenarios[i].performance_targets[j].target_value = e.target.value || null; })} />
        <select aria-label="Statut de la performance" disabled={!editable} value={t.target_status} onChange={(e) => update((s) => { s.scenarios[i].performance_targets[j].target_status = e.target.value; })}>{enums.targetStatus.map((v) => <option key={v} value={v}>{v === "UNKNOWN" ? "Inconnu" : labels[v]}</option>)}</select>
        {editable && <button type="button" className="link-button" onClick={() => update((s) => { s.scenarios[i].performance_targets.splice(j, 1); })}>Retirer</button>}</div>)}
      {editable && <button type="button" className="link-button" data-canon-add-target onClick={() => update((s) => { s.scenarios[i].performance_targets.push({ label: "Nouvelle performance", target_status: "TARGET", target_value: null, source_refs: [] }); })}>Ajouter une performance</button>}</div>
    <div data-canon-phasing><b>Phasage</b> <TriState value={sc.phasing?.required} disabled={!editable} label="Phasage requis" onChange={(v) => update((s) => { s.scenarios[i].phasing = { ...(s.scenarios[i].phasing || { phases: [], constraints: [] }), required: v }; })} />
      {sc.phasing && sc.phasing.required === "TRUE" && <textarea rows={2} aria-label="Phases (une par ligne)" placeholder="Phases (une par ligne)" disabled={!editable} value={(sc.phasing.phases || []).join("\n")} onChange={(e) => update((s) => { s.scenarios[i].phasing.phases = lines(e.target.value); })} />}
      <small className="muted">Un site occupé ne crée aucune phase automatiquement.</small></div>
    {state.investigations.length > 0 && <fieldset data-canon-dependencies><legend>Dépend de ces investigations</legend>{state.investigations.map((inv) => <Check key={inv.id} disabled={!editable} checked={(sc.dependency_investigation_ids || []).includes(inv.id)} onChange={(on) => toggleDep("dependency_investigation_ids", inv.id, on)}>{inv.label} <small>({labels[inv.status]})</small></Check>)}</fieldset>}
    {/* Projection économique : avancée, masquée par défaut, jamais affichée pour tous les dossiers */}
    {!h ? (editable && (!draftOpen
      ? <button type="button" className="link-button" data-canon-add-horizon onClick={() => setDraftOpen(true)}>Ajouter une projection sur une durée</button>
      : <div className="canon-advanced" data-canon-horizon-draft><b>Projection économique</b> <small>La durée est obligatoire ; rien n’est pré-rempli ni calculé.</small>
          <div className="canon-row"><label>Durée (années)<input type="number" min="1" step="any" data-canon-draft-years value={draftYears} onChange={(e) => setDraftYears(e.target.value)} /></label>
            <button type="button" className="secondary" data-canon-create-horizon disabled={!(Number(draftYears) > 0)} onClick={() => { update((s) => { s.scenarios[i].economic_horizon = { horizon_years: Number(draftYears), annual_delta_eur: null, cumulative_delta_eur: null, calculation_mode: "SOURCE_VALUE", origin: "USER", formula: null, source_refs: [], notes: null }; }); setDraftOpen(false); setDraftYears(""); }}>Créer la projection</button>
            <button type="button" className="link-button" onClick={() => { setDraftOpen(false); setDraftYears(""); }}>Annuler</button></div></div>))
      : <div className="canon-advanced" data-canon-horizon><b>Projection économique sur {h.horizon_years} ans</b> <small>{h.calculation_mode === "SIMPLE_UNDISCOUNTED" ? "simple non actualisée" : h.calculation_mode === "SOURCE_VALUE" ? "valeur issue de la source" : "valeur actualisée issue de la source"}</small>
        <div className="canon-row"><label>Durée (années)<input type="number" min="1" step="any" disabled={!editable} data-canon-horizon-years value={asInput(h.horizon_years)} onChange={setH("horizon_years", Number)} /></label>
          <label>Mode de calcul<select disabled={!editable} data-canon-horizon-mode value={h.calculation_mode} onChange={(e) => update((s) => { const x = s.scenarios[i].economic_horizon; x.calculation_mode = e.target.value; if (e.target.value !== "SIMPLE_UNDISCOUNTED" && x.origin === "DERIVED") { x.origin = "USER"; x.formula = null; } })}><option value="SOURCE_VALUE">Valeur issue de la source</option><option value="SIMPLE_UNDISCOUNTED">Calcul simple non actualisé</option><option value="DISCOUNTED_SOURCE">Valeur actualisée issue de la source</option></select></label>
          <label>Écart annuel (€)<input type="number" disabled={!editable} data-canon-horizon-annual value={asInput(h.annual_delta_eur)} onChange={setH("annual_delta_eur", Number)} /></label>
          <label>Écart cumulé (€)<input type="number" disabled={!editable || derived} data-canon-horizon-cumulative value={asInput(h.cumulative_delta_eur)} onChange={setH("cumulative_delta_eur", Number)} /></label></div>
        {h.origin === "DERIVED" && <p data-canon-horizon-derived className="canon-derived">Valeur calculée : <code>{h.formula}</code> (entrées : {Object.entries(h.inputs || {}).map(([k, v]) => `${k} = ${v}`).join(", ")}). Aucun ROI ni temps de retour n’est calculé.</p>}
        {h.calculation_mode === "SIMPLE_UNDISCOUNTED" && !derived && <p className="muted">Renseignez l’écart annuel et la durée : rien n’est calculé sans ces deux données.</p>}
        {editable && <button type="button" className="link-button" data-canon-remove-horizon onClick={() => { if (window.confirm("Retirer la projection économique de ce scénario ?")) update((s) => { s.scenarios[i].economic_horizon = null; }); }}>Retirer la projection</button>}</div>}
    {/* Déconstruction : modalité du scénario, jamais un type de scénario */}
    {!d ? (editable && <button type="button" className="link-button" data-canon-add-deconstruction onClick={() => update((s) => { s.scenarios[i].deconstruction_strategy = { status: "TO_STUDY", approach: null, scope: [], recovery_intent: "TO_STUDY", prerequisite_investigation_ids: [], source_refs: [], notes: null }; })}>Ajouter une stratégie de déconstruction / conservation / réemploi</button>)
      : <div className="canon-advanced" data-canon-deconstruction><b>Déconstruction / conservation / réemploi</b>
        <div className="canon-row"><label>Statut<select disabled={!editable} data-canon-decon-status value={d.status} onChange={setD("status")}>{enums.deconstructionStatus.map((v) => <option key={v} value={v}>{({ NOT_APPLICABLE: "Non applicable", TO_STUDY: "À étudier", DEFINED: "Définie", UNKNOWN: "Inconnue" })[v]}</option>)}</select></label>
          <label>Approche {d.status === "DEFINED" && <em>(obligatoire)</em>}<select disabled={!editable} data-canon-decon-approach value={d.approach || ""} onChange={setD("approach")}><option value="">—</option>{enums.deconstructionApproach.map((v) => <option key={v} value={v}>{labels[v] || v}</option>)}</select></label>
          <label>Récupération<select disabled={!editable} value={d.recovery_intent || "UNKNOWN"} onChange={setD("recovery_intent")}>{enums.recoveryIntent.map((v) => <option key={v} value={v}>{({ NONE: "Aucune", REUSE: "Réemploi", RECYCLE: "Recyclage", MIXED: "Mixte", TO_STUDY: "À étudier", UNKNOWN: "Inconnue" })[v]}</option>)}</select></label></div>
        <label>Éléments concernés <small>(un par ligne)</small><textarea rows={2} disabled={!editable} value={(d.scope || []).join("\n")} onChange={(e) => update((s) => { s.scenarios[i].deconstruction_strategy.scope = lines(e.target.value); })} /></label>
        {state.investigations.length > 0 && <fieldset><legend>Investigations prérequises</legend>{state.investigations.map((inv) => <Check key={inv.id} disabled={!editable} checked={(d.prerequisite_investigation_ids || []).includes(inv.id)} onChange={(on) => update((s) => { const list = s.scenarios[i].deconstruction_strategy.prerequisite_investigation_ids || []; s.scenarios[i].deconstruction_strategy.prerequisite_investigation_ids = on ? [...new Set([...list, inv.id])] : list.filter((x) => x !== inv.id); })}>{inv.label}</Check>)}</fieldset>}
        <small className="muted">Aucune stratégie n’est déduite d’une « rénovation » : c’est vous qui la renseignez.</small>
        {editable && <button type="button" className="link-button" data-canon-remove-deconstruction onClick={() => update((s) => { s.scenarios[i].deconstruction_strategy = null; })}>Retirer la stratégie</button>}</div>}
  </article>;
}

function CanonDecision({ state, update, editable, enums, labels }) {
  const d = state.decision;
  const set = (key) => (e) => update((s) => { s.decision[key] = e.target.value === "" ? null : e.target.value; });
  return <section className="canon-card" id="feas-canon-decision" data-canon-decision><h3>Décision du MOE</h3>
    <p className="muted">Calepin ne propose ni ne prend aucune décision : elle reste celle du MOE (aucun score ne la modifie).</p>
    <div className="canon-row"><label>Statut<select disabled={!editable} data-canon-decision-status value={d.status} onChange={(e) => update((s) => { s.decision.status = e.target.value; if (e.target.value !== "VALIDATED") s.decision.validated_by_moe = false; })}>{enums.decisionStatus.map((v) => <option key={v} value={v}>{({ UNDECIDED: "Non décidée", PROPOSED: "Proposée", VALIDATED: "Validée" })[v]}</option>)}</select></label>
      <label>Décision<select disabled={!editable} data-canon-decision-type value={d.decision_type || ""} onChange={set("decision_type")}><option value="">—</option>{enums.decisionType.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</select></label>
      <label>Scénario<select disabled={!editable} data-canon-decision-scenario value={d.scenario_id || ""} onChange={set("scenario_id")}><option value="">—</option>{state.scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}</select></label></div>
    {d.status === "VALIDATED" && <Check disabled={!editable} checked={d.validated_by_moe === true} data-canon-moe-validation onChange={(on) => update((s) => { s.decision.validated_by_moe = on; })}>Je valide cette décision en tant que MOE</Check>}
    <label>Justification<textarea rows={2} disabled={!editable} value={d.rationale || ""} onChange={set("rationale")} /></label>
    <label>Conditions et réserves <small>(une par ligne)</small><textarea rows={2} disabled={!editable} value={(d.conditions || []).join("\n")} onChange={(e) => update((s) => { s.decision.conditions = lines(e.target.value); })} /></label>
  </section>;
}

const ITEM_TYPE_LABEL = { DOCUMENT: "Document", INVESTIGATION: "Investigation", STUDY: "Étude", VISIT: "Visite", QUOTE: "Devis", VALIDATION: "Validation", ACTION: "Action", OTHER: "Autre" };
function CanonInvestigations({ state, update, editable, enums, labels }) {
  return <section className="canon-card" data-canon-investigations><h3>Études &amp; actions</h3>
    <p className="muted">Ce qu’il faut obtenir, commander, faire ou valider pour fiabiliser l’étude. Les éléments générés depuis le cadrage indiquent leur déclencheur ; vos modifications sont conservées aux recalculs.</p>
    {!state.investigations.length && <p className="muted">Aucune investigation. Une investigation non disponible n’est jamais assimilée à un résultat négatif.</p>}
    {state.investigations.map((inv, i) => <div className="canon-inv" key={inv.id} data-canon-investigation={inv.id} data-status={inv.status}>
      <input aria-label="Libellé" disabled={!editable} value={inv.label} onChange={(e) => update((s) => { s.investigations[i].label = e.target.value; })} />
      <select aria-label="Type" data-canon-inv-type disabled={!editable} value={inv.item_type || "INVESTIGATION"} onChange={(e) => update((s) => { s.investigations[i].item_type = e.target.value; s.investigations[i].user_confirmed = true; })}>{(enums.itemType || Object.keys(ITEM_TYPE_LABEL)).map((v) => <option key={v} value={v}>{ITEM_TYPE_LABEL[v] || v}</option>)}</select>
      <select aria-label="Statut" data-canon-inv-status disabled={!editable} value={inv.status} onChange={(e) => update((s) => { s.investigations[i].status = e.target.value; })}>{enums.investigationStatus.map((v) => <option key={v} value={v}>{labels[v]}</option>)}</select>
      {inv.auto_generated && <small className="canon-origin" data-canon-inv-origin={inv.rule_id}>Généré depuis le cadrage : vous avez indiqué {[...new Set((inv.trigger_refs || []).map(triggerText))].join(", ")}.{inv.purpose ? ` ${inv.purpose}` : ""}</small>}
      {inv.status === "AVAILABLE" && <textarea aria-label="Résumé du résultat" placeholder="Résumé du résultat" rows={2} disabled={!editable} value={inv.result_summary || ""} onChange={(e) => update((s) => { s.investigations[i].result_summary = e.target.value || null; })} />}
      {state.scenarios.length > 0 && <small>Bloque : {state.scenarios.map((sc) => <Check key={sc.id} disabled={!editable} checked={(inv.blocking_for || []).includes(sc.id)} onChange={(on) => update((s) => { const list = s.investigations[i].blocking_for || []; s.investigations[i].blocking_for = on ? [...new Set([...list, sc.id])] : list.filter((x) => x !== sc.id); })}>{sc.label}</Check>)}</small>}
      {editable && <button type="button" className="link-button" data-canon-remove-investigation onClick={() => update((s) => { s.investigations.splice(i, 1); })}>Retirer</button>}</div>)}
    {editable && <button type="button" className="secondary" data-canon-add-investigation onClick={() => update((s) => { s.investigations.push({ id: uid("INV"), label: "Nouvelle étude ou action", status: "TO_ORDER", item_type: "STUDY", origin: "USER", result_summary: null, source_refs: [], blocking_for: [], trigger_refs: [], auto_generated: false, user_confirmed: true }); })}>Ajouter une étude ou action</button>}
  </section>;
}

function NoticeBlocks({ blocks }) {
  return blocks.map((b, n) => b.type === "heading" ? <h5 key={n}>{b.text}</h5> : b.type === "list" ? <div key={n}>{b.title && <b>{b.title}</b>}<ul>{b.items.map((x, k) => <li key={k}>{x}</li>)}</ul></div> : <p key={n}>{b.text}</p>);
}

/** Écran Notice : un livrable, pas un outil de debug. En-tête (Aperçu / Exporter), UNE carte « Décision du MOE », puis le document lui-même (six sections, annexes repliées) tenu à jour automatiquement. */
function NoticeScreen({ id, state, update, editable, enums, labels, issues, legacy }) {
  const [result, setResult] = useState(null), [blocked, setBlocked] = useState(null), [error, setError] = useState(""), [editing, setEditing] = useState(false), [sources, setSources] = useState(false), [drafts, setDrafts] = useState({});
  const doc = useRef(null);
  const load = async (mode = "DRAFT") => {
    setError(""); setBlocked(null);
    try { setResult(await canonicalNotice(id, mode, null)); } catch (e) { if (e?.detail?.code === "NOTICE_BLOCKED") { setBlocked(e.detail); } else setError(errorText(e)); }
  };
  useEffect(() => { const timer = setTimeout(() => load("DRAFT"), 250); return () => clearTimeout(timer); }, [id, JSON.stringify(state.decision), JSON.stringify(state.scenarios), JSON.stringify(state.investigations), JSON.stringify(state.financial_framework), JSON.stringify(state.project)]); // eslint-disable-line react-hooks/exhaustive-deps
  const notice = result?.notice;
  const download = async (format) => { setError(""); try { await downloadCanonicalNotice(id, format); } catch (e) { setError(errorText(e)); } };
  const saveSection = async (sectionId, text) => { try { await apiFetch(`/cctps/${id}/feasibility/canonical/notice/sections/${sectionId}`, { method: "PUT", body: JSON.stringify({ text }) }); await load("DRAFT"); setDrafts((d) => { const next = { ...d }; delete next[sectionId]; return next; }); } catch (e) { setError(errorText(e)); } };
  const flat = (section) => section.blocks.flatMap((block) => (block.type === "list" ? [...(block.title ? [block.title] : []), ...block.items.map((item) => `• ${item}`)] : [block.text || ""])).join("\n");
  const Section = ({ section, number }) => <section className="notice-section" data-canon-notice-section={section.id} data-notice-edited={section.edited ? "true" : undefined}>
    <h3>{number}{section.title}{section.edited && <small className="muted"> · texte modifié</small>}</h3>
    {editing && drafts[section.id] !== undefined ? <div className="notice-edit"><textarea rows={Math.max(4, drafts[section.id].split("\n").length + 1)} value={drafts[section.id]} aria-label={`Texte de la section ${section.title}`} onChange={(e) => setDrafts({ ...drafts, [section.id]: e.target.value })} />
        <span><button type="button" className="secondary" data-notice-save-section onClick={() => saveSection(section.id, drafts[section.id])}>Enregistrer</button> <button type="button" className="link-button" onClick={() => setDrafts((d) => { const next = { ...d }; delete next[section.id]; return next; })}>Annuler</button>{section.edited && <> <button type="button" className="link-button" data-notice-reset-section onClick={() => saveSection(section.id, "")}>Rétablir le texte généré</button></>}</span></div>
      : section.edited ? <p className="notice-override" data-notice-override>{section.override}</p> : <NoticeBlocks blocks={section.blocks} />}
    {editing && editable && drafts[section.id] === undefined && <button type="button" className="notice-pencil" data-notice-edit-section aria-label={`Modifier la section ${section.title}`} title="Modifier ce passage" onClick={() => setDrafts({ ...drafts, [section.id]: section.override ?? flat(section) })}>✎</button>}
  </section>;
  return <div className="notice-screen" data-notice-screen>
    <header className="notice-head"><div><h2>Notice de faisabilité</h2><p className="muted">Synthèse de l’étude initiale du projet.</p></div>
      <div className="notice-actions">
        <button type="button" className="secondary" data-notice-preview onClick={() => doc.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>Aperçu</button>
        <details className="row-menu notice-export" data-notice-export-menu><summary className="primary" role="button">Exporter</summary><div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" data-notice-export="docx" onClick={() => download("docx")}>Exporter Word</button>
          <button type="button" role="menuitem" data-notice-export="pdf" onClick={() => download("pdf")}>Exporter PDF</button>
          {editable && <button type="button" role="menuitem" data-canon-notice-validated onClick={() => load("VALIDATED")}>Contrôler la version validée</button>}</div></details></div></header>
    {error && <div className="err" role="alert">{error}</div>}
    <section className="notice-decision-card canon-card" data-notice-decision>
      {legacy?.renderDecision?.()}
      <details className="notice-formal" data-canon-decision-details><summary>Validation formelle de la décision</summary><CanonDecision state={state} update={update} editable={editable} enums={enums} labels={labels} /></details>
    </section>
    {blocked && <div className="canon-blocked" role="alert" data-canon-notice-blocked><b>{blocked.message}</b><ul>{blocked.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul></div>}
    <div ref={doc} className="notice-doc-wrap" data-feasibility-panel="notice" data-notice-status={notice ? "UP_TO_DATE" : "LOADING"}>
      {!notice ? <p className="muted" data-notice-loading>Préparation de la notice…</p> : <article className="canon-notice" data-canon-notice-document data-canon-notice data-mode={notice.mode}>
        <div className="notice-toolbar"><span className="notice-uptodate" data-notice-uptodate>✓ Notice à jour</span>
          <span className="notice-tools">{editable && <button type="button" className="link-button" data-notice-edit-toggle aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? "Terminer la modification" : "Modifier la Notice"}</button>}
            <button type="button" className="link-button" data-notice-sources-toggle aria-pressed={sources} onClick={() => setSources(!sources)}>{sources ? "Masquer les sources" : "Afficher les sources"}</button></span></div>
        <h4>{notice.title}</h4>
        {notice.draft_notice && <p className="canon-draft" data-canon-draft-banner>{notice.draft_notice}</p>}
        {(notice.key_figures || []).length > 0 && <dl className="feas-keyfigures notice-figures" data-notice-keyfigures>{notice.key_figures.map((f) => <div key={f.label}><dd>{f.value}</dd><dt>{f.label}</dt></div>)}</dl>}
        {notice.sections.map((section, index) => <Section key={section.id} section={section} number={`${index + 1}. `} />)}
        {(notice.annexes || []).length > 0 && <details className="canon-annexes" data-canon-notice-annexes open={sources}><summary>Annexes et traçabilité ({notice.annexes.length})</summary>{notice.annexes.map((section, index) => <Section key={section.id} section={section} number={`Annexe ${"ABCDEFGH"[index]}. `} />)}</details>}
        {notice.reserves.length > 0 && <section data-canon-notice-reserves><h5>Réserves</h5><ul>{notice.reserves.map((r, n) => <li key={n}>{r.message}</li>)}</ul></section>}</article>}
    </div>
  </div>;
}
