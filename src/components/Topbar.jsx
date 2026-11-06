import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, Building2, Check, ChevronDown, CircleCheckBig, FolderKanban, LogOut, MessageCircle, Settings, UserRound } from 'lucide-react';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { useMyTasks } from '../hooks/useMyTasks';
import { useWorkspaces } from '../hooks/useWorkspaces';

// Navigation globale : « Projets » est l'unique entrée métier ; CCTP, DPGF et Consultation se travaillent depuis un projet (la vue « Vues agence » a été supprimée).
const TITLES = { projects: 'Projets', consult: 'Consultations', quotes: 'DPGF', profile: 'Paramètres', tasks: 'Tâches', cctp: 'CCTP' };

/** En-tête : trois espaces de travail (CCTP, DPGF, Consultation) ; à droite, les fonctions transverses (Tâches, Discussion, notifications) et l'espace de travail actif. */
export function Topbar({ projectName, lotCount = 0, activeTab, onTabChange, onHome, user, onLogout, chatUnread = 0, notifications = null, onOpenTasks, onOpenDiscussion, tasksOpen = false, discussionOpen = false, onOpenSettings, onOpenLibrary, projectScope = false }) {
  const tasks = useMyTasks();
  const { spaces, active, switchTo } = useWorkspaces();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const inProject = projectScope; // dans un projet, « Projets » reste l'entrée active
  const agencyView = false; // plus de « Vues agence » : « Projets » est l'unique entrée de la barre du haut
  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => { if (!menuRef.current?.contains(event.target)) setMenu(false); };
    const escape = (event) => { if (event.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [menu]);
  return <header className="topbar">
    <button className="logo-button" onClick={onHome}><Logo/></button>
    <div className="project-crumb" aria-hidden="true"/>{/* le header répond seulement à « où aller ? » et « dans quelle agence ? » : plus de libellé « ESPACE DE TRAVAIL » */}
    <nav className="workspace-tabs" aria-hidden="true" />
    <div/>
    <div className="account-area">
      <button type="button" className={`topbar-function ${tasksOpen ? 'active' : ''}`} data-open-tasks title="Mes tâches" onClick={onOpenTasks}><CircleCheckBig size={16}/><span>Tâches</span>{tasks.count > 0 && <em className="tab-badge" data-task-badge="header" title={`${tasks.count} tâche${tasks.count > 1 ? 's' : ''} qui vous ${tasks.count > 1 ? 'sont assignées' : 'est assignée'}, pas encore terminée${tasks.count > 1 ? 's' : ''}`}>{tasks.count > 99 ? '99+' : tasks.count}</em>}</button>
      <button type="button" className={`topbar-function ${discussionOpen ? 'active' : ''}`} data-open-discussion title="Discussion de l’agence" onClick={onOpenDiscussion}><MessageCircle size={16}/><span>Discussion</span>{chatUnread > 0 && <em className="tab-badge" data-chat-badge="header">{chatUnread > 99 ? '99+' : chatUnread}</em>}</button>
      {notifications && <NotificationBell items={notifications.items} unread={notifications.unread} onOpen={notifications.onOpen} onMarkAllRead={notifications.onMarkAllRead}/>}
      <div className="workspace-switcher" ref={menuRef}>
        <button type="button" className="workspace-switcher-button" data-workspace-switcher aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((value) => !value)} title={user.email}>
          <Building2 size={15}/><span><small>{active?.type === 'ORGANIZATION' ? 'AGENCE' : 'ESPACE'}</small><b data-workspace-name>{active?.name || 'Espace personnel'}</b></span><ChevronDown size={14}/>
        </button>
        {menu && <div className="workspace-menu" role="menu" data-workspace-menu>
          <p className="workspace-menu-user"><UserRound size={14}/> {user.email}</p>
          {spaces.map((space) => <button key={space.id} role="menuitem" type="button" className={space.active ? 'current' : ''} data-workspace-option={space.id} onClick={() => { setMenu(false); if (!space.active) switchTo(space.id); }}>{space.active ? <Check size={14}/> : <i/>}<span>{space.name}<small>{space.type === 'PERSONAL' ? 'Espace personnel' : { admin: 'Administrateur', member: 'Membre', viewer: 'Lecteur' }[space.role]}</small></span></button>)}
          <hr/>
          <button type="button" role="menuitem" data-open-agency-library onClick={() => { setMenu(false); onOpenLibrary?.(); }}><BookOpenCheck size={14}/><span>Bibliothèque agence</span></button>
          <button type="button" role="menuitem" data-open-settings onClick={() => { setMenu(false); onOpenSettings?.(); }}><Settings size={14}/><span>Paramètres</span></button>
          <button type="button" role="menuitem" data-manage-spaces onClick={() => { setMenu(false); onOpenSettings?.('agency'); }}><Building2 size={14}/><span>Gérer les espaces</span></button>
        </div>}
      </div>
      <button className="logout-button" onClick={onLogout} title="Se déconnecter"><LogOut size={16}/></button>
    </div>
  </header>;
}
