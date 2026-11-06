import { useCallback, useEffect, useState } from "react";
import { DpgfImportReview } from "./DpgfImportReview";
import { archiveAgencyReference, createAgencyReference, listAgencyReferences, listEconomicItems, listSharedStandards, overrideStandard, updateAgencyReference, createEstimateImport, getDpgfEconomicsStatus, listStandardPrices, validateEstimateImport, archiveDpgfHistoryLine, createDpgfHistoryLine, createDpgfHistoryProject, listDpgfHistoryLines, listDpgfHistoryProjects, listDpgfLineTypes, rejectDpgfHistoryLine, validateDpgfHistoryLine } from "../api/client";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const UNITS = ["m²", "ml", "u", "forfait"];
const errorText = (reason) => reason?.detail?.message || reason?.message || "Une erreur est survenue";

/** Historique de prix (DPGF V0.3) : références économiques validées par le MOE. Une ligne n'est jamais utilisée pour proposer un prix tant que vous n'avez pas cliqué « Valider cette référence ».
 *  Le vocabulaire interne (signature de périmètre, type canonique…) n'est pas affiché. */
export function DpgfHistory({ canWrite = true }) {
  const [data, setData] = useState({ lines: [], total: 0, eligible: 0 });
  const [projects, setProjects] = useState([]);
  const [types, setTypes] = useState([]);
  const [mode, setMode] = useState(null); // "project" | "line" | null
  const [error, setError] = useState("");
  const [view, setView] = useState("mine"); // « Mes références » (privées) et « Prix standards » (régional) ne sont jamais mélangés
  const [importing, setImporting] = useState(false);
  const [standards, setStandards] = useState(null);
  const load = useCallback(async () => {
    try { setData(await listDpgfHistoryLines()); setProjects((await listDpgfHistoryProjects()).projects || []); } catch (reason) { setError(errorText(reason)); }
  }, []);
  useEffect(() => { load(); listDpgfLineTypes().then((result) => setTypes(result.types || [])).catch(() => {}); }, [load]);
  const act = async (fn) => { setError(""); try { await fn(); await load(); } catch (reason) { setError(errorText(reason)); } };
  return <section className="price-library dpgf-history" data-dpgf-history>
    <header><h2>Historique de prix</h2>
      <p>Vos anciens DPGF et vos DPGF validés. Calepin propose un prix seulement à partir d’au moins 2 références validées comparables (médiane) ; vous décidez toujours du prix retenu.</p>
      <p className="price-message" data-dpgf-history-count>{data.eligible} référence{data.eligible > 1 ? "s" : ""} utilisable{data.eligible > 1 ? "s" : ""} pour proposer un prix · {data.total} au total</p></header>
    {error && <div className="err" role="alert" data-dpgf-history-error>{error}</div>}
    <DpgfImportReview canWrite={canWrite} />
    {canWrite && <div className="price-library-actions" data-dpgf-history-actions>
      <button type="button" className="primary" data-dpgf-add-project onClick={() => setMode(mode === "project" ? null : "project")}>Ajouter un ancien DPGF</button>
      <button type="button" className="secondary" data-dpgf-add-line onClick={() => setMode(mode === "line" ? null : "line")}>Ajouter une référence</button>
      <button type="button" className="secondary" data-dpgf-import-estimate onClick={() => { setImporting(!importing); setMode(null); }}>Importer une estimation</button>
      <button type="button" className="secondary" data-dpgf-import disabled title="La lecture automatique de PDF n’est pas disponible : importez un fichier Excel ou CSV">Importer un PDF — bientôt disponible</button>
    </div>}
    <nav className="dpgf-views" data-dpgf-views><button type="button" className={view === "mine" ? "active" : ""} data-dpgf-view="mine" onClick={() => setView("mine")}>Mes références</button>
      <button type="button" className={view === "agency" ? "active" : ""} data-dpgf-view="agency" onClick={() => setView("agency")}>Références agence</button>
      <button type="button" className={view === "standards" ? "active" : ""} data-dpgf-view="standards" onClick={async () => { setView("standards"); if (!standards) setStandards(await listStandardPrices().catch(() => ({ standards: [], empty: true, message: "Indisponible." }))); }}>Prix standards</button></nav>
    {importing && <EstimateImport types={types} onDone={async () => { await load(); }} onError={setError} />}
    {view === "standards" && <section data-dpgf-standards><h3>Prix standard Normandie — indicatif</h3>
      {standards?.empty !== false && <p className="muted" data-dpgf-standards-empty>{standards?.message || "Aucun prix standard publié pour l’instant : le seuil de publication n’est pas atteint. Vos propres références restent la base de vos prix."}</p>}
      {(standards?.standards || []).map((st) => <div key={st.id} data-dpgf-standard><b>{st.label}</b> · médiane {money.format(st.median_ht)} ({money.format(st.p25_ht)} – {money.format(st.p75_ht)}) · {st.sample_count} observations · {st.project_count} projets · confiance {st.status} · {st.disclaimer}</div>)}</section>}
    {view === "agency" && <AgencyReferences canWrite={canWrite} onError={setError} />}
    {view === "mine" && mode === "project" && <HistoryProjectForm types={types} onDone={async () => { setMode(null); await load(); }} onError={setError} />}
    {view === "mine" && mode === "line" && <HistoryLineForm types={types} projects={projects} onDone={async () => { setMode(null); await load(); }} onError={setError} />}
    {view === "mine" && (!data.lines.length ? <p className="muted" data-dpgf-history-empty>Aucune référence pour l’instant. Ajoutez un ancien DPGF : rien n’est utilisé avant que vous ne le validiez.</p>
      : <table className="devis-table" data-dpgf-history-table><thead><tr><th>Projet</th><th>Désignation</th><th>Unité</th><th className="num">Qté</th><th className="num">PU HT</th><th>Date du prix</th><th>Source</th><th>Statut</th><th /></tr></thead>
        <tbody>{data.lines.map((line) => <tr key={line.id} data-dpgf-history-line={line.id} data-validated={line.validated ? "1" : "0"}>
          <td>{line.project_name || "—"}</td><td>{line.designation}</td><td>{line.unit}</td><td className="num">{line.quantity ?? "—"}</td>
          <td className="num">{line.unitPriceHT === null || line.unitPriceHT === undefined ? <em>À renseigner</em> : <>{money.format(line.unitPriceHT)}{line.derived && <small data-dpgf-derived title="Calculé à partir du montant et de la quantité"> calculé</small>}</>}</td>
          <td>{line.priceDate || <em>date inconnue</em>}</td><td data-dpgf-line-source>{line.source}</td>
          <td data-dpgf-line-status>{line.documentaryOnly ? "Documentaire seulement" : line.validated ? (line.eligibleForProposals ? "Validée" : "Validée · non comptée") : "À valider"}</td>
          <td className="act">{canWrite && <>
            {line.validated && line.unitPriceHT > 0 && line.canonicalLineType && <button type="button" className="link-button" data-dpgf-use-reference title="Crée une référence agence à partir de ce prix ; l'observation reste inchangée" onClick={() => act(() => createAgencyReference({ item_key: line.canonicalLineType, granularity: "DPGF", unit: line.unit, unit_price_eur: line.unitPriceHT, economic_date: line.priceDate || null, confidence: "MEDIUM", note: `Depuis l’observation « ${line.designation} »` }))}>Utiliser comme référence agence</button>}
            {!line.validated && !line.documentaryOnly && <button type="button" className="link-button" data-dpgf-validate-line onClick={() => act(async () => {
              try { await validateDpgfHistoryLine(line.id); } catch (reason) { if (reason?.detail?.code === "DERIVED_PRICE_CONFIRMATION_REQUIRED" && window.confirm(`${reason.detail.message}`)) await validateDpgfHistoryLine(line.id, { confirmDerived: true }); else throw reason; }
            })}>Valider cette référence</button>}
            {!line.documentaryOnly && <button type="button" className="link-button" data-dpgf-reject-line onClick={() => act(() => rejectDpgfHistoryLine(line.id))}>Refuser comme référence de prix</button>}
            <button type="button" className="link-button" data-dpgf-archive-line onClick={() => act(() => archiveDpgfHistoryLine(line.id))}>Retirer</button></>}</td>
        </tr>)}</tbody></table>)}
  </section>;
}

function TypeSelect({ types, value, onChange, ...rest }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Type de ligne" {...rest}><option value="">Type de ligne…</option>{types.map((item) => <option key={item.code} value={item.code}>{item.designation}</option>)}</select>;
}

const emptyLine = () => ({ designation: "", canonicalLineType: "", unit: "m²", quantity: "", unitPriceHT: "", amountHT: "", priceDate: "" });
const clean = (line) => ({ ...line, quantity: line.quantity === "" ? null : Number(line.quantity), unitPriceHT: line.unitPriceHT === "" ? null : Number(line.unitPriceHT), amountHT: line.amountHT === "" ? null : Number(line.amountHT), priceDate: line.priceDate || null });

function HistoryProjectForm({ types, onDone, onError }) {
  const [project, setProject] = useState({ name: "", priceDate: "", operationNature: "", destination: "" });
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const set = (index, key) => (event) => setLines((current) => current.map((line, i) => (i === index ? { ...line, [key]: event.target.value } : line)));
  const save = async () => {
    setBusy(true); onError("");
    try {
      const created = await createDpgfHistoryProject({ ...project, priceDate: project.priceDate || null, operationNature: project.operationNature || null, destination: project.destination || null });
      for (const line of lines.filter((item) => item.designation.trim())) await createDpgfHistoryLine(clean(line), created.id);
      await onDone();
    } catch (reason) { onError(errorText(reason)); } finally { setBusy(false); }
  };
  return <div className="price-form" data-dpgf-project-form>
    <h3>Ancien DPGF</h3>
    <div className="price-form-grid">
      <input data-dpgf-project-name placeholder="Nom du projet" value={project.name} onChange={(e) => setProject({ ...project, name: e.target.value })} />
      <input type="date" data-dpgf-project-date aria-label="Date des prix" value={project.priceDate} onChange={(e) => setProject({ ...project, priceDate: e.target.value })} />
      <input placeholder="Nature de l’opération (facultatif)" value={project.operationNature} onChange={(e) => setProject({ ...project, operationNature: e.target.value })} />
      <input placeholder="Destination (facultatif)" value={project.destination} onChange={(e) => setProject({ ...project, destination: e.target.value })} />
    </div>
    {lines.map((line, index) => <div className="price-form-grid" key={index} data-dpgf-form-line>
      <input placeholder="Désignation d’origine" value={line.designation} onChange={set(index, "designation")} data-dpgf-line-designation />
      <TypeSelect types={types} value={line.canonicalLineType} onChange={(value) => setLines((current) => current.map((item, i) => (i === index ? { ...item, canonicalLineType: value } : item)))} data-dpgf-line-type />
      <select value={line.unit} onChange={set(index, "unit")} aria-label="Unité">{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
      <input type="number" min="0" placeholder="Quantité (facultatif)" value={line.quantity} onChange={set(index, "quantity")} />
      <input type="number" min="0" step="any" placeholder="PU HT" value={line.unitPriceHT} onChange={set(index, "unitPriceHT")} data-dpgf-line-price />
      <input type="number" min="0" step="any" placeholder="Montant HT (si pas de PU)" value={line.amountHT} onChange={set(index, "amountHT")} />
    </div>)}
    <div className="price-form-actions">
      <button type="button" className="secondary" data-dpgf-more-line onClick={() => setLines((current) => [...current, emptyLine()])}>Ajouter une ligne</button>
      <button type="button" className="primary" data-dpgf-save-project disabled={busy || project.name.trim().length < 2 || !lines.some((l) => l.designation.trim())} onClick={save}>Enregistrer (les lignes restent à valider)</button>
    </div>
    <p className="muted">Vous n’avez pas à reconstituer ce que votre ancien DPGF ne contient pas : quantité, date et montant sont facultatifs.</p>
  </div>;
}

function HistoryLineForm({ types, projects, onDone, onError }) {
  const [line, setLine] = useState({ ...emptyLine(), projectName: "" });
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setLine((current) => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    setBusy(true); onError("");
    try { await createDpgfHistoryLine(clean(line), projectId || null); await onDone(); } catch (reason) { onError(errorText(reason)); } finally { setBusy(false); }
  };
  return <div className="price-form" data-dpgf-line-form>
    <h3>Référence</h3>
    <div className="price-form-grid">
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Projet historique"><option value="">Sans projet (préciser le nom)</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {!projectId && <input placeholder="Nom du projet" value={line.projectName} onChange={set("projectName")} />}
      <input placeholder="Désignation d’origine" value={line.designation} onChange={set("designation")} data-dpgf-line-designation />
      <TypeSelect types={types} value={line.canonicalLineType} onChange={(value) => setLine((c) => ({ ...c, canonicalLineType: value }))} data-dpgf-line-type />
      <select value={line.unit} onChange={set("unit")} aria-label="Unité">{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
      <input type="number" min="0" placeholder="Quantité (facultatif)" value={line.quantity} onChange={set("quantity")} />
      <input type="number" min="0" step="any" placeholder="PU HT" value={line.unitPriceHT} onChange={set("unitPriceHT")} data-dpgf-line-price />
      <input type="date" aria-label="Date du prix" value={line.priceDate} onChange={set("priceDate")} />
      <input placeholder="Document source (facultatif)" value={line.fileName || ""} onChange={set("fileName")} />
    </div>
    <div className="price-form-actions"><button type="button" className="primary" data-dpgf-save-line disabled={busy || line.designation.trim().length < 2} onClick={save}>Enregistrer (la référence reste à valider)</button></div>
  </div>;
}


/** Import d'une estimation (XLSX / CSV) : fichier → lignes brutes + mapping PROPOSÉ → correction / validation sélective → résumé. Aucune observation n'existe avant validation ; le brut reste consultable. */
function EstimateImport({ types, onDone, onError }) {
  const [meta, setMeta] = useState({ project_name: "", economic_date: "", department: "", city: "", region: "Normandie" });
  const [batch, setBatch] = useState(null);
  const [choice, setChoice] = useState({}); // import_line_id -> { validate, stableKey }
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const upload = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true); onError(""); setSummary(null);
    try {
      const created = await createEstimateImport(file, meta);
      setBatch(created);
      setChoice(Object.fromEntries(created.lines.map((l) => [l.import_line_id, { validate: false, stableKey: l.canonical_stable_key || "" }])));
    } catch (reason) { onError(errorText(reason)); } finally { setBusy(false); }
  };
  const validate = async () => {
    setBusy(true); onError("");
    try {
      const decisions = batch.lines.map((l) => { const c = choice[l.import_line_id]; return c.validate ? { import_line_id: l.import_line_id, status: "VALIDATED", stableKey: c.stableKey || null } : { import_line_id: l.import_line_id, status: "PENDING" }; });
      const result = await validateEstimateImport(batch.id, decisions);
      setSummary(result);
      await onDone();
    } catch (reason) { onError(errorText(reason)); } finally { setBusy(false); }
  };
  return <div className="price-form" data-estimate-import>
    <h3>Importer une estimation</h3>
    <div className="price-form-grid">
      <input placeholder="Nom du projet (facultatif)" data-import-project value={meta.project_name} onChange={(e) => setMeta({ ...meta, project_name: e.target.value })} />
      <input type="month" aria-label="Date économique des prix" data-import-date value={meta.economic_date} onChange={(e) => setMeta({ ...meta, economic_date: e.target.value })} />
      <input placeholder="Département (ex. 14)" maxLength={3} value={meta.department} onChange={(e) => setMeta({ ...meta, department: e.target.value })} />
      <input placeholder="Ville (facultatif)" value={meta.city} onChange={(e) => setMeta({ ...meta, city: e.target.value })} />
      <label className="secondary" style={{ cursor: "pointer" }}>Choisir un fichier Excel ou CSV<input type="file" accept=".xlsx,.xlsm,.csv" data-import-file hidden onChange={upload} disabled={busy} /></label>
    </div>
    <p className="muted">Vos données restent privées : elles ne servent qu’à votre agence. Rien n’est utilisé avant que vous ne validiez chaque ligne.</p>
    {batch && !summary && <>
      {(Object.values(batch.detection || {})[0]?.ambiguous || []).length > 0 && <p className="err" role="alert" data-import-ambiguous>Colonnes ambiguës détectées ({Object.values(batch.detection)[0].ambiguous.join(", ")}) : vérifiez les valeurs avant de valider.</p>}
      <table className="devis-table" data-import-preview><thead><tr><th /><th>Ligne du fichier</th><th>Unité</th><th className="num">Qté</th><th className="num">PU HT</th><th className="num">Montant</th><th>Type de ligne proposé</th></tr></thead>
        <tbody>{batch.lines.map((l) => <tr key={l.import_line_id} data-import-line={l.import_line_id} data-match={l.match_method}>
          <td><input type="checkbox" aria-label="Valider cette ligne" data-import-validate checked={choice[l.import_line_id]?.validate || false} onChange={(e) => setChoice({ ...choice, [l.import_line_id]: { ...choice[l.import_line_id], validate: e.target.checked } })} /></td>
          <td>{l.raw_label}<small className="muted"> · {l.raw_sheet} · ligne {l.raw_row}{l.alert ? ` · ${l.alert}` : ""}</small></td><td>{l.raw_unit || "—"}</td><td className="num">{l.raw_quantity ?? "—"}</td><td className="num">{l.raw_unit_price_ht ?? "—"}</td><td className="num">{l.raw_amount_ht ?? "—"}</td>
          <td><select aria-label="Type de ligne" value={choice[l.import_line_id]?.stableKey || ""} onChange={(e) => setChoice({ ...choice, [l.import_line_id]: { ...choice[l.import_line_id], stableKey: e.target.value } })}><option value="">{l.match_method === "UNMATCHED" ? "Non reconnu — à choisir" : "—"}</option>{types.map((t) => <option key={t.code} value={t.code}>{t.designation}</option>)}</select></td></tr>)}</tbody></table>
      <div className="price-form-actions"><button type="button" className="primary" data-import-confirm disabled={busy || !Object.values(choice).some((c) => c.validate)} onClick={validate}>Valider les lignes cochées</button></div></>}
    {summary && <div className="price-message" data-import-summary role="status"><b>{summary.summary}</b>{summary.errors.length > 0 && <ul>{summary.errors.map((e) => <li key={e.import_line_id}>{e.import_line_id} : {e.message || e.code}</li>)}</ul>}</div>}
  </div>;
}


const CONFIDENCE_LABEL = { LOW: "Faible", MEDIUM: "Moyenne", HIGH: "Élevée" };
const emptyRef = () => ({ granularity: "DPGF", item_key: "", unit_price_eur: "", min_unit_price_eur: "", max_unit_price_eur: "", scope_signature: "", economic_date: "", confidence: "MEDIUM", note: "" });

/** Références d'agence (Shared Economics Core) : prix validés PAR VOTRE AGENCE, utilisés avant l'historique et les standards. Vos données restent isolées ; un standard publié n'est jamais modifié (surcharge séparée). */
function AgencyReferences({ canWrite, onError }) {
  const [refs, setRefs] = useState([]), [items, setItems] = useState([]), [standards, setStandards] = useState([]), [form, setForm] = useState(null), [archived, setArchived] = useState(false), [q, setQ] = useState(""), [edit, setEdit] = useState({}), [override, setOverride] = useState({});
  const load = useCallback(async () => {
    try {
      setRefs((await listAgencyReferences(archived ? { include_archived: "true" } : {})).references || []);
      setStandards((await listSharedStandards({ granularity: "FEASIBILITY" })).standards.filter((x) => x.source_type === "STANDARD_NORMANDIE"));
    } catch (reason) { onError(errorText(reason)); }
  }, [archived, onError]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (form) listEconomicItems({ granularity: form.granularity, ...(q.trim() ? { q: q.trim() } : {}) }).then((r) => setItems(r.items)).catch(() => {}); }, [form?.granularity, q, !!form]);
  const act = async (fn) => { onError(""); try { await fn(); await load(); } catch (reason) { onError(errorText(reason)); } };
  const item = items.find((i) => i.item_key === form?.item_key);
  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const save = () => act(async () => {
    await createAgencyReference({ item_key: form.item_key, granularity: form.granularity, unit: item.unit, unit_price_eur: num(form.unit_price_eur), min_unit_price_eur: num(form.min_unit_price_eur), max_unit_price_eur: num(form.max_unit_price_eur),
      scope_signature: form.scope_signature.trim() || null, economic_date: form.economic_date || null, confidence: form.confidence, note: form.note.trim() || null });
    setForm(null);
  });
  return <section data-dpgf-agency>
    <h3>Références agence</h3>
    <p className="muted">Un prix que votre agence a validé pour un poste, une unité et (si besoin) un périmètre précis. Il passe avant l’historique et les prix standards, mais n’est jamais appliqué sans votre clic « Utiliser ».</p>
    {canWrite && <div className="price-library-actions"><button type="button" className="primary" data-agency-add onClick={() => setForm(form ? null : emptyRef())}>Ajouter une référence agence</button>
      <label><input type="checkbox" checked={archived} data-agency-show-archived onChange={(e) => setArchived(e.target.checked)} /> Afficher les archivées</label></div>}
    {form && <div className="price-form" data-agency-form>
      <div className="price-form-grid">
        <select aria-label="Type de poste" value={form.granularity} data-agency-granularity onChange={(e) => setForm({ ...form, granularity: e.target.value, item_key: "" })}><option value="DPGF">Ligne de DPGF</option><option value="FEASIBILITY">Composant de faisabilité</option></select>
        <input type="search" placeholder="Chercher un poste…" data-agency-search value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Poste" value={form.item_key} data-agency-item onChange={(e) => setForm({ ...form, item_key: e.target.value })}><option value="">Poste du catalogue…</option>{items.map((i) => <option key={i.item_key} value={i.item_key}>{i.label} ({i.unit})</option>)}</select>
        <input type="number" min="0" step="any" placeholder={`PU HT${item ? ` (€/${item.unit})` : ""}`} data-agency-price value={form.unit_price_eur} onChange={(e) => setForm({ ...form, unit_price_eur: e.target.value })} />
        <input type="number" min="0" step="any" placeholder="Minimum (facultatif)" value={form.min_unit_price_eur} onChange={(e) => setForm({ ...form, min_unit_price_eur: e.target.value })} />
        <input type="number" min="0" step="any" placeholder="Maximum (facultatif)" value={form.max_unit_price_eur} onChange={(e) => setForm({ ...form, max_unit_price_eur: e.target.value })} />
        <input placeholder="Périmètre (ex. 98/48|EI60) — facultatif" data-agency-scope value={form.scope_signature} onChange={(e) => setForm({ ...form, scope_signature: e.target.value })} />
        <input type="month" aria-label="Date du prix" value={form.economic_date} onChange={(e) => setForm({ ...form, economic_date: e.target.value })} />
        <select aria-label="Confiance" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })}>{Object.entries(CONFIDENCE_LABEL).map(([k, v]) => <option key={k} value={k}>Confiance {v.toLowerCase()}</option>)}</select>
        <input placeholder="Note (facultative)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
      <small className="muted">Une référence avec périmètre ne s’applique qu’aux lignes de même périmètre ; sans périmètre, elle ne s’applique qu’aux lignes sans périmètre.</small>
      <div className="price-form-actions"><button type="button" className="primary" data-agency-save disabled={!form.item_key || !(Number(form.unit_price_eur) > 0)} onClick={save}>Enregistrer</button></div></div>}
    {!refs.length ? <p className="muted" data-agency-empty>Aucune référence agence pour l’instant.</p>
      : <table className="devis-table" data-agency-table><thead><tr><th>Poste</th><th>Périmètre</th><th className="num">PU HT</th><th>Fourchette</th><th>Confiance</th><th>Date</th><th>Origine</th><th /></tr></thead>
        <tbody>{refs.map((r) => <tr key={r.agency_price_reference_id} data-agency-ref={r.agency_price_reference_id} data-status={r.status}>
          <td>{r.item_label || r.item_key} <small className="muted">{r.item_key} · {r.unit}</small></td><td>{r.scope_signature || <em>générique</em>}</td>
          <td className="num">{edit[r.agency_price_reference_id] !== undefined ? <input type="number" min="0" step="any" aria-label="Nouveau prix" data-agency-edit-price value={edit[r.agency_price_reference_id]} onChange={(e) => setEdit({ ...edit, [r.agency_price_reference_id]: e.target.value })} /> : money.format(r.unit_price_eur)}</td>
          <td>{r.min_unit_price_eur !== null && r.max_unit_price_eur !== null ? `${money.format(r.min_unit_price_eur)} – ${money.format(r.max_unit_price_eur)}` : "—"}</td><td>{CONFIDENCE_LABEL[r.confidence]}</td><td>{r.economic_date || "—"}</td>
          <td data-agency-origin>{r.source_type === "STANDARD_OVERRIDE" ? `Surcharge du standard ${r.based_on_standard_price_id}` : "Validée par l’agence"}{r.status === "ARCHIVED" && " · archivée"}</td>
          <td className="act">{canWrite && r.status === "ACTIVE" && <>
            {edit[r.agency_price_reference_id] === undefined ? <button type="button" className="link-button" data-agency-edit onClick={() => setEdit({ ...edit, [r.agency_price_reference_id]: r.unit_price_eur })}>Modifier le prix</button>
              : <button type="button" className="link-button" data-agency-edit-save onClick={() => act(async () => { await updateAgencyReference(r.agency_price_reference_id, { unit_price_eur: Number(edit[r.agency_price_reference_id]) }); const next = { ...edit }; delete next[r.agency_price_reference_id]; setEdit(next); })}>Enregistrer</button>}
            <button type="button" className="link-button" data-agency-archive onClick={() => act(() => archiveAgencyReference(r.agency_price_reference_id))}>Archiver</button></>}</td></tr>)}</tbody></table>}
    <h4>Prix standards de faisabilité (lecture seule)</h4>
    <p className="muted">Prix standard Normandie — indicatif. Vous ne pouvez pas les modifier ; vous pouvez créer votre propre prix qui les remplace pour votre agence.</p>
    {standards.map((st) => <div key={st.standard_price_id} data-agency-standard={st.standard_price_id}><b>{st.label}</b> · {st.unit_price_eur} €/{st.unit}{st.department ? ` · département ${st.department}` : ""} · confiance {CONFIDENCE_LABEL[st.confidence] || st.confidence}
      {canWrite && (override[st.standard_price_id] === undefined ? <button type="button" className="link-button" data-agency-override onClick={() => setOverride({ ...override, [st.standard_price_id]: st.unit_price_eur })}>Définir le prix de mon agence</button>
        : <><input type="number" min="0" step="any" aria-label="Prix de l’agence" data-agency-override-price value={override[st.standard_price_id]} onChange={(e) => setOverride({ ...override, [st.standard_price_id]: e.target.value })} />
          <button type="button" className="link-button" data-agency-override-save onClick={() => act(async () => { await overrideStandard({ standard_price_id: st.standard_price_id, unit_price_eur: Number(override[st.standard_price_id]) }); const next = { ...override }; delete next[st.standard_price_id]; setOverride(next); })}>Enregistrer</button></>)}</div>)}
  </section>;
}
