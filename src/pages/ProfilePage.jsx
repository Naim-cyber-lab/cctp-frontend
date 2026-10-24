import { ArrowRight, BookOpen, Building2, UserRound, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ReferenceCctpLibrary } from '../components/ReferenceCctpLibrary';
import { PersonalInfo } from '../components/PersonalInfo';
import { FormattingPreferencesPanel } from '../components/FormattingPreferencesPanel';
import { AgencySettings } from '../components/AgencySettings';
import { useWorkspaces } from '../hooks/useWorkspaces';
import './ProfilePage.css';

/** Paramètres : « Mon compte » (informations, modèles, mise en forme) et « Espace agence » (informations, membres, invitations, rôles, domaine, sécurité). */
export function ProfilePage({user,initialSection='account',sectionNonce=0}){
 const [section,setSection]=useState(initialSection);
 const [referencesOpen,setReferencesOpen]=useState(false);
 const [formattingOpen,setFormattingOpen]=useState(false);
 const {active}=useWorkspaces();
 useEffect(()=>{setSection(initialSection)},[initialSection,sectionNonce]);
 return <main className="workspace-page profile-page layout-settings"><header className="workspace-page-head"><div><span className="eyebrow">PARAMÈTRES</span><h1>Paramètres</h1><p>Votre compte, vos modèles et l’espace de votre agence.</p></div></header>
  <nav className="profile-sections" aria-label="Sections des paramètres" data-profile-nav>
   <button className={section==='account'?'active':''} data-profile-section="account" onClick={()=>setSection('account')}><UserRound size={16}/> Mon compte</button>
   <button className={section==='agency'?'active':''} data-profile-section="agency" onClick={()=>setSection('agency')}><Building2 size={16}/> Espace agence{active?.type==='ORGANIZATION'?` · ${active.name}`:''}</button>
  </nav>
  {section==='account'&&<section className="profile-grid"><article className="profile-card profile-card-account"><span><UserRound size={22}/></span><div><small>COMPTE</small><h2>Informations personnelles</h2><PersonalInfo user={user}/></div></article><article className="profile-card"><span><BookOpen size={22}/></span><div><small>PERSONNALISATION</small><h2>Modèles CCTP de référence</h2><p>Pour que vos futurs CCTP aient votre présentation : Calepin apprend la structure, la page de garde et le style de vos anciens CCTP. Pour modifier un document existant, utilisez « Importer PDF ou Word » dans Vos CCTP.</p><button className="profile-action" onClick={()=>setReferencesOpen(true)}><span><BookOpen size={16}/> Gérer mes modèles</span><ArrowRight size={16}/></button></div></article><article className="profile-card"><span><WandSparkles size={22}/></span><div><small>PERSONNALISATION</small><h2>Mise en forme automatique</h2><p>Choisissez la taille et l’alignement de vos titres numérotés : ce réglage s’applique ensuite à tous vos CCTP et à vos exports Word/PDF.</p><button className="profile-action" onClick={()=>setFormattingOpen(true)}><span><WandSparkles size={16}/> Régler ma mise en forme</span><ArrowRight size={16}/></button></div></article></section>}
  {section==='agency'&&<div className="profile-team" data-profile-team><AgencySettings user={user}/></div>}
  {referencesOpen&&<ReferenceCctpLibrary onClose={()=>setReferencesOpen(false)}/>}{formattingOpen&&<FormattingPreferencesPanel onClose={()=>setFormattingOpen(false)}/>}</main>
}
