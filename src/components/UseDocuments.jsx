import { useEffect, useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { associateAttachment, listAttachments, uploadAttachment } from "../api/client";

/** « Utiliser des documents » : un même document du projet est associé à un module (Faisabilité, DPGF, Planning…) sans être copié ; un nouveau fichier s'ajoute au référentiel du projet, une seule fois (empreinte). */
export function UseDocuments({ projectId, module, editable = true, label = "Utiliser des documents", onChange }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState([]), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const load = () => listAttachments(projectId).then((value) => setItems(value.attachments || value || [])).catch((reason) => setError(reason.message));
  useEffect(() => { if (open) load(); }, [open, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const used = (item) => (item.associations || []).some((usage) => usage.module === module) || (module === "ESTIMATION" && item.estimateLinked);
  const use = async (item) => { setBusy(item.id); setError(""); try { await associateAttachment(projectId, item.id, module); await load(); onChange?.(); } catch (reason) { setError(reason.message); } finally { setBusy(""); } };
  const add = async (files) => { setError(""); for (const file of files) { try { await uploadAttachment(projectId, "", file, "", module); } catch (reason) { setError(reason.message); } } await load(); onChange?.(); };
  return <div className="use-documents" data-use-documents={module}>
    <button type="button" className="secondary" data-use-documents-toggle aria-expanded={open} onClick={() => setOpen(!open)}><FolderOpen size={14}/> {label}</button>
    {open && <section className="use-documents-panel" data-use-documents-panel>
      {error && <div className="err" role="alert">{error}</div>}
      {items.length === 0 ? <p className="muted" data-use-documents-empty>Aucun document dans le projet pour l’instant.</p> : <ul>{items.filter((item) => !item.archived).map((item) => <li key={item.id} data-use-document={item.id}><span title={item.filename}>{item.filename}</span>
        {used(item) ? <b className="used" data-use-document-used>✓ Utilisé ici</b> : <button type="button" className="secondary" data-use-document-button disabled={!editable || busy === item.id} onClick={() => use(item)}>Utiliser</button>}</li>)}</ul>}
      {editable && <label className="secondary feas-upload" data-use-documents-add><Plus size={14}/> Ajouter un document<input type="file" multiple hidden data-use-documents-file onChange={(event) => { add([...event.target.files]); event.target.value = ""; }}/></label>}
    </section>}
  </div>;
}
