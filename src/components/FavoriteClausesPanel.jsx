import { useEffect, useState } from 'react';
import { Bookmark, Trash2, X } from 'lucide-react';
import { deleteFavoriteClause, listFavoriteClauses } from '../api/client';

export function FavoriteClausesPanel({chapterId,onClose,onInsert}){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{setLoading(true);listFavoriteClauses(chapterId).then(setItems).catch(reason=>setError(reason.message)).finally(()=>setLoading(false))},[chapterId]);
  const remove=async(event,id)=>{event.stopPropagation();try{await deleteFavoriteClause(id);setItems(current=>current.filter(item=>item.id!==id))}catch(reason){setError(reason.message)}};
  return <><div className="reuse-backdrop" onClick={onClose}/><aside className="reuse-panel favorites-panel">
    <header><div><small>BIBLIOTHÈQUE</small><h2>Mes clauses favorites</h2></div><button onClick={onClose}><X size={18}/></button></header>
    <p>Réutilisez en un clic un paragraphe déjà épinglé, sans repartir le chercher dans un autre CCTP.</p>
    {loading?<div className="reuse-state">Chargement…</div>
      :error?<div className="login-error">{error}</div>
      :!items.length?<div className="reuse-state"><Bookmark size={25}/><b>Aucune clause épinglée</b><span>Cliquez dans un paragraphe puis sur « Épingler ce paragraphe » dans la barre d’outils (ou sélectionnez un extrait pendant une comparaison de lots) pour le retrouver ici.</span></div>
      :<div className="favorites-list">{items.map(item=><article className="favorite-clause-card" key={item.id} onClick={()=>onInsert(item.text)}>
          <header><b>{item.label}</b>{item.source_title&&<small>Depuis {item.source_title}</small>}</header>
          <p>{item.text.length>320?`${item.text.slice(0,320)}…`:item.text}</p>
          <footer><span>Cliquez pour insérer</span><button className="favorite-clause-delete" onClick={event=>remove(event,item.id)} title="Supprimer"><Trash2 size={13}/></button></footer>
        </article>)}</div>}
  </aside></>;
}
