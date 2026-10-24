import { useRef, useState } from 'react';
import { FileText, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import '../reference-drop.css';
import '../import-cctp.css';

export function ImportCctpModal({onClose,onImport}){
  const [file,setFile]=useState(null);
  const [name,setName]=useState('');
  const [dragging,setDragging]=useState(false);
  const [importing,setImporting]=useState(false);
  const [error,setError]=useState('');
  const picker=useRef();

  const pick=selected=>{
    const chosen=selected?.[0];
    if(!chosen)return;
    if(!/\.(pdf|docx)$/i.test(chosen.name)){setError(`Le fichier « ${chosen.name} » n’est pas un PDF ou un document Word (.docx).`);return}
    setError('');setFile(chosen);setName(current=>current||chosen.name.replace(/\.(pdf|docx)$/i,''));
  };
  const dragProps={onDragEnter:event=>{event.preventDefault();setDragging(true)},onDragOver:event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';setDragging(true)},onDragLeave:event=>{event.preventDefault();if(!event.currentTarget.contains(event.relatedTarget))setDragging(false)},onDrop:event=>{event.preventDefault();event.stopPropagation();setDragging(false);pick(event.dataTransfer.files)}};

  const submit=async()=>{
    if(!file)return;
    setImporting(true);setError('');
    try{await onImport(file,name)}
    catch(reason){setError(reason.message);setImporting(false)}
  };

  return <div className={`reference-library-layer ${dragging?'is-dragging':''}`} {...dragProps}>
    <div className="reference-backdrop" onClick={importing?undefined:onClose}/>
    <aside className="reference-library import-cctp-modal">
      <header><div><small>NOUVEAU CCTP</small><h2>Importer un CCTP existant</h2></div><button onClick={onClose} disabled={importing}><X size={18}/></button></header>
      <p>Déposez un PDF ou un document Word déjà rédigé. Il apparaîtra ensuite dans <strong>Vos CCTP</strong> comme un véritable document de travail : lots, textes et page de garde seront récupérés et resteront modifiables avec l’éditeur, l’IA et la comparaison. Il est aussi ajouté à vos <strong>modèles de référence</strong> pour que l’IA apprenne votre présentation et votre style rédactionnel.</p>
      <div className="reference-privacy"><ShieldCheck size={17}/><span><b>Document strictement confidentiel</b><small>Il est importé uniquement dans votre compte et n’est jamais accessible ni réutilisable par un autre utilisateur.</small></span></div>
      <input ref={picker} hidden type="file" accept=".pdf,.docx" onChange={event=>pick(event.target.files)}/>
      {importing
        ?<div className="import-cctp-progress" role="status" aria-live="polite"><Loader2 size={26} className="import-cctp-spinner"/><b>Analyse et import en cours…</b><small>Lecture du document, reconnaissance des lots et de la mise en page. Cela peut prendre quelques instants selon la taille du fichier.</small></div>
        :!file
          ?<button className={`reference-upload ${dragging?'is-dragging':''}`} onClick={()=>picker.current?.click()}><Upload size={19}/><span><b>Glissez-déposez votre CCTP ici</b><small>ou cliquez pour parcourir vos fichiers · PDF ou Word · 30 Mo maximum</small></span></button>
          :<div className="import-cctp-chosen"><FileText size={20}/><span><b>{file.name}</b><small>{Math.max(1,Math.round(file.size/1024))} Ko</small></span><button onClick={()=>{setFile(null);setName('')}} disabled={importing}><X size={14}/></button></div>}
      {file&&!importing&&<label className="import-cctp-name"><span>Nom du CCTP</span><input value={name} onChange={event=>setName(event.target.value)} maxLength={100} placeholder="Ex. Rénovation école Jean Moulin"/></label>}
      {error&&<div className="login-error">{error}</div>}
      <button className="primary import-cctp-submit" disabled={!file||importing} onClick={submit}>{importing?<><Loader2 size={16} className="import-cctp-spinner"/> Analyse et import en cours…</>:'Importer et ouvrir le CCTP'}</button>
    </aside>
  </div>;
}
