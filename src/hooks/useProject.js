import { useEffect, useMemo, useState } from 'react';

const initial = { name:'Résidence Les Tilleuls', selected:['03','06','08','09'], sections:{} };

export function useProject(){
  const [project, setProject] = useState(() => {
    try { return JSON.parse(localStorage.getItem('calepin-project')) || initial; } catch { return initial; }
  });
  useEffect(() => localStorage.setItem('calepin-project', JSON.stringify(project)), [project]);
  const toggle = id => setProject(p => ({...p, selected:p.selected.includes(id) ? p.selected.filter(x=>x!==id) : [...p.selected,id]}));
  const saveSection = (id, section) => setProject(p => ({...p, sections:{...p.sections,[id]:section}}));
  const progress = useMemo(() => project.selected.length ? Math.round(Object.keys(project.sections).filter(id=>project.selected.includes(id)).length/project.selected.length*100) : 0, [project]);
  return { project, setProject, toggle, saveSection, progress };
}
