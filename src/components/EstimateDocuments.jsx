import { Download, File, Link2, Plus, Unlink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { attachmentFileUrl, listAttachments, updateAttachment, uploadAttachment } from "../api/client";
import { DOCUMENT_CATEGORIES } from "../pages/ProjectDocumentsPage";

const ESTIMATE_CATEGORIES = ["devis", "metres", "bordereaux", "fournisseurs", "etudes", "plans", "autres"];
const ORIGIN = { CCTP: "CCTP", ESTIMATION: "DPGF", DOCUMENTS: "Documents", CONSULTATION: "Consultation", FEASIBILITY: "Faisabilité" };
const categoryLabel = (id) => (DOCUMENT_CATEGORIES.find(([key]) => key === id) || [id, id])[1];

/** DPGF › Documents du projet : le MÊME référentiel documentaire que le CCTP et l'onglet Documents (pas de bibliothèque propre au DPGF).
 *  Importer ici = ajouter un document au projet (contexte « DPGF ») ; « associer » indique seulement qu'il sert de référence à ce DPGF (le fichier n'est jamais copié). */
export function EstimateDocuments({ cctpId, editable, onClose }) {
  const [items, setItems] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [category, setCategory] = useState("devis");
  const input = useRef(null);
  const load = () => listAttachments(cctpId, null, { includeArchived: false }).then((value) => setItems(value.attachments || value || [])).catch((reason) => setError(reason.message));
  useEffect(() => { load(); }, [cctpId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (action) => { setBusy(true); setError(""); try { await action(); await load(); } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  const add = (files) => run(async () => { for (const file of files) await uploadAttachment(cctpId, "", file, category, "ESTIMATION"); });
  const link = (item, estimateLinked) => run(() => updateAttachment(cctpId, item.id, { estimateLinked }));
  const linked = items.filter((item) => item.estimateLinked), others = items.filter((item) => !item.estimateLinked);
  const row = (item) => <li key={item.id} data-estimate-doc={item.id} className={item.estimateLinked ? "linked" : ""}>
    <span className="doc-icon"><File size={16} /></span>
    <div className="doc-main"><b title={item.filename}>{item.filename}</b><small>{categoryLabel(item.category || "autres")} · ajouté depuis {ORIGIN[item.importContext] || "CCTP"}{item.uploadedBy ? ` par ${item.uploadedBy}` : ""}</small></div>
    <a className="doc-action" href={attachmentFileUrl(cctpId, item.id)} download={item.filename} title="Télécharger"><Download size={14} /></a>
    {editable && (item.estimateLinked
      ? <button type="button" className="doc-action" data-estimate-doc-unlink disabled={busy} onClick={() => link(item, false)} title="Le document reste dans les documents du projet"><Unlink size={14} /> Dissocier</button>
      : <button type="button" className="doc-action" data-estimate-doc-link disabled={busy} onClick={() => link(item, true)}><Link2 size={14} /> Associer</button>)}
  </li>;
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="estimate-documents" role="dialog" aria-modal="true" aria-label="Documents du projet" data-estimate-documents>
      <header><h2>Documents du projet</h2><button type="button" aria-label="Fermer" data-estimate-documents-close onClick={onClose}><X size={18} /></button></header>
      <p className="consult-hint">Les documents sont ceux du projet : un fichier importé depuis le CCTP est déjà proposé ici, et un fichier importé ici apparaît dans Projet › Documents.</p>
      {error && <div className="project-documents-error" role="alert">{error}</div>}
      {editable && <div className="estimate-documents-import">
        <label>Catégorie<select data-estimate-doc-category value={category} onChange={(event) => setCategory(event.target.value)}>{ESTIMATE_CATEGORIES.map((id) => <option key={id} value={id}>{categoryLabel(id)}</option>)}</select></label>
        <button type="button" className="primary" data-estimate-doc-import disabled={busy} onClick={() => input.current?.click()}><Plus size={15} /> Importer un document</button>
        <input ref={input} type="file" hidden multiple data-estimate-doc-file accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => { add([...event.target.files]); event.target.value = ""; }} />
      </div>}
      <h3>Associés à ce DPGF <small>{linked.length}</small></h3>
      {linked.length === 0 ? <p className="panel-empty" data-estimate-doc-empty>Aucun document associé au DPGF pour l’instant.</p> : <ul className="documents-list" data-estimate-doc-linked>{linked.map(row)}</ul>}
      <h3>Autres documents du projet <small>{others.length}</small></h3>
      {others.length === 0 ? <p className="panel-empty">Aucun autre document dans le projet.</p> : <ul className="documents-list" data-estimate-doc-others>{others.map(row)}</ul>}
    </section>
  </div>;
}
