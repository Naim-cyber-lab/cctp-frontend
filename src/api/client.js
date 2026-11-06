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
export function apiErrorMessage(detail,fallback='Une erreur est survenue'){
 if(typeof detail==='string'&&detail.trim())return detail;
 if(Array.isArray(detail)){const messages=detail.map(item=>typeof item==='string'?item:item?.msg||item?.message).filter(Boolean);if(messages.length)return messages.join(' · ')}
 if(detail&&typeof detail==='object'){const message=detail.message||detail.msg;if(typeof message==='string'&&message.trim())return message}
 return fallback;
}

export async function apiFetch(path, options = {}){
 const method=(options.method||'GET').toUpperCase(),key=method==='GET'?path:null;
 if(key&&prefetched.has(key)){const entry=prefetched.get(key),now=Date.now();if(entry.failed||now-entry.at>=PREFETCH_TTL||(entry.usedAt&&now-entry.usedAt>1500))prefetched.delete(key);else{entry.usedAt=entry.usedAt||now;return entry.promise}}
 if(key&&pendingGets.has(key))return pendingGets.get(key);
 const request=(async()=>{const headers={'Content-Type':'application/json',...authHeaders(),...options.headers};const response=await fetch(`${API_URL}${path}`,{credentials:'include',...options,headers});if(response.status===204)return null;const body=await response.json().catch(()=>({}));if(response.status===401&&!path.startsWith('/auth/'))window.dispatchEvent(new Event('cctp:session-expired'));if(response.status===403&&response.headers.get('X-Calepin-Code')==='EMAIL_NOT_VERIFIED'&&!path.startsWith('/auth/'))window.dispatchEvent(new Event('cctp:email-unverified'));if(!response.ok){const failure=new Error(apiErrorMessage(body.detail));failure.status=response.status;failure.detail=body.detail;throw failure}return captureToken(body)})();
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
export async function downloadDevis(cctpId,name='Devis',canonical=false){const response=await fetch(`${API_URL}/cctps/${cctpId}/dpgf/devis/export.xlsx${canonical?'?canonical=true':''}`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible de générer le devis');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}${canonical?' - DCE':''}.xlsx`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export async function getPushKey(){return apiFetch('/push/key')}
export async function subscribePush(payload){return apiFetch('/push/subscribe',{method:'POST',body:JSON.stringify(payload)})}
export async function unsubscribePush(payload){return apiFetch('/push/unsubscribe',{method:'POST',body:JSON.stringify(payload)})}
export async function testPush(){return apiFetch('/push/test',{method:'POST'})}
export async function getDevis(cctpId){return apiFetch(`/cctps/${cctpId}/dpgf/devis`)}
export async function saveDevis(cctpId,payload){return apiFetch(`/cctps/${cctpId}/dpgf/devis`,{method:'PUT',body:JSON.stringify(payload)})}
export async function downloadDpgf(cctpId,name='DPGF'){const response=await fetch(`${API_URL}/cctps/${cctpId}/dpgf/export.xlsx`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible de générer la DPGF');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}.xlsx`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
export async function listAttachments(cctpId,chapterId,{includeArchived=false}={}){const params=new URLSearchParams();if(chapterId)params.set('chapter_id',chapterId);if(includeArchived)params.set('include_archived','true');const query=params.toString()?`?${params}`:'';return apiFetch(`/cctps/${cctpId}/attachments${query}`)}
export async function getPromptGuideCoverage(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/prompt-guide-coverage`)}
export async function uploadAttachment(cctpId,chapterId,file,category='',importContext='',scope=''){const form=new FormData();form.append('file',file);if(chapterId)form.append('chapter_id',chapterId);if(category)form.append('category',category);if(importContext)form.append('import_context',importContext);if(scope)form.append('scope',scope);const response=await fetch(`${API_URL}/cctps/${cctpId}/attachments`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.detail||'Impossible d’ajouter le document');return body}
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
export async function getProductCustomization(){return apiFetch('/organization/customization')}
export async function saveDocumentTemplate(id,payload){return apiFetch(`/organization/customization/templates/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)})}
export async function deleteDocumentTemplate(id){return apiFetch(`/organization/customization/templates/${encodeURIComponent(id)}`,{method:'DELETE'})}
export async function previewDocumentTemplate(id){return apiFetch(`/organization/customization/templates/${encodeURIComponent(id)}/preview`,{method:'POST',body:'{}'})}
export async function previewDocumentTemplateFromReference(id){return apiFetch(`/organization/customization/templates/from-reference/${encodeURIComponent(id)}/preview`)}
export async function createDocumentTemplateFromReference(id){return apiFetch(`/organization/customization/templates/from-reference/${encodeURIComponent(id)}`,{method:'POST',body:'{}'})}
export async function saveDocumentAssignmentRules(rules){return apiFetch('/organization/customization/assignment-rules',{method:'PUT',body:JSON.stringify({rules})})}
export async function simulateQuestionnaireRules(answers,questions){return apiFetch('/organization/customization/questionnaire/simulate',{method:'POST',body:JSON.stringify({answers,questions})})}
export async function importAgencyQuestionnaire(file){const form=new FormData();form.append('file',file);const response=await fetch(`${API_URL}/organization/customization/questionnaire/import`,{method:'POST',credentials:'include',headers:authHeaders(),body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.detail||'Import impossible');return data}
export async function restoreQuestionChange(id){return apiFetch(`/organization/question-changes/${id}/restore`,{method:'POST',body:'{}'})}
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
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(apiErrorMessage(error.detail,'Le flux IA n’a pas pu démarrer'))}
 const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';let finalValue=null;
 const consume=block=>{let event='message';const data=[];block.split(/\r?\n/).forEach(line=>{if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trim())});if(!data.length)return;const payload=JSON.parse(data.join('\n'));onEvent?.(event,payload);if(event==='done')finalValue=payload;if(event==='offtopic'){const refusal=new Error(apiErrorMessage(payload.message,'Cette demande est hors du périmètre de l’assistant.'));refusal.offTopic=true;throw refusal}if(event==='error')throw new Error(apiErrorMessage(payload.message,'Erreur du service IA'))};
 while(true){let chunk;try{chunk=await reader.read()}catch{throw new Error('La connexion avec le service IA a été interrompue. Veuillez réessayer.')}const{done,value}=chunk;buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const blocks=buffer.split(/\r?\n\r?\n/);buffer=blocks.pop()||'';for(const block of blocks)consume(block);if(done)break}
 if(buffer.trim())consume(buffer);return finalValue;
}
export function streamGenerateChapter(cctpId,chapterId,instruction,source,onEvent,extra={}){return streamApi(`/cctps/${cctpId}/chapters/${chapterId}/generate/stream`,{instruction,source,...extra},onEvent)}
export function giveAssistantFeedback(cctpId,chapterId,messageId,body){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/messages/${messageId}/feedback`,{method:'POST',body:JSON.stringify(body)})}
export function getAssistantFeedback(cctpId,chapterId){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/feedback`)}
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
export async function getDpgfStructure(q=''){return apiFetch(`/economics/dpgf-structure?q=${encodeURIComponent(q)}`)}
export async function setPlanningDurationReference(payload){return apiFetch('/planning-v1/duration-references',{method:'PUT',body:JSON.stringify(payload)})}
export async function deletePlanningDurationReference(canonicalId){return apiFetch(`/planning-v1/duration-references/${encodeURIComponent(canonicalId)}`,{method:'DELETE'})}
export async function getWritingBlocks({q='',section='',origin='',activation=''}={}){const query=[q?`q=${encodeURIComponent(q)}`:'',section?`section=${encodeURIComponent(section)}`:'',origin?`origin=${encodeURIComponent(origin)}`:'',activation?`activation=${encodeURIComponent(activation)}`:''].filter(Boolean).join('&');return apiFetch(`/writing-blocks${query?`?${query}`:''}`)}
export async function saveWritingBlockOverride(id,text,mode='REPLACE'){return apiFetch(`/writing-blocks/${encodeURIComponent(id)}/override`,{method:'PUT',body:JSON.stringify({text,mode})})}
export async function publishWritingBlockOverride(id){return apiFetch(`/writing-blocks/${encodeURIComponent(id)}/override/publish`,{method:'POST',body:JSON.stringify({})})}
export async function restoreWritingBlock(id){return apiFetch(`/writing-blocks/${encodeURIComponent(id)}/override`,{method:'DELETE'})}
export async function setDpgfRuleOverride(cctpId,ruleKey,skip){return apiFetch(`/cctps/${cctpId}/dpgf/devis/rule-overrides`,{method:'POST',body:JSON.stringify({rule_key:ruleKey,skip})})}
export async function getDpgfCatalog(){return apiFetch('/dpgf-catalog')}
export async function saveDpgfCatalogItem(payload){return apiFetch('/dpgf-catalog',{method:'PUT',body:JSON.stringify(payload)})}
export async function restoreDpgfCatalogItem(id){return apiFetch(`/dpgf-catalog/${encodeURIComponent(id)}`,{method:'DELETE'})}
export async function getDpgfConsultationPolicy(){return apiFetch('/dpgf-consultation-policy')}
export async function saveDpgfConsultationPolicy(policy){return apiFetch('/dpgf-consultation-policy',{method:'PUT',body:JSON.stringify({policy})})}
export async function publishDpgfConsultationPolicy(){return apiFetch('/dpgf-consultation-policy/publish',{method:'POST',body:JSON.stringify({})})}
export async function listDpgfRules(){return apiFetch('/dpgf-rules')}
export async function saveDpgfRule(payload){return apiFetch('/dpgf-rules',{method:'PUT',body:JSON.stringify(payload)})}
export async function publishDpgfRule(key,version,acknowledgeConflicts=false){return apiFetch(`/dpgf-rules/${encodeURIComponent(key)}/publish`,{method:'POST',body:JSON.stringify({version,acknowledge_conflicts:acknowledgeConflicts})})}
export async function getDpgfRuleImpact(key,{version,cctpId}={}){const query=[version?`version=${version}`:'',cctpId?`cctp_id=${cctpId}`:''].filter(Boolean).join('&');return apiFetch(`/dpgf-rules/${encodeURIComponent(key)}/impact${query?`?${query}`:''}`)}
export async function archiveDpgfRule(key){return apiFetch(`/dpgf-rules/${encodeURIComponent(key)}/archive`,{method:'POST',body:JSON.stringify({})})}
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
export async function listDiscussionProjects(q=''){return apiFetch(`/discussions/projects${q?`?q=${encodeURIComponent(q)}`:''}`)}
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
export async function contextualizeRequest(cctpId,chapterId,text){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/conversation/contextualize`,{method:'POST',body:JSON.stringify({text})})}
export async function interpretStyle(cctpId,chapterId,text,history,previousTarget){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/style/interpret`,{method:'POST',body:JSON.stringify({text,history,previous_target:previousTarget||null})})}
/** Observation du classifieur d'intention : envoie la demande et la route choisie par les règles ; sans attente ni effet sur le chat (toute erreur est ignorée). */
export function observeIntent(cctpId,chapterId,text,rulesRoute){apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/intent/observe`,{method:'POST',body:JSON.stringify({text:String(text||'').slice(0,600),rules_route:rulesRoute})}).catch(()=>{})}
export async function formatChapter(cctpId,chapterId,lines,plain,level='full'){return apiFetch(`/cctps/${cctpId}/chapters/${chapterId}/format`,{method:'POST',body:JSON.stringify({lines,plain,level})})}
export async function getFeasibility(id){return apiFetch(fe(id))}
export async function getFeasibilitySummary(id){return apiFetch(fe(id,'/summary'))}
export async function createFeasibility(id){return apiFetch(fe(id),{method:'POST',body:'{}'})}
export async function saveFeasibilityAnswers(id,answers){return apiFetch(fe(id,'/answers'),{method:'PUT',body:JSON.stringify({answers})})}
export async function addFeasibilityHypothesis(id,body){return apiFetch(fe(id,'/facts'),{method:'POST',body:JSON.stringify(body)})}
export async function actOnFeasibilityFact(id,factId,body){return apiFetch(fe(id,`/facts/${factId}`),{method:'PATCH',body:JSON.stringify(body)})}
export async function extractFeasibility(id){return apiFetch(fe(id,'/extract'),{method:'POST',body:'{}'})}
export async function saveFeasibilityEstimate(id,lines){return apiFetch(fe(id,'/estimate'),{method:'PUT',body:JSON.stringify({lines})})}
export async function generateFeasibilityNotice(id,confirmOverwrite=false){return apiFetch(fe(id,'/notice'),{method:'POST',body:JSON.stringify({confirmOverwrite})})}
export async function editFeasibilityNoticeSection(id,section,text){return apiFetch(fe(id,`/notice/sections/${encodeURIComponent(section)}`),{method:'PUT',body:JSON.stringify({text})})}
export async function markFeasibilityStep(id,step,done=true){return apiFetch(fe(id,`/steps/${step}`),{method:'POST',body:JSON.stringify({done})})}
export async function downloadFeasibilityNotice(id,format,name='Notice'){const response=await fetch(`${API_URL}${fe(id,`/notice.${format}`)}`,{credentials:'include',headers:authHeaders()});if(!response.ok)throw new Error('Impossible de générer le document');const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${name}.${format}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}
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
export async function actOnFeasibilityIssue(id,issueId,body){return apiFetch(fe(id,`/issues/${issueId}`),{method:'PATCH',body:JSON.stringify(body)})}
export async function draftFeasibilityReserves(id){return apiFetch(fe(id,'/reserves/draft'),{method:'POST',body:'{}'})}
export async function saveFeasibilityReserves(id,body){return apiFetch(fe(id,'/reserves'),{method:'PUT',body:JSON.stringify(body)})}
export async function getFeasibilityAudit(id,key=''){return apiFetch(fe(id,`/audit${key?`?key=${encodeURIComponent(key)}`:''}`))}
export async function getFeasibilitySynthesis(id){return apiFetch(fe(id,'/synthesis'))}
export async function actOnFeasibilityConsistency(id,issueId,body){return apiFetch(fe(id,`/consistency/${issueId}`),{method:'PATCH',body:JSON.stringify(body)})}
export async function proposeFeasibilityStructure(id){return apiFetch(fe(id,'/estimate/structure'),{method:'POST',body:'{}'})}
export async function getFeasibilityComparables(id,lot=''){return apiFetch(fe(id,`/estimate/comparables?lot=${encodeURIComponent(lot)}`))}
export async function getFeasibilityMacroReferences(id,lot=''){return apiFetch(fe(id,`/estimate/references?lot=${encodeURIComponent(lot)}`))}
export async function saveFeasibilityMacroReference(id,lineId){return apiFetch(fe(id,'/estimate/references'),{method:'POST',body:JSON.stringify({lineId})})}

// --- Planning V1 (plâtrerie) ------------------------------------------------------------------------------------------------------------------------------
const planningBase = (id) => `/cctps/${id}/planning`;
const planningBody = (body) => ({ method: 'POST', body: JSON.stringify(body || {}) });
export const getPlanningAvailability = () => apiFetch('/planning-v1/availability');
export const getPlanning = (id) => apiFetch(planningBase(id));
export const searchPlanningTaskTemplates = (params = {}) => apiFetch(`/planning-v1/task-templates?${new URLSearchParams(params)}`);
export const savePlanningTaskTemplate = (body) => apiFetch('/planning-v1/task-templates', { method: 'PUT', body: JSON.stringify(body) });
export const restorePlanningTaskTemplate = (overrideId) => apiFetch(`/planning-v1/task-templates/${encodeURIComponent(overrideId)}`, { method: 'DELETE' });
export const getProjectConsistency = (id) => apiFetch(`/cctps/${id}/consistency`);
export const getCctpConsistencyAudit = (id, includeResolved = false) => apiFetch(`/cctps/${id}/consistency-audit?include_resolved=${includeResolved}`);
export const runCctpConsistencyAudit = (id) => apiFetch(`/cctps/${id}/consistency-audit/run`, { method: 'POST', body: '{}' });
export const decideCctpConsistencyIssue = (id, issueId, action, note = '') => apiFetch(`/cctps/${id}/consistency-audit/${issueId}`, { method: 'PATCH', body: JSON.stringify({ action, note }) });
export const getPlanningTaskProposals = (id) => apiFetch(`${planningBase(id)}/task-proposals`);
export const createPlanningTask = (id, body) => apiFetch(`${planningBase(id)}/tasks`, { method: 'POST', body: JSON.stringify(body) });
export const removePlanningTask = (id, taskId, expectedRevision) => apiFetch(`${planningBase(id)}/tasks/${encodeURIComponent(taskId)}?expected_revision=${encodeURIComponent(expectedRevision)}`, { method: 'DELETE' });
export const savePlanningTaskAsTemplate = (id, taskId, body) => apiFetch(`${planningBase(id)}/tasks/${encodeURIComponent(taskId)}/save-as-template`, { method: 'POST', body: JSON.stringify(body) });
export const getPlanningTemplateUpdates = (id) => apiFetch(`${planningBase(id)}/template-updates`);
export const decidePlanningTemplateUpdate = (id, taskId, body) => apiFetch(`${planningBase(id)}/template-updates/${encodeURIComponent(taskId)}`, { method: 'POST', body: JSON.stringify(body) });
export const generatePlanning = (id, body) => apiFetch(`${planningBase(id)}/generate`, planningBody(body));
export const syncPlanning = (id) => apiFetch(`${planningBase(id)}/sync`, { method: 'POST', body: '{}' });
export const recalculatePlanning = (id, body) => apiFetch(`${planningBase(id)}/recalculate`, planningBody(body));
export const selectPlanningScenario = (id, body) => apiFetch(`${planningBase(id)}/scenario`, { method: 'PUT', body: JSON.stringify(body) });
export const postPlanningEvent = (id, body) => apiFetch(`${planningBase(id)}/events`, planningBody(body));
export const listPlanningEvents = (id) => apiFetch(`${planningBase(id)}/events`);
export const revertPlanningEvent = (id, eventId, expectedRevision) => apiFetch(`${planningBase(id)}/events/${eventId}/revert`, planningBody({ expected_revision: expectedRevision }));
export const commitPlanning = (id) => apiFetch(`${planningBase(id)}/commit`, planningBody({}));
export const patchPlanningHoldpoint = (id, holdpointId, body) => apiFetch(`${planningBase(id)}/holdpoints/${encodeURIComponent(holdpointId)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const postPlanningActual = (id, body) => apiFetch(`${planningBase(id)}/actuals`, planningBody(body));
export const getPlanningQuantities = (id) => apiFetch(`${planningBase(id)}/quantities`);
export const getPlanningHistory = () => apiFetch('/planning-v1/history');
export const createPlanningHistoryEntry = (body) => apiFetch('/planning-v1/history', { method: 'POST', body: JSON.stringify(body) });
export const qualifyPlanningHistoryEntry = (id, constraintKnowledge) => apiFetch(`/planning-v1/history/${id}`, { method: 'PATCH', body: JSON.stringify({ constraint_knowledge: constraintKnowledge }) });
export const deletePlanningHistoryEntry = (id) => apiFetch(`/planning-v1/history/${id}`, { method: 'DELETE' });
export const setPlanningScheduleConstraint = (id, body) => apiFetch(`${planningBase(id)}/schedule-constraint`, { method: 'PATCH', body: JSON.stringify(body) });
export const getMicrosoftProjectPreflight = (id) => apiFetch(`${planningBase(id)}/export/microsoft-project/preflight`);
export async function downloadPlanning(id, format, name = 'Planning') {
  const response = await fetch(`${API_URL}${planningBase(id)}/export.${format}`, { credentials: 'include', headers: authHeaders() });
  if (!response.ok) throw new Error('Impossible de générer l’export du planning');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${name}.${format}`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

// --- DPGF V0.3 : historique de prix ----------------------------------------------------------------------------------------------------------------------------
export const listDpgfHistoryLines = (params = {}) => apiFetch(`/dpgf-library/lines?${new URLSearchParams({ status: 'ACTIVE', ...params })}`);
export const listDpgfHistoryProjects = () => apiFetch('/dpgf-library/projects');
export const listDpgfLineTypes = () => apiFetch('/dpgf-library/codes');
export const createDpgfHistoryProject = (body) => apiFetch('/dpgf-library/projects', { method: 'POST', body: JSON.stringify(body) });
export const createDpgfHistoryLine = (body, projectId) => apiFetch(`/dpgf-library/lines${projectId ? `?projectId=${projectId}` : ''}`, { method: 'POST', body: JSON.stringify(body) });
export const validateDpgfHistoryLine = (id, body = {}) => apiFetch(`/dpgf-library/lines/${id}/validate`, { method: 'POST', body: JSON.stringify(body) });
export const rejectDpgfHistoryLine = (id) => apiFetch(`/dpgf-library/lines/${id}/reject`, { method: 'POST', body: '{}' });
export const archiveDpgfHistoryLine = (id) => apiFetch(`/dpgf-library/lines/${id}`, { method: 'DELETE' });
export const previewDevisPrices = (cctpId) => apiFetch(`/cctps/${cctpId}/dpgf/devis/validate/preview`);
export const validateDevisPrices = (cctpId) => apiFetch(`/cctps/${cctpId}/dpgf/devis/validate`, { method: 'POST', body: '{}' });

// --- DPGF Economics 1.0 ------------------------------------------------------------------------------------------------------------------------------------------
export const getDpgfEconomicsStatus = () => apiFetch('/dpgf-economics/status');
export const listEstimateImports = () => apiFetch('/dpgf-economics/imports');
export const getEstimateImport = (id) => apiFetch(`/dpgf-economics/imports/${id}`);
export const validateEstimateImport = (id, decisions) => apiFetch(`/dpgf-economics/imports/${id}/validate`, { method: 'POST', body: JSON.stringify({ decisions }) });
export const listStandardPrices = () => apiFetch('/dpgf-economics/standards');
export const setObservationContribution = (id, authorization) => apiFetch(`/dpgf-economics/observations/${id}/contribution`, { method: 'PATCH', body: JSON.stringify({ authorization }) });
export async function createEstimateImport(file, meta) {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(meta || {})) if (value) form.append(key, value);
  const response = await fetch(`${API_URL}/dpgf-economics/imports`, { method: 'POST', credentials: 'include', headers: authHeaders(), body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const failure = new Error(apiErrorMessage(body.detail, `Import impossible (erreur ${response.status}).`)); failure.detail = body.detail; failure.status = response.status; throw failure; }
  return body;
}

// --- Shared Economics Core V1 : catalogue commun et références d'agence ------------------------------------------------------------------------------------------------
export const listEconomicItems = (params = {}) => apiFetch(`/economics/items?${new URLSearchParams(params)}`);
export const listAgencyReferences = (params = {}) => apiFetch(`/economics/agency-references?${new URLSearchParams(params)}`);
export const createAgencyReference = (body) => apiFetch('/economics/agency-references', { method: 'POST', body: JSON.stringify(body) });
export const updateAgencyReference = (id, body) => apiFetch(`/economics/agency-references/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const archiveAgencyReference = (id) => apiFetch(`/economics/agency-references/${id}/archive`, { method: 'POST', body: '{}' });
export const overrideStandard = (body) => apiFetch('/economics/agency-references/override-standard', { method: 'POST', body: JSON.stringify(body) });
export const listSharedStandards = (params = {}) => apiFetch(`/economics/standards?${new URLSearchParams(params)}`);
export const getEconomicsLibrary = (params = {}) => apiFetch(`/economics/library?${new URLSearchParams(params)}`);
export const listEconomySheets = (params = {}) => apiFetch(`/economics/sheets?${new URLSearchParams(params)}`);
export const associateAttachment = (cctpId, attachmentId, module, lot = null) => apiFetch(`/cctps/${cctpId}/attachments/${attachmentId}/associations`, { method: 'POST', body: JSON.stringify({ module, lot }) });
export const getPlanningProjection = (cctpId) => apiFetch(`/cctps/${cctpId}/planning/dpgf-projection`);
export async function downloadCanonicalNotice(id, format, name = 'notice-de-faisabilite') { const response = await fetch(`${API_URL}/cctps/${id}/feasibility/canonical/notice.${format}`, { credentials: 'include', headers: authHeaders() }); if (!response.ok) throw new Error('Impossible de générer le document'); const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${name}.${format}`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); }
export const dissociateAttachment = (cctpId, attachmentId, module, lot = null) => apiFetch(`/cctps/${cctpId}/attachments/${attachmentId}/associations?module=${encodeURIComponent(module)}${lot ? `&lot=${encodeURIComponent(lot)}` : ''}`, { method: 'DELETE' });

// --- Conformité réglementaire --------------------------------------------------------------------------------------------------------------------------------
export const listRegulatoryRules = (params = {}) => apiFetch(`/regulatory/rules?${new URLSearchParams(params)}`);
export const getRegulatoryRule = (id) => apiFetch(`/regulatory/rules/${encodeURIComponent(id)}`);
export const listRegulatoryTopics = () => apiFetch('/regulatory/topics');

export const getDevisRegeneratePreview = (cctpId) => apiFetch(`/cctps/${cctpId}/dpgf/devis/regenerate/preview`);

export const previewWritingBlockOverride = (id, body) => apiFetch(`/writing-blocks/${encodeURIComponent(id)}/preview`, { method: 'POST', body: JSON.stringify(body) });
export const listProjectsForBlocks = () => apiFetch('/cctps?summary=true');

export const detectDpgfRuleCandidates = () => apiFetch('/dpgf-rule-candidates/detect', { method: 'POST', body: JSON.stringify({}) });
export const listDpgfRuleCandidates = (status = 'CANDIDATE') => apiFetch(`/dpgf-rule-candidates?status=${encodeURIComponent(status)}`);
export const draftDpgfRuleCandidate = (id) => apiFetch(`/dpgf-rule-candidates/${encodeURIComponent(id)}/draft`, { method: 'POST', body: JSON.stringify({}) });
export const dismissDpgfRuleCandidate = (id) => apiFetch(`/dpgf-rule-candidates/${encodeURIComponent(id)}/dismiss`, { method: 'POST', body: JSON.stringify({}) });

export const freezeDevis = (cctpId, reason = '') => apiFetch(`/cctps/${cctpId}/dpgf/devis/freeze`, { method: 'POST', body: JSON.stringify({ reason }) });
export const unfreezeDevis = (cctpId, reason = '') => apiFetch(`/cctps/${cctpId}/dpgf/devis/unfreeze`, { method: 'POST', body: JSON.stringify({ reason }) });
