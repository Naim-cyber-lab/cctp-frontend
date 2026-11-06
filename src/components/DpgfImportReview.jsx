import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

const ROLE = { MAIN: "Ouvrage principal", PLUS_VALUE: "Plus-value", OPTION: "Option", ACCESSORY: "Accessoire", ADMIN: "Ligne administrative" };

/** Relecture d'un ancien DPGF importé : chaque ligne extraite est un BROUILLON avec des propositions CANDIDATES (rôle, parent, famille, unité, poste du catalogue, article de l'ancien CCTP).
 *  Rien n'entre dans l'historique de prix ni dans les règles sans « Valider cette ligne » : les valeurs proposées sont préremplies mais restent à confirmer. */
export function DpgfImportReview({ canWrite = true }) {
  const [drafts, setDrafts] = useState(null);
  const [types, setTypes] = useState([]);
  const [forms, setForms] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [articles, setArticles] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => apiFetch("/dpgf-library/import-drafts").then((r) => { setDrafts(r.drafts || []); setError(""); }).catch((e) => setError(e.message || "Brouillons indisponibles.")), []);
  useEffect(() => { load(); apiFetch("/dpgf-library/codes").then((r) => setTypes(r.types || [])).catch(() => setTypes([])); }, [load]);
  const act = async (fn, done) => { setBusy(true); setError(""); setMessage(""); try { await fn(); await load(); setMessage(done); } catch (e) { setError(e?.detail?.message || e.message || "Action impossible."); } finally { setBusy(false); } };
  if (drafts === null) return error ? <p className="err" role="alert" data-import-review-error>{error}</p> : null;
  if (!drafts.length) return <p className="pln-muted" data-import-review-empty>Aucun ancien DPGF à relire pour l’instant.</p>;
  const formOf = (item) => forms[item.id] || { type: item.draft.canonicalLineTypeCandidate || item.draft.inference?.canonicalLineTypeCandidate || "", unit: item.draft.normalizedUnitCandidate || item.draft.rawUnit || "", quantity: item.draft.quantityCandidate ?? "", price: item.draft.unitPriceHTCandidate ?? "", project: "" };
  const set = (item, patch) => setForms({ ...forms, [item.id]: { ...formOf(item), ...patch } });
  const batches = [...new Set(drafts.map((d) => d.draft.importBatchId || ""))];
  return <section data-import-review className="card" style={{ margin: "8px 0" }}>
    <h3>Ancien DPGF à relire <small className="muted">({drafts.length} ligne{drafts.length > 1 ? "s" : ""})</small></h3>
    <p className="pln-muted" data-import-review-note>Ces lignes viennent d’un document importé. Les propositions de Calepin (rôle, ouvrage parent, poste du catalogue, unité) sont des <b>candidats</b> : elles ne deviennent ni une référence de prix ni une règle sans votre validation.</p>
    {error && <div className="err" role="alert" data-import-review-error>{error}</div>}
    {message && <p className="ok" role="status" data-import-review-message>{message}</p>}
    <details data-import-cctp-map><summary>Associer un ancien CCTP (facultatif)</summary>
      <label>Articles du CCTP, un par ligne : « code titre » <textarea rows={4} data-import-articles value={articles} onChange={(e) => setArticles(e.target.value)} placeholder={"11.2.1.1 Doublages en plaques de plâtre\n11.2.2.1 Cloisons sèches"} /></label>
      <button type="button" className="secondary" data-import-map disabled={busy || !articles.trim()} onClick={() => act(async () => {
        const list = articles.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [code, ...rest] = line.split(/\s+/); return { code, title: rest.join(" ") }; });
        for (const batch of batches) await apiFetch("/dpgf-library/import-drafts/map-cctp", { method: "POST", body: JSON.stringify({ batch_id: batch, articles: list }) });
      }, "Correspondances candidates calculées : à confirmer.")}>Chercher les correspondances</button></details>
    <ul className="plain-list" style={{ display: "grid", gap: 8 }}>{drafts.map((item) => {
      const inf = item.draft.inference, form = formOf(item), map = item.draft.cctpMappingCandidate?.candidates?.[0];
      return <li key={item.id} className="card" data-import-draft={item.draft.sourceRow || item.id}>
        <b>{item.draft.rawDesignation}</b> <small className="muted">· {item.draft.fileName}{item.draft.sourceSheet ? ` · ${item.draft.sourceSheet}` : ""}{item.draft.sourceRow ? ` · ligne ${item.draft.sourceRow}` : ""} · unité brute {item.draft.rawUnit || "—"}</small>
        {inf && <div data-import-candidate style={{ fontSize: 13 }}>
          <span data-import-role>Proposé (à confirmer) : <b>{ROLE[inf.role] || inf.role}</b></span>{inf.family ? ` · famille ${inf.family}` : ""}{inf.parent ? <> · rattachée à « {inf.parent.designation} »</> : null}
          <small className="muted" style={{ display: "block" }}>{(inf.roleReasons || []).join(" ; ")}</small></div>}
        {map && <small data-import-cctp-candidate className="muted" style={{ display: "block" }}>Article du CCTP probable : {map.articleCode} « {map.articleTitle} » (confiance {map.level === "HIGH" ? "haute" : map.level === "MEDIUM" ? "moyenne" : "faible"})</small>}
        {canWrite && <div className="devis-form" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label>Poste du catalogue <select data-import-type value={form.type} onChange={(e) => set(item, { type: e.target.value })}><option value="">À choisir</option>{types.map((t) => <option key={t.code} value={t.code}>{t.designation}</option>)}</select></label>
          <label>Unité <input data-import-unit value={form.unit} onChange={(e) => set(item, { unit: e.target.value })} size={6} /></label>
          <label>Quantité <input data-import-quantity type="number" step="any" value={form.quantity} onChange={(e) => set(item, { quantity: e.target.value })} size={8} /></label>
          <label>PU HT <input data-import-price type="number" step="any" value={form.price} onChange={(e) => set(item, { price: e.target.value })} size={8} /></label>
          <label>Projet d’origine <input data-import-project value={form.project} onChange={(e) => set(item, { project: e.target.value })} placeholder="Nom du projet" /></label>
          <button type="button" className="primary" data-import-validate disabled={busy || !form.type || !form.unit || !form.project.trim() || !(Number(form.price) > 0)}
            onClick={() => act(() => apiFetch(`/dpgf-library/import-drafts/${item.id}/validate`, { method: "POST", body: JSON.stringify({ canonicalLineType: form.type, unit: form.unit, quantity: form.quantity === "" ? null : Number(form.quantity), unitPriceHT: Number(form.price), projectName: form.project.trim() }) }), "Ligne validée : ajoutée à l’historique de prix.")}>Valider cette ligne</button>
          <button type="button" className="secondary" data-import-reject disabled={busy} onClick={() => act(() => apiFetch(`/dpgf-library/import-drafts/${item.id}/reject`, { method: "POST", body: JSON.stringify({}) }), "Ligne rejetée.")}>Rejeter</button></div>}
      </li>;
    })}</ul>
  </section>;
}
