import { ChevronLeft, LogOut } from 'lucide-react';
import { Logo } from './Logo';

export function Topbar({projectName,step,onHome,user,onLogout}){
 return <header className="topbar"><button className="logo-button" onClick={onHome}><Logo/></button>{projectName?<div className="project-crumb"><button className="icon-button" onClick={onHome} title="Voir tous les CCTP"><ChevronLeft size={18}/></button><span><small>CCTP EN COURS</small><b>{projectName}</b></span></div>:<div className="project-crumb"><span><small>ESPACE DE TRAVAIL</small><b>Mes CCTP</b></span></div>}{step>0?<div className="stepper"><i className="done">1</i><span className={step>=2?'active':''}>2</span><i className={step>=3?'done':''}>3</i><small>{step===1?'Création':step===2?'Rédaction':'Assistant'}</small></div>:<div/>}<div className="account-area"><span><small>CONNECTÉ</small><b>{user.email}</b></span><button className="logout-button" onClick={onLogout} title="Se déconnecter"><LogOut size={16}/></button></div></header>
}
