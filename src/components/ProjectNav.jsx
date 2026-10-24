import { ArrowLeft, BookOpenCheck, ClipboardCheck, FileSpreadsheet, FileText, FolderOpen, LayoutDashboard, Send } from "lucide-react";

const ITEMS = [
  ["overview", "Vue d’ensemble", LayoutDashboard],
  ["feasibility", "Faisabilité", ClipboardCheck],
  ["cctp", "CCTP", FileText],
  ["estimate", "DPGF", FileSpreadsheet],
  ["consultation", "Consultation", Send],
  ["documents", "Documents", FolderOpen],
];

/** Navigation d'un projet (UX-PROJET-CTX-01) : seulement un retour vers « Projets » puis les onglets du projet. L'onglet actif indique la section ;
 *  le nom du projet n'est pas répété ici (il figure dans l'en-tête de la page). */
export function ProjectNav({ project, active, onNavigate, onBack, onOpenLibrary }) {
  if (!project) return null;
  return <nav className="project-nav" aria-label={`Navigation du projet ${project.name}`} data-project-nav>
    <div className="project-nav-identity project-breadcrumb" data-breadcrumb>
      <button type="button" data-breadcrumb-projects onClick={onBack} title="Retour à tous les projets"><ArrowLeft size={14}/> Projets</button>
    </div>
    <div className="project-nav-items">
      {ITEMS.map(([id, label, Icon]) => <button key={id} type="button" className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} data-project-section={id} onClick={() => onNavigate(id)}><Icon size={15}/><span>{label}</span></button>)}
    </div>
    {onOpenLibrary && <button type="button" className="project-nav-library" data-project-library title="Bibliothèque de l’agence : clauses, modèles d’ouvrages, références de prix" onClick={onOpenLibrary}><BookOpenCheck size={15}/> Bibliothèque agence</button>}
  </nav>;
}
