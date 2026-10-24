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
const pendingGets = new Map();
// Lectures lancées à l'avance (survol d'un bouton, page qui va suivre) : la page suivante les récupère déjà prêtes au lieu de les redemander.
const prefetched = new Map();
const PREFETCH_TTL = 6000;
export function prefetchGet(path){if(prefetched.has(path)&&Date.now()-prefetched.get(path).at<PREFETCH_TTL)return;const entry={at:Date.now(),failed:false,promise:null};entry.promise=apiFetch(path);entry.promise.catch(()=>{entry.failed=true});prefetched.set(path,entry)}
export function setAuthToken(token){if(!isDesktop)return;authToken=token;if(token)localStorage.setItem('cctp_access_token',token);else localStorage.removeItem('cctp_access_token')}
function authHeaders(){return isDesktop&&authToken?{Authorization:`Bearer ${authToken}`}:{}}
function captureToken(body){if(isDesktop&&body?.accessToken)setAuthToken(body.accessToken);return body}

export async function apiFetch(path, options = {}){
 const method=(options.method||'GET').toUpperCase(),key=method==='GET'?path:null;
 if(key&&prefetched.has(key)){const entry=prefetched.get(key),now=Date.now();if(entry.failed||now-entry.at>=PREFETCH_TTL||(entry.usedAt&&now-entry.usedAt>1500))prefetched.delete(key);else{entry.usedAt=entry.usedAt||now;return entry.promise}}
 if(key&&pendingGets.has(key))return pendingGets.get(key);
 const request=(async()=>{const headers={'Content-Type':'application/json',...authHeaders(),...options.headers};const response=await fetch(`${API_URL}${path}`,{credentials:'include',...options,headers});if(response.status===204)return null;const body=await response.json().catch(()=>({}));if(response.status===401&&!path.startsWith('/auth/'))window.dispatchEvent(new Event('cctp:session-expired'));if(response.status===403&&response.headers.get('X-Calepin-Code')==='EMAIL_NOT_VERIFIED'&&!path.startsWith('/auth/'))window.dispatchEvent(new Event('cctp:email-unverified'));if(!response.ok){const failure=new Error(body.detail||'Une erreur est survenue');failure.status=response.status;throw failure}return captureToken(body)})();
 if(key)pendingGets.set(key,request);
 try{return await request}finally{if(key)pendingGets.delete(key)}
}
export async function downloadCctp(id,format,name,options={}){const query=new URLSearchParams(Object.entries(options).map(([key,value])=>[key,typeof value==='string'?value:String(!!value)])).toString();const response=await fetch(`${API_URL}/cctps/${id}/export.${format}${query?`?${query}`:''}`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible de générer le document');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}.${format}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export async function getDpgf(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf`)}
export async function getDevisSummary(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/devis/summary`)}
export async function saveDpgf(cctpId,payload){return apiFetch(`/cctps/${cctpId}/dpgf`,{method:'PUT',body:JSON.stringify(payload)})}
export async function findSimilarPassages(cctpId,payload){return apiFetch(`/cctps/${cctpId}/similar-passages`,{method:'POST',body:JSON.stringify(payload)})}
export async function getRuleHistory(questionId){return apiFetch(`/account/rule-overrides/history?question_id=${encodeURIComponent(questionId)}`)}
export async function getRuleDefault(payload){return apiFetch('/account/rule-overrides/default',{method:'POST',body:JSON.stringify(payload)})}
export async function downloadDevis(cctpId,name='Devis'){const response=await fetch(`${API_URL}/cctps/${cctpId}/dpgf/devis/export.xlsx`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible de générer le devis');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}.xlsx`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export async function getPushKey(){return apiFetch('/push/key')}
export async function subscribePush(payload){return apiFetch('/push/subscribe',{method:'POST',body:JSON.stringify(payload)})}
export async function unsubscribePush(payload){return apiFetch('/push/unsubscribe',{method:'POST',body:JSON.stringify(payload)})}
export async function testPush(){return apiFetch('/push/test',{method:'POST'})}
export async function getDevis(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/devis`)}
export async function saveDevis(cctpId,payload){return apiFetch(`/cctps/${cctpId}/dpgf/devis`,{method:'PUT',body:JSON.stringify(payload)})}
export async function downloadDpgf(cctpId,name='DPGF'){const response=await fetch(`${API_URL}/cctps/${cctpId}/dpgf/export.xlsx`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible de générer la DPGF');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}.xlsx`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export async function listAttachments(cctpId,chapterId,{includeArchived=false}={}){const params=new URLSearchParams();if(chapterId)params.set('chapter_id',chapterId);if(includeArchived)params.set('include_archived','true');const query=params.toString()?`?${params}`:'';return apiFetch(`/cctps/${cctpId}/attachments${query}`)}
export async function getPromptGuideCoverage(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/prompt-guide-coverage`)}
export async function uploadAttachment(cctpId,chapterId,file,category='',importContext=''){const form=new FormData();form.append('file',file);if(chapterId)form.append('chapter_id',chapterId);if(category)form.append('category',category);if(importContext)form.append('import_context',importContext);const response=await fetch(`${API_URL}/cctps/${cctpId}/attachments`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||'Impossible d’ajouter le document');return body}
export async function deleteAttachment(cctpId,attachmentId){return apiFetch(`/cctps/${cctpId}/attachments/${attachmentId}`,{method:'DELETE'})}
export async function listReferenceCctps(){return apiFetch('/account/reference-cctps')}
export async function uploadReferenceCctp(file){const form=new FormData();form.append('file',file);const response=await fetch(`${API_URL}/account/reference-cctps`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||`Impossible d’importer ce CCTP (erreur ${response.status}). Réessayez dans quelques instants.`);return body}
export async function deleteReferenceCctp(id){return apiFetch(`/account/reference-cctps/${id}`,{method:'DELETE'})}
export async function importCctp(file,name=''){const form=new FormData();form.append('file',file);if(name)form.append('name',name);const response=await fetch(`${API_URL}/cctps/import`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||`Impossible d’importer ce CCTP (erreur ${response.status}). Réessayez dans quelques instants.`);return body}
export async function listFavoriteClauses(chapterId){const query=chapterId?`?chapter_id=${encodeURIComponent(chapterId)}`:'';return apiFetch(`/account/favorite-clauses${query}`)}
export async function createFavoriteClause(payload){return apiFetch('/account/favorite-clauses',{method:'POST',body:JSON.stringify(payload)})}
export async function deleteFavoriteClause(id){return apiFetch(`/account/favorite-clauses/${id}`,{method:'DELETE'})}
export async function updateProfile(profile){return apiFetch('/auth/me',{method:'PATCH',body:JSON.stringify(profile)})}
export async function changeEmail(newEmail,password){return apiFetch('/auth/change-email',{method:'POST',body:JSON.stringify({newEmail,password})})}
export async function listFolders(){return apiFetch('/account/folders')}
export async function createFolder(name){return apiFetch('/account/folders',{method:'POST',body:JSON.stringify({name})})}
export async function renameFolder(id,name){return apiFetch(`/account/folders/${id}`,{method:'PATCH',body:JSON.stringify({name})})}
export async function deleteFolder(id){return apiFetch(`/account/folders/${id}`,{method:'DELETE'})}
export async function getFormattingPreferences(){return apiFetch('/account/formatting-preferences')}
export async function updateFormattingPreferences(headingStyles){return apiFetch('/account/formatting-preferences',{method:'PUT',body:JSON.stringify({headingStyles})})}
export async function getCoverSuggestions(){return apiFetch('/cctps/cover-suggestions')}
export async function getChapterReuseSources(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/reuse-sources`)}
export async function generateChapter(cctpId,chapterId,instruction,source=''){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/generate`,{method:'POST',body:JSON.stringify({instruction,source})})}
export async function analyzeProjectDocuments(cctpId,attachmentIds=[]){return apiFetch(`/cctps/${cctpId}/chapters/06/documents-prefill`,{method:'POST',body:JSON.stringify({attachmentIds})})}
export async function getPlatrerieQuestionnaire(cctpId){return apiFetch(`/cctps/${cctpId}/chapters/06/questionnaire`)}
export async function prefillPlatrerieQuestionnaire(cctpId,instruction){return apiFetch(`/cctps/${cctpId}/chapters/06/questionnaire/prefill`,{method:'POST',body:JSON.stringify({instruction})})}

async function streamApi(path,body,onEvent){
 let response;
 try{response=await fetch(`${API_URL}${path}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','Accept':'text/event-stream',...authHeaders()},body:JSON.stringify(body)})}
 catch{throw new Error('La connexion avec le service IA a été interrompue. Veuillez réessayer.')}
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.detail||'Le flux IA n’a pas pu démarrer')}
 const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let finalValue=null;
 const consume=block=>{let event='message';const data=[];block.split(/\r?\n/).forEach(line=>{if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trim())});if(!data.length)return;const payload=JSON.parse(data.join('\n'));onEvent?.(event,payload);if(event==='done')finalValue=payload;if(event==='offtopic'){const refusal=new Error(payload.message||'Cette demande est hors du périmètre de l’assistant.');refusal.offTopic=true;throw refusal}if(event==='error')throw new Error(payload.message||'Erreur du service IA')};
 while(true){let chunk;try{chunk=await reader.read()}catch{throw new Error('La connexion avec le service IA a été interrompue. Veuillez réessayer.')}const{done,value}=chunk;buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop()||'';for(const block of blocks)consume(block);if(done)break}
 if(buffer.trim())consume(buffer);return finalValue;
}
export function streamGenerateChapter(cctpId,chapterId,instruction,source,onEvent,extra={}){return streamApi(`/cctps/${cctpId}/chapters/${chapterId}/generate/stream`,{instruction,source,...extra},onEvent)}
export function listChapterMessages(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/messages`)}
export function createChapterMessage(cctpId,chapterId,role,content){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/messages`,{method:'POST',body:JSON.stringify({role,content})})}
export function streamPrefillPlatrerieQuestionnaire(cctpId,instruction,onEvent){return streamApi(`/cctps/${cctpId}/chapters/06/questionnaire/prefill/stream`,{instruction},onEvent)}

export async function openAttachmentProof(cctpId,attachmentId,page){const tab=window.open('','_blank');try{const response=await fetch(`${API_URL}/cctps/${cctpId}/attachments/${attachmentId}/file`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible d’ouvrir la pièce');const blob=await response.blob();const url=URL.createObjectURL(blob);const target=page&&blob.type==='application/pdf'?`${url}#page=${page}`:url;if(tab)tab.location.href=target;else window.location.href=target}catch(error){if(tab)tab.close();throw error}}

export async function downloadWorksRecap(cctpId,columns,rows){const response=await fetch(`${API_URL}/cctps/${cctpId}/works-recap.xlsx`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({columns,rows})});if(!response.ok)throw new Error('Impossible de générer le fichier Excel');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='Recapitulatif-ouvrages.xlsx';document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}

export async function getRuleOverrides(){return apiFetch('/account/rule-overrides')}
export async function setRuleOverride(questionId,template){return apiFetch('/account/rule-overrides',{method:'PUT',body:JSON.stringify({questionId,template})})}
export async function listMyTeams(){return apiFetch('/organization/teams')}
export async function setActiveTeam(organizationId){return apiFetch('/organization/active',{method:'POST',body:JSON.stringify({organizationId})})}
export async function getOrganization(){return apiFetch('/organization')}
export async function createOrganization(name,extra={}){return apiFetch('/organization',{method:'POST',body:JSON.stringify({name,...extra})})}
export async function addOrganizationMember(email,role,canManageLibrary){return apiFetch('/organization/members',{method:'POST',body:JSON.stringify({email,role,...(canManageLibrary?{canManageLibrary:true}:{})})})}
export async function updateOrganizationMember(userId,changes){return apiFetch(`/organization/members/${userId}`,{method:'PATCH',body:JSON.stringify(typeof changes==='string'?{role:changes}:changes)})}
export async function removeOrganizationMember(userId){return apiFetch(`/organization/members/${userId}`,{method:'DELETE'})}
export async function renameOrganization(name,extra={}){return apiFetch('/organization',{method:'PATCH',body:JSON.stringify({name,...extra})})}
export async function cancelOrganizationInvitation(id){return apiFetch(`/organization/invitations/${id}`,{method:'DELETE'})}
export async function listOrganizationTasks(cctpId='',filters={}){const query=new URLSearchParams();if(cctpId)query.set('cctp_id',cctpId);for(const[key,value]of Object.entries(filters))if(value)query.set(key,value);const text=query.toString();return apiFetch(`/organization/tasks${text?`?${text}`:''}`)}
export async function createOrganizationTask(payload){return apiFetch('/organization/tasks',{method:'POST',body:JSON.stringify(payload)})}
export async function updateOrganizationTask(id,payload){return apiFetch(`/organization/tasks/${id}`,{method:'PATCH',body:JSON.stringify(payload)})}
export async function deleteOrganizationTask(id){return apiFetch(`/organization/tasks/${id}`,{method:'DELETE'})}
export async function listOrganizationTaskColumns(){return apiFetch('/organization/tasks/columns')}
export async function createOrganizationTaskColumn(name){return apiFetch('/organization/tasks/columns',{method:'POST',body:JSON.stringify({name})})}
export async function renameOrganizationTaskColumn(id,name){return apiFetch(`/organization/tasks/columns/${id}`,{method:'PATCH',body:JSON.stringify({name})})}
export async function deleteOrganizationTaskColumn(id,moveTo){return apiFetch(`/organization/tasks/columns/${id}?move_to=${encodeURIComponent(moveTo)}`,{method:'DELETE'})}
export async function listTeamClauses(archived=false){return apiFetch(`/organization/clauses${archived?'?archived=true':''}`)}
export async function getQuestionnaireCatalog(){return apiFetch('/catalog/questionnaires/platrerie-06')}
export async function listQuestionChanges(){return apiFetch('/organization/question-changes')}
export async function proposeQuestionChange(payload){return apiFetch('/organization/question-changes',{method:'POST',body:JSON.stringify(payload)})}
export async function validateQuestionChange(id){return apiFetch(`/organization/question-changes/${id}/validate`,{method:'POST'})}
export async function rejectQuestionChange(id){return apiFetch(`/organization/question-changes/${id}/reject`,{method:'POST'})}
export async function deleteQuestionChange(id){return apiFetch(`/organization/question-changes/${id}`,{method:'DELETE'})}
export async function proposeTeamClause(payload){return apiFetch('/organization/clauses',{method:'POST',body:JSON.stringify(payload)})}
export async function editTeamClause(id,payload){return apiFetch(`/organization/clauses/${id}`,{method:'PATCH',body:JSON.stringify(payload)})}
export async function validateTeamClause(id){return apiFetch(`/organization/clauses/${id}/validate`,{method:'POST'})}
export async function rejectTeamClause(id){return apiFetch(`/organization/clauses/${id}/reject`,{method:'POST'})}
export async function useTeamClause(id){return apiFetch(`/organization/clauses/${id}/use`,{method:'POST'})}
export async function deleteTeamClause(id){return apiFetch(`/organization/clauses/${id}`,{method:'DELETE'})}

export async function shareReferenceCctp(id,shared){return apiFetch(`/account/reference-cctps/${id}/share`,{method:'POST',body:JSON.stringify({shared})})}
export async function listConversations(){return apiFetch('/organization/chat/conversations')}
export async function createConversation(title,memberIds){return apiFetch('/organization/chat/conversations',{method:'POST',body:JSON.stringify({title,memberIds})})}
export async function addConversationMembers(id,userIds){return apiFetch(`/organization/chat/conversations/${id}/members`,{method:'POST',body:JSON.stringify({userIds})})}
export async function leaveConversation(id){return apiFetch(`/organization/chat/conversations/${id}/members/me`,{method:'DELETE'})}
export async function listChatMessages(id,before=''){return apiFetch(`/organization/chat/conversations/${id}/messages?limit=50${before?`&before=${encodeURIComponent(before)}`:''}`)}
export async function sendChatMessage(id,body,cctpId=null,replyToId=null){return apiFetch(`/organization/chat/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({body,cctpId,replyToId})})}
export async function editChatMessage(messageId,body){return apiFetch(`/organization/chat/messages/${messageId}`,{method:'PATCH',body:JSON.stringify({body})})}
export async function openDirectConversation(userId){return apiFetch('/organization/chat/conversations/direct',{method:'POST',body:JSON.stringify({userId})})}
export async function reactToMessage(messageId,emoji){return apiFetch(`/organization/chat/messages/${messageId}/reactions`,{method:'POST',body:JSON.stringify({emoji})})}
export async function getSharedCctp(messageId){return apiFetch(`/organization/chat/messages/${messageId}/cctp`)}
export async function sendChatFiles(conversationId,files,body='',replyToId=''){const form=new FormData();files.forEach(file=>form.append('files',file));if(body)form.append('body',body);if(replyToId)form.append('replyToId',replyToId);const response=await fetch(`${API_URL}/organization/chat/conversations/${conversationId}/files`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.detail||`Envoi impossible (erreur ${response.status}).`);return data}
export function chatFileUrl(id,{download=false}={}){const url=new URL(`${API_URL}/organization/chat/files/${id}`,window.location.href);if(download)url.searchParams.set('download','true');if(isDesktop&&authToken)url.searchParams.set('token',authToken);return url.toString()}
export async function getMessageSeen(messageId){return apiFetch(`/organization/chat/messages/${messageId}/seen`)}
export async function markConversationRead(id){return apiFetch(`/organization/chat/conversations/${id}/read`,{method:'POST'})}
export async function deleteChatMessage(id){return apiFetch(`/organization/chat/messages/${id}`,{method:'DELETE'})}
export async function importSharedCctp(messageId){return apiFetch(`/organization/chat/messages/${messageId}/import-cctp`,{method:'POST'})}
export async function listLiveHistory(cctpId,key){return apiFetch(`/cctps/${cctpId}/live-history?limit=40${key?`&key=${encodeURIComponent(key)}`:''}`)}
export async function restoreLiveVersion(cctpId,entryId,before=false){return apiFetch(`/cctps/${cctpId}/live-history/${entryId}/restore${before?'?before=true':''}`,{method:'POST'})}
export async function listLiveVersions(cctpId){return apiFetch(`/cctps/${cctpId}/live-versions?limit=60`)}
export async function labelLiveVersion(cctpId,entryId,label){return apiFetch(`/cctps/${cctpId}/live-versions/${entryId}`,{method:'PATCH',body:JSON.stringify({label})})}
export async function listNotifications(){return apiFetch('/notifications')}
export async function markNotificationsRead(ids){return apiFetch('/notifications/read',{method:'POST',body:JSON.stringify({ids:ids||null})})}
export async function listSnapshots(cctpId){return apiFetch(`/cctps/${cctpId}/snapshots`)}
export async function createSnapshot(cctpId,name){return apiFetch(`/cctps/${cctpId}/snapshots`,{method:'POST',body:JSON.stringify({name})})}
export async function compareSnapshot(cctpId,snapshotId){return apiFetch(`/cctps/${cctpId}/snapshots/${snapshotId}/compare`)}
export async function restoreSnapshot(cctpId,snapshotId){return apiFetch(`/cctps/${cctpId}/snapshots/${snapshotId}/restore`,{method:'POST'})}
export async function deleteSnapshot(cctpId,snapshotId){return apiFetch(`/cctps/${cctpId}/snapshots/${snapshotId}`,{method:'DELETE'})}
export async function listCctpChat(cctpId){return apiFetch(`/cctps/${cctpId}/chat`)}
export async function sendCctpChat(cctpId,body,replyToId=null,quote=null){return apiFetch(`/cctps/${cctpId}/chat`,{method:'POST',body:JSON.stringify({body,replyToId,quote})})}
export async function getCctpChatRead(cctpId){return apiFetch(`/cctps/${cctpId}/chat/read`)}
export async function markCctpChatRead(cctpId){return apiFetch(`/cctps/${cctpId}/chat/read`,{method:'POST'})}
export async function pinCctpChat(cctpId,messageId,pinned){return apiFetch(`/cctps/${cctpId}/chat/messages/${messageId}/pin`,{method:'POST',body:JSON.stringify({pinned})})}
export async function sendCctpChatImages(cctpId,files,body='',replyToId='',quote=null){const form=new FormData();files.forEach(file=>form.append('files',file));if(body)form.append('body',body);if(replyToId)form.append('replyToId',replyToId);if(quote)form.append('quote',JSON.stringify(quote));const response=await fetch(`${API_URL}/cctps/${cctpId}/chat/files`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:`Envoi impossible (erreur ${response.status}).`);return data}
export function cctpChatImageUrl(cctpId,fileId){const url=new URL(`${API_URL}/cctps/${cctpId}/chat/files/${fileId}`,window.location.href);if(isDesktop&&authToken)url.searchParams.set('token',authToken);return url.toString()}
export async function editCctpChat(cctpId,messageId,body){return apiFetch(`/cctps/${cctpId}/chat/messages/${messageId}`,{method:'PATCH',body:JSON.stringify({body})})}
export async function deleteCctpChat(cctpId,messageId){return apiFetch(`/cctps/${cctpId}/chat/messages/${messageId}`,{method:'DELETE'})}
export async function reactCctpChat(cctpId,messageId,emoji){return apiFetch(`/cctps/${cctpId}/chat/messages/${messageId}/reactions`,{method:'POST',body:JSON.stringify({emoji})})}
export async function listComments(cctpId){return apiFetch(`/cctps/${cctpId}/comments`)}
export async function createComment(cctpId,payload){return apiFetch(`/cctps/${cctpId}/comments`,{method:'POST',body:JSON.stringify(payload)})}
export async function updateComment(cctpId,commentId,changes){return apiFetch(`/cctps/${cctpId}/comments/${commentId}`,{method:'PATCH',body:JSON.stringify(changes)})}
export async function deleteComment(cctpId,commentId){return apiFetch(`/cctps/${cctpId}/comments/${commentId}`,{method:'DELETE'})}
export async function getCctpAccess(cctpId){return apiFetch(`/cctps/${cctpId}/access`)}
export async function listCctpShares(cctpId){return apiFetch(`/cctps/${cctpId}/shares`)}
export async function shareCctp(cctpId,email,role){return apiFetch(`/cctps/${cctpId}/shares`,{method:'POST',body:JSON.stringify({email,role})})}
export async function updateCctpShare(cctpId,shareId,role){return apiFetch(`/cctps/${cctpId}/shares/${shareId}`,{method:'PATCH',body:JSON.stringify({role})})}
export async function removeCctpShare(cctpId,shareId){return apiFetch(`/cctps/${cctpId}/shares/${shareId}`,{method:'DELETE'})}
export async function heartbeatCctp(cctpId,location,editing=false){return apiFetch(`/cctps/${cctpId}/presence`,{method:'POST',body:JSON.stringify({location,editing})})}
export function cctpLiveSocketUrl(cctpId){const url=new URL(API_URL,window.location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=`${url.pathname.replace(/\/$/,'')}/cctps/${cctpId}/live`;if(isDesktop&&authToken)url.searchParams.set('token',authToken);return url.toString()}
// Adresse du WebSocket du chat (même serveur que l'API). Le navigateur envoie le cookie de session ; l'application de bureau passe son jeton.
export function chatSocketUrl(){const url=new URL(API_URL,window.location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname=`${url.pathname.replace(/\/$/,'')}/organization/chat/ws`;if(isDesktop&&authToken)url.searchParams.set('token',authToken);return url.toString()}
export async function getVoiceToken(cctpId){return apiFetch(cctpId==='workspace'?'/workspaces/voice/token':`/cctps/${cctpId}/voice/token`,{method:'POST'})}
export async function getVoiceState(cctpId){return apiFetch(cctpId==='workspace'?'/workspaces/voice':`/cctps/${cctpId}/voice`)}
export function livekitUrl(){const base=new URL(API_URL,window.location.href);return `${base.protocol==='https:'?'wss:':'ws:'}//${base.host}/livekit`}

export async function getPriceLibrary(){return apiFetch('/price-library')}
export async function getPriceSuggestions(cctpId){return apiFetch(`/price-library/suggestions/${cctpId}`)}
export async function deletePriceLibraryFile(name){return apiFetch(`/price-library/files?name=${encodeURIComponent(name)}`,{method:'DELETE'})}
export async function importPriceLibrary(file){const form=new FormData();form.append('file',file);const response=await fetch(`${API_URL}/price-library/import`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||"Import impossible");return body}

export async function getPriceReferences(cctpId){return apiFetch(`/price-library/references/${cctpId}`)}

export async function getDevisSharing(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/sharing`)}
export async function listDevisShares(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/shares`)}
export async function shareDevis(cctpId,email,role){return apiFetch(`/cctps/${cctpId}/dpgf/shares`,{method:'POST',body:JSON.stringify({email,role})})}
export async function updateDevisShare(cctpId,shareId,role){return apiFetch(`/cctps/${cctpId}/dpgf/shares/${shareId}`,{method:'PATCH',body:JSON.stringify({role})})}
export async function removeDevisShare(cctpId,shareId){return apiFetch(`/cctps/${cctpId}/dpgf/shares/${shareId}`,{method:'DELETE'})}
export async function setDevisInheritCctp(cctpId,inheritCctpAccess){return apiFetch(`/cctps/${cctpId}/dpgf/sharing`,{method:'PUT',body:JSON.stringify({inheritCctpAccess})})}
export async function moveDevisToFolder(cctpId,folderId){return apiFetch(`/cctps/${cctpId}/dpgf/folder`,{method:'PUT',body:JSON.stringify({folderId})})}
export async function getDevisAudit(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/audit`)}
export async function requestCctpAccess(cctpId){return apiFetch(`/cctps/${cctpId}/access-request`,{method:'POST'})}
export async function listSharedDevis(){return apiFetch('/devis-shared')}
export async function listDevisComments(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/comments`)}
export async function addDevisComment(cctpId,payload){return apiFetch(`/cctps/${cctpId}/dpgf/comments`,{method:'POST',body:JSON.stringify(payload)})}
export async function getRecommendedDocuments(lotId){return apiFetch(`/recommended-documents/${encodeURIComponent(lotId)}`)}

export async function listWorkspaces(){return apiFetch('/workspaces')}
export async function switchWorkspace(workspaceId){return apiFetch('/workspaces/active',{method:'POST',body:JSON.stringify({workspaceId})})}
export async function listWorkspaceMembers(){return apiFetch('/workspaces/members')}
export async function getWorkspaceDomain(){return apiFetch('/workspaces/domain')}
export async function verifyWorkspaceDomain(){return apiFetch('/workspaces/domain/verify',{method:'POST'})}
export async function setWorkspaceDomainPolicy(policy){return apiFetch('/workspaces/domain',{method:'PATCH',body:JSON.stringify({policy})})}
export async function removeWorkspaceDomain(){return apiFetch('/workspaces/domain',{method:'DELETE'})}
export async function listWorkspaceRequests(){return apiFetch('/workspaces/requests')}
export async function myWorkspaceRequests(){return apiFetch('/workspaces/requests/mine')}
export async function acceptWorkspaceRequest(id,role='member'){return apiFetch(`/workspaces/requests/${id}/accept`,{method:'POST',body:JSON.stringify({role})})}
export async function rejectWorkspaceRequest(id){return apiFetch(`/workspaces/requests/${id}/reject`,{method:'POST'})}
export async function getPersonalDocuments(){return apiFetch('/workspaces/personal-documents')}
export async function importPersonalDocuments(payload){return apiFetch('/workspaces/import-documents',{method:'POST',body:JSON.stringify(payload)})}
export async function getCctpPeople(cctpId){return apiFetch(`/cctps/${cctpId}/people`)}
export async function getCctpEditRights(cctpId){return apiFetch(`/cctps/${cctpId}/edit-rights`)}
export async function setCctpEditRights(cctpId,payload){return apiFetch(`/cctps/${cctpId}/edit-rights`,{method:'PUT',body:JSON.stringify(payload)})}
export async function getDevisEditRights(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/edit-rights`)}
export async function setDevisEditRights(cctpId,payload){return apiFetch(`/cctps/${cctpId}/dpgf/edit-rights`,{method:'PUT',body:JSON.stringify(payload)})}
export async function listConsultations(cctpId){if(!cctpId)return[];const data=await apiFetch(`/cctps/${cctpId}/consultations`);return data.consultations||[]}

export async function listWorkTemplates(filters={}){const params=new URLSearchParams();if(filters.q)params.set('q',filters.q);if(filters.lotId)params.set('lotId',filters.lotId);if(filters.family)params.set('family',filters.family);params.set('status',filters.status||'ACTIVE');return apiFetch(`/workspaces/work-templates?${params}`)}
export async function getWorkTemplate(id){return apiFetch(`/workspaces/work-templates/${id}`)}
export async function createWorkTemplate(payload){return apiFetch('/workspaces/work-templates',{method:'POST',body:JSON.stringify(payload)})}
export async function archiveWorkTemplate(id){return apiFetch(`/workspaces/work-templates/${id}/archive`,{method:'POST',body:'{}'})}
export async function restoreWorkTemplate(id){return apiFetch(`/workspaces/work-templates/${id}/restore`,{method:'POST',body:'{}'})}
export async function getWorkTemplateEligibility(lotId='06'){return apiFetch(`/workspaces/work-templates/eligibility?lotId=${encodeURIComponent(lotId)}`)}
export async function saveWorkAsTemplate(payload){return apiFetch('/workspaces/work-templates/from-work',{method:'POST',body:JSON.stringify(payload)})}
export async function listPriceItems(q=''){return apiFetch(`/price-library/items?q=${encodeURIComponent(q)}`)}
export async function updateAttachment(cctpId,attachmentId,changes){return apiFetch(`/cctps/${cctpId}/attachments/${attachmentId}`,{method:'PATCH',body:JSON.stringify(changes)})}
export const attachmentFileUrl=(cctpId,attachmentId)=>`${API_URL}/cctps/${cctpId}/attachments/${attachmentId}/file`
export async function getHelpSeen(){return apiFetch('/account/help')}
export async function markHelpSeen(topic){return apiFetch(`/account/help/${topic}/seen`,{method:'POST',body:'{}'})}
export async function resetHelpSeen(topic){return apiFetch(`/account/help/${topic}/seen`,{method:'DELETE'})}

export async function listPriceReferences(filters={}){const params=new URLSearchParams();for(const [key,value] of Object.entries(filters)){if(value)params.set(key==='dateFrom'?'date_from':key==='dateTo'?'date_to':key,value)}return apiFetch(`/price-references?${params.toString()}`)}
export async function createPriceReference(body){return apiFetch('/price-references',{method:'POST',body:JSON.stringify(body)})}
export async function updatePriceReference(id,body){return apiFetch(`/price-references/${id}`,{method:'PATCH',body:JSON.stringify(body)})}
export async function previewPriceImport(file){const form=new FormData();form.append('file',file);const response=await fetch(`${API_URL}/price-references/import/preview`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||"Lecture du devis impossible");return body}
export async function confirmPriceImport(body){return apiFetch('/price-references/import/confirm',{method:'POST',body:JSON.stringify(body)})}
export async function listPricingRules(){return apiFetch('/pricing-rules')}
export async function savePricingRule(code,policy){return apiFetch(`/pricing-rules/${code}`,{method:'PUT',body:JSON.stringify({policy})})}
export async function resetPricingRule(code){return apiFetch(`/pricing-rules/${code}`,{method:'DELETE'})}

export async function getTeamClause(id){return apiFetch(`/organization/clauses/${id}`)}
export async function listRelevantClauses({lot='',section='',q=''}={}){const params=new URLSearchParams();if(lot)params.set('lot',lot);if(section)params.set('section',section);if(q)params.set('q',q);return apiFetch(`/organization/clauses/relevant?${params.toString()}`)}
export async function proposeClauseVersion(id,body){return apiFetch(`/organization/clauses/${id}/versions`,{method:'POST',body:JSON.stringify(body)})}
export async function validateClauseVersion(id,number){return apiFetch(`/organization/clauses/${id}/versions/${number}/validate`,{method:'POST'})}
export async function rejectClauseVersion(id,number){return apiFetch(`/organization/clauses/${id}/versions/${number}/reject`,{method:'POST'})}
export async function submitTeamClause(id){return apiFetch(`/organization/clauses/${id}/submit`,{method:'POST'})}
export async function archiveTeamClause(id){return apiFetch(`/organization/clauses/${id}/archive`,{method:'POST'})}
export async function restoreTeamClause(id){return apiFetch(`/organization/clauses/${id}/restore`,{method:'POST'})}

const fe=(id,path='')=>`/cctps/${id}/feasibility${path}`;
export async function getFeasibility(id){return apiFetch(fe(id))}
export async function createFeasibility(id){return apiFetch(fe(id),{method:'POST',body:'{}'})}
export async function saveFeasibilityAnswers(id,answers){return apiFetch(fe(id,'/answers'),{method:'PUT',body:JSON.stringify({answers})})}
export async function addFeasibilityHypothesis(id,body){return apiFetch(fe(id,'/facts'),{method:'POST',body:JSON.stringify(body)})}
export async function actOnFeasibilityFact(id,factId,body){return apiFetch(fe(id,`/facts/${factId}`),{method:'PATCH',body:JSON.stringify(body)})}
export async function extractFeasibility(id){return apiFetch(fe(id,'/extract'),{method:'POST',body:'{}'})}
export async function saveFeasibilityEstimate(id,lines){return apiFetch(fe(id,'/estimate'),{method:'PUT',body:JSON.stringify({lines})})}
export async function generateFeasibilityNotice(id){return apiFetch(fe(id,'/notice'),{method:'POST',body:'{}'})}
export async function getFeasibilityBrief(id){return apiFetch(fe(id,'/brief'))}
export async function refreshFeasibilityChecklist(id){return apiFetch(fe(id,'/checklist/refresh'),{method:'POST',body:'{}'})}
export async function getFeasibilityChecklist(id){return apiFetch(fe(id,'/checklist'))}
export async function patchFeasibilityChecklist(id,itemId,body){return apiFetch(fe(id,`/checklist/${itemId}`),{method:'PATCH',body:JSON.stringify(body)})}
export async function setFeasibilityConclusion(id,body){return apiFetch(fe(id,'/conclusion'),{method:'PUT',body:JSON.stringify(body)})}
export async function validateFeasibility(id){return apiFetch(fe(id,'/validate'),{method:'POST',body:'{}'})}
export async function submitFeasibility(id){return apiFetch(fe(id,'/submit'),{method:'POST',body:'{}'})}
export async function archiveFeasibility(id){return apiFetch(fe(id,'/archive'),{method:'POST',body:'{}'})}
export async function createFeasibilityVersion(id,label){return apiFetch(fe(id,'/versions'),{method:'POST',body:JSON.stringify({label})})}
export async function listFeasibilityVersions(id){return apiFetch(fe(id,'/versions'))}
export async function getFeasibilityAudit(id){return apiFetch(fe(id,'/audit'))}
