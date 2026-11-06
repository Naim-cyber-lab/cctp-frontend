import { useCallback, useEffect, useState } from "react";
import { getDpgfCatalog, restoreDpgfCatalogItem, saveDpgfCatalogItem } from "../api/client";

const STATE_LABEL = { STANDARD: "Standard Calepin", REPLACED: "Personnalisé par l’agence", ADDED: "Créé par l’agence", DISABLED: "Désactivé par l’agence" };
const EMPTY = { label: "", unit: "", kind: "MAIN" };

/** Bibliothèque › DPGF › Postes & structure. Le Standard Calepin n'est jamais modifié : l'agence peut remplacer un poste, le désactiver, ou en créer un. */
export function DpgfStructure({ query = "", canEdit = true }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);   // { code (poste modifié) | null (nouveau), label, unit, kind }
  const load = useCallback(async () => { try { setData(await getDpgfCatalog()); } catch (e) { setError(e.message || "Lecture impossible."); } }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, done) => { setBusy(true); setError(""); setMessage(""); try { await fn(); await load(); setMessage(done); } catch (e) { setError(e.message || "Action impossible."); } finally { setBusy(false); } };
  if (!data) return error ? <p className="err" role="alert" data-dpgf-structure-error>{error}</p> : <p className="pln-muted" data-dpgf-structure-loading>Chargement des postes…</p>;
  const needle = query.trim().toLowerCase();
  const items = data.items.filter((item) => !needle || item.label.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle));
  const kindLabel = (code) => data.kinds.find((k) => k.code === code)?.label || code;
  const save = () => act(async () => {
    await saveDpgfCatalogItem(form.code ? { item_key: form.code, mode: form.state === "ADDED" ? "ADD" : "REPLACE", label: form.label, unit: form.unit, kind: form.kind } : { mode: "ADD", label: form.label, unit: form.unit, kind: form.kind });
    setForm(null);
  }, form?.code ? "Poste personnalisé pour votre agence. Le standard n’est pas modifié." : "Poste créé pour votre agence.");
  return <section data-dpgf-structure>
    <p className="pln-muted">Les postes utilisés par Calepin pour produire la DPGF. Le Standard Calepin n’est jamais modifié : votre agence peut remplacer un poste, le désactiver ou en créer un.</p>
    {error && <div className="err" role="alert" data-dpgf-structure-error>{error}</div>}
    {message && <p className="ok" role="status" data-dpgf-structure-message>{message}</p>}
    {canEdit && <button type="button" className="primary" data-dpgf-item-new onClick={() => setForm({ code: null, state: "ADDED", ...EMPTY })}>+ Nouveau poste</button>}
    {form && <div className="card" data-dpgf-item-form style={{ display: "grid", gap: 8, margin: "8px 0" }}>
      <b>{form.code ? "Personnaliser ce poste pour mon agence" : "Nouveau poste"}</b>
      <label>Désignation<input data-dpgf-item-label value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
      <label>Unité<input data-dpgf-item-unit value={form.unit} placeholder="m², ml, u, forfait…" onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label>
      <label>Type de ligne<select data-dpgf-item-kind value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{data.kinds.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}</select></label>
      <div><button type="button" className="secondary" onClick={() => setForm(null)}>Annuler</button> <button type="button" className="primary" data-dpgf-item-save disabled={busy || !form.label.trim()} onClick={save}>Enregistrer pour mon agence</button></div>
    </div>}
    {!items.length && <p className="pln-muted" data-dpgf-structure-empty>Aucun poste ne correspond à cette recherche.</p>}
    {items.length > 0 && <table className="table" data-dpgf-structure-table>
      <thead><tr><th>Poste</th><th>Type de ligne</th><th>Unité</th><th>Origine</th>{canEdit && <th>Actions</th>}</tr></thead>
      <tbody>{items.map((item) => <tr key={item.code} data-dpgf-structure-row={item.code} data-state={item.state} style={item.state === "DISABLED" ? { opacity: 0.55 } : undefined}>
        <td>{item.label}{item.state === "REPLACED" && <small className="muted" style={{ display: "block" }}>Standard : {item.standard.label}</small>}</td>
        <td>{kindLabel(item.kind)}</td><td>{item.unit || "—"}</td><td data-dpgf-item-origin>{STATE_LABEL[item.state]}</td>
        {canEdit && <td><span className="pln-inline">
          {item.state !== "DISABLED" && <button type="button" className="link-button" data-dpgf-item-edit onClick={() => setForm({ code: item.code, state: item.state, label: item.label, unit: item.unit, kind: item.kind })}>{item.state === "STANDARD" ? "Modifier pour mon agence" : "Modifier"}</button>}
          {item.state !== "DISABLED" && item.state !== "ADDED" && <button type="button" className="link-button" data-dpgf-item-disable disabled={busy} onClick={() => act(() => saveDpgfCatalogItem({ item_key: item.code, mode: "DISABLE" }), "Poste désactivé pour votre agence.")}>Désactiver</button>}
          {item.overrideId && <button type="button" className="link-button" data-dpgf-item-restore disabled={busy} onClick={() => act(() => restoreDpgfCatalogItem(item.overrideId), item.state === "ADDED" ? "Poste supprimé." : "Standard Calepin rétabli.")}>{item.state === "ADDED" ? "Supprimer" : "Rétablir le standard"}</button>}
        </span></td>}
      </tr>)}</tbody>
    </table>}
  </section>;
}
