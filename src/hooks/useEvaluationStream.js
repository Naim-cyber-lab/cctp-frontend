import { useEffect, useState } from 'react';
import { subscribeChapterEvaluation } from '../api/client';
import '../evaluation-stream.css';

export function useEvaluationStream(cctpId,chapterId='06',initial=null,enabled=true){
 const [summary,setSummary]=useState(initial);
 useEffect(()=>{
   if(!enabled||!cctpId)return;
   return subscribeChapterEvaluation(cctpId,chapterId,setSummary);
 },[cctpId,chapterId,enabled]);
 return [summary,setSummary];
}

export function useProjectEvaluationStreams(projects){
 const [summaries,setSummaries]=useState({});
 useEffect(()=>{
   const active=projects.filter(project=>project.selected?.includes('06'));
   setSummaries(current=>Object.fromEntries(active.map(project=>[project.id,current[project.id]||project.evaluations?.['06']||null])));
   const close=active.map(project=>subscribeChapterEvaluation(project.id,'06',summary=>setSummaries(current=>({...current,[project.id]:summary}))));
   return()=>close.forEach(stop=>stop());
 },[projects.map(project=>project.id).join('|')]);
 return summaries;
}
