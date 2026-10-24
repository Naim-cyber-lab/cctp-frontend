import { AlertTriangle, FileText, ShieldCheck, Trash2, Upload, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { deleteReferenceCctp, getOrganization, listReferenceCctps, shareReferenceCctp, uploadReferenceCctp } from '../api/client';
import '../reference-drop.css';

export function ReferenceCctpLibrary({onClose,onCountChange}) {
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [error,setError]=useState('');
  const [teamRole,setTeamRole]=useState(null);
  useEffect(()=>{getOrganization().then(team=>setTeamRole(team?.organization?team.role:null)).catch(()=>{})},[]);
  const canShare=teamRole==='admin'||teamRole==='validator';
  const toggleShare=async item=>{setError('');try{const updated=await shareReferenceCctp(item.id,!item.shared);setItems(list=>list.map(entry=>entry.id===item.id?{...entry,shared:updated.shared}:entry))}catch(reason){setError(reason.message)}};
  const picker=useRef();
  const confirmation=useRef(null);
  const deletingRef=useRef(false);
  const [pendingDelete,setPendingDelete]=useState(null);
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  useEffect(()=>{if(pendingDelete)confirmation.current?.showModal();else confirmation.current?.close()},[pendingDelete]);
  const cancelDelete=()=>{if(!deletingRef.current){setPendingDelete(null);setDeleteError('')}};
  const refresh=()=>listReferenceCctps().then(values=>{setItems(values);onCountChange?.(values.length)}).catch(reason=>setError(reason.message)).finally(()=>setLoading(false));
  useEffect(()=>{refresh()},[]);

  const uploadFiles=async selectedFiles=>{
    const files=Array.from(selectedFiles||[]);
    if(!files.length)return;
    const invalid=files.find(file=>!(/\.(pdf|docx)$/i.test(file.name)));
    if(invalid){setDragging(false);setError(`Le fichier « ${invalid.name} » n’est pas un PDF ou un document Word (.docx).`);return}
    setUploading(true);setDragging(false);setError('');
    try{for(const file of files)await uploadReferenceCctp(file);await refresh()}catch(reason){setError(reason.message)}finally{setUploading(false)}
  };
  const upload=event=>{uploadFiles(event.target.files);event.target.value=''};
  const drop=event=>{event.preventDefault();event.stopPropagation();if(!uploading)uploadFiles(event.dataTransfer.files)};
  const remove=async()=>{
    if(!pendingDelete||deletingRef.current)return;
    deletingRef.current=true;setDeleting(true);setDeleteError('');
    try{
      await deleteReferenceCctp(pendingDelete.id);
      const next=items.filter(item=>item.id!==pendingDelete.id);
      setItems(next);onCountChange?.(next.length);setPendingDelete(null);
    }catch(reason){setDeleteError(reason.message||'La suppression a échoué. Réessayez.')}
    finally{deletingRef.current=false;setDeleting(false)}
  };  const dragProps={onDragEnter:event=>{event.preventDefault();setDragging(true)},onDragOver:event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';setDragging(true)},onDragLeave:event=>{event.preventDefault();if(!event.currentTarget.contains(event.relatedTarget))setDragging(false)},onDrop:drop};

  return <div className={`reference-library-layer ${dragging?'is-dragging':''}`} {...dragProps}>
    <div className="reference-backdrop" onClick={onClose}/>
    <aside className="reference-library">
      <header><div><small>PERSONNALISATION DU COMPTE</small><h2>Vos CCTP de référence</h2></div><button onClick={onClose}><X size={18}/></button></header>
      <p>Ajoutez vos anciens CCTP : ils ne sont pas ouverts comme documents à modifier (pour cela, utilisez « Importer PDF ou Word » dans Vos CCTP). Calepin en analyse la présentation et le style rédactionnel pour personnaliser vos futurs documents.</p>
      <div className="reference-privacy"><ShieldCheck size={17}/><span><b>Documents strictement confidentiels</b><small>Vos CCTP sont isolés dans votre compte. Ils ne sont accessibles, consultables ou réutilisables par aucun autre utilisateur et ne servent jamais à personnaliser son IA.</small></span></div>
      {!loading&&items.length===0&&<div className="reference-warning"><AlertTriangle size={18}/><span><b>Ajoutez au moins un modèle CCTP</b><small>Sans document de référence, l’IA utilise une présentation générique. Importez un ancien CCTP pour qu’elle adapte la page de garde, la structure et le style rédactionnel à vos habitudes.</small></span></div>}
      <input ref={picker} hidden multiple type="file" accept=".pdf,.docx" onChange={upload}/>
      <button className={`reference-upload ${dragging?'is-dragging':''}`} onClick={()=>picker.current.click()} disabled={uploading}><Upload size={19}/><span><b>{uploading?'Analyse des documents…':'Glissez-déposez vos CCTP sur toute la page'}</b>{!uploading&&<small>ou cliquez pour choisir plusieurs fichiers PDF ou Word</small>}</span></button>
      {error&&<div className="login-error">{error}</div>}
      <section className="reference-list">{loading?<p>Chargement…</p>:items.length===0?<div className="reference-empty"><FileText size={28}/><b>Aucun modèle ajouté</b><span>Importez un ou plusieurs CCTP représentatifs de votre manière de travailler.</span></div>:items.map(item=><article key={item.id} data-reference={item.filename} data-shared={item.shared?'true':'false'}><FileText size={18}/><span><b>{item.filename}</b><small>{Math.max(1,Math.round(item.size/1024))} Ko · Présentation et rédaction analysées{item.shared&&<> · <em className="reference-shared-badge">{item.mine?'Partagé avec l’équipe':`Partagé par ${item.ownerEmail||'un collègue'}`}</em></>}</small></span>{item.mine&&canShare&&<button data-share onClick={()=>toggleShare(item)} title={item.shared?'Ne plus partager avec l’équipe':'Partager avec l’équipe'} aria-label={`${item.shared?'Ne plus partager':'Partager avec l’équipe'} le modèle ${item.filename}`}><Users size={15}/></button>}{item.mine&&<button onClick={()=>{setDeleteError('');setPendingDelete(item)}} title="Supprimer" aria-label={`Supprimer le modèle ${item.filename}`}><Trash2 size={15}/></button>}</article>)}</section>
    </aside>
    <dialog ref={confirmation} className="confirm-dialog reference-delete-dialog" aria-labelledby="reference-delete-title" aria-describedby="reference-delete-description" onCancel={event=>{event.preventDefault();cancelDelete()}} onClick={event=>{if(event.target===event.currentTarget){const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)cancelDelete()}}}>
      <button className="confirm-close" onClick={cancelDelete} disabled={deleting} aria-label="Fermer"><X size={18}/></button>
      <span className="confirm-icon"><Trash2 size={22}/></span>
      <h2 id="reference-delete-title">Supprimer ce modèle CCTP ?</h2>
      <p id="reference-delete-description">Voulez-vous vraiment supprimer <strong style={{overflowWrap:'anywhere'}}>« {pendingDelete?.filename} »</strong> de vos modèles de référence ?</p>
      {deleteError&&<div className="confirm-error" role="alert">{deleteError}</div>}
      <div className="confirm-actions"><button className="confirm-cancel" autoFocus onClick={cancelDelete} disabled={deleting}>Annuler</button><button className="confirm-delete" onClick={remove} disabled={deleting}><Trash2 size={15}/>{deleting?'Suppression…':'Supprimer'}</button></div>
    </dialog>
    {dragging&&!uploading&&<div className="reference-page-drop"><Upload size={34}/><b>Déposez vos CCTP</b><span>PDF ou Word · plusieurs fichiers acceptés</span></div>}
  </div>;
}
