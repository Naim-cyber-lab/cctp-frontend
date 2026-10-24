import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileUp, LoaderCircle, Plus, Send, Trash2 } from "lucide-react";
import { apiFetch } from "../api/client";
import "../consultations.css";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" });
const API = import.meta.env.VITE_API_URL || "/api";
// identifiant d'appareil : permet la « confirmation par code » (option du maître d'œuvre) ; conservé dans ce navigateur
const DEVICE = (() => {
  try {
    let value = localStorage.getItem("cctp_portal_device");
    if (!value) { value = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("cctp_portal_device", value); }
    return value;
  } catch { return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""); }
})();
const portalFetch = (path, options = {}) => apiFetch(path, { ...options, headers: { "X-Device": DEVICE, ...(options.headers || {}) } });
const withDevice = (url) => `${url}${url.includes("?") ? "&" : "?"}device=${DEVICE}`;
const CONFIDENCE = { HIGH: "Confiance élevée", MEDIUM: "Confiance moyenne", LOW: "Confiance faible", AMBIGUOUS: "Ambigu : à choisir", NONE: "Aucune correspondance" };
function remaining(deadline) {
  if (!deadline) return "";
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return "échéance dépassée";
  const hours = Math.floor(ms / 36e5);
  return hours >= 48 ? `dans ${Math.floor(hours / 24)} jours` : hours >= 1 ? `dans ${hours} h` : "dans moins d'une heure";
}

async function sendFile(path, file, extra = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(extra).forEach(([key, value]) => form.append(key, value));
  const response = await fetch(`${API}${path}`, { method: "POST", body: form, headers: { "X-Device": DEVICE } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || "Envoi impossible");
  return body;
}

/** Portail entreprise : accessible par lien personnel, sans compte. Ne contient que le DCE de l'entreprise, jamais l'estimation du MOE ni les autres entreprises. */
export function CompanyPortalPage({ token }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => portalFetch(`/consult/${token}`).then(setView).catch((e) => setError(e.message)), [token]);
  useEffect(() => { load(); }, [load]);
  if (error === "DEVICE_CONFIRMATION_REQUIRED" && !view) return <DeviceConfirm token={token} onDone={() => { setError(""); load(); }} />;
  if (error && !view) return <main className="portal" data-portal-error><h1>Lien indisponible</h1><p>{error}</p></main>;
  if (!view) return <main className="portal"><div className="quotes-loading"><LoaderCircle className="spin" /> Ouverture du dossier…</div></main>;
  const { consultation, company, lots } = view;
  const editable = consultation.open && company.status !== "DECLINED";
  const started = view.started || lots.some((lot) => lot.offer.lines.length || lot.offer.total !== null);
  return (
    <main className="portal" data-portal>
      <header>
        <span className="eyebrow">CONSULTATION · DOSSIER INDICE {consultation.revision}</span>
        <h1 data-portal-title>{consultation.name}</h1>
        <p className="portal-hello">Bonjour <b>{company.name}</b>,</p>
        <div className="portal-facts">
          <div><small>Projet</small><b>{consultation.project}</b></div>
          <div><small>Maître d'œuvre</small><b data-portal-moe>{view.moe || "—"}</b></div>
          <div data-portal-revision><small>Dossier consulté</small><b>indice {consultation.revision}</b><span>{lots.map((lot) => `Lot ${lot.lotId} — ${lot.title}`).join(" ; ")}</span></div>
          <div className={consultation.open ? "" : "fact-closed"}><small>Date limite</small><b>{consultation.deadline ? dateTime.format(new Date(consultation.deadline)) : "non précisée"}</b>
            {consultation.open ? <span>{remaining(consultation.deadline)}</span> : <em className="portal-closed" data-portal-closed>Consultation clôturée : plus aucune offre n'est acceptée</em>}</div>
        </div>
        <section className="consult-card" data-portal-documents>
          <h3>Documents</h3>
          <ul className="consult-docs">
            {(view.documents || []).map((doc) => <li key={doc.key}><a data-portal-document={doc.key} href={withDevice(doc.key === "cctp" ? `${API}/consult/${token}/dce.pdf` : doc.key === "dpgf" ? `${API}/consult/${token}/dpgf.xlsx` : `${API}/consult/${token}/documents/${doc.key}`)}><Download size={13} /> {doc.name}</a></li>)}
          </ul>
        </section>
        <div className="consult-buttons">
          <a className="button" data-portal-dce href={withDevice(`${API}/consult/${token}/dce.pdf`)}><Download size={15} /> Télécharger le DCE (PDF)</a>
          {editable && !company.declined && <button data-portal-decline onClick={() => confirm("Décliner cette consultation ? Le maître d'œuvre en sera informé.") && portalFetch(`/consult/${token}/decline`, { method: "POST" }).then(setView).catch((e) => setError(e.message))}>Je ne souhaite pas répondre</button>}
        </div>
      </header>
      {error && <div className="portal-error" role="alert" data-portal-error-banner>{error}</div>}
      {company.declined && (
        <section className="decline-card" data-portal-declined>
          <span className="decline-icon"><CheckCircle2 size={28} /></span>
          <div><h3>Consultation déclinée</h3>
            <p>Vous avez indiqué que vous ne répondrez pas à cette consultation. Le maître d'œuvre en a été informé.</p>
            {consultation.open && <button type="button" data-portal-undecline onClick={() => portalFetch(`/consult/${token}/undecline`, { method: "POST" }).then(setView).catch((e) => setError(e.message))}>J'ai changé d'avis : je souhaite répondre</button>}</div>
        </section>
      )}
      {company.declined ? null : editable && !started ? (
        <section className="consult-card" data-portal-offer-start>
          <h3>Votre offre</h3>
          <p className="consult-hint">Consultez le dossier puis commencez votre offre : vous pourrez l'enregistrer en brouillon et la remettre quand elle est prête.</p>
          <div className="consult-buttons"><button className="primary" data-portal-start onClick={() => { setError(""); portalFetch(`/consult/${token}/start`, { method: "POST" }).then(setView).catch((e) => setError(e.message)); }}>Commencer mon offre</button></div>
        </section>
      ) : lots.map((lot) => <LotOffer key={`${lot.lotId}-${consultation.revision}`} token={token} lot={lot} editable={editable} required={view.requiredDocuments || []} onChange={load} />)}
      {!company.declined && <Questions token={token} view={view} setView={setView} editable={consultation.open} />}
    </main>
  );
}

const blank = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
const SEVERITY = { "": "Non précisée", LOW: "Faible", MEDIUM: "Moyenne", HIGH: "Élevée" };
const newId = () => Math.random().toString(36).slice(2, 10);
const rowsFrom = (lot) => lot.lines.map((line) => {
  const saved = lot.offer.lines.find((item) => item.key === line.key) || {};
  return { ...line, unitPrice: saved.unitPrice ?? "", disputedQuantity: saved.disputedQuantity ?? "", justification: saved.justification ?? "", disputeOpen: saved.disputedQuantity != null, proposedUnit: saved.proposedUnit ?? "", comment: saved.comment ?? "" };
});

function LotOffer({ token, lot, editable, required, onChange }) {
  const [rows, setRows] = useState(() => rowsFrom(lot));
  const [extras] = useState(() => lot.offer.extras || []);
  const [options, setOptions] = useState(() => lot.offer.options || []);
  const [variants, setVariants] = useState(() => lot.offer.variants || []);
  const [reservations, setReservations] = useState(() => lot.offer.reservations || []);
  const [total, setTotal] = useState(lot.offer.total ?? "");
  const [offer, setOffer] = useState(lot.offer);
  const [msg, setMsg] = useState("");
  const [warnings, setWarnings] = useState(null);
  const [importState, setImportState] = useState(null);
  const [docLabel, setDocLabel] = useState("");
  const hasLines = rows.some((row) => row.unitPrice !== "");
  const disputedTotal = rows.some((row) => row.disputeOpen && row.disputedQuantity !== "") ? rows.reduce((sum, row) => sum + (row.unitPrice !== "" ? Number(row.unitPrice) * Number(row.disputeOpen && row.disputedQuantity !== "" ? row.disputedQuantity : row.quantity || 0) : 0), 0) : null;
  const computed = rows.reduce((sum, row) => sum + (row.unitPrice !== "" && row.quantity ? Number(row.unitPrice) * Number(row.quantity) : 0), 0);
  const body = () => JSON.stringify({
    lines: rows.map((row) => ({ key: row.key, unitPrice: row.unitPrice === "" ? null : Number(row.unitPrice), disputedQuantity: row.disputeOpen && row.disputedQuantity !== "" ? Number(row.disputedQuantity) : null, justification: row.disputeOpen ? row.justification : "", proposedUnit: row.proposedUnit, comment: row.comment })),
    extras, options: options.map((o) => ({ ...o, amount: blank(o.amount), unitPrice: blank(o.unitPrice) })),
    variants: variants.map((v) => ({ ...v, priceImpact: blank(v.priceImpact), delayImpact: blank(v.delayImpact) })),
    reservations: reservations.map((r) => ({ ...r, financialImpact: blank(r.financialImpact), delayImpact: blank(r.delayImpact) })), total: hasLines ? null : total === "" ? null : Number(total),
  });
  const save = async () => { const result = await portalFetch(`/consult/${token}/offers/${lot.lotId}`, { method: "PUT", body: body() }); setOffer(result); return result; };
  const saveDraft = async () => { setMsg(""); try { await save(); setMsg("Brouillon enregistré"); } catch (e) { setMsg(e.message); } };
  const submit = async (confirmed) => {
    setMsg("");
    try {
      await save();
      const result = await portalFetch(`/consult/${token}/offers/${lot.lotId}/submit`, { method: "POST", body: JSON.stringify({ confirm: confirmed }) });
      if (!result.submitted) { setWarnings(result.warnings); return; }
      setWarnings(null); setOffer(result); setMsg(`Offre remise (V${result.version})`); onChange();
    } catch (e) { setMsg(e.message); }
  };
  const upload = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try { setOffer(await sendFile(`/consult/${token}/offers/${lot.lotId}/documents`, file, { label: docLabel })); setDocLabel(""); setMsg("Document ajouté"); } catch (e) { setMsg(e.message); }
  };
  const removeDoc = async (id) => { try { setOffer(await portalFetch(`/consult/${token}/offers/${lot.lotId}/documents/${id}`, { method: "DELETE" })); } catch (e) { setMsg(e.message); } };
  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setMsg("");
    try {
      const result = await sendFile(`/consult/${token}/offers/${lot.lotId}/import`, file);
      setImportState(result.proposals.map((p) => ({ ...p, target: p.match?.key || "", accepted: false })));
    } catch (e) { setMsg(e.message); }
  };
  const applyImport = () => {
    const accepted = importState.filter((p) => p.accepted && p.target);
    setRows(rows.map((row) => {
      const hit = accepted.find((p) => p.target === row.key);
      if (!hit) return row;
      return { ...row, unitPrice: hit.source.unitPrice };
    }));
    setMsg(`${accepted.length} ligne${accepted.length > 1 ? "s" : ""} importée${accepted.length > 1 ? "s" : ""} : vérifiez puis enregistrez`);
    setImportState(null);
  };
  const submitted = offer.version > 0;
  const draftAfter = submitted && offer.status === "DRAFT";
  const uploadedLabels = (offer.documents || []).map((d) => String(d.label || "").toLowerCase());
  const setRow = (index, patch) => setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <section className="consult-card" data-portal-lot={lot.lotId}>
      <h3>Lot {lot.lotId} · {lot.title} {submitted && <span className="consult-status s-AWARDED" data-portal-submitted>Offre remise · V{offer.version}{draftAfter ? ` (modifications non déposées : V${offer.version + 1} en brouillon)` : ""}</span>}</h3>
      {lot.notice && <div className="consult-banner" data-portal-notice>{lot.notice}</div>}
      <div className="portal-block" data-portal-section="offer">
        <h4><span className="portal-step">1</span> Votre offre</h4>
        <p className="consult-hint">Chiffrez ici le DPGF du DCE : le prix unitaire que vous renseignez est « le prix proposé par votre entreprise ». Une variante ne se saisit jamais ici (voir 3).</p>
      {rows.length > 0 ? (
        <div className="portal-table-wrap"><table className="consult-table compact portal-lines"><thead><tr><th>Désignation</th><th>Unité</th><th>Qté DCE</th><th>Prix proposé par votre entreprise (HT)</th><th>Observations</th><th>Total (qté DCE)</th></tr></thead><tbody>
          {rows.map((row, i) => [<tr key={row.key} data-portal-line={row.key}>
            <td>{row.designation}{editable && !row.disputeOpen && row.quantity != null && <div><button type="button" className="link-button" data-portal-dispute-open onClick={() => setRow(i, { disputeOpen: true })}>Signaler une quantité différente</button></div>}</td>
            <td data-label="Unité">{row.unit}</td><td data-label="Qté DCE">{row.quantity ?? "à confirmer"}</td>
            <td data-label="Prix proposé par votre entreprise"><input type="number" min="0" step=".01" disabled={!editable} data-portal-price value={row.unitPrice} onChange={(e) => setRow(i, { unitPrice: e.target.value })} /></td>
            <td data-label="Observations"><input type="text" disabled={!editable} data-portal-comment value={row.comment} placeholder="Observation" onChange={(e) => setRow(i, { comment: e.target.value })} /></td>
            <td data-label="Total">{row.unitPrice !== "" && row.quantity ? money.format(row.unitPrice * row.quantity) : "—"}</td></tr>,
            row.disputeOpen && <tr key={`${row.key}-dispute`} className="portal-dispute-row" data-portal-dispute={row.key}><td colSpan={6}>
              <div className="portal-dispute"><b>Quantité différente signalée</b>
                <p className="consult-hint">Quantité du DCE : <b>{row.quantity} {row.unit}</b> — c'est elle qui sert au calcul de votre offre. Votre estimation est transmise au maître d'œuvre comme anomalie.</p>
                <div className="portal-dispute-fields">
                  <label>Quantité estimée par votre entreprise<input type="number" min="0" step=".01" disabled={!editable} data-portal-dispute-qty value={row.disputedQuantity} onChange={(e) => setRow(i, { disputedQuantity: e.target.value })} /></label>
                  <label>Justification (obligatoire)<textarea rows={2} disabled={!editable} data-portal-dispute-reason value={row.justification} onChange={(e) => setRow(i, { justification: e.target.value })} /></label>
                </div>
                {editable && <button type="button" className="link-button" data-portal-dispute-close onClick={() => setRow(i, { disputeOpen: false, disputedQuantity: "", justification: "" })}>Retirer ce signalement</button>}</div></td></tr>])}
        </tbody></table></div>
      ) : <label>Montant global HT de votre offre pour ce lot<input type="number" min="0" disabled={!editable} data-portal-total value={total} onChange={(e) => setTotal(e.target.value)} /></label>}
      {hasLines && <p className="consult-hint" data-portal-base-total>Total HT de votre offre (quantités du DCE) : <b>{money.format(computed)}</b>. Options, variantes et réserves ne sont jamais ajoutées à ce montant.</p>}
      {disputedTotal !== null && <p className="consult-hint" data-portal-company-total>Information — montant selon vos quantités estimées : <b>{money.format(disputedTotal)}</b> (non retenu pour la comparaison).</p>}
      </div>

      {(lot.options || []).length > 0 && <div className="portal-block" data-portal-section="options">
        <h4><span className="portal-step">2</span> Options demandées</h4>
        <p className="consult-hint">Le maître d'œuvre demande ces options : chiffrez-les séparément du prix de base.</p>
        {lot.options.map((option) => {
          const given = options.find((o) => o.optionId === option.id) || { optionId: option.id, amount: "", unitPrice: "", includedInBase: false, comment: "" };
          const setGiven = (patch) => setOptions(options.some((o) => o.optionId === option.id) ? options.map((o) => (o.optionId === option.id ? { ...o, ...patch } : o)) : [...options, { ...given, ...patch }]);
          const unitAmount = option.pricingMode === "UNIT" && given.unitPrice !== "" && given.unitPrice !== null ? Number(given.unitPrice) * option.quantity : null;
          return <div className="portal-option" key={option.id} data-portal-option={option.id}>
            <div><b>{option.label}</b> {option.required && <span className="consult-status">Chiffrage obligatoire</span>}{option.description && <p className="consult-hint">{option.description}</p>}</div>
            {option.pricingMode === "UNIT"
              ? <label>Prix unitaire HT ({option.quantity} {option.unit} demandés)<input type="number" step=".01" disabled={!editable} data-portal-option-unit-price value={given.unitPrice ?? ""} onChange={(e) => setGiven({ unitPrice: e.target.value })} /></label>
              : <label>Prix forfaitaire HT<input type="number" step=".01" disabled={!editable} data-portal-option-amount value={given.amount ?? ""} onChange={(e) => setGiven({ amount: e.target.value })} /></label>}
            {unitAmount !== null && <small data-portal-option-total>= {money.format(unitAmount)}</small>}
            <label className="check"><input type="checkbox" disabled={!editable} data-portal-option-included checked={!!given.includedInBase} onChange={(e) => setGiven({ includedInBase: e.target.checked })} /> Inclus dans mon offre de base</label>
            <label>Observation<input type="text" disabled={!editable} data-portal-option-comment value={given.comment || ""} onChange={(e) => setGiven({ comment: e.target.value })} /></label>
          </div>;
        })}
      </div>}

      <div className="portal-block" data-portal-section="variants">
        <h4><span className="portal-step">{(lot.options || []).length > 0 ? 3 : 2}</span> Variantes proposées</h4>
        <p className="consult-hint">Une variante est une alternative que vous proposez au DCE (autre matériau, autre mise en œuvre…). Elle reste hors de votre prix de base.</p>
        {variants.map((v, i) => <div className="portal-variant" key={v.id || i} data-portal-variant>
          <label>Titre de la variante<input type="text" disabled={!editable} data-portal-variant-title value={v.title} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /></label>
          <label>Description<textarea rows={2} disabled={!editable} data-portal-variant-desc value={v.description || ""} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></label>
          <label>Incidence sur le prix (+/− € HT)<input type="number" step=".01" disabled={!editable} data-portal-variant-price value={v.priceImpact ?? ""} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, priceImpact: e.target.value } : x)))} /></label>
          <label>Incidence sur le délai (jours)<input type="number" step="1" disabled={!editable} data-portal-variant-delay value={v.delayImpact ?? ""} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, delayImpact: e.target.value } : x)))} /></label>
          {(offer.documents || []).length > 0 && <fieldset className="portal-variant-docs"><legend>Documents techniques liés</legend>{offer.documents.map((d) => <label className="check" key={d.id}><input type="checkbox" disabled={!editable} checked={(v.technicalDocuments || []).includes(d.id)}
            onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, technicalDocuments: e.target.checked ? [...(x.technicalDocuments || []), d.id] : (x.technicalDocuments || []).filter((id) => id !== d.id) } : x)))} /> {d.label || d.filename}</label>)}</fieldset>}
          {editable && <button type="button" className="icon" aria-label="Supprimer la variante" onClick={() => setVariants(variants.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
        </div>)}
        {variants.length === 0 && <p className="consult-hint">Aucune variante proposée.</p>}
        {editable && <div className="consult-buttons"><button data-portal-add-variant onClick={() => setVariants([...variants, { id: newId(), title: "", description: "", priceImpact: "", delayImpact: "", technicalDocuments: [] }])}><Plus size={13} /> Proposer une variante</button></div>}
      </div>

      <div className="portal-block" data-portal-section="reservations">
        <h4><span className="portal-step">{(lot.options || []).length > 0 ? 4 : 3}</span> Réserves</h4>
        <p className="consult-hint">Une réserve est une condition ou un point d'attention sur votre offre. Le prix est facultatif.</p>
        {reservations.map((r, i) => <div className="portal-variant" key={r.id || i} data-portal-reservation>
          <label>Objet de la réserve<input type="text" disabled={!editable} data-portal-reservation-subject value={r.subject} onChange={(e) => setReservations(reservations.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} /></label>
          <label>Description<textarea rows={2} disabled={!editable} data-portal-reservation-desc value={r.description || ""} onChange={(e) => setReservations(reservations.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></label>
          <label>Incidence financière (€ HT, facultatif)<input type="number" step=".01" disabled={!editable} data-portal-reservation-price value={r.financialImpact ?? ""} onChange={(e) => setReservations(reservations.map((x, j) => (j === i ? { ...x, financialImpact: e.target.value } : x)))} /></label>
          <label>Incidence sur le délai (jours, facultatif)<input type="number" step="1" disabled={!editable} value={r.delayImpact ?? ""} onChange={(e) => setReservations(reservations.map((x, j) => (j === i ? { ...x, delayImpact: e.target.value } : x)))} /></label>
          <label>Gravité<select disabled={!editable} value={r.severity || ""} onChange={(e) => setReservations(reservations.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)))}>{Object.entries(SEVERITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {editable && <button type="button" className="icon" aria-label="Supprimer la réserve" onClick={() => setReservations(reservations.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
        </div>)}
        {reservations.length === 0 && <p className="consult-hint">Aucune réserve.</p>}
        {editable && <div className="consult-buttons"><button data-portal-add-reservation onClick={() => setReservations([...reservations, { id: newId(), subject: "", description: "", financialImpact: "", delayImpact: "", severity: "" }])}><Plus size={13} /> Ajouter une réserve</button></div>}
      </div>

      <div className="portal-block" data-portal-section="documents">
      <h4><span className="portal-step">{(lot.options || []).length > 0 ? 5 : 4}</span> Documents</h4>
      {required.length > 0 && <p className="consult-hint">Documents demandés : {required.map((name) => <span key={name} className={`req-doc ${uploadedLabels.includes(name.toLowerCase()) ? "ok" : ""}`} data-portal-required={name}>{name}</span>)}</p>}
      <ul className="consult-docs">{(offer.documents || []).map((d) => <li key={d.id} data-portal-offer-doc>{d.label ? <b>{d.label} · </b> : null}{d.filename}{editable && <button className="icon" onClick={() => removeDoc(d.id)}><Trash2 size={13} /></button>}</li>)}</ul>
      {editable && <div className="consult-row">
        <input type="text" list={`req-${lot.lotId}`} value={docLabel} data-portal-doc-label placeholder="Nature du document (ex. Assurance décennale)" onChange={(e) => setDocLabel(e.target.value)} />
        <datalist id={`req-${lot.lotId}`}>{required.map((name) => <option key={name} value={name} />)}</datalist>
        <label className="upload"><FileUp size={14} /> Ajouter un document<input type="file" hidden data-portal-doc-file onChange={upload} /></label>
      </div>}

      </div>

      {editable && <div className="consult-row">
        <label className="upload"><FileUp size={14} /> Importer mon offre (Excel, CSV, PDF)<input type="file" hidden accept=".xlsx,.xlsm,.csv,.pdf" data-portal-import-file onChange={importFile} /></label>
        <span className="consult-hint">Les lignes sont rapprochées du DPGF : vous validez chaque correspondance avant qu'elle soit reprise.</span>
      </div>}
      {importState && <div className="import-box" data-portal-import>
        <table className="consult-table compact"><thead><tr><th>Ligne de votre fichier</th><th>PU</th><th>Ligne du DPGF</th><th>Confiance</th><th>Valider</th></tr></thead><tbody>
          {importState.map((p, i) => <tr key={i} data-portal-import-row><td>{p.source.designation}</td><td>{p.source.unitPrice}</td>
            <td><select value={p.target} onChange={(e) => setImportState(importState.map((x, j) => (j === i ? { ...x, target: e.target.value, accepted: false } : x)))}><option value="">— aucune —</option>{rows.map((row) => <option key={row.key} value={row.key}>{row.designation}</option>)}</select></td>
            <td><span className={`conf c-${p.confidence}`}>{CONFIDENCE[p.confidence]}</span></td>
            <td><input type="checkbox" disabled={!p.target} checked={p.accepted} data-portal-import-accept onChange={(e) => setImportState(importState.map((x, j) => (j === i ? { ...x, accepted: e.target.checked } : x)))} /></td></tr>)}
        </tbody></table>
        <div className="consult-buttons"><button className="primary" data-portal-import-apply onClick={applyImport}>Reprendre les lignes validées</button><button onClick={() => setImportState(null)}>Annuler</button></div>
      </div>}

      {warnings && <div className="consult-banner" data-portal-warnings><div><b>Avant de déposer :</b><ul>{warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul></div>
        <button data-portal-submit-anyway onClick={() => submit(true)}>Déposer quand même</button></div>}
      {editable && <div className="consult-buttons"><button data-portal-save onClick={saveDraft}>Enregistrer le brouillon</button><button className="primary" data-portal-submit onClick={() => submit(false)}><Send size={15} /> Déposer mon offre</button>{msg && <span data-portal-msg>{msg}</span>}</div>}
    </section>
  );
}

function Questions({ token, view, setView, editable }) {
  const [text, setText] = useState("");
  const [lot, setLot] = useState("");
  const [replies, setReplies] = useState({});
  const [problem, setProblem] = useState("");
  const ask = async () => { setProblem(""); try { setView(await portalFetch(`/consult/${token}/questions`, { method: "POST", body: JSON.stringify({ body: text.trim(), lotId: lot }) })); setText(""); } catch (e) { setProblem(e.message); } };
  const reply = async (id) => { setView(await portalFetch(`/consult/${token}/questions/${id}/reply`, { method: "POST", body: JSON.stringify({ answer: replies[id] }) })); };
  return (
    <section className="consult-card" data-portal-questions>
      <h3>Questions et réponses</h3>
      {view.publicAnswers?.length > 0 && <div data-portal-public-answers><h4>Réponses communiquées à tous les candidats</h4>{view.publicAnswers.map((q, i) => <div key={i} className="consult-question"><p><b>{q.lotId ? `Lot ${q.lotId} · ` : ""}Question :</b> {q.body}</p><p className="answer">Réponse du maître d'œuvre : {q.answer}</p></div>)}</div>}
      {view.questions.map((q) => <div key={q.id} className="consult-question" data-portal-question-item>
        <p>{q.origin === "MOE" ? <b>Demande de précision du maître d'œuvre : </b> : null}{q.body}</p>
        {q.origin === "MOE" ? (q.answer ? <p className="answer">Votre réponse : {q.answer}</p> : editable && <div className="consult-row"><input value={replies[q.id] || ""} data-portal-reply placeholder="Votre réponse…" onChange={(e) => setReplies({ ...replies, [q.id]: e.target.value })} /><button disabled={!(replies[q.id] || "").trim()} data-portal-reply-send onClick={() => reply(q.id)}>Répondre</button></div>)
          : q.answer ? <p className="answer">Réponse : {q.answer}</p> : <small>En attente de réponse</small>}
      </div>)}
      {editable && <div className="consult-row"><select value={lot} onChange={(e) => setLot(e.target.value)}><option value="">Question générale</option>{view.lots.map((l) => <option key={l.lotId} value={l.lotId}>Lot {l.lotId}</option>)}</select>
        <input value={text} data-portal-question placeholder="Votre question…" onChange={(e) => setText(e.target.value)} /><button disabled={!text.trim()} data-portal-ask onClick={ask}>Envoyer</button></div>}
      {problem && <div className="portal-error" role="alert">{problem}</div>}
    </section>
  );
}


/** Écran de confirmation : l'entreprise reçoit un code à 6 chiffres sur son adresse e-mail pour valider ce navigateur. */
function DeviceConfirm({ token, onDone }) {
  const [step, setStep] = useState("ask");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const ask = async () => { setMsg(""); try { const r = await portalFetch(`/consult/${token}/device/request`, { method: "POST" }); setEmail(r.email); setStep("code"); if (!r.sent) setMsg("L'e-mail n'a pas pu être envoyé : contactez le maître d'œuvre."); } catch (e) { setMsg(e.message); } };
  const confirmCode = async () => { setMsg(""); try { await portalFetch(`/consult/${token}/device/confirm`, { method: "POST", body: JSON.stringify({ code, device: DEVICE }) }); onDone(); } catch (e) { setMsg(e.message); } };
  return (
    <main className="portal" data-portal-device>
      <section className="consult-card">
        <h3>Confirmez votre identité</h3>
        <p className="consult-hint">Pour protéger ce dossier, un code de confirmation est envoyé à l'adresse e-mail de votre entreprise. Il ne sera plus redemandé sur ce navigateur.</p>
        {step === "ask" ? <div className="consult-buttons"><button className="primary" data-portal-device-ask onClick={ask}>Recevoir un code par e-mail</button></div> : (
          <div className="consult-row"><label>Code reçu à {email}<input inputMode="numeric" maxLength="6" data-portal-device-code value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label><button className="primary" data-portal-device-confirm disabled={code.length !== 6} onClick={confirmCode}>Confirmer</button><button onClick={ask}>Renvoyer un code</button></div>)}
        {msg && <div className="quotes-error" data-portal-device-msg>{msg}</div>}
      </section>
    </main>
  );
}
