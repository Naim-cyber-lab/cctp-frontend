import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { saveWorkAsTemplate } from "../api/client";
import "../consultations.css";

const FAMILY_LABELS = { cloison: "Cloison distributive", doublage: "Doublage", plafond: "Faux plafond", gaine: "Gaine / coffre", habillage: "Habillage", protection_feu: "Protection feu", acoustique: "Traitement acoustique", combles: "Combles / rampants", enduit: "Enduit / reprise" };
const show = (value) => (Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value));

/** « Enregistrer comme modèle d'ouvrage » depuis un ouvrage d'un CCTP : le modèle est construit à partir de l'état du questionnaire de l'ouvrage (pas du texte final) ;
 *  les informations propres au projet (repère, quantité, hauteur, zone…) sont exclues par défaut et listées dans « Voir le détail ». */
export function SaveWorkTemplateModal({ projectId, work, onClose }) {
  const [form, setForm] = useState({ name: work.answers?.["Q-W01"] || work.label || "", workFamily: FAMILY_LABELS[work.family] || "", description: "" });
  const [preview, setPreview] = useState(null);
  const [detail, setDetail] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    saveWorkAsTemplate({ cctpId: projectId, workId: work.id, name: form.name, workFamily: form.workFamily, save: false }).then(setPreview).catch((reason) => setError(reason.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.name.trim() || !form.workFamily.trim()) { setError("Indiquez le nom du modèle et sa famille d’ouvrage."); return; }
    setBusy(true); setError("");
    try { setSaved(await saveWorkAsTemplate({ cctpId: projectId, workId: work.id, name: form.name, workFamily: form.workFamily, description: form.description, save: true })); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };

  return <div className="consult-modal-backdrop" data-save-template-modal onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="consult-modal template-editor" role="dialog" aria-modal="true" aria-label="Enregistrer comme modèle d’ouvrage">
      <header className="template-editor-head"><div><small>Plâtrerie</small><h3>Créer un modèle d’ouvrage</h3></div><button type="button" className="icon close" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header>
      {error && <div className="login-error" role="alert" data-save-template-error>{error}</div>}
      {saved ? <div data-save-template-done>
        <p><b>Modèle « {saved.template.name} » enregistré</b> (version 1, {saved.reusableCount} information{saved.reusableCount > 1 ? "s" : ""} réutilisable{saved.reusableCount > 1 ? "s" : ""}).</p>
        <p className="consult-hint">Retrouvez-le dans Bibliothèque agence › Modèles d’ouvrages.</p>
        <div className="consult-buttons"><button type="button" className="primary" onClick={onClose}>Fermer</button></div>
      </div> : <>
        <div className="template-editor-step">
          <label>Nom<input data-save-template-name maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Lot<input value="Plâtrerie – Isolation" disabled /></label>
          <label>Famille d’ouvrage<input data-save-template-family maxLength={80} value={form.workFamily} onChange={(event) => setForm({ ...form, workFamily: event.target.value })} placeholder="Ex. Cloison distributive" /></label>
          <label>Description<textarea rows={2} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        </div>
        {preview ? <div className="template-preview" data-save-template-summary>
          <p>Informations réutilisables détectées : <b data-reusable-count>{preview.reusableCount}</b></p>
          <p>Informations propres au projet exclues : <b data-excluded-count>{preview.excludedCount}</b></p>
          <button type="button" className="secondary" data-save-template-detail onClick={() => setDetail((value) => !value)}>{detail ? "Masquer le détail" : "Voir le détail"}</button>
          {detail && <div className="template-preview-detail" data-save-template-detail-list>
            <h4>Conservées dans le modèle</h4><ul>{preview.reusable.map((row) => <li key={row.questionId}><b>{row.label}</b> <span>{show(row.value)}</span></li>)}{preview.reusable.length === 0 && <li>Aucune.</li>}</ul>
            <h4>Exclues (propres au projet)</h4><ul>{preview.excluded.map((row) => <li key={row.questionId} className="excluded"><b>{row.label}</b> <span>{show(row.value)}</span></li>)}{preview.excluded.length === 0 && <li>Aucune.</li>}</ul>
          </div>}
        </div> : !error && <p className="panel-empty">Analyse de l’ouvrage…</p>}
        <div className="consult-buttons template-editor-actions"><button type="button" onClick={onClose}>Annuler</button><button type="button" className="primary" data-save-template-submit disabled={busy || !preview} onClick={save}><Check size={14} /> {busy ? "Enregistrement…" : "Enregistrer"}</button></div>
      </>}
    </div>
  </div>;
}
