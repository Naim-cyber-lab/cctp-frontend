const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';
export async function apiFetch(path, options = {}){const response=await fetch(`${API_URL}${path}`,{credentials:'include',...options,headers:{'Content-Type':'application/json',...options.headers}});if(response.status===204)return null;const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||'Une erreur est survenue');return body}
export async function downloadCctp(id,format,name){const response=await fetch(`${API_URL}/cctps/${id}/export.${format}`,{credentials:'include'});if(!response.ok)throw new Error('Impossible de générer le document');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}.${format}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export async function listAttachments(cctpId,chapterId){const query=chapterId?`?chapter_id=${encodeURIComponent(chapterId)}`:'';return apiFetch(`/cctps/${cctpId}/attachments${query}`)}
export async function getPromptGuideCoverage(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/prompt-guide-coverage`)}
export async function uploadAttachment(cctpId,chapterId,file){const form=new FormData();form.append('file',file);if(chapterId)form.append('chapter_id',chapterId);const response=await fetch(`${API_URL}/cctps/${cctpId}/attachments`,{method:'POST',credentials:'include',body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||'Impossible d’ajouter le document');return body}
export async function deleteAttachment(cctpId,attachmentId){return apiFetch(`/cctps/${cctpId}/attachments/${attachmentId}`,{method:'DELETE'})}
export async function generateChapter(cctpId,chapterId,instruction,source=''){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/generate`,{method:'POST',body:JSON.stringify({instruction,source})})}
export async function getPlatrerieQuestionnaire(cctpId){return apiFetch(`/cctps/${cctpId}/chapters/06/questionnaire`)}
export async function prefillPlatrerieQuestionnaire(cctpId,instruction){return apiFetch(`/cctps/${cctpId}/chapters/06/questionnaire/prefill`,{method:'POST',body:JSON.stringify({instruction})})}

async function streamApi(path,body,onEvent){
 const response=await fetch(`${API_URL}${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify(body)});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.detail||'Le flux IA n’a pas pu démarrer')}
 const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let finalValue=null;
 const consume=block=>{let event='message';const data=[];block.split(/\r?\n/).forEach(line=>{if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trim())});if(!data.length)return;const payload=JSON.parse(data.join('\n'));onEvent?.(event,payload);if(event==='done')finalValue=payload;if(event==='error')throw new Error(payload.message||'Erreur du service IA')};
 while(true){const{done,value}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop()||'';for(const block of blocks)consume(block);if(done)break}
 if(buffer.trim())consume(buffer);return finalValue;
}
export function streamGenerateChapter(cctpId,chapterId,instruction,source,onEvent){return streamApi(`/cctps/${cctpId}/chapters/${chapterId}/generate/stream`,{instruction,source},onEvent)}
export function listChapterMessages(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/messages`)}
export function createChapterMessage(cctpId,chapterId,role,content){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/messages`,{method:'POST',body:JSON.stringify({role,content})})}
export function streamPrefillPlatrerieQuestionnaire(cctpId,instruction,onEvent){return streamApi(`/cctps/${cctpId}/chapters/06/questionnaire/prefill/stream`,{instruction},onEvent)}
export function streamEvaluateChapter(cctpId,chapterId,content,onEvent){return streamApi(`/cctps/${cctpId}/chapters/${chapterId}/evaluate/stream`,{content},onEvent)}
export function getChapterEvaluation(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/evaluation`)}
export function refreshChapterEvaluation(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/evaluation/refresh`,{method:'POST'})}
export function subscribeChapterEvaluation(cctpId,chapterId,onEvaluation,onError){
 const source=new EventSource(`${API_URL}/cctps/${cctpId}/chapters/${chapterId}/evaluation/events`,{withCredentials:true});
 source.addEventListener('evaluation',event=>{try{onEvaluation?.(JSON.parse(event.data))}catch{}});
 source.onerror=event=>onError?.(event);
 return()=>source.close();
}
