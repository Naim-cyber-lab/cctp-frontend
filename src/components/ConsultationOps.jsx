import { offerStatusLabel, offerStatusDetail } from "../utils/statuses";
import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, Send } from "lucide-react";
import { apiFetch } from "../api/client";
import { OfferImport, OfferReview, PointsPanel, ReferencesFeed } from "./ConsultationDpgf";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const API = import.meta.env.VITE_API_URL || "/api";
const FLAG = { NOT_PRICED: "ligne non chiffrée", QUANTITY_DISPUTE: "quantité contestée par l'entreprise", UNIT_DIFFERENT: "unité différente", HIGH: "prix fortement supérieur à l'estimation", LOW: "prix fortement inférieur à l'estimation", ATYPICAL: "prix atypique dans cette consultation", ARITHMETIC: "erreur de calcul (total ≠ quantité × prix)", ADDED_LINE: "ligne ajoutée par l'entreprise" };
const FLAG_ICON = { NOT_PRICED: "∅", QUANTITY_DISPUTE: "Q", UNIT_DIFFERENT: "U", HIGH: "▲", LOW: "▼", ATYPICAL: "≈", ARITHMETIC: "=", ADDED_LINE: "+" };
const EXTRA_LABEL = { VARIANT: "Variante", VARIANTE: "Variante", OPTION: "Option", RESERVATION: "Réserve" };
const RESERVATION_STATUS = { TO_CLARIFY: "À clarifier", ACCEPTED: "Acceptée", REFUSED: "Refusée", LIFTED: "Levée" };
const AUDIT = {
  "consultation.created": "Consultation créée", "consultation.published": "DCE publié (indice A) et entreprises invitées", "consultation.settings": "Paramètres d'analyse modifiés", "consultation.status": "Statut modifié",
  "consultation.closed": "Consultation clôturée", "company.invitation": "Entreprise invitée", "company.reminder": "Relance envoyée", "company.revision": "Nouvel indice envoyé à l'entreprise", "company.opened": "Dossier ouvert",
  "company.started": "Réponse commencée", "company.declined": "Consultation déclinée", "dce.revision": "Indice du DCE publié", "offer.submitted": "Offre déposée", "offer.viewed": "Offre consultée par le MOE",
  "offer.document_viewed": "Document d'offre consulté", "question.asked": "Question reçue", "question.answered": "Réponse du MOE", "clarification.asked": "Précision demandée", "clarification.answered": "Précision fournie",
  "clarification.decision": "Décision notée", "award.decided": "Lot attribué", "planning.added": "Ajouté au planning", "deadline.approaching": "Date limite proche", "email.sent": "E-mail envoyé", "email.failed": "E-mail non envoyé",
};
// Quatre entrées au premier niveau : Suivi | Analyse (comparatif → attribution) | Échanges | Plus ▾ (planning, indices, notes, journal, export)
const ANALYSIS = [["compare", "Comparatif"], ["award", "Attribution"]];
const MORE = [["planning", "Planning"], ["revisions", "Indices"], ["notes", "Notes"], ["audit", "Journal"], ["export", "Export"]];

async function download(path, name) {
  const response = await fetch(`${API}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error("Téléchargement impossible");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

export function ConsultationOps({ data, id, project, run, setLinks, onError, tab: forcedTab }) {
  const [tab, setTab] = useState(forcedTab || "tracking");
  const [revision, setRevision] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const inAnalysis = ["compare", "award"].includes(tab);
  const inMore = MORE.some(([key]) => key === tab);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => { if (!event.target.closest(".ops-more")) setMoreOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [moreOpen]);
  const bump = () => setRevision((n) => n + 1);
  const shared = { data, id, run: async (fn) => { await run(fn); bump(); }, setLinks, onError, revision, goTo: setTab };
  return (
    <div data-consult-ops>
      <nav className="wizard-steps ops-primary-tabs" role="tablist" data-ops-primary>
        <li><button className={tab === "tracking" ? "active" : ""} data-ops-tab="tracking" onClick={() => setTab("tracking")}>Suivi</button></li>
        <li><button className={inAnalysis ? "active" : ""} data-ops-group="analysis" onClick={() => !inAnalysis && setTab("compare")}>Analyse</button></li>
        <li><button className={tab === "exchanges" ? "active" : ""} data-ops-tab="exchanges" onClick={() => setTab("exchanges")}>Échanges</button></li>
        <li className="ops-more"><button className={inMore ? "active" : ""} data-ops-more aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>{inMore ? MORE.find(([key]) => key === tab)[1] : "Plus"} ▾</button>
          {moreOpen && <div className="sel-bar-menu ops-more-menu" role="menu" data-ops-menu>{MORE.map(([key, label]) => <button key={key} type="button" role="menuitem" data-ops-tab={key} onClick={() => { setTab(key); setMoreOpen(false); }}>{label}</button>)}</div>}</li>
      </nav>
      {inAnalysis && <nav className="ops-secondary-tabs" data-ops-secondary aria-label="Analyse">{ANALYSIS.map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} data-ops-tab={key} onClick={() => setTab(key)}>{label}</button>)}</nav>}
      {tab === "tracking" && <Tracking {...shared} />}
      {tab === "compare" && <Compare {...shared} />}
      {tab === "exchanges" && <Exchanges {...shared} />}
      {tab === "award" && <Award {...shared} />}
      {tab === "planning" && <Planning {...shared} />}
      {tab === "revisions" && <Revisions {...shared} />}
      {tab === "notes" && <Notes {...shared} />}
      {tab === "audit" && <Audit {...shared} />}
      {tab === "export" && <Export {...shared} />}
    </div>
  );
}

function useLoad(path, deps) {
  const [value, setValue] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch(path).then((v) => { setValue(v); setError(""); }).catch((e) => setError(e.message)), [path]);
  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, error, load];
}

const Loading = ({ error }) => <div className="quotes-loading">{error ? error : <><LoaderCircle className="spin" /> Chargement…</>}</div>;

// --- CONSULT-12 : suivi ----------------------------------------------------------------------------------------------------------------
function Tracking({ id, revision, run, setLinks, goTo, onError }) {
  const [t, error, load] = useLoad(`/consultations/${id}/tracking`, [revision]);
  const [offer, setOffer] = useState(null);
  if (!t) return <Loading error={error} />;
  const remind = (companyIds) => run(async () => { const result = await apiFetch(`/consultations/${id}/remind`, { method: "POST", body: JSON.stringify({ companyIds }) }); setLinks(result.invitations); load(); });
  const open = async (companyId, lotId) => { try { setOffer({ ...(await apiFetch(`/consultations/${id}/offers/${companyId}/${lotId}`)), companyId }); } catch (e) { onError(e.message); } };
  const kpi = t.kpi;
  return (
    <section data-ops-panel="tracking">
      <div className="kpi-row" data-ops-kpi>
        <span><b>{kpi.invited}</b> invitée{kpi.invited > 1 ? "s" : ""}</span><span><b>{kpi.opened}</b> ont ouvert</span><span><b>{kpi.submitted}</b> réponse{kpi.submitted > 1 ? "s" : ""}</span>
        <span><b>{kpi.declined}</b> déclin{kpi.declined > 1 ? "s" : ""}</span><span><b>{kpi.pending}</b> en attente</span>
        {kpi.pending > 0 && ["PUBLISHED", "IN_PROGRESS"].includes(t.status) && <button data-ops-remind-all onClick={() => remind([])}><Send size={13} /> Relancer toutes les entreprises n'ayant pas répondu</button>}
      </div>
      {t.lots.map((lot) => (
        <article className="consult-card" key={lot.lotId} data-ops-lot={lot.lotId}>
          <h3>Lot {lot.lotId} · {lot.title}</h3>
          <p className="consult-hint">Estimation MOE : <b>{lot.estimateAmount ? money.format(lot.estimateAmount) : "—"}</b> (confidentielle)</p>
          <table className="consult-table compact"><thead><tr><th>Entreprise</th><th>État</th><th>Offre</th><th /></tr></thead><tbody>
            {lot.companies.map((c) => <tr key={c.companyId} data-ops-company={c.companyId}><td><b>{c.name}</b></td><td><span className={`company-status c-${c.status}`} data-offer-status={offerStatusLabel(c.status)} title={offerStatusDetail(c.status)}>{offerStatusLabel(c.status)}</span></td>
              <td>{c.offerTotal !== null ? <b>{money.format(c.offerTotal)}</b> : "—"}{c.version > 1 ? <small> V{c.version}</small> : null}</td>
              <td>{c.hasOffer && <button data-ops-open-offer onClick={() => open(c.companyId, lot.lotId)}>Ouvrir offre</button>}
                {["INVITED", "OPENED", "IN_PROGRESS"].includes(c.status) && ["PUBLISHED", "IN_PROGRESS"].includes(t.status) && <button data-ops-remind onClick={() => remind([c.companyId])}>Relancer</button>}
                {c.hasOffer && <button data-ops-compare onClick={() => goTo("compare")}>Comparer</button>}</td></tr>)}
          </tbody></table>
        </article>
      ))}
      {offer && <OfferModal offer={offer} id={id} onClose={() => setOffer(null)} />}
    </section>
  );
}

function OfferModal({ offer, id, onClose }) {
  const [index, setIndex] = useState(0);
  const [compare, setCompare] = useState(false);
  const v = offer.versions[index];
  const previous = offer.versions[index + 1];
  const delta = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : Math.round((a - b) * 100) / 100);
  return (
    <div className="consult-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="consult-modal wide" role="dialog" aria-modal="true" data-ops-offer-modal>
        <h3>{offer.company} · lot {offer.lotId}</h3>
        <div className="consult-buttons">{offer.versions.map((x, i) => <button key={x.version} className={i === index ? "primary" : ""} data-ops-version={x.version} onClick={() => setIndex(i)}>V{x.version}</button>)}</div>
        <p className="consult-hint">Déposée le {dateTime.format(new Date(v.submittedAt))} sur l'indice {v.revision} · total <b>{v.total !== null ? money.format(v.total) : "—"}</b>
          {previous && <button type="button" data-ops-compare-versions onClick={() => setCompare(!compare)} style={{ marginLeft: 12 }}>{compare ? "Masquer la comparaison" : `Comparer avec V${previous.version}`}</button>}</p>
        {compare && previous && <div data-ops-version-diff className="version-diff"><h4>V{previous.version} → V{v.version}</h4>
          <p className="consult-hint">Total : {previous.total !== null ? money.format(previous.total) : "—"} → <b>{v.total !== null ? money.format(v.total) : "—"}</b>{delta(v.total, previous.total) !== null && <span className={delta(v.total, previous.total) > 0 ? "delta up" : "delta down"}> {delta(v.total, previous.total) > 0 ? "+" : ""}{money.format(delta(v.total, previous.total))}</span>}</p>
          <ul className="consult-docs">{v.lines.map((l) => { const old = previous.lines.find((x) => x.key === l.key); const d = delta(l.unitPrice, old?.unitPrice); return d !== 0 && <li key={l.key} data-ops-line-change>{l.designation} : {old?.unitPrice ?? "—"} → <b>{l.unitPrice ?? "—"}</b>{d !== null && <span className={d > 0 ? "delta up" : "delta down"}> {d > 0 ? "+" : ""}{d}</span>}</li>; })}
            {v.extras.length !== previous.extras.length && <li>Variantes / réserves : {previous.extras.length} → {v.extras.length}</li>}
            {v.documents.length !== previous.documents.length && <li>Documents joints : {previous.documents.length} → {v.documents.length}</li>}</ul></div>}
        <table className="consult-table compact"><thead><tr><th>Désignation</th><th>Unité</th><th>Qté DCE</th><th>Qté estimée par l'entreprise</th><th>PU</th><th>Observations</th></tr></thead><tbody>
          {v.lines.map((l) => <tr key={l.key}><td>{l.designation}</td><td>{l.unit}</td><td>{l.quantity ?? "—"}</td><td>{l.disputedQuantity != null ? <span className="flagged" data-ops-modal-dispute>⚠ {l.disputedQuantity}<small> {l.justification}</small></span> : ""}</td><td>{l.unitPrice ?? "—"}</td><td>{l.comment}</td></tr>)}
        </tbody></table>
        {v.totalCompanyQuantities != null && <p className="consult-hint">Information — montant selon les quantités de l'entreprise : <b>{money.format(v.totalCompanyQuantities)}</b> (non utilisé pour la comparaison)</p>}
        {(v.variants || []).length > 0 && <ul className="consult-docs" data-ops-modal-variants>{v.variants.map((x) => <li key={x.id}><b>Variante</b> · {x.title} {x.priceImpact != null ? `· ${money.format(x.priceImpact)}` : ""} {x.delayImpact != null ? `· ${x.delayImpact} j` : ""} {x.description ? `· ${x.description}` : ""}</li>)}</ul>}
        {(v.reservations || []).length > 0 && <ul className="consult-docs" data-ops-modal-reservations>{v.reservations.map((x) => <li key={x.id}><b>Réserve</b> · {x.subject} {x.description ? `· ${x.description}` : ""}</li>)}</ul>}
        {v.extras.length > 0 && <ul className="consult-docs">{v.extras.map((e) => <li key={e.id}><b>{EXTRA_LABEL[e.kind]}</b> · {e.label} {e.amount !== null ? `· ${money.format(e.amount)}` : ""} {e.comment ? `· ${e.comment}` : ""}</li>)}</ul>}
        {v.documents.length > 0 && <ul className="consult-docs">{v.documents.map((d) => <li key={d.id}>{d.label ? <b>{d.label} · </b> : null}<a href="#" data-ops-offer-doc onClick={(e) => { e.preventDefault(); download(`/consultations/${id}/offers/${offer.companyId}/${offer.lotId}/documents/${d.id}`, d.filename).catch(() => {}); }}><Download size={12} /> {d.filename}</a></li>)}</ul>}
        <div className="consult-buttons"><button onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}

// --- CONSULT-13/14/15 : comparateur ligne par ligne + synthèse --------------------------------------------------------------------------
function Compare({ data, id, revision, run, onError }) {
  const [a, error, load] = useLoad(`/consultations/${id}/analysis`, [revision]);
  const [clar, setClar] = useState(null);
  const [high, setHigh] = useState(null);
  const [low, setLow] = useState(null);
  const [docs, setDocs] = useState(null);
  const [flags, setFlags] = useState({});
  const [importing, setImporting] = useState(null);
  if (!a) return <Loading error={error} />;
  const flag = (key) => (key in flags ? flags[key] : Boolean(data.settings?.[key] ?? (key === "autoReminders")));
  const saveSettings = () => run(async () => { await apiFetch(`/consultations/${id}/settings`, { method: "PUT", body: JSON.stringify({ thresholdHigh: Number(high ?? a.thresholds.high), thresholdLow: Number(low ?? a.thresholds.low), ...(docs !== null ? { requiredDocuments: docs.split(",").map((s) => s.trim()).filter(Boolean) } : {}), ...flags }) }); load(); });
  const decide = (company, lot, kind, itemId, status) => run(async () => { await apiFetch(`/consultations/${id}/decisions`, { method: "PUT", body: JSON.stringify({ companyId: company.companyId, lotId: lot.lotId, kind, itemId, status }) }); load(); });
  const sendClar = () => run(async () => { await apiFetch(`/consultations/${id}/clarifications`, { method: "POST", body: JSON.stringify(clar) }); setClar(null); });
  return (
    <section data-ops-panel="compare">
      <article className="consult-card" data-ops-settings>
        <h3>Seuils d'alerte et documents demandés</h3>
        <div className="consult-row">
          <label>Écart haut (%)<input type="number" data-ops-threshold-high value={high ?? a.thresholds.high} onChange={(e) => setHigh(e.target.value)} /></label>
          <label>Écart bas (%)<input type="number" data-ops-threshold-low value={low ?? a.thresholds.low} onChange={(e) => setLow(e.target.value)} /></label>
          <label>Documents obligatoires (séparés par des virgules)<input type="text" data-ops-required-docs value={docs ?? a.requiredDocuments.join(", ")} onChange={(e) => setDocs(e.target.value)} /></label>
          <button data-ops-save-settings onClick={saveSettings}>Enregistrer</button>
        </div>
        <div className="consult-switches" data-ops-switches>
          <label><input type="checkbox" data-ops-switch="autoReminders" checked={flag("autoReminders")} onChange={(e) => setFlags({ ...flags, autoReminders: e.target.checked })} /> Relances automatiques à J-3 et J-1</label>
          <label><input type="checkbox" data-ops-switch="deviceConfirmation" checked={flag("deviceConfirmation")} onChange={(e) => setFlags({ ...flags, deviceConfirmation: e.target.checked })} /> Confirmation par code e-mail sur un nouvel appareil (un lien transféré ne suffit plus)</label>
          <label><input type="checkbox" data-ops-switch="hideEstimatesFromReaders" checked={flag("hideEstimatesFromReaders")} onChange={(e) => setFlags({ ...flags, hideEstimatesFromReaders: e.target.checked })} /> Estimation réservée : les relecteurs en lecture seule ne la voient pas</label>
        </div>
      </article>
      <PointsPanel id={id} revision={revision} lots={a.lots} companies={[...new Map(a.lots.flatMap((l) => l.companies).map((c) => [c.companyId, c])).values()]}
        onAsk={(p) => setClar({ companyId: p.companyId, lotId: p.lotId, lineKey: p.lineKey, body: `Merci de confirmer ou justifier : ${p.typeLabel.toLowerCase()} — ${p.designation}.` })} />
      {a.lots.map((lot) => (
        <article className="consult-card" key={lot.lotId} data-ops-analysis={lot.lotId}>
          <h3>Lot {lot.lotId} · {lot.title}</h3>
          {!lot.companies.length ? <p className="consult-hint">Aucune offre remise.</p> : <>
            <p className="consult-hint">Le montant comparé est toujours la base : quantités du DCE × prix unitaires. Options, variantes et réserves sont présentées à part et jamais ajoutées automatiquement.</p>
            <div className="table-scroll"><table className="consult-table compact" data-ops-synthesis><thead><tr><th>Entreprise</th><th>Base HT (qté DCE)</th><th>Écart / estimation</th><th>Options</th><th>Variantes</th><th>Réserves</th><th>Quantités</th><th>Non chiffrées</th><th>Documents manquants</th></tr></thead><tbody>
              <tr className="estimate-row"><td><b>Estimation MOE</b></td><td><b>{lot.estimateAmount ? money.format(lot.estimateAmount) : "—"}</b></td><td colSpan="7" /></tr>
              {[...lot.companies].sort((x, y) => (x.rank || 99) - (y.rank || 99)).map((c) => <tr key={c.companyId} data-ops-synthesis-row><td>{c.rank ? `${c.rank}. ` : ""}{c.company} <small>V{c.version}</small></td><td><b>{c.total !== null ? money.format(c.total) : "—"}</b></td>
                <td>{c.gap === null ? "—" : `${c.gap > 0 ? "+" : ""}${c.gap} %`}</td>
                <td data-ops-col="options">{c.options.length ? `${c.options.filter((o) => o.priced).length}/${c.options.length} chiffrée${c.options.length > 1 ? "s" : ""}` : "—"}</td>
                <td data-ops-col="variants">{c.variants.length ? <span className="portal-warn">{c.variants.length} variante{c.variants.length > 1 ? "s" : ""}</span> : "—"}</td>
                <td data-ops-col="reservations">{c.reservations.length ? <span className="portal-warn">⚠ {c.reservations.length} réserve{c.reservations.length > 1 ? "s" : ""}</span> : <span className="ok-text">✓ aucune réserve</span>}</td>
                <td data-ops-col="quantities">{c.quantityChanged ? <span className="portal-warn">⚠ {c.quantityChanged} quantité{c.quantityChanged > 1 ? "s" : ""} différente{c.quantityChanged > 1 ? "s" : ""}</span> : <span className="ok-text">✓ aucune quantité modifiée</span>}</td>
                <td>{c.missingLines || "—"}</td><td>{c.missingDocuments.join(", ") || "—"}</td></tr>)}
            </tbody></table></div>
            {lot.companies.map((c) => (c.options.length || c.variants.length || c.reservations.length || c.quantityDisputes.length) ? <div className="ops-company-detail" key={c.companyId} data-ops-company-detail={c.company}>
              <h4>{c.company} <small>· base {c.total !== null ? money.format(c.total) : "—"}</small></h4>
              {c.options.length > 0 && <div data-ops-block="options"><h5>Options demandées</h5>{c.options.map((o) => <div className="ops-item" key={o.id} data-ops-option>
                <span><b>{o.label}</b> {o.required && <small>(obligatoire)</small>}</span>
                <span>{o.includedInBase ? "Inclus dans la base" : o.amount != null ? money.format(o.amount) : <span className="portal-warn">non chiffrée</span>}{o.comment ? ` · ${o.comment}` : ""}</span>
                {o.baseWithOption != null && <span data-ops-base-plus-option>Base + option sélectionnée : <b>{money.format(o.baseWithOption)}</b></span>}
                <span className="ops-decide">{[["SELECTED", "Retenir"], ["NOT_SELECTED", "Ne pas retenir"]].map(([st, label]) => <button key={st} className={o.status === st ? "primary" : ""} data-ops-option-decide={st} onClick={() => decide(c, lot, "OPTION", o.id, o.status === st ? "" : st)}>{label}</button>)}</span></div>)}</div>}
              {c.variants.length > 0 && <div data-ops-block="variants"><h5>Variantes proposées</h5>{c.variants.map((v) => <div className="ops-item" key={v.id} data-ops-variant>
                <span><b>{v.title}</b>{v.description ? ` — ${v.description}` : ""}</span>
                <span>Incidence : {v.priceImpact != null ? `${v.priceImpact > 0 ? "+" : ""}${money.format(v.priceImpact)}` : "non précisée"}{v.delayImpact != null ? ` · délai ${v.delayImpact > 0 ? "+" : ""}${v.delayImpact} j` : ""}</span>
                {v.totalIfRetained != null && <span data-ops-total-if-variant>Montant si variante retenue (information) : <b>{money.format(v.totalIfRetained)}</b></span>}
                <span className="ops-decide">{[["RETAINED", "Retenir"], ["NOT_RETAINED", "Ne pas retenir"]].map(([st, label]) => <button key={st} className={v.status === st ? "primary" : ""} data-ops-variant-decide={st} onClick={() => decide(c, lot, "VARIANT", v.id, v.status === st ? "" : st)}>{label}</button>)}</span></div>)}</div>}
              {c.reservations.length > 0 && <div data-ops-block="reservations"><h5>Réserves</h5>{c.reservations.map((r) => <div className="ops-item" key={r.id} data-ops-reservation>
                <span><b>{r.subject}</b>{r.description ? ` — ${r.description}` : ""}</span>
                <span>{r.financialImpact != null ? `Incidence : ${money.format(r.financialImpact)}` : "Sans incidence chiffrée"}{r.delayImpact != null ? ` · délai ${r.delayImpact} j` : ""}{r.severity ? ` · gravité ${{ LOW: "faible", MEDIUM: "moyenne", HIGH: "élevée" }[r.severity]}` : ""}</span>
                <label>Statut MOE <select value={r.status} data-ops-reservation-status onChange={(e) => decide(c, lot, "RESERVATION", r.id, e.target.value)}>{Object.entries(RESERVATION_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>)}</div>}
              {c.quantityDisputes.length > 0 && <div data-ops-block="quantities"><h5>Quantités contestées</h5>{c.quantityDisputes.map((q) => <div className="ops-item" key={q.lineKey} data-ops-quantity-dispute>
                <span><b>{q.designation}</b></span><span>DCE : {q.quantity} · estimée par l'entreprise : <b>{q.disputedQuantity}</b></span><span>Justification : {q.justification}</span></div>)}
                {c.totalCompanyQuantities != null && <p className="consult-hint">Montant selon les quantités de l'entreprise (information, non comparable) : {money.format(c.totalCompanyQuantities)}</p>}</div>}
            </div> : null)}
            <OfferReview lot={lot} id={id} run={run} reload={load} onImport={(companyId) => setImporting({ lot, companyId })} canAward={["CLOSED", "ANALYSIS", "AWARDED"].includes(data.status)} />
            <h4>Comparaison ligne par ligne</h4>
            <div className="portal-table-wrap"><table className="consult-table compact" data-ops-lines><thead><tr><th>Ligne</th><th>Qté</th><th>Estimation MOE</th>{lot.companies.map((c) => <th key={c.companyId}>{c.company}</th>)}</tr></thead><tbody>
              {lot.lines.map((line) => <tr key={line.key} data-ops-line={line.key}><td>{line.designation}</td><td>{line.quantity ?? "—"} {line.unit}</td><td>{line.estimateUnitPrice ? money.format(line.estimateUnitPrice) : "—"}</td>
                {lot.companies.map((c) => { const o = line.offers[c.companyId] || { flags: [] }; return <td key={c.companyId} className={o.flags.length ? "flagged" : ""} data-ops-cell>
                  {o.unitPrice === null || o.unitPrice === undefined ? "—" : money.format(o.unitPrice)}{o.gap !== null && o.gap !== undefined ? <small> {o.gap > 0 ? "+" : ""}{o.gap} %</small> : null}
                  {o.flags.map((f) => <span key={f} className={`flag f-${f}`} data-ops-flag={f} title={FLAG[f]}>{FLAG_ICON[f]}</span>)}
                  {o.atypical && <span className="flag f-ATYPICAL" data-ops-atypical title={o.atypical.label}>{FLAG_ICON.ATYPICAL}</span>}
                  {o.arithmetic && <span className="flag f-ARITHMETIC" data-ops-arithmetic title={`Total déclaré ${money.format(o.arithmetic.declaredTotal)} ; calcul ${money.format(o.arithmetic.expected)}`}>{FLAG_ICON.ARITHMETIC}</span>}
                  {o.disputedQuantity != null && <small className="portal-warn" data-ops-dispute-note title={o.justification}>⚠ {c.company} estime la quantité à {o.disputedQuantity} {line.unit}</small>}</td>; })}</tr>)}
            </tbody></table></div>
            <p className="consult-hint">{Object.entries(FLAG).map(([k, v]) => <span key={k} className="legend"><span className={`flag f-${k}`}>{FLAG_ICON[k]}</span> {v}</span>)}</p>
          </>}
          {lot.anomalies.length > 0 && <div data-ops-anomalies><h4>Anomalies ({lot.anomalies.length})</h4><ul className="consult-docs">
            {lot.anomalies.map((an, i) => <li key={i} data-ops-anomaly><b>{an.company}</b> · {an.designation} · {an.detail || an.label}{!an.detail && an.gap !== null ? ` (${an.gap > 0 ? "+" : ""}${an.gap} %)` : ""}
              <button data-ops-ask onClick={() => setClar({ companyId: an.companyId, lotId: an.lotId, lineKey: an.lineKey, body: an.type === "NOT_PRICED" ? "Merci de confirmer si cette prestation est comprise dans un autre prix ou oubliée." : `Merci de confirmer ou justifier : ${an.label}.` })}>Demander une précision</button></li>)}
          </ul></div>}
          {lot.mainGaps.length > 0 && <p className="consult-hint" data-ops-maingaps>Écarts principaux : {lot.mainGaps.map((g) => `${g.designation} (${g.company}, ${g.gap > 0 ? "+" : ""}${g.gap} %)`).join(" ; ")}</p>}
        </article>
      ))}
      {importing && <OfferImport id={id} data={data} lot={importing.lot} companyId={importing.companyId} run={run} onClose={() => setImporting(null)} onDone={() => { setImporting(null); load(); }} />}
      {clar && <div className="consult-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setClar(null)}><div className="consult-modal" role="dialog" aria-modal="true" data-ops-clar-modal>
        <h3>Demander une précision</h3>
        <textarea rows="4" value={clar.body} data-ops-clar-body onChange={(e) => setClar({ ...clar, body: e.target.value })} />
        <div className="consult-buttons"><button className="primary" data-ops-clar-send onClick={sendClar}>Envoyer à l'entreprise</button><button onClick={() => setClar(null)}>Annuler</button></div></div></div>}
    </section>
  );
}

// --- CONSULT-10/16 : échanges ----------------------------------------------------------------------------------------------------------
function Exchanges({ data, id, run }) {
  const [answers, setAnswers] = useState({});
  const [publish, setPublish] = useState({});
  const [notes, setNotes] = useState({});
  if (!data.questions.length) return <p className="consult-empty" data-ops-panel="exchanges">Aucune question ni demande de précision pour le moment.</p>;
  return (
    <section data-ops-panel="exchanges">
      {data.questions.map((q) => (
        <article className="consult-card" key={q.id} data-consult-question data-origin={q.origin}>
          <p><span className="consult-status">{q.origin === "MOE" ? "Précision demandée" : q.visibility === "PUBLIC_TO_ALL_BIDDERS" ? "Réponse publique" : "Question"}</span> <b>{q.company}</b>{q.lotId ? ` · lot ${q.lotId}` : ""}{q.lineKey ? ` · ligne ${q.lineKey.split("::").slice(-2).join(" ")}` : ""}</p>
          <p>{q.body}</p>
          {q.origin === "MOE" ? (q.answer ? <p className="answer">Réponse de l'entreprise : {q.answer}</p> : <small>En attente de la réponse de l'entreprise</small>)
            : q.answer ? <p className="answer">Votre réponse : {q.answer}</p> : (
              <div className="consult-row"><input value={answers[q.id] || ""} placeholder="Votre réponse…" onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                <label className="inline-check"><input type="checkbox" data-consult-publish-answer checked={!!publish[q.id]} onChange={(e) => setPublish({ ...publish, [q.id]: e.target.checked })} /> Publier à toutes les entreprises du lot</label>
                <button disabled={!(answers[q.id] || "").trim()} data-consult-answer onClick={() => run(async () => { await apiFetch(`/consultations/${id}/questions/${q.id}/answer`, { method: "POST", body: JSON.stringify({ answer: answers[q.id], publish: !!publish[q.id] }) }); })}>Répondre</button></div>)}
          <div className="consult-row"><input value={notes[q.id] ?? q.decision} placeholder="Décision / note interne (invisible de l'entreprise)" data-ops-decision onChange={(e) => setNotes({ ...notes, [q.id]: e.target.value })} />
            <button onClick={() => run(async () => { await apiFetch(`/consultations/${id}/questions/${q.id}/decision`, { method: "POST", body: JSON.stringify({ decision: notes[q.id] ?? q.decision }) }); })}>Noter</button></div>
        </article>
      ))}
    </section>
  );
}

// --- CONSULT-17/18/22 : attribution et planning ---------------------------------------------------------------------------------------------
function Award({ data, id, revision, run }) {
  const [c, error] = useLoad(`/consultations/${id}/comparison`, [revision]);
  const [planning, , loadPlanning] = useLoad(`/cctps/${data.cctpId}/planning`, [revision]);
  const [choice, setChoice] = useState({});
  if (!c) return <Loading error={error} />;
  const canAward = ["CLOSED", "ANALYSIS", "AWARDED"].includes(data.status);
  return (
    <section data-ops-panel="award">
      {!canAward && <p className="consult-hint">L'attribution se fait après la clôture de la remise des offres.</p>}
      {c.lots.map((lot) => {
        const awarded = data.awards.find((a) => a.lotId === lot.lotId);
        const item = planning?.items.find((p) => p.lotId === lot.lotId);
        const best = [...lot.offers].sort((x, y) => (x.rank || 99) - (y.rank || 99))[0];
        return (
          <article className="consult-card" key={lot.lotId} data-ops-award-lot={lot.lotId}>
            <h3>Lot {lot.lotId} · {lot.title}</h3>
            {awarded ? (
              <div data-ops-awarded><dl className="award-grid"><dt>Entreprise retenue</dt><dd data-ops-awarded-company>{awarded.company}{awarded.version ? ` — V${awarded.version}, indice du CCTP ${awarded.revision}` : ""}</dd><dt>Montant</dt><dd>{awarded.amountHt !== null ? `${money.format(awarded.amountHt)} HT` : "—"}</dd>
                <dt>Estimation MOE</dt><dd>{awarded.estimateAmount ? money.format(awarded.estimateAmount) : "—"}</dd><dt>Écart</dt><dd>{awarded.gap === null ? "—" : `${awarded.gap > 0 ? "+" : ""}${awarded.gap} %`}</dd></dl>
                <p className="consult-hint">Ce prix est devenu une référence économique : il alimente l'historique de prix et la bibliothèque de prix de l'agence.</p>
                <ReferencesFeed id={id} lotId={lot.lotId} run={run} />
                {!item ? <button data-ops-add-planning onClick={() => run(async () => { await apiFetch(`/consultations/${id}/awards/${lot.lotId}/planning`, { method: "POST" }); loadPlanning(); })}>Ajouter au planning</button> : <PlanningRow item={item} onSaved={loadPlanning} />}</div>
            ) : !lot.offers.length ? <p className="consult-hint">Aucune offre remise : il n'y a pas encore d'entreprise à retenir pour ce lot.</p> : (() => {
              const candidates = lot.candidates || [];
              const companyId = choice[lot.lotId]?.companyId ?? best?.companyId ?? "";
              const picked = candidates.find((x) => x.companyId === companyId);
              const versionId = choice[lot.lotId]?.versionId ?? picked?.versions?.[0]?.id ?? "";
              const setChoiceFor = (patch) => setChoice({ ...choice, [lot.lotId]: { companyId, versionId, notify: true, ...(choice[lot.lotId] || {}), ...patch } });
              const notify = choice[lot.lotId]?.notify ?? true;
              return (
                <div className="award-form" data-ops-award-form>
                  <div className="consult-row">
                    <label>Entreprise à retenir<select value={companyId} data-ops-award-select onChange={(e) => setChoiceFor({ companyId: e.target.value, versionId: candidates.find((x) => x.companyId === e.target.value)?.versions?.[0]?.id ?? "" })}>
                      {candidates.map((o) => <option key={o.companyId} value={o.companyId} disabled={!o.hasOffer}>{o.company}{o.hasOffer ? ` — ${o.versions[0].total !== null ? money.format(o.versions[0].total) : "—"}` : " — pas d'offre remise"}</option>)}</select></label>
                    <label>Version de l'offre retenue<select value={versionId} data-ops-award-version disabled={!picked?.hasOffer} onChange={(e) => setChoiceFor({ versionId: e.target.value })}>
                      {(picked?.versions || []).map((v) => <option key={v.id} value={v.id}>V{v.version} · indice du CCTP {v.revision}{v.total !== null ? ` · ${money.format(v.total)}` : ""}</option>)}</select></label>
                  </div>
                  <label className="inline-check"><input type="checkbox" data-ops-award-notify checked={notify} onChange={(e) => setChoiceFor({ notify: e.target.checked })} /> Prévenir l'entreprise retenue par e-mail</label>
                  {notify && <textarea rows={2} placeholder="Message complémentaire (facultatif)" data-ops-award-message value={choice[lot.lotId]?.message ?? ""} onChange={(e) => setChoiceFor({ message: e.target.value })} />}
                  <div className="consult-buttons"><button className="primary" disabled={!canAward || !picked?.hasOffer} data-ops-award onClick={() => run(async () => { await apiFetch(`/consultations/${id}/awards`, { method: "POST", body: JSON.stringify({ lotId: lot.lotId, companyId, versionId, notify, message: choice[lot.lotId]?.message ?? "" }) }); loadPlanning(); })}>Retenir cette entreprise</button></div>
                  {!canAward && <p className="consult-hint">Clôturez d'abord la remise des offres pour pouvoir attribuer.</p>}
                </div>
              );
            })()}
          </article>
        );
      })}
    </section>
  );
}

function PlanningRow({ item, onSaved }) {
  const [start, setStart] = useState(item.startDate || "");
  const [end, setEnd] = useState(item.endDate || "");
  const [msg, setMsg] = useState("");
  const save = async () => { try { await apiFetch(`/planning/${item.id}`, { method: "PUT", body: JSON.stringify({ startDate: start, endDate: end }) }); setMsg("Dates enregistrées"); onSaved(); } catch (e) { setMsg(e.message); } };
  return <div className="planning-row" data-ops-planning><b>Planning</b> · Lot {item.lotId} · {item.company} · {item.amountHt !== null ? money.format(item.amountHt) : "—"}
    <label>Début<input type="date" data-ops-plan-start value={start} onChange={(e) => setStart(e.target.value)} /></label><label>Fin<input type="date" data-ops-plan-end value={end} onChange={(e) => setEnd(e.target.value)} /></label>
    <button data-ops-plan-save onClick={save}>Enregistrer</button>{msg && <span>{msg}</span>}</div>;
}

// --- versions du DCE : modifications, nouvelle version, historique -------------------------------------------------------------------------------

/** Liste lisible des modifications entre deux indices : regroupée par lot puis par nature (texte, mise en forme, lignes, options, pièces jointes). */
const CATEGORY_ORDER = ["TEXT", "FORMAT", "LINES", "OPTIONS", "DOCUMENTS", "LOTS", "OTHER"];
function ChangeList({ changes, from, to }) {
  const lots = [...new Set(changes.map((c) => c.lotId || ""))];
  const counts = CATEGORY_ORDER.map((key) => [key, changes.filter((c) => c.category === key).length]).filter(([, n]) => n > 0);
  const labels = { TEXT: "texte", FORMAT: "mise en forme", LINES: "lignes", OPTIONS: "options", DOCUMENTS: "pièces jointes", LOTS: "lots", OTHER: "autre" };
  return <div data-ops-diff className="change-list">
    <p className="consult-hint" data-ops-diff-summary><b>{changes.length} modification{changes.length > 1 ? "s" : ""}</b> depuis l'indice {from}{to ? ` — elles seront comprises dans l'indice ${to}` : ""} : {counts.map(([key, n]) => `${n} ${labels[key]}`).join(" · ")}.</p>
    {lots.map((lot) => {
      const inLot = changes.filter((c) => (c.lotId || "") === lot);
      return <section key={lot || "general"} className="change-group" data-ops-change-group={lot || "general"}>
        <h5>{lot ? `Lot ${lot}${inLot[0]?.lotTitle ? ` · ${inLot[0].lotTitle}` : ""}` : "Dossier (pièces jointes, divers)"}</h5>
        <ul>{CATEGORY_ORDER.flatMap((key) => inLot.filter((c) => c.category === key)).map((ch, i) => <li key={i} data-ops-change={ch.type} className={`change change-${ch.category}`}>
          <span className="change-tag">{ch.categoryLabel}</span>
          {ch.type === "TEXT" ? <span><s className="change-before">{ch.before}</s> <b>→</b> <span className="change-after">{ch.after}</span></span> : ch.type === "TEXT_ADDED" ? <span>Ajout : <span className="change-after">{ch.after}</span></span> : ch.type === "TEXT_REMOVED" ? <span>Suppression : <s className="change-before">{ch.before}</s></span> : <span>{ch.label}</span>}
        </li>)}</ul>
      </section>;
    })}
  </div>;
}

function Revisions({ data, id, revision, run, setLinks }) {
  const [diff, error] = useLoad(`/consultations/${id}/diff`, [revision]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState(null);
  const [sentMsg, setSentMsg] = useState("");
  const next = data.nextRevisionLabel;
  const targets = data.companies.filter((c) => c.status !== "DECLINED" && c.invitedAt);
  const chosen = selected ?? targets.map((c) => c.companyId);
  const send = () => run(async () => { const result = await apiFetch(`/consultations/${id}/revisions`, { method: "POST", body: JSON.stringify({ companyIds: chosen }) }); setLinks(result.invitations); setSentMsg(`Indice ${result.revision} publié · ${result.invitations.length} entreprise${result.invitations.length > 1 ? "s" : ""} prévenue${result.invitations.length > 1 ? "s" : ""}.`); });
  const showDiff = async (r) => { try { const result = await apiFetch(`/consultations/${id}/diff?source=${encodeURIComponent(r.previousIndex)}&target=${encodeURIComponent(r.index)}`); setView({ title: `Indice ${r.previousIndex} → indice ${r.index}`, changes: result.changes, from: r.previousIndex, to: r.index }); } catch (e) { setView({ title: "Différences", changes: [], error: e.message }); } };
  return (
    <section data-ops-panel="revisions">
      {sentMsg && <div className="consult-banner" role="status" data-ops-revision-sent>{sentMsg}</div>}
      <article className="consult-card">
        <h3>Modifications depuis l'indice {data.currentRevision}</h3>
        {!diff ? <Loading error={error} /> : !diff.changes.length ? <p className="consult-hint" data-ops-nodiff>Le dossier actuellement publié est à jour : aucune modification depuis l'indice {diff.from}.</p> : <ChangeList changes={diff.changes} from={diff.from} to={next} />}
        {diff?.changes.length > 0 && <div data-ops-publish-area>
          <h4>Entreprises concernées</h4>
          <div>{targets.map((c) => <label key={c.companyId} className="inline-check"><input type="checkbox" checked={chosen.includes(c.companyId)} onChange={(e) => setSelected(e.target.checked ? [...chosen, c.companyId] : chosen.filter((x) => x !== c.companyId))} /> {c.name} (indice {c.revisionIndex})</label>)}</div>
          <p className="consult-hint">Les entreprises sauront que leur ancienne offre concernait l'indice {data.currentRevision} et que l'indice actuel est {next}. L'ancien dossier n'est jamais écrasé.</p>
          {!targets.length && <p className="consult-hint" data-ops-no-target>Aucune entreprise n'a encore reçu le dossier : l'indice {next} sera enregistré sans envoi.</p>}
          {targets.length > 0 && !chosen.length && <p className="consult-hint">Cochez au moins une entreprise à prévenir, ou publiez sans envoi.</p>}
          <button className="primary" data-ops-send-revision onClick={send}><Send size={14} /> {chosen.length || !targets.length ? `Publier l'indice ${next}` : `Publier l'indice ${next} sans prévenir d'entreprise`}</button></div>}
      </article>
      <article className="consult-card" data-consult-revisions><h3>Historique du DCE</h3>
        <ul className="consult-docs revision-history">{[...data.revisions].reverse().map((r) => (
          <li key={r.id} data-revision={r.index} className={r.active ? "active" : ""}>
            <div><b>Indice {r.index}</b>{r.active && <span className="consult-status s-AWARDED">Version active</span>}<small>{dateTime.format(new Date(r.createdAt))}{r.publishedBy ? ` · publié par ${r.publishedBy}` : ""}</small>
              <small>{r.changeSummary?.first ? "Première diffusion" : `${r.changeSummary?.count ?? 0} modification${(r.changeSummary?.count ?? 0) > 1 ? "s" : ""}`} · lots {r.lots.join(", ")} · empreinte {r.hash}{r.attachments ? ` · ${r.archivedFiles}/${r.attachments} pièce(s) jointe(s) archivée(s)` : ""}</small></div>
            <div className="consult-buttons"><button type="button" data-revision-open onClick={() => download(`/consultations/${id}/dce.pdf?revision=${r.index}`, `DCE-${r.index}.pdf`).catch(() => {})}><Download size={13} /> Voir le dossier</button>
              {r.previousIndex && <button type="button" data-revision-diff onClick={() => showDiff(r)}>Voir les différences</button>}</div>
          </li>))}</ul></article>
      {view && <div className="consult-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setView(null)}><div className="consult-modal" role="dialog" aria-modal="true" data-revision-diff-modal>
        <h3>{view.title}</h3>{view.error ? <p className="consult-hint">{view.error}</p> : !view.changes.length ? <p className="consult-hint">Aucune différence.</p> : <ChangeList changes={view.changes} from={view.from} to={view.to} />}
        <div className="consult-buttons"><button onClick={() => setView(null)}>Fermer</button></div></div></div>}
    </section>
  );
}

// --- CONSULT-20 : journal --------------------------------------------------------------------------------------------------------------------
function Audit({ id, revision }) {
  const [log, error] = useLoad(`/consultations/${id}/audit`, [revision]);
  if (!log) return <Loading error={error} />;
  return (
    <section className="consult-card" data-ops-panel="audit">
      <h3>Journal d'audit</h3>
      <p className="consult-hint">Qui a fait quoi, et quand. Le serveur d'e-mail ne confirme ni la remise ni l'ouverture : l'e-mail est tracé « envoyé » ou « non envoyé », l'ouverture du dossier est tracée par le portail.</p>
      <table className="consult-table compact"><thead><tr><th>Date</th><th>Événement</th><th>Acteur</th><th>Entreprise</th></tr></thead><tbody>
        {log.events.map((e) => <tr key={e.id} data-ops-event={e.kind}><td>{dateTime.format(new Date(e.at))}</td><td>{AUDIT[e.kind] || e.kind}{e.payload?.lotId ? ` · lot ${e.payload.lotId}` : ""}{e.payload?.version ? ` · V${e.payload.version}` : ""}{e.payload?.to ? ` · ${e.payload.to}` : ""}</td><td>{e.actor || (e.actorType === "SYSTEM" ? "Système" : "")}</td><td>{e.company}</td></tr>)}
      </tbody></table>
    </section>
  );
}

// --- CONSULT-21 : export ---------------------------------------------------------------------------------------------------------------------
function Export({ data, id, onError, run }) {
  const finished = ["AWARDED", "CANCELLED"].includes(data.status);
  const purged = Boolean(data.settings?.filesPurgedAt);
  return (
    <section className="consult-card" data-ops-panel="export">
      <h3>Rapport d'analyse des offres</h3>
      <p className="consult-hint">Projet, lots, entreprises consultées et répondantes, estimation MOE, tableau des offres, écarts majeurs, lignes manquantes, variantes, réserves, précisions demandées et attribution.</p>
      <div className="consult-buttons">
        <button data-ops-export-xlsx onClick={() => download(`/consultations/${id}/report.xlsx`, "rapport-analyse-offres.xlsx").catch((e) => onError(e.message))}><Download size={14} /> Exporter en Excel (XLSX)</button>
        <button data-ops-export-pdf onClick={() => download(`/consultations/${id}/report.pdf`, "rapport-analyse-offres.pdf").catch((e) => onError(e.message))}><Download size={14} /> Exporter en PDF</button>
        <button data-ops-export-docx onClick={() => download(`/consultations/${id}/report.docx`, "rapport-analyse-offres.docx").catch((e) => onError(e.message))}><Download size={14} /> Exporter en Word (DOCX)</button>
      </div>
      <h3 style={{ marginTop: 22 }}>Données et RGPD</h3>
      <p className="consult-hint">Une fois la consultation attribuée ou annulée, vous pouvez supprimer les fichiers stockés (documents joints aux offres, copies archivées du DCE). Les montants, l'historique et le journal sont conservés.</p>
      <div className="consult-buttons"><button className="danger" data-ops-purge disabled={!finished || purged} onClick={() => confirm("Supprimer définitivement les fichiers de cette consultation ?") && run(async () => { await apiFetch(`/consultations/${id}/purge-files`, { method: "POST" }); })}>{purged ? "Fichiers déjà purgés" : "Purger les fichiers"}</button>{!finished && <small>Disponible quand la consultation est attribuée ou annulée.</small>}</div>
    </section>
  );
}


// --- planning : vue Gantt et dépendances ---------------------------------------------------------------------------------------------------
const DAY = 864e5;
const fmtDay = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

function Planning({ data, revision }) {
  const [plan, error, load] = useLoad(`/cctps/${data.cctpId}/planning`, [revision]);
  if (!plan) return <Loading error={error} />;
  const dated = plan.items.filter((i) => i.startDate && i.endDate);
  const times = dated.flatMap((i) => [new Date(i.startDate).getTime(), new Date(i.endDate).getTime()]);
  const min = times.length ? Math.min(...times) - 3 * DAY : 0;
  const max = times.length ? Math.max(...times) + 3 * DAY : 0;
  const span = Math.max(max - min, 7 * DAY);
  const pct = (t) => `${((t - min) / span) * 100}%`;
  const months = [];
  if (times.length) for (let d = new Date(min); d.getTime() < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(new Date(d));
  const today = Date.now();
  return (
    <section data-ops-panel="planning">
      {!plan.items.length ? <p className="consult-empty">Aucun lot au planning : attribuez un lot puis choisissez « Ajouter au planning ».</p> : (
        <article className="consult-card gantt" data-ops-gantt>
          <h3>Planning chantier</h3>
          {times.length > 0 && <div className="gantt-scale" aria-hidden>{months.map((m, i) => <span key={i} style={{ left: pct(Math.max(m.getTime(), min)) }}>{fmtMonth.format(m)}</span>)}</div>}
          {plan.items.map((item) => <PlanningLine key={item.id} item={item} all={plan.items} min={min} span={span} today={today} showToday={times.length > 0 && today > min && today < max} pct={pct} onSaved={load} />)}
          {!times.length && <p className="consult-hint">Renseignez les dates de début et de fin pour voir la frise.</p>}
        </article>
      )}
    </section>
  );
}

function PlanningLine({ item, all, min, span, today, showToday, pct, onSaved }) {
  const [start, setStart] = useState(item.startDate || "");
  const [end, setEnd] = useState(item.endDate || "");
  const [pred, setPred] = useState(item.predecessorId || "");
  const [msg, setMsg] = useState("");
  const save = async () => { try { await apiFetch(`/planning/${item.id}`, { method: "PUT", body: JSON.stringify({ startDate: start, endDate: end, predecessorId: pred || null }) }); setMsg("Enregistré"); onSaved(); } catch (e) { setMsg(e.message); } };
  const remove = async () => { try { await apiFetch(`/planning/${item.id}`, { method: "DELETE" }); onSaved(); } catch (e) { setMsg(e.message); } };
  const barStart = item.startDate ? new Date(item.startDate).getTime() : null;
  const barEnd = item.endDate ? new Date(item.endDate).getTime() : null;
  const before = all.find((p) => p.id === item.predecessorId);
  return (
    <div className="gantt-line" data-ops-planning-line={item.lotId}>
      <div className="gantt-label"><b>Lot {item.lotId} · {item.lotTitle}</b><span>{item.company}{item.amountHt !== null ? ` · ${money.format(item.amountHt)}` : ""}</span>{before && <small>après lot {before.lotId}</small>}</div>
      <div className="gantt-track">{showToday && <i className="gantt-today" style={{ left: pct(today) }} title="Aujourd'hui" />}{barStart && barEnd && <span className="gantt-bar" data-ops-bar style={{ left: pct(barStart), width: `${Math.max(((barEnd - barStart) / span) * 100, 1.5)}%` }}>{fmtDay.format(new Date(barStart))} → {fmtDay.format(new Date(barEnd))}</span>}</div>
      <div className="gantt-edit">
        <label>Début<input type="date" data-ops-plan-start value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Fin<input type="date" data-ops-plan-end value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>Après<select data-ops-plan-pred value={pred} onChange={(e) => setPred(e.target.value)}><option value="">— aucun —</option>{all.filter((p) => p.id !== item.id).map((p) => <option key={p.id} value={p.id}>Lot {p.lotId}</option>)}</select></label>
        <button data-ops-plan-save onClick={save}>Enregistrer</button><button className="icon" title="Retirer du planning" onClick={remove}>Retirer</button>{msg && <small data-ops-plan-msg>{msg}</small>}
      </div>
    </div>
  );
}

// --- notes internes ------------------------------------------------------------------------------------------------------------------------
function Notes({ data, id, revision, run }) {
  const [list, error, load] = useLoad(`/consultations/${id}/notes`, [revision]);
  const [body, setBody] = useState("");
  const [companyId, setCompanyId] = useState("");
  if (!list) return <Loading error={error} />;
  const add = async () => { await apiFetch(`/consultations/${id}/notes`, { method: "POST", body: JSON.stringify({ body, companyId: companyId || null }) }); setBody(""); load(); };
  return (
    <section data-ops-panel="notes">
      <article className="consult-card">
        <h3>Notes internes</h3>
        <p className="consult-hint">Visibles uniquement par l'équipe projet : jamais par les entreprises.</p>
        {data.canWrite && <div className="consult-row"><select value={companyId} data-ops-note-company onChange={(e) => setCompanyId(e.target.value)}><option value="">Note générale</option>{data.companies.map((c) => <option key={c.companyId} value={c.companyId}>{c.name}</option>)}</select>
          <input value={body} data-ops-note-body placeholder="Votre note…" onChange={(e) => setBody(e.target.value)} /><button className="primary" disabled={!body.trim()} data-ops-note-add onClick={add}>Ajouter</button></div>}
        {!list.notes.length ? <p className="consult-empty">Aucune note.</p> : <ul className="consult-docs">{list.notes.map((n) => <li key={n.id} data-ops-note><span><b>{n.company || "Général"}</b> · {n.body}<small> — {n.author}, {dateTime.format(new Date(n.createdAt))}</small></span>{data.canWrite && <button className="icon" onClick={() => apiFetch(`/consultations/${id}/notes/${n.id}`, { method: "DELETE" }).then(load)}>Supprimer</button>}</li>)}</ul>}
      </article>
    </section>
  );
}
