import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import "../feasibility-rules.css";

// PLANNING-DPGF-UNMATCHED-01 : « Examiner » ouvre les lignes DPGF qui n'ont généré aucune tâche Planning, avec la raison et l'action : créer une tâche, associer, ignorer pour le planning (explicite).
// Ne pas confondre avec « À compléter » (tâches existantes incomplètes).
const errorText = (error) => error?.detail?.message || error?.message || "Une erreur est survenue";
export const DPGF_FOCUS_KEY = "calepin.dpgf.focusLine";

export function PlanningUnmatchedLines({ projectId, revision, onClose, onChanged, onOpenDpgf }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(null);
  const [associating, setAssociating] = useState(null);   // { key, taskId }
  const base = `/cctps/${projectId}/planning`;
  const load = () => apiFetch(`${base}/unmatched-lines`).then(setData).catch((e) => setError(errorText(e)));
  useEffect(() => { load(); }, [projectId, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (line_key, action, extra = {}) => {
    setBusy(true); setError("");
    try { await apiFetch(`${base}/dpgf-lines/decision`, { method: "POST", body: JSON.stringify({ line_key, action, ...extra }) }); setAssociating(null); await load(); onChanged?.(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const agencyRule = async (line) => {
    setMenu(null); setBusy(true); setError("");
    try { await apiFetch("/planning-v1/mappings", { method: "PUT", body: JSON.stringify({ catalog_code: line.catalog_code, behavior: "STANDALONE_TASK", unit: line.unit || "", task_label: line.designation }) }); setData({ ...data, ruleNote: "Règle agence enregistrée : elle s'appliquera aux nouveaux projets. Ce projet garde ses décisions." }); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  if (!data) return <aside className="pln-card pln-drawer" data-planning-unmatched role="dialog" aria-label="Lignes DPGF sans tâche Planning">{error ? <div className="err" role="alert">{error}</div> : <p>Chargement…</p>}</aside>;
  const { lines, ignored } = data;
  return <aside className="pln-card pln-drawer" data-planning-unmatched role="dialog" aria-label="Lignes DPGF sans tâche Planning">
    <div className="pln-detail-head"><b>Lignes DPGF sans tâche Planning</b><button type="button" className="link-button" data-planning-unmatched-close onClick={onClose}>Fermer</button></div>
    {error && <div className="err" role="alert" data-planning-unmatched-error>{error}</div>}
    {data.ruleNote && <p className="pln-muted" role="status">{data.ruleNote}</p>}
    {lines.length === 0 ? <p data-planning-unmatched-empty>Toutes les lignes de votre DPGF sont associées au planning ou ignorées explicitement.</p>
      : <><p data-planning-unmatched-intro>{lines.length} ligne{lines.length > 1 ? "s" : ""} de votre DPGF ne {lines.length > 1 ? "sont" : "est"} liée{lines.length > 1 ? "s" : ""} à aucune tâche du planning. Pour chacune, choisissez ce que le planning doit en faire :</p>
        <ul className="pln-un-legend" data-planning-unmatched-legend>
          <li><b>Créer une tâche</b> : ajoute au planning une nouvelle tâche pour ce poste.</li>
          <li><b>Rattacher à une tâche</b> : le poste correspond à une tâche déjà présente dans le planning.</li>
          <li><b>Ne pas planifier</b> : ce poste n’a pas d’incidence sur le planning (frais divers, administratif…).</li></ul>
        <ul className="pln-un-list" data-planning-unmatched-table>{lines.map((line) => <li className="pln-un-card" key={line.line_key} data-planning-unmatched-line={line.line_key}>
          <div className="pln-un-head"><b>{line.designation}</b><small>{[line.lot_id && `Lot ${line.lot_id}`, line.quantity !== null && line.quantity !== undefined && `${line.quantity}${line.unit ? ` ${line.unit}` : ""}`].filter(Boolean).join(" · ") || "—"}</small></div>
          <p className="pln-un-reason">{line.reason}</p>
          <div className="pln-un-actions">
            <button type="button" className="primary" data-planning-line-create disabled={busy} onClick={() => decide(line.line_key, "CREATE_TASK")}>Créer une tâche</button>
            {data.associable_tasks.length > 0 && (associating?.key === line.line_key
              ? <span className="pln-un-associate"><select aria-label="Tâche du planning à rattacher" data-planning-line-task value={associating.taskId} onChange={(e) => setAssociating({ ...associating, taskId: e.target.value })}><option value="">Choisir la tâche du planning…</option>{data.associable_tasks.map((t) => <option key={t.task_id} value={t.task_id}>{t.label}</option>)}</select>
                <button type="button" className="primary" disabled={busy || !associating.taskId} data-planning-line-associate-confirm onClick={() => decide(line.line_key, "ASSOCIATE", { task_id: associating.taskId })}>Rattacher</button>
                <button type="button" className="link-button" onClick={() => setAssociating(null)}>Annuler</button></span>
              : <button type="button" className="secondary" data-planning-line-associate disabled={busy} onClick={() => setAssociating({ key: line.line_key, taskId: "" })}>Rattacher à une tâche</button>)}
            <button type="button" className="secondary" data-planning-line-ignore disabled={busy} title="Poste sans incidence sur le planning (frais divers, élément administratif…)" onClick={() => decide(line.line_key, "IGNORE")}>Ne pas planifier</button>
            <span className="frl-menu"><button type="button" className="link-button" aria-label={`Autres actions pour ${line.designation}`} aria-expanded={menu === line.line_key} data-planning-line-menu onClick={() => setMenu(menu === line.line_key ? null : line.line_key)}>Autres actions ▾</button>
              {menu === line.line_key && <span className="frl-menu-list" role="menu">
                <button type="button" role="menuitem" data-planning-line-open-dpgf onClick={() => { setMenu(null); try { window.sessionStorage.setItem(DPGF_FOCUS_KEY, line.line_key); } catch { /* stockage indisponible */ } onOpenDpgf?.(line); }}>Ouvrir dans la DPGF</button>
                {line.catalog_code && <button type="button" role="menuitem" data-planning-line-rule onClick={() => agencyRule(line)}>Créer une règle agence : toujours créer une tâche pour ce poste</button>}</span>}</span></div></li>)}</ul></>}
    {ignored.length > 0 && <details data-planning-unmatched-ignored><summary>Postes non planifiés ({ignored.length})</summary>
      <ul>{ignored.map((line) => <li key={line.line_key}>{line.designation} <button type="button" className="link-button" data-planning-line-restore disabled={busy} onClick={() => decide(line.line_key, "RESTORE")}>Remettre à traiter</button></li>)}</ul></details>}
  </aside>;
}
