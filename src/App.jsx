import { useState } from 'react';
import { Topbar } from './components/Topbar';
import { CatalogProvider, useCatalog } from './catalog/CatalogContext';
import { useProjects } from './hooks/useProjects';
import { ProjectsPage } from './pages/ProjectsPage';
import { SelectionPage } from './pages/SelectionPage';
import { DraftPage } from './pages/DraftPage';
import { AssistantPage } from './pages/AssistantPage';
import { LoginPage } from './pages/LoginPage';
import { DocumentEditorPage } from './pages/DocumentEditorPage';
import { useAuth } from './auth/AuthContext';
import { AiUnavailableModal } from './components/AiUnavailableModal';
import { renumberSection } from './utils/chapterNumbering';
import { CctpOnboardingPage } from './pages/CctpOnboardingPage';

export function App(){
 const {user,loading:authLoading,login,register,completeOnboarding,logout}=useAuth();
 if(authLoading)return <div className="auth-loading">Chargement de votre espace…</div>;
 if(!user)return <LoginPage onLogin={login} onRegister={register}/>;
 if(!user.onboardingCompleted)return <CctpOnboardingPage onComplete={completeOnboarding} onLogout={logout}/>;
 return <CatalogProvider><AuthenticatedApp user={user} onLogout={logout}/></CatalogProvider>;
}

function AuthenticatedApp({user,onLogout}){
 const {chapters,loading:catalogLoading,error:catalogError}=useCatalog();
 const {projects,loading,error,createProject,updateProject,deleteProject,archiveProject,saveSection,getProgress}=useProjects(user);
 const [view,setView]=useState('projects'); const [activeProjectId,setActiveProjectId]=useState(null); const [activeChapterId,setActiveChapterId]=useState(null); const [unavailableChapter,setUnavailableChapter]=useState(null);
 const project=projects.find(p=>p.id===activeProjectId);
 const openProject=id=>{setActiveProjectId(id);setView('draft')};
 const submitSelection=async(name,selected,cover)=>{if(project){await updateProject(project.id,{name:name.trim(),selected,sections:{...project.sections,__document:{...(project.sections.__document||{}),...cover}}});setView('draft')}else{const created=await createProject(name,selected,cover);setActiveProjectId(created.id);setView('draft')}};
 const goHome=()=>{setActiveProjectId(null);setView('projects')};
 const editChapter=id=>{const chapter=chapters.find(item=>item.id===id);if(id!=='06'){setUnavailableChapter(chapter);return}setActiveChapterId(id);setView('assistant')};
 const reorderChapters=async(fromIndex,toIndex)=>{if(!project||toIndex<0||toIndex>=project.selected.length)return;const selected=[...project.selected];const [moved]=selected.splice(fromIndex,1);selected.splice(toIndex,0,moved);const sections={...project.sections};selected.forEach((id,index)=>{if(sections[id])sections[id]=renumberSection(sections[id],index+1)});await updateProject(project.id,{selected,sections})};
 if(loading||catalogLoading)return <div className="api-state">Chargement de vos CCTP…</div>;
 return <div className="app"><Topbar projectName={project?.name} step={view==='select'?1:view==='draft'?2:view==='assistant'||view==='preview'?3:0} onHome={goHome} user={user} onLogout={onLogout}/>{(error||catalogError)&&<div className="api-state api-error">{error||catalogError}</div>}
 {view==='projects'&&<ProjectsPage projects={projects} getProgress={getProgress} onNew={()=>{setActiveProjectId(null);setView('select')}} onOpen={openProject} onDelete={deleteProject} onArchive={archiveProject}/>} 
 {view==='select'&&<SelectionPage initial={project} onCancel={project?()=>setView('draft'):goHome} onSubmit={submitSelection}/>} 
 {view==='draft'&&project&&<DraftPage project={project} projects={projects} progress={getProgress(project)} getProgress={getProgress} onEdit={editChapter} onModify={()=>setView('select')} onNew={()=>{setActiveProjectId(null);setView('select')}} onOpen={openProject} onPreview={()=>setView('preview')} onReorder={reorderChapters}/>} 
 {view==='preview'&&project&&<DocumentEditorPage project={project} onBack={()=>setView('draft')} onUnavailable={setUnavailableChapter} onSave={(name,sections)=>updateProject(project.id,{name,sections})}/>} 
 {view==='assistant'&&project&&<AssistantPage projectId={project.id} chapter={chapters.find(c=>c.id===activeChapterId)} chapterNumber={project.selected.indexOf(activeChapterId)+1} existing={project.sections[activeChapterId]} onBack={()=>setView('draft')} onSave={async section=>{await saveSection(project.id,activeChapterId,section);setView('draft')}} onGenerated={async section=>{await saveSection(project.id,activeChapterId,section);setView('preview')}}/>}
 {unavailableChapter&&<AiUnavailableModal chapter={unavailableChapter} onClose={()=>setUnavailableChapter(null)}/>}</div>
}
