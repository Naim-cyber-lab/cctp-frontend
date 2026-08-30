const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

// Desktop build only (Tauri or Electron): the app talks to a remotely-hosted API from
// its own origin (a custom webview scheme, or file:// for Electron), where the httpOnly
// SameSite cookie the web app relies on never arrives. It authenticates with a Bearer
// token instead, kept in memory + localStorage (scoped to the app's own origin — never
// a public website — so this is not the XSS exposure it would be on a real site). The
// browser web build is untouched: no token is ever stored or sent there, it keeps using
// the cookie exactly as before.
const isDesktop = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || window.cctpDesktop === true);
let authToken = isDesktop ? localStorage.getItem('cctp_access_token') : null;
export function setAuthToken(token){if(!isDesktop)return;authToken=token;if(token)localStorage.setItem('cctp_access_token',token);else localStorage.removeItem('cctp_access_token')}
function authHeaders(){return isDesktop&&authToken?{Authorization:`Bearer ${authToken}`}:{}}
function captureToken(body){if(isDesktop&&body?.accessToken)setAuthToken(body.accessToken);return body}

export async function apiFetch(path, options = {}){const headers={'Content-Type':'application/json',...authHeaders(),...options.headers};const response=await fetch(`${API_URL}${path}`,{credentials:'include',...options,headers});if(response.status===204)return null;const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||'Une erreur est survenue');return captureToken(body)}
export async function downloadCctp(id,format,name){const response=await fetch(`${API_URL}/cctps/${id}/export.${format}`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible de générer le document');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}.${format}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export async function listAttachments(cctpId,chapterId){const query=chapterId?`?chapter_id=${encodeURIComponent(chapterId)}`:'';return apiFetch(`/cctps/${cctpId}/attachments${query}`)}
export async function getPromptGuideCoverage(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/prompt-guide-coverage`)}
export async function uploadAttachment(cctpId,chapterId,file){const form=new FormData();form.append('file',file);if(chapterId)form.append('chapter_id',chapterId);const response=await fetch(`${API_URL}/cctps/${cctpId}/attachments`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||'Impossible d’ajouter le document');return body}
export async function deleteAttachment(cctpId,attachmentId){return apiFetch(`/cctps/${cctpId}/attachments/${attachmentId}`,{method:'DELETE'})}
export async function listReferenceCctps(){return apiFetch('/account/reference-cctps')}
export async function uploadReferenceCctp(file){const form=new FormData();form.append('file',file);const response=await fetch(`${API_URL}/account/reference-cctps`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||'Impossible d’importer ce CCTP');return body}
export async function deleteReferenceCctp(id){return apiFetch(`/account/reference-cctps/${id}`,{method:'DELETE'})}
export async function getCoverSuggestions(){return apiFetch('/cctps/cover-suggestions')}
export async function getChapterReuseSources(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/reuse-sources`)}
export async function generateChapter(cctpId,chapterId,instruction,source=''){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/generate`,{method:'POST',body:JSON.stringify({instruction,source})})}
export async function getPlatrerieQuestionnaire(cctpId){return apiFetch(`/cctps/${cctpId}/chapters/06/questionnaire`)}
export async function prefillPlatrerieQuestionnaire(cctpId,instruction){return apiFetch(`/cctps/${cctpId}/chapters/06/questionnaire/prefill`,{method:'POST',body:JSON.stringify({instruction})})}

async function streamApi(path,body,onEvent){
 const response=await fetch(`${API_URL}${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'text/event-stream',...authHeaders()},body:JSON.stringify(body)});
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
 // Native EventSource cannot set custom headers, so the desktop build passes the
 // token as a query param (accepted server-side just for this endpoint's auth).
 const tokenParam=isDesktop&&authToken?`?token=${encodeURIComponent(authToken)}`:'';
 const source=new EventSource(`${API_URL}/cctps/${cctpId}/chapters/${chapterId}/evaluation/events${tokenParam}`,{withCredentials:true});
 source.addEventListener('evaluation',event=>{try{onEvaluation?.(JSON.parse(event.data))}catch{}});
 source.onerror=event=>onError?.(event);
 return()=>source.close();
}
