import { useCallback, useEffect, useState } from "react";
import { getDpgfConsultationPolicy, publishDpgfConsultationPolicy, saveDpgfConsultationPolicy } from "../api/client";

/** Bibliothèque › DPGF › Règles de consultation : ce que le cadre DPGF envoyé aux entreprises demande ou autorise. Brouillon puis publication ; les consultations déjà envoyées ne changent pas. */
export function DpgfConsultationPolicy({ canPublish = true }) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const next = await getDpgfConsultationPolicy(); setData(next); setValues(next.draft?.policy || next.effective); } catch (e) { setError(e.message || "Lecture impossible."); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, done) => { setBusy(true); setError(""); setMessage(""); try { await fn(); await load(); setMessage(done); } catch (e) { setError(e.message || "Action impossible."); } finally { setBusy(false); } };
  if (!data) return error ? <p className="err" role="alert" data-dpgf-consultation-error>{error}</p> : <p className="pln-muted">Chargement…</p>;
  const changed = data.fields.some((f) => values[f.key] !== data.effective[f.key]);
  return <section data-dpgf-consultation-policy>
    <p className="pln-muted">Ces réglages définissent ce que le cadre DPGF envoyé aux entreprises leur demande ou leur autorise. Une fois publiés, ils s’appliquent aux nouvelles consultations ; <b>celles déjà envoyées gardent leur cadre</b>.</p>
    <p data-dpgf-consultation-origin className="pln-muted">{data.origin === "AGENCY" ? `Politique de votre agence en vigueur (version ${data.published.version}).` : "Standard Calepin en vigueur : aucune politique d’agence publiée."}{data.draft && <> <b data-dpgf-consultation-draft>Brouillon en cours (version {data.draft.version}).</b></>}</p>
    {error && <div className="err" role="alert" data-dpgf-consultation-error>{error}</div>}
    {message && <p className="ok" role="status" data-dpgf-consultation-message>{message}</p>}
    <div className="card" style={{ display: "grid", gap: 10 }}>
      {data.fields.map((field) => <label key={field.key} data-dpgf-consultation-field={field.key} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(160px, 1fr)", gap: 8, alignItems: "center" }}>
        <span>{field.label}</span>
        <select value={values[field.key] || field.default} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}>{field.options.map((o) => <option key={o.code} value={o.code}>{o.label}{o.code === field.default ? " (standard)" : ""}</option>)}</select>
      </label>)}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="secondary" data-dpgf-consultation-save disabled={busy || (!changed && !data.draft)} onClick={() => act(() => saveDpgfConsultationPolicy(values), "Brouillon enregistré. Publiez-le pour l’appliquer aux nouvelles consultations.")}>Enregistrer le brouillon</button>
        {canPublish && data.draft && <button type="button" className="primary" data-dpgf-consultation-publish disabled={busy} onClick={() => act(() => publishDpgfConsultationPolicy(), "Politique publiée pour les nouvelles consultations. Les consultations déjà envoyées ne changent pas.")}>Publier</button>}
      </div>
    </div>
  </section>;
}
