import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, FileSearch, FileText, Info, Layers3, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { WorksRecap } from './WorksRecap';
import { SaveWorkTemplateModal } from './SaveWorkTemplateModal';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { downloadWorksRecap, listWorkTemplates } from '../api/client';
import { useEffect, useMemo, useState } from 'react';
import { isQuestionVisible } from '../utils/questionnaireLogic';

const parseOptions=value=>(value||'').split(';').map(item=>item.trim()).filter(Boolean);
const isProjectQuestion=id=>/^Q-(?:P|R)\d+$/.test(id);
const widgetScope=widget=>widget.questions.every(isProjectQuestion)?'project':'work';
// Ces codes doivent rester alignés avec ceux attendus par les moteurs de rendu CCTP et
// Notice (platrerie_cctp_renderer.py / platrerie_notice_renderer.py).
const FAMILY_CODE={CLO:'cloison',DOU:'doublage',PLF:'plafond',GAI:'gaine',HAB:'habillage',PFI:'protection_feu',ACO:'acoustique',COM:'combles',END:'enduit'};
// Ces cartes ne concernent que les ouvrages de la famille correspondante (mise en page en
// colonnes façon « type de cloison / de plafond… », comme dans la maquette de référence).
const WIDGET_FAMILY={'CW-FAMILY-CLO':'cloison','CW-FAMILY-DOU':'doublage','CW-FAMILY-PLF':'plafond','CW-FAMILY-GAI':'gaine','CW-FAMILY-HAB':'habillage','CW-FAMILY-PFI':'protection_feu','CW-FAMILY-ACO':'acoustique','CW-FAMILY-COM':'combles','CW-FAMILY-END':'enduit','CW-SPEC-PLF':'plafond','CW-SPEC-GAI':'gaine','CW-SPEC-PFI':'protection_feu'};
const FAMILY_DESC={cloison:'Distribution, séparation, cloison spéciale',doublage:'Doublage thermique, acoustique ou habillage de mur',plafond:'Fixe, suspendu, démontable, acoustique',gaine:'Gaines techniques, réseaux, coffres',habillage:'Bâtis-supports, poutres, retombées, éléments divers',protection_feu:'Protection de structure ou élément existant',acoustique:'Panneaux, îlots et corrections acoustiques',combles:'Rampants, combles perdus ou aménagés',enduit:'Enduits plâtre, reprises et réparations'};
const FAMILY_LABEL={cloison:'Cloison',doublage:'Doublage',plafond:'Plafond / faux-plafond',gaine:'Gaine / coffre',habillage:'Habillage',protection_feu:'Protection feu',acoustique:'Traitement acoustique',combles:'Combles / rampants',enduit:'Enduit / reprise'};
// Une proposition IA n'est pertinente que pour l'ouvrage dont la réponse en est issue.
const sameAsCandidate=(candidate,value)=>candidate&&String(Array.isArray(value)?value.join(' ; '):value??'')===String(Array.isArray(candidate.value)?candidate.value.join(' ; '):candidate.value??'');
const filled=value=>value!==''&&value!=null&&(!Array.isArray(value)||value.length>0);
const answeredCount=(questions,answers)=>questions.filter(question=>{const value=answers[question.id];return value!==''&&value!=null&&(!Array.isArray(value)||value.length)}).length;

// Retours MOE V22.5 : formulation contextualisée de l'étanchéité à l'air pour une cloison.
const labelFor=(question,family)=>question.id==='Q-AIR01'&&family==='cloison'?'Une continuité d’étanchéité à l’air avec le doublage est-elle requise ?':question.label;
// Questions à choix multiples : une pastille par choix (plusieurs possibles). La valeur reste le texte « a ; b » attendu par la rédaction.
const MULTI_TYPES=['multi','multi_text'];
const isNone=item=>/^aucune?( particularité)?$/i.test(item.trim());
const asItems=value=>(Array.isArray(value)?value:String(value??'').split(' ; ')).map(item=>String(item).trim()).filter(Boolean);
const EXTRA_PREFIX='Autre : ';

function QuestionField({question,value,onChange,candidate,family}){
 const options=parseOptions(question.options); const isLong=['textarea','multi_text','responsibility_matrix'].includes(question.answer_type);
 const label=labelFor(question,family);
 if(options.length&&MULTI_TYPES.includes(question.answer_type)){
  const items=asItems(value); const extra=question.id==='Q-P06'?(items.find(item=>item.startsWith(EXTRA_PREFIX))||'').slice(EXTRA_PREFIX.length):'';
  const chosen=question.id==='Q-P06'?items.filter(item=>!item.startsWith(EXTRA_PREFIX)):items;
  const shown=[...options,...chosen.filter(item=>!options.includes(item))];
  const commit=(list,extraText)=>{const out=[...list];if(question.id==='Q-P06'&&extraText.trim())out.push(EXTRA_PREFIX+extraText.trim());onChange(out.join(' ; '))};
  const toggle=option=>{
   const on=chosen.includes(option);
   let next=on?chosen.filter(item=>item!==option):[...chosen,option];
   if(!on&&isNone(option))next=[option]; else if(!on)next=next.filter(item=>!isNone(item));
   commit(next,isNone(option)&&!on?'':extra);
  };
  return <div className="pl-question pl-multi" data-question-id={question.id} data-multi-question><span className="pl-question-head"><b>{label}</b><small>{question.id}</small></span>
   <div className="pl-chips" role="group" aria-label={label}>{shown.map(option=><button type="button" key={option} className={chosen.includes(option)?'on':''} aria-pressed={chosen.includes(option)} data-choice={option} onClick={()=>toggle(option)}>{option}</button>)}</div>
   {question.id==='Q-P06'&&<div className="pl-extra"><b>Quelles limites de prestations voulez-vous ajouter ?</b><textarea rows={2} data-multi-extra value={extra} onChange={event=>commit(chosen.filter(item=>!isNone(item)),event.target.value)} placeholder="Ajoutez ici une limite particulière au projet…"/></div>}
   {candidate&&<span className="pl-evidence"><Sparkles size={12}/><span><b>Proposition IA · {Math.round(candidate.confidence*100)} %</b><small>{candidate.evidence||candidate.source}</small></span></span>}
  </div>;
 }
 return <label className="pl-question" data-question-id={question.id}><span className="pl-question-head"><b>{label}</b><small>{question.id}</small></span>{options.length&&question.answer_type==='single'?<select value={value||''} onChange={event=>onChange(event.target.value)}><option value="">Sélectionner…</option>{options.map(option=><option key={option}>{option}</option>)}</select>:isLong?<textarea rows={3} value={Array.isArray(value)?value.join(' ; '):value||''} onChange={event=>onChange(event.target.value)} placeholder="À renseigner…"/>:<input value={Array.isArray(value)?value.join(' ; '):value||''} onChange={event=>onChange(event.target.value)} placeholder={options.length?options.join(' · '):'À renseigner…'}/>} {candidate&&<span className="pl-evidence"><Sparkles size={12}/><span><b>Proposition IA · {Math.round(candidate.confidence*100)} %</b><small>{candidate.evidence||candidate.source}</small></span></span>}</label>
}

/** Indicateurs de la « revue documentaire » : calculés sur les mêmes questions visibles que le questionnaire (même moteur de règles). */
export function enumerateQuestions(manifest,state){
 const questionMap=Object.fromEntries(manifest.questions.map(question=>[question.id,question]));
 const widgets=manifest.widgets.map(widget=>({...widget,scope:widgetScope(widget)}));
 const visible=(widget,answers)=>widget.questions.map(id=>questionMap[id]).filter(question=>question&&isQuestionVisible(question.id,manifest.applicability,answers));
 const items=[];
 widgets.filter(widget=>widget.scope==='project').forEach(widget=>visible(widget,state.project).forEach(question=>items.push({scope:'project',id:question.id,question,value:state.project[question.id],answered:filled(state.project[question.id])})));
 (state.works||[]).forEach(work=>{const answers={...state.project,...(work.answers||{})};widgets.filter(widget=>widget.scope==='work'&&(!WIDGET_FAMILY[widget.id]||WIDGET_FAMILY[widget.id]===work.family)).forEach(widget=>visible(widget,answers).forEach(question=>items.push({scope:work.id,work,id:question.id,question,value:(work.answers||{})[question.id],answered:filled((work.answers||{})[question.id])})))});
 return items;
}
export function questionnaireStats(manifest,state){
 const items=enumerateQuestions(manifest,state);
 const prov=item=>state.provenance?.[item.scope]?.[item.id];
 const proposals=items.filter(item=>prov(item)?.status==='DOCUMENT_INFERRED');
 return {total:items.length,answered:items.filter(item=>item.answered).length,found:items.filter(item=>prov(item)?.status==='DOCUMENT_CONFIRMED').length,
  toVerify:proposals.filter(item=>prov(item).validation==='UNREVIEWED').length,proposals:proposals.length,verified:proposals.filter(item=>prov(item).validation!=='UNREVIEWED').length,
  missing:items.filter(item=>!item.answered).length,conflicts:(state.conflicts||[]).filter(conflict=>!conflict.resolved).length};
}

const REVIEW_FILTERS=[['all','Tous'],['toverify','À vérifier'],['tofill','À compléter'],['found','Trouvés dans les documents'],['conflict','Conflits']];
const where=item=>`${item.documentName||'document'}${item.page?` — p.${item.page}`:''}`;

/** Provenance d'une réponse issue des documents : trouvée (vert), à confirmer (bleu), modifiée / confirmée, ou conflit à arbitrer. */
function ProvenanceBar({prov,conflict,onConfirm,onUseCandidate,onOpenSource}){
 if(conflict&&!conflict.resolved)return <div className="pl-conflict" data-conflict={conflict.questionId} role="group" aria-label="Documents contradictoires">
  <b>⚠ {conflict.kind==='update'?'Nouvelle information contradictoire détectée':'Documents contradictoires'}</b>
  {conflict.candidates.map((candidate,index)=><div key={index} data-conflict-candidate><span><b>{candidate.documentName||'Votre réponse'}{candidate.page?` — p.${candidate.page}`:''}</b> : {String(candidate.value)}</span>
   <span>{candidate.documentId&&<button type="button" className="link-button" onClick={()=>onOpenSource(candidate)}>Voir la source</button>}<button type="button" data-conflict-use onClick={()=>onUseCandidate(candidate)}>Utiliser {String(candidate.value)}</button></span></div>)}
  <small>Vous pouvez aussi saisir une autre valeur dans le champ ci-dessus : le conflit disparaît dès que vous la validez.</small></div>;
 if(!prov)return null;
 const reviewed=prov.validation!=='UNREVIEWED';
 const kind=prov.validation==='EDITED_BY_USER'?'edited':prov.validation==='CONFIRMED_BY_USER'?'confirmed':prov.status==='DOCUMENT_INFERRED'?'inferred':'found';
 return <div className={`pl-prov pl-prov-${kind}`} data-provenance={kind}>
  <span>{kind==='found'&&<>🟢 Trouvé dans les documents — {where(prov)}</>}{kind==='inferred'&&<>🔵 Proposition à confirmer — {where(prov)}</>}
   {kind==='confirmed'&&<>✓ Confirmé par vous — {where(prov)}</>}{kind==='edited'&&<>✎ Modifié par vous — valeur du document : {String(prov.original)} ({where(prov)})</>}</span>
  <span>{prov.documentId&&<button type="button" className="link-button" data-prov-source onClick={()=>onOpenSource(prov)}>Voir la source</button>}
   {!reviewed&&<button type="button" data-prov-confirm onClick={onConfirm}>Confirmer</button>}</span>
 </div>;
}

const DOC_MODES=[{id:'notice',label:'Notice descriptive',hint:'Synthétique, centrée sur les prestations essentielles'},{id:'cctp',label:'CCTP détaillé',hint:'Prescription technique et contractuelle complète'}];

export function PlatrerieQuestionnaire({focus,manifest,state,candidates,onOpenProof,docMode,onChangeDocMode,projectId,onChangeProject,onChangeWork,onCreateWork,onChangeWorkFamily,onDeleteWork,onDuplicateWork,onProgressChange,onBack,onGenerate,generating,onProvenance,onResolveConflict,onAddDocuments}){
 const {isAgency}=useWorkspaces();const [templateWork,setTemplateWork]=useState(null);
 const questionMap=useMemo(()=>Object.fromEntries(manifest.questions.map(question=>[question.id,question])),[manifest]);
 const candidateMap=useMemo(()=>Object.fromEntries(candidates.map(item=>[item.questionId,item])),[candidates]);
 const widgets=useMemo(()=>manifest.widgets.map(widget=>({...widget,scope:widgetScope(widget)})),[manifest]);
 const steps=useMemo(()=>[...new Set(widgets.map(widget=>widget.step))],[widgets]);
 const families=useMemo(()=>widgets.filter(widget=>widget.id.startsWith('CW-FAMILY-')).map(widget=>({code:FAMILY_CODE[widget.id.replace('CW-FAMILY-','')]||widget.id,label:FAMILY_LABEL[FAMILY_CODE[widget.id.replace('CW-FAMILY-','')]]||widget.title,desc:FAMILY_DESC[FAMILY_CODE[widget.id.replace('CW-FAMILY-','')]]||''})),[widgets]);
 const [reviewFilter,setReviewFilter]=useState('all');
 const stats=useMemo(()=>questionnaireStats(manifest,state),[manifest,state]);
 const documentReview=Boolean(state.provenance&&Object.keys(state.provenance).length)||Boolean((state.conflicts||[]).length);
 const [stepIndex,setStepIndex]=useState(0);
 const [activeWorkId,setActiveWorkId]=useState(state.works[0]?.id||null);
 const [open,setOpen]=useState(widgets[0]?.id);
 const [creating,setCreating]=useState(false);
 const [tplMode,setTplMode]=useState(false);const [templates,setTemplates]=useState(null);const [tplSearch,setTplSearch]=useState('');const [tplError,setTplError]=useState('');
 useEffect(()=>{if(!creating||!tplMode||templates)return;listWorkTemplates({lotId:'06',status:'ACTIVE'}).then(data=>setTemplates(data.templates||[])).catch(reason=>{setTemplates([]);setTplError(reason.message)})},[creating,tplMode,templates]);
 const [createFamily,setCreateFamily]=useState('');
 const [createLabel,setCreateLabel]=useState('');
 const [createLoc,setCreateLoc]=useState('');
 const [createFn,setCreateFn]=useState('');
 const [editingId,setEditingId]=useState(null);
 const activeWork=state.works.find(item=>item.id===activeWorkId)||state.works[0]||null;
 const [dismissed,setDismissed]=useState([]);
 const [recapOpen,setRecapOpen]=useState(false);
 const filtering=reviewFilter!=='all'&&documentReview;
 const showMain=!recapOpen&&!filtering;
 const asText=value=>Array.isArray(value)?value.join(' ; '):String(value??'');
 const isProjectId=id=>/^Q-(?:P|R)\d+$/.test(id);
 const currentAnswer=id=>isProjectId(id)?state.project[id]:activeWork?.answers[id];
 const proposals=candidates.filter(item=>questionMap[item.questionId]&&!dismissed.includes(item.questionId)&&asText(currentAnswer(item.questionId))!==asText(item.value));
 const canApply=item=>isProjectId(item.questionId)||Boolean(activeWork);
 const acceptProposal=item=>{if(!canApply(item))return;if(isProjectId(item.questionId))onChangeProject(item.questionId,item.value);else onChangeWork(activeWork.id,item.questionId,item.value)};
 const confident=proposals.filter(item=>item.confidence>0.9&&canApply(item));

 const allAnswersFor=work=>({...state.project,...(work?.answers||{})});
 const visibleQuestionsFor=(widget,answers)=>widget.questions.map(id=>questionMap[id]).filter(question=>question&&isQuestionVisible(question.id,manifest.applicability,answers));

 const totalProjectQuestions=widgets.filter(widget=>widget.scope==='project').flatMap(widget=>visibleQuestionsFor(widget,state.project));
 const totalWorkQuestions=state.works.reduce((sum,work)=>{const answers=allAnswersFor(work);return sum+widgets.filter(widget=>widget.scope==='work'&&(!WIDGET_FAMILY[widget.id]||WIDGET_FAMILY[widget.id]===work.family)).flatMap(widget=>visibleQuestionsFor(widget,answers)).length},0);
 const completedProject=answeredCount(totalProjectQuestions,state.project);
 const completedWork=state.works.reduce((sum,work)=>{const answers=allAnswersFor(work);const questions=widgets.filter(widget=>widget.scope==='work'&&(!WIDGET_FAMILY[widget.id]||WIDGET_FAMILY[widget.id]===work.family)).flatMap(widget=>visibleQuestionsFor(widget,answers));return sum+answeredCount(questions,work.answers)},0);
 const completed=completedProject+completedWork; const total=totalProjectQuestions.length+totalWorkQuestions;
 useEffect(()=>{onProgressChange?.({answered:completed,total})},[completed,total,onProgressChange]);

 const step=steps[stepIndex]; const stepWidgets=widgets.filter(widget=>widget.step===step);
 const stepHasWorkWidgets=stepWidgets.some(widget=>widget.scope==='work');
 const isOuvragesStep=step==='02 Ouvrages';
 const gated=stepHasWorkWidgets&&!isOuvragesStep&&!state.works.length;

 const startCreate=()=>{setTplMode(false);setCreating(true);setEditingId(null);setCreateFamily('');setCreateLabel('');setCreateLoc('');setCreateFn('')};
 const familyOfTemplate=template=>{const wanted=String(template.workFamily||'').toLowerCase();return families.find(family=>family.label.toLowerCase()===wanted)||families.find(family=>wanted.includes(family.label.toLowerCase())||family.label.toLowerCase().includes(wanted))};
 const useTemplate=template=>{const family=familyOfTemplate(template)?.code||createFamily;if(!family){setTplError('Choisissez d’abord la famille d’ouvrage correspondant à ce modèle.');return}setTplError('');const id=crypto.randomUUID();const answers={};for(const row of template.answers||[])answers[row.questionId]=row.value;onCreateWork(family,template.name,answers,id,{templateId:template.id,templateVersionId:template.currentVersionId,templateName:template.name,versionNumber:template.versionNumber});setTplMode(false);openCharacteristics(id,family)};
 const submitCreate=()=>{if(!createFamily||!createLabel.trim())return;const id=crypto.randomUUID();const extra={};if(createLoc.trim())extra['Q-W02']=createLoc.trim();if(createFn.trim())extra['Q-W04']=createFn.trim();onCreateWork(createFamily,createLabel.trim(),extra,id);openCharacteristics(id,createFamily)};
 const editWork=id=>{setActiveWorkId(id);setEditingId(id);setCreating(false)};
 // Un clic sur un ouvrage (ou sa création) mène DIRECTEMENT à ses caractéristiques : l'identité (nom, localisation, fonction) vient
 // d'être saisie à la création, et reste modifiable par le crayon ou « Modifier l'ouvrage ».
 const openCharacteristics=(id,family)=>{const next=Math.min(steps.indexOf('02 Ouvrages')+1,steps.length-1);const nextName=steps[next];const first=widgets.find(widget=>widget.step===nextName&&widget.scope==='work'&&(!WIDGET_FAMILY[widget.id]||WIDGET_FAMILY[widget.id]===family));setActiveWorkId(id);setEditingId(null);setCreating(false);setRecapOpen(false);setStepIndex(next);if(first)setOpen(first.id)};
 const removeWork=id=>{onDeleteWork(id);if(editingId===id)setEditingId(null);if(activeWorkId===id)setActiveWorkId(null)};
 const identityPending=work=>['Q-W02','Q-W04'].filter(id=>!filled(work.answers[id])).length;
 const registerWidgets=work=>widgets.filter(widget=>widget.step==='02 Ouvrages'&&widget.scope==='work'&&(!WIDGET_FAMILY[widget.id]||WIDGET_FAMILY[widget.id]===work.family));
 const editingWork=state.works.find(item=>item.id===editingId)||null;

 const readyWorks=state.works.filter(work=>Object.entries(work.answers).some(([id,value])=>id!=='Q-W01'&&filled(value)));
 const emptyWork=state.works.find(work=>!readyWorks.includes(work))||null;
 const canGenerate=readyWorks.length>0;
 const workName=work=>work.answers['Q-W01']||work.label;
 const goCreate=()=>{setStepIndex(Math.max(0,steps.indexOf('02 Ouvrages')));startCreate()};
 const goToQuestion=(work,qid)=>{const widget=widgets.find(item=>item.questions.includes(qid)&&(!WIDGET_FAMILY[item.id]||WIDGET_FAMILY[item.id]===work.family));setRecapOpen(false);setActiveWorkId(work.id);if(!widget){goDescribe(work);return}const index=steps.indexOf(widget.step);setStepIndex(Math.max(0,index));if(widget.step==='02 Ouvrages')editWork(work.id);else{setEditingId(null);setOpen(widget.id)}};
 useEffect(()=>{
  if(!focus?.questionId)return;
  const work=state.works.find(item=>item.id===focus.workId)||activeWork||state.works[0];
  if(isProjectId(focus.questionId)){const widget=widgets.find(item=>item.questions.includes(focus.questionId));if(widget){setRecapOpen(false);setStepIndex(Math.max(0,steps.indexOf(widget.step)));setOpen(widget.id)}}
  else if(work)goToQuestion(work,focus.questionId);
  const timer=setTimeout(()=>document.querySelector(`[data-question-id="${focus.questionId}"]`)?.scrollIntoView({block:'center',behavior:'smooth'}),250);
  return()=>clearTimeout(timer);
 },[focus]);
 const goDescribe=work=>{setStepIndex(Math.max(0,steps.indexOf('02 Ouvrages')));editWork(work.id)};
 const isLastStep=stepIndex>=steps.length-1;
 const nextStepLabel=(steps[stepIndex+1]||'').replace(/^\d+\s*/,'');
 const canSubmitCreate=Boolean(createFamily&&createLabel.trim());
 const goNext=()=>{
  if(isOuvragesStep&&creating){submitCreate();return}
  if(isOuvragesStep&&!state.works.length){startCreate();return}
  setStepIndex(Math.min(stepIndex+1,steps.length-1))
 };
 const blockReason=!state.works.length?'Aucun ouvrage n’a encore été créé.':`L’ouvrage « ${workName(emptyWork||state.works[0])} » est encore vide : renseignez au moins une information.`;

 return <section className="pl-questionnaire">
  <header><button onClick={onBack}><ArrowLeft size={16}/> Modifier ma demande</button><div><span><FileSearch size={18}/></span><div><b>Questionnaire canonique Plâtrerie</b><small>Décrivez vos ouvrages · seules les questions pertinentes sont affichées</small></div></div><div className="pl-doc-modes">{DOC_MODES.map(mode=><button key={mode.id} className={docMode===mode.id?'on':''} onClick={()=>onChangeDocMode(mode.id)}><FileText size={13}/><span><b>{mode.label}</b><small>{mode.hint}</small></span></button>)}</div><strong>{completed}/{total} renseignées</strong></header>
  <div className="pl-progress"><i style={{width:`${total?Math.min(100,completed/total*100):0}%`}}/></div>
  {(documentReview||onAddDocuments)&&<section className="pl-review" data-document-review>
   {documentReview&&<><b>Revue des données extraites</b>
    <span data-review-progress>{stats.verified} / {stats.proposals} proposition{stats.proposals>1?'s':''} vérifiée{stats.verified>1?'s':''} · {stats.conflicts} conflit{stats.conflicts>1?'s':''} restant{stats.conflicts>1?'s':''} · {stats.missing} information{stats.missing>1?'s':''} manquante{stats.missing>1?'s':''}</span>
    <nav className="pl-filters" aria-label="Filtrer les questions">{REVIEW_FILTERS.map(([id,label])=>{const count={all:stats.total,toverify:stats.toVerify,tofill:stats.missing,found:stats.found,conflict:stats.conflicts}[id];return <button type="button" key={id} className={reviewFilter===id?'on':''} data-review-filter={id} onClick={()=>setReviewFilter(id)}>{label}{id==='all'?'':` (${count})`}</button>})}</nav></>}
   {onAddDocuments&&<button type="button" className="secondary" data-add-documents onClick={onAddDocuments}>Ajouter des documents</button>}
  </section>}

  {proposals.length>0&&<section className="pl-proposals" data-proposals aria-label="Propositions de l’IA à valider"><header><span><b><Sparkles size={15}/> {proposals.length} proposition{proposals.length>1?'s':''} de l’IA à valider</b><small>Chaque réponse est justifiée par un extrait de vos pièces. Rien n’est appliqué sans votre accord.</small></span>{confident.length>0&&<button type="button" className="pl-accept-all" onClick={()=>confident.forEach(acceptProposal)}>Tout accepter ({confident.length} sûre{confident.length>1?'s':''}, &gt; 90 %)</button>}</header>
   <ul>{proposals.map(item=>{const question=questionMap[item.questionId];const applicable=canApply(item);const target=!isProjectId(item.questionId)&&activeWork?` · ouvrage « ${activeWork.answers['Q-W01']||activeWork.label} »`:'';return <li key={item.questionId}><div className="pl-proposal-main"><b>{question.label}</b><span className="pl-proposal-value">→ {asText(item.value)}</span><small>Confiance {Math.round(item.confidence*100)} %{target}</small></div><blockquote className="pl-proof">{item.excerpt?<>« {item.excerpt} »</>:item.evidence}{item.documentId?<button type="button" onClick={()=>onOpenProof?.(item)} title="Ouvre la pièce à la page concernée"><FileSearch size={12}/> Voir la preuve : {item.source}{item.page?`, p. ${item.page}`:''}</button>:<small>Source : {item.source}</small>}</blockquote><div className="pl-proposal-actions"><button type="button" className="accept" disabled={!applicable} title={applicable?undefined:'Créez d’abord un ouvrage pour appliquer cette réponse'} onClick={()=>acceptProposal(item)}><Check size={13}/> Accepter</button><button type="button" onClick={()=>setDismissed(list=>[...list,item.questionId])}>Ignorer</button></div></li>})}</ul></section>}
  <nav className="pl-steps">{steps.map((item,index)=><button key={item} className={!recapOpen&&index===stepIndex?'on':''} onClick={()=>{setRecapOpen(false);setStepIndex(index)}}>{item}</button>)}<button type="button" data-recap-tab className={`pl-recap-tab ${recapOpen?'on':''}`} onClick={()=>setRecapOpen(true)}>Récapitulatif{state.works.length>0&&<b>{state.works.length}</b>}</button></nav>
  {filtering&&<section className="pl-filtered" data-review-list>
   {(()=>{
    const items=enumerateQuestions(manifest,state);
    const keep=item=>{const prov=state.provenance?.[item.scope]?.[item.id];const conflict=(state.conflicts||[]).find(c=>!c.resolved&&c.questionId===item.id&&c.workId===item.scope);
     return {toverify:prov?.status==='DOCUMENT_INFERRED'&&prov.validation==='UNREVIEWED',tofill:!item.answered,found:prov?.status==='DOCUMENT_CONFIRMED',conflict:Boolean(conflict)}[reviewFilter]};
    const shown=items.filter(keep);
    // un conflit peut concerner une question que les règles masquent (ex. réponse supprimée) : il reste arbitrable
    const orphans=reviewFilter==='conflict'?(state.conflicts||[]).filter(c=>!c.resolved&&!items.some(item=>item.id===c.questionId&&item.scope===c.workId)):[];
    if(!shown.length&&!orphans.length)return <p className="consult-hint">Rien à afficher pour ce filtre : tout est traité.</p>;
    const groups=[...new Set(shown.map(item=>item.scope))];
    return <>{groups.map(scope=><div className="pl-filtered-group" key={scope}><h4>{scope==='project'?'Projet':workName(state.works.find(work=>work.id===scope)||{answers:{},label:scope})}</h4>
     <div className="pl-fields">{shown.filter(item=>item.scope===scope).map(item=>{const prov=state.provenance?.[scope]?.[item.id];const conflict=(state.conflicts||[]).find(c=>!c.resolved&&c.questionId===item.id&&c.workId===scope);
      return <div className="pl-qwrap" key={item.id}><QuestionField family={item.work?.family} question={item.question} value={item.value} candidate={null} onChange={value=>scope==='project'?onChangeProject(item.id,value):onChangeWork(scope,item.id,value)}/>
       <ProvenanceBar prov={prov} conflict={conflict} onConfirm={()=>onProvenance?.(scope,item.id,{validation:'CONFIRMED_BY_USER'})} onUseCandidate={candidate=>onResolveConflict?.(conflict.id,candidate)} onOpenSource={source=>onOpenProof?.(source)}/></div>})}</div></div>)}
     {orphans.map(conflict=><div className="pl-qwrap" key={conflict.id}><b>{conflict.questionId}</b><ProvenanceBar prov={null} conflict={conflict} onUseCandidate={candidate=>onResolveConflict?.(conflict.id,candidate)} onOpenSource={source=>onOpenProof?.(source)}/></div>)}</>;
   })()}
  </section>}
  {recapOpen&&<WorksRecap works={state.works} familyLabel={code=>families.find(item=>item.code===code)?.label||code} onFix={goToQuestion} onCreate={()=>{setRecapOpen(false);goCreate()}} onExport={(columns,rows)=>downloadWorksRecap(projectId,columns,rows)}/>}
  {showMain&&isOuvragesStep&&<section className="pl-works">
   <p className="pl-works-intro">Créez ici les prestations réellement différentes de ce lot. Chaque ouvrage aura ensuite ses propres caractéristiques, performances et interfaces. « Ajouter un autre ouvrage » crée une prestation indépendante ; il ne modifie jamais l’ouvrage précédent.</p>
   {state.works.length===0
    ?<div className="pl-works-empty"><Layers3 size={26}/><b>Aucun ouvrage créé</b><p>Un ouvrage correspond à un type de prestation homogène : par exemple « Cloison séparative bureaux », « Doublage périphérique » ou « Plafond acoustique salles de réunion ».</p><button className="primary" onClick={startCreate}><Plus size={15}/> Créer mon premier ouvrage</button></div>
    :<div className="pl-work-list">{state.works.map(work=>{const answers=allAnswersFor(work);const questions=widgets.filter(widget=>widget.scope==='work'&&(!WIDGET_FAMILY[widget.id]||WIDGET_FAMILY[widget.id]===work.family)).flatMap(widget=>visibleQuestionsFor(widget,answers));const done=answeredCount(questions,work.answers);const pending=identityPending(work);const loc=String(work.answers['Q-W02']||'').trim();const fn=String(work.answers['Q-W04']||'').trim();return <article key={work.id} className={work.id===editingId?'active':''} onClick={()=>openCharacteristics(work.id,work.family)} title="Ouvrir les caractéristiques de cet ouvrage" data-work-open><div><b>{work.answers['Q-W01']||work.label}</b><span className="pl-work-meta"><span className="pl-badge">{families.find(item=>item.code===work.family)?.label||work.family}</span><span className={`pl-badge ${pending?'todo':'done'}`}>{pending?`${pending} point${pending>1?'s':''} à compléter`:'Identité renseignée'}</span></span><span className="pl-work-family">{loc?<><b>Localisation :</b> {loc}</>:'Localisation à préciser'}{fn&&<> · <b>Fonction :</b> {fn}</>}</span></div><small>{done}/{questions.length} renseignées</small><div className="pl-work-actions"><button onClick={event=>{event.stopPropagation();editWork(work.id)}} title="Modifier"><Pencil size={13}/></button><button onClick={event=>{event.stopPropagation();onDuplicateWork(work.id)}} title="Dupliquer"><Copy size={13}/></button><button onClick={event=>{event.stopPropagation();removeWork(work.id)}} title="Supprimer"><Trash2 size={13}/></button></div></article>})}
     <button className="secondary pl-add-work" onClick={startCreate}><Plus size={15}/> Ajouter un autre ouvrage</button>
    </div>}
   {creating&&tplMode&&<div className="pl-create-work" data-template-picker><div className="pl-create-head"><b>Modèles de l’agence</b><button onClick={()=>setCreating(false)}>Annuler</button></div><div className="pl-create-mode" data-create-mode>{isAgency&&<><button type="button" className={!tplMode?'on':''} data-create-new onClick={()=>setTplMode(false)}>Créer un nouvel ouvrage</button><button type="button" className={tplMode?'on':''} data-create-from-template onClick={()=>setTplMode(true)}>Utiliser un modèle de l’agence</button></>}</div>
    <div className="pl-create-section"><span>Plâtrerie – Isolation</span><input value={tplSearch} onChange={event=>setTplSearch(event.target.value)} placeholder="Rechercher un modèle…" aria-label="Rechercher un modèle" data-template-picker-search/>
     {tplError&&<small className="pl-template-error" role="alert" data-template-picker-error>{tplError}</small>}
     {!templates?<small>Chargement des modèles…</small>:templates.filter(template=>!tplSearch.trim()||`${template.name} ${template.workFamily} ${template.description}`.toLowerCase().includes(tplSearch.trim().toLowerCase())).length===0?<small data-template-picker-empty>Aucun modèle d’ouvrage disponible pour ce lot.</small>:<ul className="pl-template-list">{templates.filter(template=>!tplSearch.trim()||`${template.name} ${template.workFamily} ${template.description}`.toLowerCase().includes(tplSearch.trim().toLowerCase())).map(template=><li key={template.id} data-template-choice={template.id}><div><b>{template.name}</b><small>{template.workFamily} · version {template.versionNumber||1} · {(template.answers||[]).length} réponse{(template.answers||[]).length>1?'s':''}</small></div><button type="button" className="primary" data-use-template onClick={()=>useTemplate(template)}>Utiliser ce modèle</button></li>)}</ul>}
     {templates&&templates.some(template=>!familyOfTemplate(template))&&<div className="pl-family-grid" data-template-family-fallback><small>Pour les modèles dont la famille n’est pas reconnue, choisissez-la ici :</small>{families.map(family=><button key={family.code} className={createFamily===family.code?'on':''} onClick={()=>setCreateFamily(family.code)}><b>{family.label}</b></button>)}</div>}
    </div></div>}
   {creating&&!tplMode&&<div className="pl-create-work"><div className="pl-create-head"><b>Nouvel ouvrage</b><button onClick={()=>setCreating(false)}>Annuler</button></div><div className="pl-create-mode" data-create-mode>{isAgency&&<><button type="button" className={!tplMode?'on':''} data-create-new onClick={()=>setTplMode(false)}>Créer un nouvel ouvrage</button><button type="button" className={tplMode?'on':''} data-create-from-template onClick={()=>setTplMode(true)}>Utiliser un modèle de l’agence</button></>}</div>
    <div className="pl-create-section"><span>1. Famille d’ouvrage</span><div className="pl-family-grid">{families.map(family=><button key={family.code} className={createFamily===family.code?'on':''} onClick={()=>setCreateFamily(family.code)}><b>{family.label}</b><small>{family.desc}</small></button>)}</div></div>
    <div className="pl-create-section"><span>2. Identifier l’ouvrage</span><div className="pl-create-fields"><label className="full">Nom de l’ouvrage *<input autoFocus value={createLabel} onChange={event=>setCreateLabel(event.target.value)} placeholder="Ex. Cloison séparative bureaux"/></label><label>Localisation<input value={createLoc} onChange={event=>setCreateLoc(event.target.value)} placeholder="Ex. Bureaux / circulations"/></label><label>Fonction principale<input value={createFn} onChange={event=>setCreateFn(event.target.value)} placeholder="Ex. Séparation intérieure"/></label></div></div>
    <button className="primary" disabled={!createFamily||!createLabel.trim()} onClick={submitCreate}>Créer et décrire l’ouvrage</button>
   </div>}
   {editingWork&&!creating&&<div className="pl-work-editor"><div className="pl-editor-head"><div><small>Ouvrage en cours de description</small><b>{editingWork.answers['Q-W01']||editingWork.label}</b></div><label>Famille<select value={editingWork.family} onChange={event=>{const next=event.target.value;if(next===editingWork.family)return;const hasDetails=Object.keys(editingWork.answers).some(id=>!['Q-W01','Q-W02','Q-W03','Q-W04'].includes(id)&&filled(editingWork.answers[id]));if(hasDetails&&!window.confirm('Changer de famille réinitialisera les réponses techniques déjà saisies pour cet ouvrage. Continuer ?'))return;onChangeWorkFamily(editingWork.id,next)}}>{families.map(family=><option key={family.code} value={family.code}>{family.label}</option>)}</select></label></div>
    <p className="pl-works-intro">Renseignez ici l’identité et le type de cet ouvrage. Ses performances (feu, acoustique, thermique…), interfaces et cas particuliers se complètent dans les étapes suivantes, ouvrage par ouvrage.</p>
    {registerWidgets(editingWork).map(widget=>{const questions=visibleQuestionsFor(widget,allAnswersFor(editingWork));if(!questions.length)return null;return <div className="pl-editor-block" key={widget.id}><h4>{widget.title}</h4><div className="pl-fields">{questions.map(question=><QuestionField key={question.id} family={editingWork.family} question={question} value={editingWork.answers[question.id]} candidate={sameAsCandidate(candidateMap[question.id],editingWork.answers[question.id])?candidateMap[question.id]:null} onChange={value=>onChangeWork(editingWork.id,question.id,value)}/>)}</div></div>})}
    <div className="pl-editor-actions"><button className="secondary" onClick={()=>setEditingId(null)}><Check size={14}/> Enregistrer et fermer</button><button className="primary" onClick={()=>{setActiveWorkId(editingWork.id);setEditingId(null);setStepIndex(Math.min(stepIndex+1,steps.length-1))}}>Continuer : caractéristiques de cet ouvrage <ArrowRight size={14}/></button></div>
   </div>}
  </section>}
  {showMain&&gated&&<div className="pl-gate"><Layers3 size={20}/><b>Créez d’abord un ouvrage</b><p>Les caractéristiques, performances et interfaces se renseignent ouvrage par ouvrage. Retournez à l’étape « 02 Ouvrages » pour en créer un avant de continuer.</p><button className="secondary" onClick={()=>setStepIndex(steps.indexOf('02 Ouvrages'))}>Aller à « Ouvrages »</button></div>}
  {showMain&&!isOuvragesStep&&!gated&&<>
   {stepHasWorkWidgets&&state.works.length>1&&<div className="pl-worktabs">{state.works.map(work=><button key={work.id} className={work.id===activeWorkId?'on':''} onClick={()=>setActiveWorkId(work.id)}>{work.answers['Q-W01']||work.label}</button>)}</div>}
   {stepHasWorkWidgets&&activeWork&&<div className="pl-work-context" data-work-context><span><small>Ouvrage décrit</small><b>{workName(activeWork)}</b></span>{state.templateOrigin?.[activeWork.id]&&<span className="pl-template-origin" data-template-origin><Layers3 size={12}/> Prérempli depuis : <b>{state.templateOrigin[activeWork.id].templateName}</b> (version {state.templateOrigin[activeWork.id].versionNumber||1}) — à vérifier</span>}<button type="button" onClick={()=>goDescribe(activeWork)} data-work-edit-identity><Pencil size={12}/> Modifier l’ouvrage</button>{isAgency&&projectId&&<button type="button" data-save-as-template onClick={()=>setTemplateWork(activeWork)}><Layers3 size={12}/> Enregistrer comme modèle d’ouvrage</button>}</div>}{templateWork&&<SaveWorkTemplateModal projectId={projectId} work={templateWork} onClose={()=>setTemplateWork(null)}/>}
   <div className="pl-widgets">{stepWidgets.filter(widget=>!WIDGET_FAMILY[widget.id]||WIDGET_FAMILY[widget.id]===(activeWork?.family)).map(widget=>{
    const answers=widget.scope==='project'?state.project:allAnswersFor(activeWork);
    const questions=visibleQuestionsFor(widget,answers);
    if(!questions.length)return null;
    const count=answeredCount(questions,widget.scope==='project'?state.project:(activeWork?.answers||{}));
    const onChange=widget.scope==='project'?onChangeProject:(id,value)=>onChangeWork(activeWork.id,id,value);
    return <section className={`pl-widget ${open===widget.id?'open':''}`} key={widget.id}><button className="pl-widget-title" onClick={()=>setOpen(open===widget.id?'':widget.id)}><span><small>{widget.step}</small><b>{widget.title}</b></span><span>{count}/{questions.length}<ChevronDown size={16}/></span></button>{(open===widget.id||reviewFilter!=='all')&&<div className="pl-fields">{questions.map(question=>{const scopeKey=widget.scope==='project'?'project':activeWork.id;const prov=state.provenance?.[scopeKey]?.[question.id];const conflict=(state.conflicts||[]).find(item=>!item.resolved&&item.questionId===question.id&&item.workId===scopeKey);const current=(widget.scope==='project'?state.project:activeWork.answers)[question.id];const keep={all:true,toverify:prov?.status==='DOCUMENT_INFERRED'&&prov.validation==='UNREVIEWED',tofill:!filled(current),found:prov?.status==='DOCUMENT_CONFIRMED',conflict:Boolean(conflict)}[reviewFilter];if(!keep)return null;return <div className="pl-qwrap" key={question.id}><QuestionField family={activeWork?.family} question={question} value={current} candidate={widget.scope==='project'||sameAsCandidate(candidateMap[question.id],activeWork.answers[question.id])?candidateMap[question.id]:null} onChange={value=>onChange(question.id,value)}/><ProvenanceBar prov={prov} conflict={conflict} onConfirm={()=>onProvenance?.(scopeKey,question.id,{validation:'CONFIRMED_BY_USER'})} onUseCandidate={candidate=>onResolveConflict?.(conflict.id,candidate)} onOpenSource={item=>onOpenProof?.(item)}/></div>})}</div>}</section>
   })}</div>
  </>}
  <footer>{isLastStep&&!canGenerate
   ?<div className="pl-blocked" role="alert"><span><Info size={15}/> <b>Génération impossible pour l’instant.</b> {blockReason}</span><div><button className="secondary" onClick={()=>emptyWork?goDescribe(emptyWork):goCreate()}>{emptyWork?`Décrire « ${workName(emptyWork)} »`:'Créer mon premier ouvrage'} <ArrowRight size={13}/></button></div></div>
   :<span><Info size={15}/> {completed}/{total} renseignées · remplissez le plus possible, et passez les questions dont vous ne connaissez pas encore la réponse.</span>}
   <div className="pl-footer-actions">
    {!isLastStep&&canGenerate&&<button type="button" className="ghost" onClick={onGenerate} disabled={generating} title={`Générer ${docMode==='notice'?'la notice':'le CCTP'} avec les réponses actuelles, sans renseigner les étapes suivantes`}>Générer maintenant</button>}
    {isLastStep
     ?<button type="button" onClick={onGenerate} disabled={generating||!canGenerate} title={canGenerate?undefined:blockReason}><Sparkles size={16}/>{generating?'Génération en cours…':`Générer ${docMode==='notice'?'la notice':'le CCTP'}`}</button>
     :<button type="button" onClick={goNext} disabled={isOuvragesStep&&creating&&!canSubmitCreate} title={isOuvragesStep&&creating&&!canSubmitCreate?'Choisissez une famille et renseignez le nom de l’ouvrage.':undefined}>{isOuvragesStep&&creating?'Créer et décrire l’ouvrage':isOuvragesStep&&!state.works.length?'Créer mon premier ouvrage':`Étape suivante : ${nextStepLabel}`} <ArrowRight size={16}/></button>}
   </div></footer>
 </section>
}
