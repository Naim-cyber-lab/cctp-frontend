import { Archive, Download, File, FolderOpen, Plus, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { attachmentFileUrl, listAttachments, updateAttachment, uploadAttachment } from "../api/client";

export const DOCUMENT_CATEGORIES = [["plans", "Plans"], ["notices", "Notices"], ["etudes", "Études"], ["cctp_importes", "CCTP importés"], ["programme", "Programme MOA"], ["doe", "DOE"], ["diagnostics", "Diagnostics"], ["topographie", "Topographie"], ["geotechnique", "Géotechnique"], ["urbanisme", "Documents urbanisme"], ["photos", "Photos"], ["anciennes_pieces", "Anciennes pièces marché"], ["metres", "Métrés / quantitatifs"], ["devis", "Devis / références de prix"], ["bordereaux", "Bordereaux de prix"], ["fournisseurs", "Documents fournisseurs"], ["entreprises", "Documents entreprises"], ["autres", "Autres"]];
const label = (category) => (DOCUMENT_CATEGORIES.find(([id]) => id === category) || DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1])[1];
const ORIGIN = { CCTP: "CCTP", ESTIMATION: "DPGF", CONSULTATION: "Consultation", FEASIBILITY: "Faisabilité", DOCUMENTS: "Documents" };
const size = (bytes) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`);

/** Projet › Documents : les fichiers du projet, classés (plans, notices, études, CCTP importés, documents entreprises, autres), avec recherche, téléchargement et archivage.
 *  Ce sont les mêmes pièces que celles utilisées par le CCTP : un document importé ici est disponible sans nouvel envoi. */
export function ProjectDocumentsPage({ project }) {
  const [items, setItems] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [filter, setFilter] = useState("all"), [query, setQuery] = useState(""), [showArchived, setShowArchived] = useState(false), [uploadCategory, setUploadCategory] = useState("plans");
  const input = useRef(null);
  const load = () => listAttachments(project.id, null, { includeArchived: true }).then((value) => setItems(value.attachments || value || [])).catch((reason) => setError(reason.message));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (files) => { setBusy(true); setError(""); try { for (const file of files) await uploadAttachment(project.id, "", file, uploadCategory, "DOCUMENTS"); await load(); } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  const change = async (item, changes) => { setBusy(true); setError(""); try { await updateAttachment(project.id, item.id, changes); await load(); } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  const active = items.filter((item) => !item.archived), archived = items.filter((item) => item.archived);
  const counts = useMemo(() => Object.fromEntries(DOCUMENT_CATEGORIES.map(([id]) => [id, active.filter((item) => (item.category || "autres") === id).length])), [items]); // eslint-disable-line react-hooks/exhaustive-deps
  const pool = showArchived ? archived : active;
  const shown = pool.filter((item) => (filter === "all" || (item.category || "autres") === filter) && (!query.trim() || item.filename.toLowerCase().includes(query.trim().toLowerCase())));
  return <main className="project-documents layout-portfolio" data-project-documents onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); add([...event.dataTransfer.files]); }}>
    <header><div><span className="eyebrow">DOCUMENTS DU PROJET</span><h1>Pièces et références</h1><p>Centralisez ici les plans, notices et pièces DCE utilisés dans le CCTP, le DPGF et la consultation.</p></div>
      <div className="documents-import"><label>Catégorie<select data-doc-upload-category value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>{DOCUMENT_CATEGORIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <button type="button" className="primary" data-doc-import disabled={busy} onClick={() => input.current?.click()}><Plus size={15}/> Importer</button>
        <input ref={input} type="file" hidden multiple data-doc-file accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => { add([...event.target.files]); event.target.value = ""; }} /></div></header>
    {error && <div className="project-documents-error" role="alert">{error}</div>}
    {items.length === 0 ? <button type="button" className="documents-dropzone" onClick={() => input.current?.click()}><FolderOpen size={30}/><b>Déposez les documents du projet ici</b><span>PDF, Word, Excel et images — ils restent disponibles dans tout le projet.</span></button> : <>
      <div className="documents-toolbar" data-doc-toolbar>
        <label className="library-search"><Search size={15}/><input type="search" data-doc-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un document…" aria-label="Rechercher un document"/></label>
        <label className="inline-check"><input type="checkbox" data-doc-show-archived checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)}/> Archivés ({archived.length})</label>
      </div>
      <nav className="documents-categories" data-doc-categories aria-label="Catégories">
        <button type="button" className={filter === "all" ? "active" : ""} data-doc-category="all" onClick={() => setFilter("all")}>Tous <b>{active.length}</b></button>
        {DOCUMENT_CATEGORIES.map(([id, name]) => <button key={id} type="button" className={filter === id ? "active" : ""} data-doc-category={id} onClick={() => setFilter(id)}>{name} <b>{counts[id]}</b></button>)}
      </nav>
      {shown.length === 0 ? <p className="panel-empty" data-doc-empty>{showArchived ? "Aucun document archivé." : "Aucun document ne correspond."}</p> : <ul className="documents-list" data-doc-list>
        {shown.map((item) => <li key={item.id} data-doc={item.id} className={item.archived ? "archived" : ""}>
          <span className="doc-icon"><File size={18}/></span>
          <div className="doc-main"><b title={item.filename}>{item.filename}</b><small>{label(item.category)} · {size(item.size)} · {new Date(item.createdAt).toLocaleDateString("fr-FR")}{item.uploadedBy ? ` · ajouté par ${item.uploadedBy}` : ""} · <span data-doc-origin>Ajouté depuis {ORIGIN[item.importContext] || "CCTP"}</span>{item.estimateLinked ? <span data-doc-estimate-linked> · associé à l’estimation</span> : null}</small></div>
          <select data-doc-category-select value={item.category || "autres"} disabled={busy || item.archived} aria-label={`Catégorie de ${item.filename}`} onChange={(event) => change(item, { category: event.target.value })}>{DOCUMENT_CATEGORIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <a className="doc-action" data-doc-download href={attachmentFileUrl(project.id, item.id)} download={item.filename} title="Télécharger"><Download size={15}/> Télécharger</a>
          <button type="button" className="doc-action" data-doc-archive disabled={busy} onClick={() => change(item, { archived: !item.archived })}>{item.archived ? <><RotateCcw size={15}/> Restaurer</> : <><Archive size={15}/> Archiver</>}</button>
        </li>)}
      </ul>}
    </>}
  </main>;
}
