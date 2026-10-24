import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const API = import.meta.env.VITE_API_URL || "/api";
export const ANALYSIS_STATUS = { TO_ANALYZE: "À analyser", TO_CLARIFY: "À clarifier", ANALYZED: "Analysée", DISCARDED: "Écartée" };
const SOURCE = { COMPANY_PORTAL: "Portail entreprise", EXCEL_IMPORT: "Import Excel", PDF_IMPORT: "Import PDF", FREE_QUOTE: "Devis libre", MANUAL: "Saisie manuelle" };
const MAPPING = { EXACT: "Identifiant technique", MATCHED: "Rapprochée", TO_CONFIRM: "À confirmer", UNMATCHED: "Hors DPGF" };
const POINT_STATE = { OPEN: "À traiter", CLARIFYING: "En clarification", ANSWERED: "Réponse reçue" };

// Suivi des offres d'un lot : origine, statut d'analyse, montant de base / analysé, recommandation du MOE (jamais automatique).
export function OfferReview({ lot, id, run, reload, onImport, canAward }) {
  const setStatus = (c, analysisStatus) => run(async () => { await apiFetch(`/consultations/${id}/offers/${c.companyId}/${lot.lotId}/review`, { method: "PUT", body: JSON.stringify({ analysisStatus }) }); reload(); });
  const recommend = (c) => run(async () => {
    const note = c.recommended ? "" : (window.prompt("Motif de la recommandation (facultatif)", c.recommendationNote || "") ?? null);
    if (note === null) return;
    await apiFetch(`/consultations/${id}/offers/${c.companyId}/${lot.lotId}/recommendation`, { method: "POST", body: JSON.stringify({ recommended: !c.recommended, note }) }); reload();
  });
  return (
    <div className="offer-review" data-offer-review={lot.lotId}>
      <h4>Suivi des offres <button type="button" data-offer-import-open onClick={() => onImport(null)}>Importer une offre reçue</button></h4>
      <p className="consult-hint">La recommandation est un avis du maître d’œuvre : elle n’attribue pas le lot et n’est jamais déduite du prix.</p>
      <div className="table-scroll"><table className="consult-table compact"><thead><tr><th>Entreprise</th><th>Origine</th><th>Montant de base</th><th>Montant analysé</th><th>Statut d’analyse</th><th>Recommandation</th></tr></thead><tbody>
        {lot.companies.map((c) => {
          const source = c.sources?.length ? SOURCE[c.sources[c.sources.length - 1].sourceType] : SOURCE.COMPANY_PORTAL;
          return (
            <tr key={c.companyId} data-offer-review-row={c.companyId} data-analysis-status={c.analysisStatus} className={c.analysisStatus === "DISCARDED" ? "discarded" : ""}>
              <td><b>{c.company}</b> <small>V{c.version}</small></td>
              <td data-offer-source>{source}</td>
              <td data-offer-base>{c.baseAmount != null ? money.format(c.baseAmount) : "—"}</td>
              <td data-offer-analyzed>{c.analyzedAmount != null ? money.format(c.analyzedAmount) : "—"}{c.completeness != null && <small data-offer-completeness> · analyse complète à {c.completeness} % ({c.pricedLines}/{c.dceLines} lignes)</small>}
                {c.unconfirmedLines > 0 && <small className="portal-warn" data-offer-unconfirmed> · {c.unconfirmedLines} ligne(s) à confirmer</small>}</td>
              <td><select value={c.analysisStatus} data-offer-analysis-select onChange={(e) => setStatus(c, e.target.value)}>{Object.entries(ANALYSIS_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td>{c.recommended && <span className="ok-text" data-offer-recommended>★ Recommandée par le MOE{c.recommendationNote ? ` — ${c.recommendationNote}` : ""} </span>}
                <button type="button" data-offer-recommend disabled={c.analysisStatus === "DISCARDED" && !c.recommended} onClick={() => recommend(c)}>{c.recommended ? "Retirer la recommandation" : "Recommander"}</button>
                <button type="button" data-offer-import-company onClick={() => onImport(c.companyId)}>Importer une version</button></td>
            </tr>
          );
        })}
      </tbody></table></div>
    </div>
  );
}

// Import d'une offre reçue hors portail : aperçu du rapprochement, validation ligne par ligne, puis nouvelle version.
export function OfferImport({ id, data, lot, companyId, onClose, onDone, run }) {
  const [company, setCompany] = useState(companyId || (data.companies || []).find((c) => (c.invitedLots || []).includes(lot.lotId))?.companyId || "");
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [sourceType, setSourceType] = useState("EXCEL_IMPORT");
  const options = (data.companies || []).filter((c) => (c.invitedLots || []).includes(lot.lotId)).map((c) => ({ id: c.companyId, name: c.name }));
  const send = async (file) => {
    setError("");
    const form = new FormData(); form.append("file", file);
    const response = await fetch(`${API}/consultations/${id}/offers/${company}/${lot.lotId}/import/preview`, { method: "POST", credentials: "include", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.detail || "Import impossible"); return; }
    setPreview(body); setRows(body.rows.map((r) => ({ ...r })));
    setSourceType(file.name.toLowerCase().endsWith(".pdf") ? "PDF_IMPORT" : "EXCEL_IMPORT");
  };
  const counts = {
    exact: rows.filter((r) => r.mapping === "EXACT").length, matched: rows.filter((r) => r.mapping === "MATCHED").length,
    toConfirm: rows.filter((r) => r.mapping === "TO_CONFIRM" && !r.confirmed).length, unmatched: rows.filter((r) => r.mapping === "UNMATCHED").length,
  };
  const used = new Set(rows.filter((r) => ["EXACT", "MATCHED"].includes(r.mapping) || r.confirmed).map((r) => r.matchKey).filter(Boolean));
  const setRow = (index, patch) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const choose = (index, key) => setRow(index, key ? { matchKey: key, confirmed: true, mapping: rows[index].mapping === "UNMATCHED" ? "TO_CONFIRM" : rows[index].mapping } : { matchKey: null, confirmed: false, mapping: "UNMATCHED" });
  const confirm = () => run(async () => {
    try { await apiFetch(`/consultations/${id}/offers/${company}/${lot.lotId}/import/confirm`, { method: "POST", body: JSON.stringify({ filename: preview.filename, sourceType, rows }) }); onDone(); }
    catch (e) { setError(e.message); }
  });
  return (
    <div className="consult-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="consult-modal wide" role="dialog" aria-modal="true" data-offer-import>
        <h3>Importer une offre — lot {lot.lotId}</h3>
        {!preview ? <>
          <p className="consult-hint">Fichier Excel, CSV ou PDF (avec texte) reçu d’une entreprise. Rien n’est enregistré avant votre validation ; l’import crée toujours une nouvelle version, sans écraser les précédentes.</p>
          <label>Entreprise<select value={company} data-offer-import-company-select onChange={(e) => setCompany(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label>Fichier<input type="file" accept=".xlsx,.xlsm,.csv,.txt,.pdf" data-offer-import-file onChange={(e) => e.target.files[0] && send(e.target.files[0])} /></label>
        </> : <>
          <p data-offer-import-summary><b>{preview.company}</b> · {preview.filename} · deviendra la version <b>V{preview.nextVersion}</b></p>
          <p className="import-counts" data-offer-import-counts>
            <span>{counts.exact} identifiée(s) par identifiant</span> · <span>{counts.matched} rapprochée(s)</span> · <span className={counts.toConfirm ? "portal-warn" : ""}>{counts.toConfirm} à confirmer</span> · <span>{counts.unmatched} hors DPGF</span> · <span>{preview.dceLines.filter((l) => !used.has(l.key)).length} ligne(s) du DPGF non retrouvée(s)</span>
          </p>
          <div className="table-scroll"><table className="consult-table compact"><thead><tr><th>Ligne importée</th><th>Qté</th><th>PU</th><th>Rapprochement</th><th>Ligne du DPGF</th></tr></thead><tbody>
            {rows.map((r, i) => (
              <tr key={i} data-import-row={r.mapping} className={r.mapping === "TO_CONFIRM" && !r.confirmed ? "flagged" : ""}>
                <td>{r.designation}{r.quantityDiffers && <small className="portal-warn"> · quantité différente du DCE</small>}{r.unitDiffers && <small className="portal-warn"> · unité différente</small>}</td>
                <td>{r.quantity ?? "—"} {r.unit}</td><td>{money.format(r.unitPrice)}</td>
                <td>{r.confirmed ? "Confirmée" : MAPPING[r.mapping]}<small> {r.reason}</small></td>
                <td><select value={r.matchKey || ""} data-import-select onChange={(e) => choose(i, e.target.value)}>
                  <option value="">Ligne hors DPGF (ajoutée par l’entreprise)</option>
                  {preview.dceLines.map((l) => <option key={l.key} value={l.key} disabled={used.has(l.key) && l.key !== r.matchKey}>{l.designation}</option>)}
                </select></td>
              </tr>
            ))}
          </tbody></table></div>
        </>}
        {error && <p className="error-text" role="alert" data-offer-import-error>{error}</p>}
        <div className="consult-buttons">
          {preview && <button className="primary" data-offer-import-confirm onClick={confirm}>Enregistrer comme V{preview.nextVersion}</button>}
          <button onClick={onClose}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// Points à traiter : anomalies, documents manquants, réserves, lignes à confirmer — filtrables.
export function PointsPanel({ id, revision, lots, companies, onAsk }) {
  const [filters, setFilters] = useState({ lot: "", company: "", type: "", status: "" });
  const [result, setResult] = useState(null);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const load = useCallback(() => apiFetch(`/consultations/${id}/points${query ? `?${query}` : ""}`).then(setResult).catch(() => setResult({ points: [], types: [], total: 0 })), [id, query]);
  useEffect(() => { load(); }, [load, revision]);
  if (!result) return null;
  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
  return (
    <article className="consult-card" data-ops-points>
      <h3>Points à traiter ({result.points.length}{result.points.length !== result.total ? ` sur ${result.total}` : ""})</h3>
      <div className="consult-row points-filters">
        <label>Lot<select value={filters.lot} data-points-filter="lot" onChange={set("lot")}><option value="">Tous</option>{lots.map((l) => <option key={l.lotId} value={l.lotId}>Lot {l.lotId}</option>)}</select></label>
        <label>Entreprise<select value={filters.company} data-points-filter="company" onChange={set("company")}><option value="">Toutes</option>{companies.map((c) => <option key={c.companyId} value={c.companyId}>{c.company}</option>)}</select></label>
        <label>Type<select value={filters.type} data-points-filter="type" onChange={set("type")}><option value="">Tous</option>{result.types.map((t) => <option key={t.type} value={t.type}>{t.label} ({t.count})</option>)}</select></label>
        <label>État<select value={filters.status} data-points-filter="status" onChange={set("status")}><option value="">Tous</option>{Object.entries(POINT_STATE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      {!result.points.length ? <p className="consult-hint" data-points-empty>Aucun point à traiter avec ces filtres.</p> : (
        <ul className="consult-docs">{result.points.map((p) => (
          <li key={p.id} data-point={p.type} data-point-status={p.status}><b>{p.company}</b> · lot {p.lotId} · <span className="chip">{p.typeLabel}</span> {p.designation} <small>— {p.detail}</small> <span className={`point-state s-${p.status}`}>{POINT_STATE[p.status]}</span>
            {onAsk && p.status === "OPEN" && <button data-point-ask onClick={() => onAsk(p)}>Demander une précision</button>}</li>
        ))}</ul>
      )}
    </article>
  );
}

// Après attribution : le MOE valide quelles lignes du marché deviennent des références de prix de l'agence.
export function ReferencesFeed({ id, lotId, run }) {
  const [proposal, setProposal] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [done, setDone] = useState(null);
  const open = () => run(async () => { const p = await apiFetch(`/consultations/${id}/awards/${lotId}/references`, { method: "POST", body: JSON.stringify({}) }); setProposal(p); setSelected(new Set(p.candidates.map((c) => c.key))); });
  const feed = () => run(async () => { const r = await apiFetch(`/consultations/${id}/awards/${lotId}/references`, { method: "POST", body: JSON.stringify({ confirm: true, keys: [...selected] }) }); setDone(r); setProposal(null); });
  if (done) return <p className="ok-text" data-references-done>{done.created} référence(s) de prix ajoutée(s) à la bibliothèque de l’agence. Source : {done.source}.</p>;
  if (!proposal) return <button type="button" data-references-open onClick={open}>Choisir les prix à garder comme références</button>;
  return (
    <div className="references-feed" data-references-feed>
      <p className="consult-hint">Source : {proposal.source}. Seules les lignes cochées deviennent des références de prix (type « offre retenue »).</p>
      <ul className="consult-docs">{proposal.candidates.map((c) => (
        <li key={c.key}><label><input type="checkbox" data-reference-line checked={selected.has(c.key)} onChange={(e) => { const next = new Set(selected); e.target.checked ? next.add(c.key) : next.delete(c.key); setSelected(next); }} /> {c.designation} — {money.format(c.unitPrice)} / {c.unit || "u"}</label></li>
      ))}</ul>
      <button className="primary" data-references-confirm onClick={feed}>Valider {selected.size} référence(s)</button>
    </div>
  );
}
