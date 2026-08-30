import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

const byLastUpdate=(a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime();
const latestFirst=items=>[...items].sort(byLastUpdate);

export function useProjects(user){
  const [projects,setProjects]=useState([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');
  const refresh=useCallback(async()=>{if(!user)return;setLoading(true);try{let remote=await apiFetch('/cctps');const migrated=localStorage.getItem('calepin-api-migrated');if(!remote.length&&!migrated){const local=JSON.parse(localStorage.getItem('calepin-projects')||'[]');for(const item of local){await apiFetch('/cctps',{method:'POST',body:JSON.stringify({name:item.name,selected:item.selected,sections:item.sections||{}})})}localStorage.setItem('calepin-api-migrated','1');if(local.length)remote=await apiFetch('/cctps')}setProjects(latestFirst(remote));setError('')}catch(err){setError(err.message)}finally{setLoading(false)}},[user]);
  useEffect(()=>{refresh()},[refresh]);
  const createProject=async(name,selected,cover={})=>{const project=await apiFetch('/cctps',{method:'POST',body:JSON.stringify({name:name.trim(),selected,sections:{},cover})});setProjects(items=>latestFirst([project,...items]));return project};
  const updateProject=async(id,changes)=>{const project=await apiFetch(`/cctps/${id}`,{method:'PATCH',body:JSON.stringify(changes)});setProjects(items=>latestFirst(items.map(p=>p.id===id?project:p)));return project};
  const deleteProject=async id=>{await apiFetch(`/cctps/${id}`,{method:'DELETE'});setProjects(items=>items.filter(project=>project.id!==id))};
  const archiveProject=async(id,archived=true)=>updateProject(id,{archived});
  const saveSection=async(projectId,chapterId,section)=>{const project=await apiFetch(`/cctps/${projectId}/sections/${chapterId}`,{method:'PUT',body:JSON.stringify({section})});setProjects(items=>latestFirst(items.map(p=>p.id===projectId?project:p)));return project};
  const getProgress=project=>project?.selected.length?Math.round(Object.keys(project.sections).filter(id=>project.selected.includes(id)).length/project.selected.length*100):0;
  return {projects,loading,error,createProject,updateProject,deleteProject,archiveProject,saveSection,getProgress,refresh};
}
