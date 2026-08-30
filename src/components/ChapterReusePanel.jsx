import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, FileText, GitCompareArrows, Layers3, Search, X } from 'lucide-react';
import { getChapterReuseSources } from '../api/client';

const normalize=value=>(value||'').toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^\d+(?:\.\d+)*[\s.\-–—:]*/,'').replace(/\s+/g,' ').trim();
const blocks=value=>(value||'').split(/\n\s*\n|(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/).map(item=>item.replace(/\s+/g,' ').trim()).filter(item=>item.length>2);
const isHeading=value=>/^\d+(?:\.\d+)*(?:[\s.\-–—:]+|$)/.test(value)||(/^[A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 '\-/]{4,90}$/.test(value)&&value.length<95);

function sections(value){
  const result=[];let current={title:'Introduction et dispositions générales',heading:'',paragraphs:[]};
  blocks(value).forEach(block=>{if(isHeading(block)){if(current.heading||current.paragraphs.length)result.push(current);current={title:block.replace(/^\d+(?:\.\d+)*[\s.\-–—:]*/,''),heading:block,paragraphs:[]}}else current.paragraphs.push(block)});
  if(current.heading||current.paragraphs.length)result.push(current);
  return result;
}

function sectionRows(currentText,sourceText){
  const current=sections(currentText),source=sections(sourceText),used=new Set();
  return source.map((incoming,index)=>{let match=current.findIndex((item,i)=>!used.has(i)&&normalize(item.title)===normalize(incoming.title));if(match<0&&index<current.length&&!used.has(index))match=index;if(match>=0)used.add(match);const local=match>=0?current[match]:null;const same=local&&normalize(local.paragraphs.join(' '))===normalize(incoming.paragraphs.join(' '));return{id:`part-${index}`,local,incoming,status:!local?'new':same?'same':'changed'}});
}

export function ChapterReusePanel({cctpId,chapterId,chapterTitle,currentText,onClose,onMerge}){
  const [sources,setSources]=useState([]),[sourceId,setSourceId]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[applied,setApplied]=useState([]),[expanded,setExpanded]=useState({}),[excerpt,setExcerpt]=useState(null),[excerptAdded,setExcerptAdded]=useState(false);
  useEffect(()=>{getChapterReuseSources(cctpId,chapterId).then(items=>{setSources(items);setSourceId(items[0]?.id||'')}).catch(item=>setError(item.message)).finally(()=>setLoading(false))},[cctpId,chapterId]);
  const source=sources.find(item=>item.id===sourceId);
  const allRows=useMemo(()=>sectionRows(currentText,source?.content||''),[currentText,source]);
  const rows=useMemo(()=>{const needle=normalize(query);return allRows.filter(row=>!needle||normalize(`${row.incoming.title} ${row.incoming.paragraphs.join(' ')}`).includes(needle))},[allRows,query]);
  const changed=allRows.filter(row=>row.status==='changed').length,newCount=allRows.filter(row=>row.status==='new').length,same=allRows.filter(row=>row.status==='same').length;
  const apply=row=>{onMerge({mode:row.local?'replace':'add',anchor:row.local?.heading||row.local?.paragraphs[0]||'',heading:row.incoming.heading,paragraphs:row.incoming.paragraphs,highlight:true});setApplied(items=>[...items,row.id])};
  const captureExcerpt=(event,row)=>{if(event.target.closest('button'))return;const selection=window.getSelection();const text=selection?.toString().replace(/\s+/g,' ').trim();if(!text||text.length<3||!event.currentTarget.contains(selection.anchorNode)||!event.currentTarget.contains(selection.focusNode))return;setExcerpt({text,anchor:row.local?.heading||row.local?.paragraphs[0]||''});setExcerptAdded(false)};
  const addExcerpt=()=>{if(!excerpt)return;onMerge({mode:'add',anchor:excerpt.anchor,heading:'',paragraphs:[excerpt.text],highlight:true});setExcerptAdded(true);window.getSelection()?.removeAllRanges()};
  return <><div className="reuse-backdrop" onClick={onClose}/><aside className="reuse-panel reuse-merge-panel">
    <header><div><small>FUSION ENTRE DEUX CCTP</small><h2>{chapterTitle}</h2></div><button onClick={onClose}><X size={18}/></button></header>
    <div className="merge-summary"><GitCompareArrows size={19}/><span><b>{changed} partie{changed>1?'s':''} modifiée{changed>1?'s':''}</b><small>{newCount} nouvelle{newCount>1?'s':''} · {same} identique{same>1?'s':''}</small></span><p>Comparez des parties complètes. Rien n’est modifié tant que vous ne choisissez pas une version.</p></div>
    {loading?<div className="reuse-state">Préparation de la comparaison…</div>:error?<div className="login-error">{error}</div>:sources.length===0?<div className="reuse-state"><FileText size={25}/><b>Aucun autre CCTP ne contient ce lot</b><span>Ajoutez ce lot dans un autre CCTP ou importez un ancien document de référence.</span></div>:<>
      <div className="reuse-merge-controls"><label><span>Comparer avec</span><select value={sourceId} onChange={event=>{setSourceId(event.target.value);setApplied([])}}>{sources.map(item=><option key={`${item.type}-${item.id}`} value={item.id}>{item.type==='reference'?'Modèle importé':'CCTP'} · {item.title}{item.archived?' (archivé)':''}</option>)}</select></label><label className="reuse-search"><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher une partie ou une prescription…"/></label></div>
      <div className="reuse-merge-head"><span>VOTRE LOT ACTUEL</span><GitCompareArrows size={16}/><span>{source?.title}</span></div>
      <section className="section-merge-list">{rows.map((row,index)=>{const open=expanded[row.id]??row.status!=='same';const done=applied.includes(row.id);return <article className={`section-merge-card ${row.status}`} id={row.id} key={row.id}><header onClick={()=>setExpanded(value=>({...value,[row.id]:!open}))}><span className="section-index">{String(index+1).padStart(2,'0')}</span><span><b>{row.incoming.title}</b><small>{row.status==='same'?'Partie identique':row.status==='new'?'Nouvelle partie disponible':'Différences détectées dans cette partie'}</small></span><i>{row.status==='same'?'Identique':row.status==='new'?'Nouveau':'À comparer'}</i><ChevronDown className={open?'open':''} size={17}/></header>{open&&<div className="section-merge-body"><div><small>VERSION ACTUELLE</small>{row.local?<><h3>{row.local.heading||row.local.title}</h3>{row.local.paragraphs.map((text,i)=><p key={i}>{text}</p>)}</>:<div className="section-empty">Cette partie n’existe pas encore.</div>}</div><div className="selectable-source" onMouseUp={event=>captureExcerpt(event,row)}><small>VERSION DU CCTP SÉLECTIONNÉ · SÉLECTIONNEZ LIBREMENT DU TEXTE</small><h3>{row.incoming.heading||row.incoming.title}</h3>{row.incoming.paragraphs.map((text,i)=><p key={i}>{text}</p>)}{row.status!=='same'&&<button disabled={done} onClick={()=>apply(row)}>{done?<><Check size={15}/> Version récupérée</>:<><Layers3 size={15}/> {row.local?'Utiliser cette version':'Ajouter toute cette partie'}</>}</button>}</div></div>}</article>})}{!rows.length&&<div className="reuse-state">Aucune partie ne correspond à cette recherche.</div>}</section>
    </>}
    {excerpt&&<div className="excerpt-action"><span><b>Extrait sélectionné</b><small>« {excerpt.text.slice(0,180)}{excerpt.text.length>180?'…':''} »</small></span><button disabled={excerptAdded} onClick={addExcerpt}>{excerptAdded?<><Check size={15}/> Extrait ajouté</>:<>Insérer cet extrait dans mon lot</>}</button><button className="excerpt-close" onClick={()=>setExcerpt(null)}><X size={14}/></button></div>}
    <footer><span>Chaque partie récupérée reste entièrement modifiable dans votre document.</span><button onClick={onClose}>Terminer la comparaison</button></footer>
  </aside></>;
}
