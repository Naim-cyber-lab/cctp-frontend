import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { apiFetch } from "../api/client";
import { ANALYSIS_STATUS } from "./ConsultationDpgf";
import { aggregateGlobal } from "../utils/analysisGlobal";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const euro = (value) => (value === null || value === undefined ? "—" : money.format(value));
const signedEuro = (value) => (value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${money.format(Math.abs(value))}`);
const percent = (value, digits = 1) => (value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits).replace(".", ",")} %`);
const RESERVATION_STATUS = { TO_CLARIFY: "À clarifier", ACCEPTED: "Acceptée", REFUSED: "Refusée", LIFTED: "Levée" };
const POINT_STATE = { OPEN: "À traiter", CLARIFYING: "En clarification", ANSWERED: "Réponse reçue" };
// Texte lisible directement sur la ligne : jamais une icône seule (« ∅ Q U ▲ ▼ ≈ »)
const FLAG_TEXT = { NOT_PRICED: "Non chiffré", QUANTITY_DISPUTE: "Qté modifiée", UNIT_DIFFERENT: "Unité différente", HIGH: "Au-dessus de l’estimation", LOW: "Sous l’estimation", ADDED_LINE: "Ligne ajoutée", ARITHMETIC: "Erreur de calcul" };
const FLAG_HELP = { NOT_PRICED: "L’entreprise n’a pas chiffré cette ligne : son total est partiel.", QUANTITY_DISPUTE: "L’entreprise conteste la quantité du DCE : la ligne n’est pas comparée comme une ligne standard.", UNIT_DIFFERENT: "L’entreprise a utilisé une autre unité : le prix n’est pas directement comparable.",
  HIGH: "Prix fortement supérieur à l’estimation du MOE.", LOW: "Prix fortement inférieur à l’estimation du MOE.", ADDED_LINE: "Ligne absente du DPGF, ajoutée par l’entreprise.", ARITHMETIC: "Le total déclaré par l’entreprise ne correspond pas à quantité × prix unitaire." };
const TYPE_ORDER = ["NOT_PRICED", "QUANTITY_DISPUTE", "UNIT_DIFFERENT", "ADDED_LINE", "ARITHMETIC", "ATYPICAL", "RESERVATION", "MISSING_DOCUMENT", "OPTION_UNPRICED", "UNCONFIRMED_LINE", "HIGH", "LOW"];

function useAnalysis(id, revision) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const load = useCallback(() => apiFetch(`/consultations/${id}/analysis`).then((value) => { setData(value); setError(""); }).catch((reason) => setError(reason.message)), [id]);
  useEffect(() => { load(); }, [load, revision]);
  return [data, error, load];
}

const Loading = ({ error }) => <div className="quotes-loading">{error || <><LoaderCircle className="spin" /> Chargement…</>}</div>;

/** Page « Analyse » : décision d'abord, détail ensuite — synthèse des offres, éléments différenciants, principaux écarts, comparatif ligne par ligne, points à traiter, variantes et réserves, recommandation MOE. */
export function Analysis({ data, id, revision, run, goTo }) {
  const [a, error, load] = useAnalysis(id, revision);
  const [clar, setClar] = useState(null);
  const [view, setView] = useState("global");
  if (!a) return <Loading error={error} />;
  const decide = (company, lot, kind, itemId, status) => run(async () => { await apiFetch(`/consultations/${id}/decisions`, { method: "PUT", body: JSON.stringify({ companyId: company.companyId, lotId: lot.lotId, kind, itemId, status }) }); load(); });
  const sendClar = () => run(async () => { await apiFetch(`/consultations/${id}/clarifications`, { method: "POST", body: JSON.stringify(clar) }); setClar(null); });
  const multi = a.lots.length > 1;
  const current = multi && view !== "global" ? a.lots.filter((lot) => lot.lotId === view) : multi ? [] : a.lots;
  return <section data-ops-panel="compare" data-ops-analysis-page>
    {multi && <div className="segmented analysis-views" role="group" aria-label="Vue de l’analyse" data-analysis-views>
      <button type="button" className={view === "global" ? "active" : ""} aria-pressed={view === "global"} data-analysis-view="global" onClick={() => setView("global")}>Vue globale</button>
      {a.lots.map((lot) => <button key={lot.lotId} type="button" className={view === lot.lotId ? "active" : ""} aria-pressed={view === lot.lotId} data-analysis-view={lot.lotId} onClick={() => setView(lot.lotId)}>Lot {lot.lotId}</button>)}</div>}
    {multi && view === "global" && <GlobalAnalysis lots={a.lots} onOpen={setView} />}
    {current.map((lot) => <LotAnalysis key={lot.lotId} lot={lot} a={a} id={id} data={data} revision={revision} run={run} reload={load} decide={decide} onAsk={setClar} goTo={goTo} />)}
    {clar && <div className="consult-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setClar(null)}><div className="consult-modal" role="dialog" aria-modal="true" data-ops-clar-modal>
      <h3>Demander une précision</h3>
      <textarea rows="4" value={clar.body} data-ops-clar-body onChange={(event) => setClar({ ...clar, body: event.target.value })} />
      <div className="consult-buttons"><button className="primary" data-ops-clar-send onClick={sendClar}>Envoyer à l'entreprise</button><button onClick={() => setClar(null)}>Annuler</button></div></div></div>}
  </section>;
}

const SECTIONS = [["synthesis", "1 · Synthèse"], ["points", "2 · Points à examiner"], ["lines", "3 · Comparatif détaillé"], ["recommendation", "Décision du MOE"]];   // trois niveaux, puis la décision (CONSULT-OFFER-ANALYSIS-UX-V3)
const scrollToSection = (lotId, key) => document.querySelector(`[data-ops-analysis="${lotId}"] [data-analysis-section="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });

// Action principale unique de la page, selon l'état de l'analyse.
function nextAction(lot, goTo) {
  if (!lot.companies.length) return { label: "Importer les offres", run: () => goTo?.("tracking") };
  const open = lot.companies.reduce((sum, company) => sum + company.unresolvedIssueCount, 0);
  if (open > 0) return { label: `Traiter les ${open} point${open > 1 ? "s" : ""} ouvert${open > 1 ? "s" : ""}`, run: () => { scrollToSection(lot.lotId, "points"); const button = document.querySelector(`[data-ops-analysis="${lot.lotId}"] [data-points-examine]`); if (button && /^Examiner/.test(button.innerText)) button.click(); } };
  if (lot.companies.some((company) => company.analysisStatus === "TO_ANALYZE")) return { label: "Examiner les écarts", run: () => scrollToSection(lot.lotId, lot.economicGaps.items.length ? "gaps" : "lines") };
  return { label: "Préparer la décision du MOE", run: () => scrollToSection(lot.lotId, "recommendation") };
}

function LotAnalysis({ lot, a, id, data, revision, run, reload, decide, onAsk, goTo }) {
  const received = lot.companies;
  const summary = lot.summary;
  const action = nextAction(lot, goTo);
  const important = lot.lines.length >= 8 || received.length >= 3;
  return <article className="consult-card analysis-lot" data-ops-analysis={lot.lotId}>
    <header className="analysis-head" data-analysis-header>
      <span className="eyebrow">ANALYSE DES OFFRES</span>
      <h3>Lot {lot.lotId} — {lot.title}</h3>
      {received.length > 0 && <p className="analysis-summary" data-analysis-summary>{summary.offersReceived} offre{summary.offersReceived > 1 ? "s" : ""} reçue{summary.offersReceived > 1 ? "s" : ""} · {summary.offersComplete} complète{summary.offersComplete > 1 ? "s" : ""} · <span className={summary.blockingPoints ? "portal-warn" : ""}>{summary.blockingPoints} point{summary.blockingPoints > 1 ? "s" : ""} bloquant{summary.blockingPoints > 1 ? "s" : ""}</span></p>}
      <button type="button" className="primary" data-analysis-cta onClick={action.run}>{action.label}</button>
      {important && received.length > 0 && <nav className="analysis-nav" aria-label="Sections de l’analyse" data-analysis-nav>{SECTIONS.map(([key, label]) => <button key={key} type="button" className="link-button" data-analysis-nav-item={key} onClick={() => scrollToSection(lot.lotId, key)}>{label}</button>)}</nav>}
    </header>
    {!received.length ? <p className="consult-hint">Aucune offre remise.</p> : <>
      <Synthesis lot={lot} />
      <Differentiators lot={lot} required={a.requiredDocuments || []} />
      <EconomicGaps lot={lot} />
      <AnalysisPoints lot={lot} id={id} revision={revision} companies={received} onAsk={onAsk} />
      <VariantsAndReservations lot={lot} decide={decide} />
      <LineComparison lot={lot} a={a} onAsk={onAsk} id={id} />
      <Recommendation lot={lot} id={id} run={run} reload={reload} data={data} />
    </>}
  </article>;
}

// --- vue globale (plusieurs lots) -----------------------------------------------------------------------------------------------------------
function GlobalAnalysis({ lots, onOpen }) {
  const g = useMemo(() => aggregateGlobal(lots), [lots]);
  if (!g.lotsAnswered) return <p className="consult-hint" data-analysis-global>Aucune offre remise pour le moment.</p>;
  return <article className="consult-card analysis-lot" data-analysis-global>
    <header className="analysis-head"><span className="eyebrow">ANALYSE DES OFFRES</span><h3>Vue globale · {g.lotsAnswered} lot{g.lotsAnswered > 1 ? "s" : ""} avec offres</h3></header>
    <div className="table-scroll"><table className="consult-table compact" data-global-table><thead><tr><th>Entreprise</th><th>Total analysé</th><th>Écart au moins-disant</th><th>Lots où elle est la moins chère</th><th>Lots couverts</th></tr></thead><tbody>
      {g.companies.map((c) => <tr key={c.companyId} data-global-row={c.company} className={c.isLowest ? "lowest" : ""}>
        <td><b>{c.company}</b>{c.isLowest && <span className="badge-lowest">Moins-disant{g.provisional ? " (provisoire)" : ""}</span>}</td>
        <td><b className="analysis-amount">{euro(c.total)}</b>{!c.comparable && <span className="badge-partial" title="Offre incomplète ou lots non couverts : total non comparable.">Total partiel</span>}</td>
        <td>{c.isLowest ? "Référence" : c.differenceToLowestAmount === null ? "—" : `${signedEuro(c.differenceToLowestAmount)} · ${percent(c.differenceToLowestPercent)}`}</td>
        <td>{c.lotsLowest}</td><td className={c.missingLots ? "portal-warn" : ""}>{c.lots} / {g.lotsAnswered}</td></tr>)}</tbody></table></div>
    {g.lotGaps.length > 0 && <div className="analysis-sub" data-global-gaps><h5>Principaux écarts par lot</h5>
      <ul>{g.lotGaps.map((lot) => <li key={lot.lotId}><button type="button" className="link-button" onClick={() => onOpen(lot.lotId)}>Lot {lot.lotId} · {lot.title}</button> <b>{euro(lot.finalGap)}</b> <small>{lot.lowestCompany ? `moins-disant : ${lot.lowestCompany}` : ""}</small></li>)}</ul></div>}
    <p className="consult-hint">Totaux = somme des montants analysés par lot. Une entreprise qui n’a pas répondu à tous les lots, ou dont une offre est incomplète, n’est jamais comparée comme si son total était complet.</p>
  </article>;
}

// Ce qui rend le montant analysé « non définitif » : calcul déterministe depuis les données structurées de l'offre.
const openReasons = (c) => {
  const reasons = [];
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const unknown = c.reservations.filter((r) => r.status !== "LIFTED" && (r.financialImpact === null || r.financialImpact === undefined)).length;
  if (unknown) reasons.push(`${plural(unknown, "réserve avec impact financier inconnu", "réserves avec impact financier inconnu")}`);
  if (c.unpricedCount) reasons.push(plural(c.unpricedCount, "poste non chiffré", "postes non chiffrés"));
  const options = c.options.filter((o) => o.required && !o.includedInBase && (o.amount === null || o.amount === undefined)).length;
  if (options) reasons.push(plural(options, "option obligatoire non chiffrée", "options obligatoires non chiffrées"));
  const variants = c.variants.filter((v) => v.status === "RETAINED" && (v.priceImpact === null || v.priceImpact === undefined)).length;
  if (variants) reasons.push(plural(variants, "variante retenue sans impact chiffré", "variantes retenues sans impact chiffré"));
  return reasons;
};

// --- 1 · tableau de synthèse entreprise ----------------------------------------------------------------------------------------------------
function Synthesis({ lot }) {
  const hasEstimate = Boolean(lot.summary.hasEstimate);
  const ordered = [...lot.companies].sort((x, y) => (x.analysisAmount ?? Infinity) - (y.analysisAmount ?? Infinity));
  const points = (c) => c.unresolvedIssueCount;
  return <section className="analysis-block" data-analysis-synthesis data-analysis-section="synthesis">
    <div className="table-scroll"><table className="consult-table compact analysis-synthesis" data-ops-synthesis><thead><tr>
      <th>Entreprise</th><th>Montant analysé</th><th>Écart au moins-disant</th>{hasEstimate && <th data-col-estimate>Écart estimatif</th>}<th>Complétude</th><th>Points à traiter</th></tr></thead><tbody>
      {ordered.map((c) => <tr key={c.companyId} data-ops-synthesis-row data-company={c.companyId} className={c.isLowest ? "lowest" : ""}>
        <td><b>{c.company}</b> <small>V{c.version}</small>{c.isLowest && <span className="badge-lowest" data-badge-lowest>Moins-disant</span>}</td>
        <td data-analysis-amount><b className="analysis-amount">{euro(c.analysisAmount)}</b>{openReasons(c).length > 0 && c.analysisAmount !== null && <span className="analysis-open" data-non-definitive>⚠ Non définitif<small data-financial-incomplete>Analyse financière incomplète</small>{openReasons(c).map((reason) => <small key={reason} data-non-definitive-reason>{reason}</small>)}</span>}
          {!c.complete && c.analysisAmount !== null && <span className="badge-partial" data-badge-partial title="Une partie des postes n’est pas chiffrée : ce montant n’est pas comparable à une offre complète.">Montant partiel</span>}
          {(c.retainedVariantsAmount || c.selectedOptionsAmount) ? <small className="analysis-breakdown" data-analysis-breakdown>base {euro(c.baseOfAnalysis)}{c.retainedVariantsAmount ? ` · variante retenue ${signedEuro(c.retainedVariantsAmount)}` : ""}{c.selectedOptionsAmount ? ` · option retenue ${signedEuro(c.selectedOptionsAmount)}` : ""}</small> : null}</td>
        <td data-analysis-gap>{c.isLowest ? "Référence" : c.differenceToLowestAmount === null ? "—" : c.comparableToLowest ? `${signedEuro(c.differenceToLowestAmount)} · ${percent(c.differenceToLowestPercent)}` : <span className="analysis-gap-partial" data-gap-partial>{signedEuro(c.differenceToLowestAmount)} · {percent(c.differenceToLowestPercent)}<small> (offre incomplète : écart non significatif)</small></span>}</td>
        {hasEstimate && <td data-col-estimate>{c.differenceToEstimateAmount == null ? "—" : `${signedEuro(c.differenceToEstimateAmount)} · ${percent(c.differenceToEstimatePercent)}`}</td>}
        <td data-analysis-completeness>{c.complete ? <span className="ok-text">✓ {c.pricedLines}/{c.dceLines}</span> : <span className="portal-warn" title="Postes chiffrés sur postes du DPGF">⚠ {c.pricedLines}/{c.dceLines}</span>}</td>
        <td data-analysis-points>{points(c) ? <b className="portal-warn">{points(c)}</b> : <span className="ok-text">0</span>}</td></tr>)}
    </tbody></table></div>
    {hasEstimate && <EstimateComparison lot={lot} companies={ordered} />}
    {lot.summary.provisional && <p className="consult-hint" data-analysis-provisional>Aucune offre n’est complète : le moins-disant est provisoire.</p>}
    {!hasEstimate && !lot.summary.estimatesHidden && <p className="consult-hint analysis-no-estimate" data-no-estimate>Aucune estimation MOE de référence pour ce lot.</p>}
    <details className="analysis-details" data-analysis-details><summary>Détail du montant : base, options, variantes</summary>
      <ul className="consult-docs">{lot.companies.map((c) => <li key={c.companyId} data-analysis-detail-line><b>{c.company}</b> — montant de base {euro(c.baseOfAnalysis)}{c.selectedOptionsAmount ? ` · options retenues ${signedEuro(c.selectedOptionsAmount)}` : ""}{c.retainedVariantsAmount ? ` · variante retenue ${signedEuro(c.retainedVariantsAmount)}` : ""} → <b>montant analysé {euro(c.analysisAmount)}</b>
        {c.totalCompanyQuantities != null && <small> · montant selon les quantités de l’entreprise (information, non comparable) : {euro(c.totalCompanyQuantities)}</small>}</li>)}</ul>
      <p className="consult-hint">Le montant analysé part toujours du montant de base (quantités du DCE × prix unitaires) ; options et variantes y sont ajoutées seulement quand le MOE les a retenues, et le montant de base n’est jamais remplacé en silence.</p></details>
  </section>;
}

const PHASE = { DPGF: "estimation du DPGF (devis chiffré du projet)", MANUAL: "estimation saisie par le MOE" };
function EstimateComparison({ lot, companies }) {
  return <div className="analysis-estimate" data-analysis-estimate>
    <h5>ESTIMATION MOE <b>{euro(lot.estimateAmount)}</b></h5>
    {lot.estimatePhase && <small className="consult-hint" data-estimate-phase={lot.estimatePhase}>Référence : {PHASE[lot.estimatePhase] || lot.estimatePhase}. L’estimation très amont de faisabilité n’est jamais utilisée ici.</small>}
    <ul>{companies.map((c) => <li key={c.companyId} data-estimate-line={c.company}><span>{c.company}</span><b>{euro(c.analysisAmount)}</b><span>{signedEuro(c.differenceToEstimateAmount)}</span><span>{percent(c.differenceToEstimatePercent)}</span></li>)}</ul>
  </div>;
}

// --- 2 · éléments différenciants ------------------------------------------------------------------------------------------------------------
function Differentiators({ lot, required }) {
  const mark = { ok: "✓", warn: "⚠", info: "•" };
  const ordered = [...lot.companies].sort((x, y) => (x.analysisAmount ?? Infinity) - (y.analysisAmount ?? Infinity));
  const compared = lot.lines.filter((line) => line.comparableCount >= 2).length;
  return <section className="analysis-block" data-analysis-differentiators><h4>ÉLÉMENTS DIFFÉRENCIANTS</h4>
    <div className="analysis-diff-grid">{[...lot.companies].sort((x, y) => (x.analysisAmount ?? Infinity) - (y.analysisAmount ?? Infinity)).map((c) => <div key={c.companyId} className="analysis-diff" data-differentiators={c.company}>
      <h5>{c.company}</h5>
      <ul>{c.strengths.map((text) => <li key={text} className="tone-ok" data-differentiator-ok>✓ {text}</li>)}
        {c.differentiators.map((item, index) => <li key={`${item.type}-${index}`} className={`tone-${item.tone}`} data-differentiator={item.type}>{mark[item.tone]} {item.label}</li>)}</ul></div>)}</div>
    {required.length > 0 && <div className="analysis-sub" data-analysis-documents><h5>Documents</h5>
      <ul>{ordered.map((c) => <li key={c.companyId} data-documents-of={c.company}><b>{c.company}</b> {c.missingDocuments.length ? <span className="portal-warn">⚠ {c.missingDocuments.join(", ")} manquant{c.missingDocuments.length > 1 ? "s" : ""}</span> : <span className="ok-text">✓ Tous reçus</span>}</li>)}</ul></div>}
  </section>;
}

// --- 3 · principaux écarts économiques ----------------------------------------------------------------------------------------------------
const GAP_SORT = { amount: "Plus gros écart en €", percent: "Plus gros écart en %", line: "Poste", company: "Entreprise la moins chère" };
function EconomicGaps({ lot }) {
  const [sort, setSort] = useState("amount"), [all, setAll] = useState(false);
  const items = lot.economicGaps.items;
  const sorted = useMemo(() => [...items].sort((x, y) => (sort === "percent" ? Math.abs(y.spreadPercent ?? 0) - Math.abs(x.spreadPercent ?? 0) : sort === "line" ? x.designation.localeCompare(y.designation, "fr") : sort === "company" ? x.favorCompany.localeCompare(y.favorCompany, "fr") || y.spreadAmount - x.spreadAmount : y.spreadAmount - x.spreadAmount)), [items, sort]);
  if (!items.length) return null;
  const shown = all ? sorted : sorted.slice(0, 10);
  const byCompany = [...new Set(shown.map((item) => item.favorCompanyId))];
  return <section className="analysis-block" data-analysis-gaps data-analysis-section="gaps"><h4>PRINCIPAUX ÉCARTS</h4>
    <div className="consult-row"><label>Trier par<select data-gaps-sort value={sort} onChange={(event) => setSort(event.target.value)}>{Object.entries(GAP_SORT).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <small>{all || items.length <= 10 ? `${items.length} écart${items.length > 1 ? "s" : ""}` : `Top 10 sur ${items.length} écarts`}</small></div>
    {sort === "company" || sort === "amount" || sort === "percent" || sort === "line" ? byCompany.map((companyId) => <div key={companyId} className="analysis-gap-group" data-gaps-favor={companyId}>
      <h5>En faveur de {lot.companies.find((c) => c.companyId === companyId)?.company}</h5>
      <ul>{shown.filter((item) => item.favorCompanyId === companyId).map((item) => <li key={item.lineKey} data-gap-line={item.lineKey}><span className="gap-label">{item.designation}</span><b className="gap-amount">{signedEuro(-item.spreadAmount)}</b><small className="gap-percent">{percent(item.spreadPercent)}</small></li>)}</ul></div>) : null}
    {items.length > 10 && <button type="button" className="link-button" data-gaps-toggle onClick={() => setAll(!all)}>{all ? "Voir le top 10" : "Voir tous les écarts"}</button>}
    {lot.economicGaps.finalGap !== null && <p className="analysis-final-gap" data-gaps-final>Écart final entre les offres <b>{euro(lot.economicGaps.finalGap)}</b></p>}
    {lot.economicGaps.top5Share != null && <p className="consult-hint" data-gaps-concentration>Les 5 plus gros écarts expliquent {lot.economicGaps.top5Share} % de l’écart cumulé des postes comparés.</p>}
    {items.length >= 10 && lot.economicGaps.drivers.length > 0 && <div className="analysis-sub" data-gaps-drivers><h5>POSTES QUI EXPLIQUENT LE PLUS L’ÉCART</h5>
      <ol>{lot.economicGaps.drivers.map((driver) => <li key={driver.lineKey}><span className="gap-label">{driver.designation}</span><b className="gap-amount">{euro(driver.spreadAmount)}</b><small className="gap-percent">{driver.share != null ? `${driver.share} %` : ""}</small></li>)}</ol></div>}
  </section>;
}

// --- 4 · comparatif ligne par ligne -------------------------------------------------------------------------------------------------------
const MODES = [["amounts", "Montants"], ["unit", "Prix unitaires"], ["gaps", "Écarts"]];
const FILTERS = [["all", "Toutes les lignes"], ["significant", "Écarts significatifs"], ["anomalies", "Anomalies uniquement"], ["differences", "Différences uniquement"]];

function LineComparison({ lot, a, onAsk, id }) {
  const [mode, setMode] = useState("amounts"), [filter, setFilter] = useState("all"), [open, setOpen] = useState({}), [article, setArticle] = useState(null);
  const companies = [...lot.companies].sort((x, y) => (x.analysisAmount ?? Infinity) - (y.analysisAmount ?? Infinity));
  const hasEstimate = lot.lines.some((line) => line.estimateUnitPrice);
  const threshold = a.thresholds.significant ?? 10;
  const hasFlags = (line) => Object.values(line.offers).some((o) => o.flags.length || o.atypical || o.arithmetic);
  const visible = lot.lines.filter((line) => filter === "all" || (filter === "significant" && line.comparableCount >= 2 && !line.identical && Math.abs(line.spreadPercent ?? 0) >= threshold) || (filter === "anomalies" && hasFlags(line)) || (filter === "differences" && !line.identical));
  const cell = (line, company) => {
    const offer = line.offers[company.companyId] || { flags: [], comparable: false };
    const badges = [...offer.flags.map((flag) => ({ key: flag, text: FLAG_TEXT[flag], help: FLAG_HELP[flag] })), ...(offer.atypical ? [{ key: "ATYPICAL", text: `Prix atypique : ${percent(offer.atypical.deviation, 0)}`, help: offer.atypical.label }] : []),
      ...(offer.arithmetic ? [{ key: "ARITHMETIC", text: FLAG_TEXT.ARITHMETIC, help: `Total déclaré ${euro(offer.arithmetic.declaredTotal)} ; calcul ${euro(offer.arithmetic.expected)}` }] : [])];
    const reference = line.minAmount;
    const shown = mode === "unit" ? offer.unitPrice : mode === "gaps" ? (offer.comparable && reference !== null && !offer.best ? offer.amount - reference : null) : offer.amount;
    const text = mode === "gaps" && offer.best ? "Moins cher" : shown === null || shown === undefined ? "—" : mode === "gaps" ? signedEuro(shown) : euro(shown);
    const detailKey = `${line.key}|${company.companyId}`;
    return <td key={company.companyId} className={`${offer.best ? "best" : ""} ${badges.length ? "flagged" : ""}`} data-ops-cell data-best={offer.best ? "true" : undefined}>
      <span className="analysis-value">{text}</span>{mode === "gaps" && offer.comparable && !offer.best && line.minAmount ? <small> {percent((offer.amount - reference) / reference * 100)}</small> : null}
      {badges.map((badge) => <button key={badge.key} type="button" className={`flag-badge f-${badge.key}`} data-ops-flag={badge.key} title={badge.help} onClick={() => setOpen({ ...open, [detailKey]: !open[detailKey] })}>{badge.text}</button>)}
      {open[detailKey] && badges.length > 0 && <small className="flag-detail" data-flag-detail data-ops-dispute-note={offer.disputedQuantity != null ? "" : undefined}>{badges.map((badge) => badge.help).join(" ")}{offer.disputedQuantity != null ? ` ${company.company} estime la quantité à ${offer.disputedQuantity} ${line.unit}.${offer.justification ? ` Justification : ${offer.justification}` : ""}` : ""}</small>}</td>;
  };
  const gapCell = (line) => {
    const review = line.comparisonStatus === "NEEDS_REVIEW" ? <small className="portal-warn" data-line-needs-review> ⚠ Comparaison à vérifier</small> : null;
    if (line.comparableCount < 2) return <td data-line-gap>—{review}</td>;
    if (line.identical) return <td data-line-gap className="muted">Identique{review}</td>;
    if (companies.filter((c) => line.offers[c.companyId]?.comparable).length === 2 && line.cheapestCompanyIds.length === 1) {
      const name = lot.companies.find((c) => c.companyId === line.cheapestCompanyIds[0])?.company;
      return <td data-line-gap>{name} {signedEuro(-line.spreadAmount)}<small> / {percent(line.spreadPercent)}</small>{review}</td>;
    }
    const key = `${line.key}|gap`;
    return <td data-line-gap>{euro(line.minAmount)} → {euro(line.maxAmount)}<small> Écart : {euro(line.spreadAmount)}</small>{review}
      <button type="button" className="link-button" data-line-gap-detail onClick={() => setOpen({ ...open, [key]: !open[key] })}>{open[key] ? "Fermer" : "Détail"}</button>
      {open[key] && <ul className="flag-detail">{companies.map((c) => <li key={c.companyId}>{c.company} : {euro(line.offers[c.companyId]?.amount)}</li>)}</ul>}</td>;
  };
  return <section className="analysis-block" data-analysis-lines data-analysis-section="lines"><h4>Comparaison ligne par ligne</h4>
    <div className="consult-row analysis-toolbar">
      <span className="segmented" role="group" aria-label="Mode d’affichage" data-line-modes>{MODES.map(([key, label]) => <button key={key} type="button" className={mode === key ? "active" : ""} aria-pressed={mode === key} data-line-mode={key} onClick={() => setMode(key)}>{label}</button>)}</span>
      <label>Afficher<select data-line-filter value={filter} onChange={(event) => setFilter(event.target.value)}>{FILTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <small data-line-count>{visible.length} ligne{visible.length > 1 ? "s" : ""} sur {lot.lines.length}</small></div>
    {article && <section className="card" data-cctp-article role="dialog" aria-label="Exigence du CCTP" style={{ margin: "8px 0" }}>
      <p style={{ margin: 0 }}><b>{article.designation}</b> — <span data-cctp-article-message>{article.message}</span> <button type="button" className="link-button" data-cctp-article-close onClick={() => setArticle(null)}>Fermer</button></p>
      {article.article && <pre data-cctp-article-text style={{ whiteSpace: "pre-wrap", maxHeight: 280, overflow: "auto", fontFamily: "inherit" }}>{article.article.text}</pre>}
      {(article.requirements || []).length > 0 && <ul data-cctp-requirements>{article.requirements.map((r, i) => <li key={i}>{r.label}{r.answer ? <> : <mark>{r.answer}</mark></> : null}</li>)}</ul>}
      <small className="muted">Source : {article.source || "DCE publié"}{article.rule ? ` · règle ${article.rule}` : ""}</small></section>}
    <div className="portal-table-wrap"><table className="consult-table compact analysis-lines" data-ops-lines><thead><tr><th>Poste</th><th>Quantité DCE</th>{hasEstimate && <th data-col-estimate>Estimation MOE</th>}{companies.map((c) => <th key={c.companyId}>{c.company}</th>)}<th>Écart</th></tr></thead><tbody>
      {visible.map((line) => <tr key={line.key} data-ops-line={line.key} data-line-identical={line.identical ? "true" : undefined}><td>{line.designation}{id && <button type="button" className="link-button" data-line-cctp onClick={() => apiFetch(`/consultations/${id}/lines/${encodeURIComponent(line.key)}/cctp-article`).then(setArticle).catch((reason) => setArticle({ designation: line.designation, message: reason?.message || "Exigence indisponible", requirements: [] }))} style={{ display: "block", fontSize: 12 }}>Voir l’exigence CCTP</button>}</td><td>{line.quantity ?? "—"} {line.unit}</td>
        {hasEstimate && <td data-col-estimate>{line.estimateUnitPrice ? euro(line.estimateUnitPrice) : "—"}</td>}
        {companies.map((c) => cell(line, c))}{gapCell(line)}</tr>)}
      {!visible.length && <tr><td colSpan={companies.length + 3 + (hasEstimate ? 1 : 0)} className="consult-hint" data-line-empty>Aucune ligne ne correspond à ce filtre.</td></tr>}
    </tbody></table></div>
  </section>;
}

// --- 5 · points à traiter ----------------------------------------------------------------------------------------------------------------------
function AnalysisPoints({ lot, id, revision, companies, onAsk }) {
  const [result, setResult] = useState(null), [open, setOpen] = useState(false), [filters, setFilters] = useState({ company: "", type: "", status: "" });
  const rootRef = useRef(null);
  const query = new URLSearchParams(Object.entries({ lot: lot.lotId, ...filters }).filter(([, v]) => v)).toString();
  const load = useCallback(() => apiFetch(`/consultations/${id}/points?${query}`).then(setResult).catch(() => setResult({ points: [], types: [], total: 0 })), [id, query]);
  useEffect(() => { load(); }, [load, revision]);
  const everything = useMemo(() => (result ? result.types : []), [result]);
  if (!result) return null;
  const total = everything.reduce((sum, item) => sum + item.count, 0);
  const goTo = (point) => {
    if (!point.lineKey) return;
    const row = document.querySelector(`[data-ops-analysis="${lot.lotId}"] [data-ops-line="${CSS.escape(point.lineKey)}"]`);
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    row?.classList.add("line-highlight");
    setTimeout(() => row?.classList.remove("line-highlight"), 2200);
  };
  const set = (key) => (event) => setFilters({ ...filters, [key]: event.target.value });
  return <section className="analysis-block" data-ops-points data-analysis-section="points" ref={rootRef}>
    {total === 0 ? <p className="analysis-ok" data-points-empty>✓ Aucun point à traiter</p> : <>
      <p className="analysis-points-summary" data-points-summary><b className="portal-warn">⚠ {total} point{total > 1 ? "s" : ""} à traiter</b>
        <span>{[...everything].sort((x, y) => TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type)).map((item) => `${item.count} ${item.label.toLowerCase()}`).join(" · ")}</span>
        <button type="button" className="secondary" data-points-examine onClick={() => setOpen(!open)}>{open ? "Masquer les points" : `Examiner les ${total} point${total > 1 ? "s" : ""}`}</button></p>
      {open && <div data-points-detail>
        <div className="consult-row points-filters">
          <label>Entreprise<select value={filters.company} data-points-filter="company" onChange={set("company")}><option value="">Toutes</option>{companies.map((c) => <option key={c.companyId} value={c.companyId}>{c.company}</option>)}</select></label>
          <label>Type<select value={filters.type} data-points-filter="type" onChange={set("type")}><option value="">Tous</option>{everything.map((t) => <option key={t.type} value={t.type}>{t.label} ({t.count})</option>)}</select></label>
          <label>État<select value={filters.status} data-points-filter="status" onChange={set("status")}><option value="">Tous</option>{Object.entries(POINT_STATE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        {!result.points.length ? <p className="consult-hint">Aucun point avec ces filtres.</p> : <ul className="consult-docs">{result.points.map((p) => (
          <li key={p.id} data-point={p.type} data-point-status={p.status}><b>{p.company}</b> · <span className="chip">{p.typeLabel}</span>{" "}
            {p.lineKey ? <button type="button" className="link-button" data-point-goto onClick={() => goTo(p)}>{p.designation}</button> : p.designation} <small>— {p.detail}</small> <span className={`point-state s-${p.status}`}>{POINT_STATE[p.status]}</span>
            {onAsk && p.status === "OPEN" && <button data-point-ask onClick={() => onAsk({ companyId: p.companyId, lotId: p.lotId, lineKey: p.lineKey, body: `Merci de confirmer ou justifier : ${p.typeLabel.toLowerCase()} — ${p.designation}.` })}>Demander une précision</button>}</li>))}</ul>}</div>}
    </>}
  </section>;
}

// --- 6 · variantes et réserves ------------------------------------------------------------------------------------------------------------------
function VariantsAndReservations({ lot, decide }) {
  const any = lot.companies.some((c) => c.variants.length || c.reservations.length || c.options.length || c.quantityDisputes.length);
  return <section className="analysis-block" data-analysis-variants data-analysis-section="variants"><h4>VARIANTES ET RÉSERVES</h4>
    {!any && <p className="consult-hint">Aucune variante, réserve ni option pour ce lot.</p>}
    {lot.companies.map((c) => <div className="ops-company-detail" key={c.companyId} data-ops-company-detail={c.company}>
      <h5>{c.company}</h5>
      {!(c.variants.length || c.reservations.length || c.options.length || c.quantityDisputes.length) ? <p className="muted">Aucune</p> : <>
        {c.variants.length > 0 && <div data-ops-block="variants">{c.variants.map((v) => <div className="ops-item" key={v.id} data-ops-variant>
          <span><b>Variante</b> · {v.title}{v.description ? ` — ${v.description}` : ""}</span>
          <span data-variant-impact>Impact : {v.priceImpact != null ? signedEuro(v.priceImpact) : "non chiffré"}{v.delayImpact != null ? ` · délai ${v.delayImpact > 0 ? "+" : ""}${v.delayImpact} j` : ""}</span>
          {v.priceImpact != null && v.status !== "RETAINED" && <span className="analysis-variant-math" data-ops-total-if-variant>Montant si variante retenue (information) : <b>{euro((c.analysisAmount ?? 0) + v.priceImpact)}</b> <small>(base {euro(c.baseOfAnalysis)} {signedEuro(v.priceImpact)})</small></span>}
          <span className="ops-decide">{[["RETAINED", "Retenir"], ["NOT_RETAINED", "Ne pas retenir"]].map(([status, label]) => <button key={status} className={v.status === status ? "primary" : ""} data-ops-variant-decide={status} onClick={() => decide(c, lot, "VARIANT", v.id, v.status === status ? "" : status)}>{label}</button>)}</span></div>)}</div>}
        {c.reservations.length > 0 && <div data-ops-block="reservations">{c.reservations.map((r) => <div className="ops-item" key={r.id} data-ops-reservation>
          <span><b>Réserve</b> · {r.subject}{r.description ? ` — ${r.description}` : ""}</span>
          <span data-reservation-impact>Impact : {r.financialImpact != null ? signedEuro(r.financialImpact) : "non chiffré"}{r.delayImpact != null ? ` · délai ${r.delayImpact} j` : ""}</span>
          <label>Statut MOE <select value={r.status} data-ops-reservation-status onChange={(event) => decide(c, lot, "RESERVATION", r.id, event.target.value)}>{Object.entries(RESERVATION_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>)}</div>}
        {c.options.length > 0 && <div data-ops-block="options">{c.options.map((o) => <div className="ops-item" key={o.id} data-ops-option>
          <span><b>Option</b> · {o.label}{o.required ? " (obligatoire)" : ""}</span>
          <span>{o.includedInBase ? "Incluse dans la base" : o.amount != null ? euro(o.amount) : <span className="portal-warn">non chiffrée</span>}</span>
          {o.baseWithOption != null && <span data-ops-base-plus-option>Base + option retenue : <b>{euro(o.baseWithOption)}</b></span>}
          <span className="ops-decide">{[["SELECTED", "Retenir"], ["NOT_SELECTED", "Ne pas retenir"]].map(([status, label]) => <button key={status} className={o.status === status ? "primary" : ""} data-ops-option-decide={status} onClick={() => decide(c, lot, "OPTION", o.id, o.status === status ? "" : status)}>{label}</button>)}</span></div>)}</div>}
        {c.quantityDisputes.length > 0 && <div data-ops-block="quantities">{c.quantityDisputes.map((q) => <div className="ops-item" key={q.lineKey} data-ops-quantity-dispute><span><b>Quantité contestée</b> · {q.designation}</span><span>DCE : {q.quantity} · estimée par l’entreprise : <b>{q.disputedQuantity}</b></span><span>{q.justification}</span></div>)}</div>}
        {(c.retainedVariantsAmount || c.selectedOptionsAmount) ? <p className="analysis-math" data-analysis-math>Montant de base <b>{euro(c.baseOfAnalysis)}</b>{c.retainedVariantsAmount ? <> · Variante retenue <b>{signedEuro(c.retainedVariantsAmount)}</b></> : null}{c.selectedOptionsAmount ? <> · Option retenue <b>{signedEuro(c.selectedOptionsAmount)}</b></> : null} · Montant analysé <b>{euro(c.analysisAmount)}</b></p> : null}</>}</div>)}
  </section>;
}

// --- 7 · recommandation du MOE (jamais automatique) ----------------------------------------------------------------------------------------
// Faits calculés, jamais une phrase de recommandation : « Nous recommandons A » n'est écrit nulle part par Calepin.
function decisionFacts(lot) {
  const ordered = [...lot.companies].sort((x, y) => (x.analysisAmount ?? Infinity) - (y.analysisAmount ?? Infinity));
  const lowest = ordered.find((c) => c.isLowest);
  const compared = lot.lines.filter((line) => line.comparableCount >= 2).length;
  const facts = [];
  const next = ordered.find((c) => !c.isLowest && c.comparableToLowest && c.differenceToLowestAmount != null);
  if (lowest && next) facts.push(`${lowest.company} est moins-disante de ${euro(next.differenceToLowestAmount)}`);
  for (const c of ordered) {
    if (compared && !c.isLowest && c.cheapestLineCount > 0) facts.push(`${c.company} est moins chère sur ${c.cheapestLineCount} poste${c.cheapestLineCount > 1 ? "s" : ""}`);
    const reservations = c.reservations.filter((r) => r.status !== "LIFTED").length;
    facts.push(reservations ? `${c.company} présente ${reservations} réserve${reservations > 1 ? "s" : ""}` : `${c.company} ne présente aucune réserve`);
    for (const v of c.variants) facts.push(`${c.company} présente une variante de ${v.priceImpact != null ? signedEuro(v.priceImpact) : "montant non chiffré"}`);
    if (c.missingDocuments.length) facts.push(`${c.missingDocuments.length} document${c.missingDocuments.length > 1 ? "s manquent" : " manque"} chez ${c.company}`);
  }
  return facts;
}

function readiness(lot) {
  const live = lot.companies.filter((c) => c.analysisStatus !== "DISCARDED");
  const toAnalyze = live.filter((c) => c.analysisStatus === "TO_ANALYZE" || c.analysisStatus === "TO_CLARIFY").length;
  const unpriced = live.reduce((sum, c) => sum + c.unpricedCount, 0);
  const quantities = live.reduce((sum, c) => sum + c.quantityChanged, 0);
  const variants = live.reduce((sum, c) => sum + c.variants.filter((v) => !["RETAINED", "NOT_RETAINED"].includes(v.status)).length, 0);
  const reservations = live.reduce((sum, c) => sum + c.reservations.filter((r) => r.status === "TO_CLARIFY").length, 0);
  const documents = live.reduce((sum, c) => sum + c.missingDocuments.length, 0);
  const items = [
    ["Toutes les offres comparées", toAnalyze, `${toAnalyze} offre${toAnalyze > 1 ? "s" : ""} à analyser ou à clarifier`], ["Aucun poste non chiffré", unpriced, `${unpriced} poste${unpriced > 1 ? "s" : ""} non chiffré${unpriced > 1 ? "s" : ""}`],
    ["Quantités examinées", quantities, `${quantities} quantité${quantities > 1 ? "s" : ""} modifiée${quantities > 1 ? "s" : ""}`], ["Variantes traitées", variants, `${variants} variante${variants > 1 ? "s" : ""} sans décision`],
    ["Réserves traitées", reservations, `${reservations} réserve${reservations > 1 ? "s" : ""} à clarifier`], ["Documents reçus", documents, `${documents} document${documents > 1 ? "s" : ""} manquant${documents > 1 ? "s" : ""}`]];
  return { items, remaining: items.reduce((sum, item) => sum + item[1], 0) };
}

function Recommendation({ lot, id, run, reload, data }) {
  const [note, setNote] = useState(null);
  const ordered = [...lot.companies].sort((x, y) => (x.analysisAmount ?? Infinity) - (y.analysisAmount ?? Infinity));
  const recommended = ordered.find((c) => c.recommended);
  const text = note ?? recommended?.recommendationNote ?? "";
  const award = (data.awards || []).find((x) => x.lotId === lot.lotId);
  const ready = readiness(lot);
  const facts = decisionFacts(lot);
  const setStatus = (c, analysisStatus) => run(async () => { await apiFetch(`/consultations/${id}/offers/${c.companyId}/${lot.lotId}/review`, { method: "PUT", body: JSON.stringify({ analysisStatus }) }); reload(); });
  const recommend = (c) => run(async () => {
    await apiFetch(`/consultations/${id}/offers/${c.companyId}/${lot.lotId}/recommendation`, { method: "POST", body: JSON.stringify({ recommended: !c.recommended, note: c.recommended ? "" : text.trim() }) });
    setNote(null); reload();
  });
  return <section className="analysis-block offer-review" data-offer-review={lot.lotId} data-analysis-recommendation data-analysis-section="recommendation"><h4>DÉCISION DU MOE</h4>
    <div className={`analysis-ready ${ready.remaining ? "open" : "done"}`} data-analysis-ready>
      <b>{ready.remaining ? `⚠ ${ready.remaining} point${ready.remaining > 1 ? "s" : ""} restent à traiter` : "✓ Analyse prête"}</b>
      <ul>{ready.items.map(([label, count, detail]) => <li key={label} data-ready-item={count ? "open" : "ok"}>{count ? `⚠ ${detail}` : `✓ ${label}`}</li>)}</ul>
      <small className="consult-hint">Indication seulement : elle ne bloque jamais la recommandation.</small></div>
    {facts.length > 0 && <div className="analysis-facts" data-decision-facts><h5>Éléments pouvant éclairer votre décision</h5><ul>{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
      <small className="consult-hint">Faits calculés à partir des offres. La décision reste au MOE : Calepin ne recommande aucune entreprise.</small></div>}
    <div className="table-scroll"><table className="consult-table compact"><thead><tr><th>Entreprise</th><th>Montant analysé</th><th>Statut d’analyse</th><th>Recommandation</th></tr></thead><tbody>
      {ordered.map((c) => <tr key={c.companyId} data-offer-review-row={c.companyId} data-analysis-status={c.analysisStatus} className={c.analysisStatus === "DISCARDED" ? "discarded" : ""}>
        <td><b>{c.company}</b> <small>V{c.version}</small></td>
        <td data-offer-analyzed>{euro(c.analysisAmount)} <small>{c.isLowest ? "Moins-disante" : c.differenceToLowestPercent != null ? percent(c.differenceToLowestPercent) : ""}</small>{!c.complete && c.analysisAmount !== null ? <small className="portal-warn"> · partiel ({c.pricedLines}/{c.dceLines})</small> : null}</td>
        <td><select value={c.analysisStatus} data-offer-analysis-select onChange={(event) => setStatus(c, event.target.value)}>{Object.entries(ANALYSIS_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td>
        <td>{c.recommended && <span className="ok-text" data-offer-recommended>★ Recommandée par le MOE{c.recommendationNote ? ` — ${c.recommendationNote}` : ""} </span>}
          <button type="button" data-offer-recommend disabled={c.analysisStatus === "DISCARDED" && !c.recommended} onClick={() => recommend(c)}>{c.recommended ? "Retirer la recommandation" : `Recommander ${c.company}`}</button></td></tr>)}
    </tbody></table></div>
    <p className={lot.summary.blockingPoints ? "portal-warn" : "ok-text"} data-reco-blocking>{lot.summary.blockingPoints ? `⚠ ${lot.summary.blockingPoints} point${lot.summary.blockingPoints > 1 ? "s" : ""} bloquant${lot.summary.blockingPoints > 1 ? "s" : ""} restant${lot.summary.blockingPoints > 1 ? "s" : ""}.` : "Aucun point bloquant restant."}</p>
    <label className="reco-note">Motif de la décision (facultatif)<textarea rows={3} data-reco-note value={text} placeholder="Pourquoi ce choix ? (facultatif)" onChange={(event) => setNote(event.target.value)} /></label>
    <p className="consult-hint">La recommandation est un avis du maître d’œuvre : elle n’attribue pas le lot et n’est jamais déduite du prix.</p>
    <div className="analysis-decisions" data-analysis-decisions>
      <p data-moe-recommendation><b>Recommandation MOE</b> : {recommended ? recommended.company : "aucune pour le moment"}</p>
      {award && <p data-moa-decision><b>Décision d’attribution</b> : {award.company} retenue</p>}</div>
  </section>;
}
