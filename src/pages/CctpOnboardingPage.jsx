import { ArrowRight, BookOpen, Check, FileText, LogOut, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadReferenceCctp } from '../api/client';
import { Logo } from '../components/Logo';

export function CctpOnboardingPage({onComplete,onLogout}) {
  const picker = useRef(null);
  const [documents,setDocuments] = useState([]);
  const [uploading,setUploading] = useState(false);
  const [finishing,setFinishing] = useState(false);
  const [error,setError] = useState('');

  const upload = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setUploading(true); setError('');
    try {
      const uploaded = [];
      for (const file of files) uploaded.push(await uploadReferenceCctp(file));
      setDocuments(current => [...current,...uploaded]);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setUploading(false);
    }
  };

  const finish = async () => {
    setFinishing(true); setError('');
    try { await onComplete(); }
    catch (reason) { setError(reason.message); setFinishing(false); }
  };

  return <main className="cctp-onboarding">
    <header><Logo/><button onClick={onLogout}><LogOut size={16}/> Se déconnecter</button></header>
    <section className="onboarding-copy">
      <span className="onboarding-step">BIENVENUE DANS CALEPIN</span>
      <h1>Apprenez à l’IA<br/>votre façon de rédiger.</h1>
      <p>Ajoutez un ou plusieurs anciens CCTP représentatifs. Ils permettent à Calepin d’adapter progressivement la page de garde, la structure et le style rédactionnel de vos futurs documents.</p>
      <div className="onboarding-benefits">
        <article><Sparkles size={20}/><span><b>Votre style rédactionnel</b><small>Organisation, niveau de détail, vocabulaire et formulation.</small></span></article>
        <article><BookOpen size={20}/><span><b>Votre présentation</b><small>Page de garde, titres, hiérarchie et habitudes de mise en page.</small></span></article>
        <article><ShieldCheck size={20}/><span><b>Strictement confidentiel</b><small>Vos documents sont isolés dans votre compte et ne sont jamais accessibles ni réutilisés par un autre utilisateur.</small></span></article>
      </div>
    </section>
    <section className="onboarding-import">
      <div className="onboarding-import-head"><span><FileText size={22}/></span><div><small>ÉTAPE DE PERSONNALISATION</small><h2>Vos anciens CCTP</h2></div></div>
      <p>Sélectionnez des documents qui reflètent le mieux la présentation et le ton que vous souhaitez retrouver.</p>
      <input ref={picker} hidden multiple type="file" accept=".pdf,.docx" onChange={upload}/>
      <button className="onboarding-drop" onClick={()=>picker.current?.click()} disabled={uploading}>
        <Upload size={25}/><b>{uploading?'Analyse en cours…':'Ajouter des CCTP'}</b><small>PDF ou Word · 30 Mo maximum par fichier</small>
      </button>
      {documents.length>0&&<div className="onboarding-files">{documents.map(item=><div key={item.id}><Check size={15}/><span><b>{item.filename}</b><small>Modèle analysé et associé à votre compte</small></span></div>)}</div>}
      <div className="onboarding-confidential"><ShieldCheck size={17}/><span><b>Bibliothèque privée</b><small>Les données de ces CCTP restent entièrement confidentielles. Elles servent uniquement à personnaliser votre propre compte.</small></span></div>
      {error&&<div className="login-error">{error}</div>}
      <button className="primary onboarding-continue" onClick={finish} disabled={uploading||finishing}>{finishing?'Ouverture de votre espace…':documents.length?'Continuer avec mes modèles':'Continuer sans modèle'} {!finishing&&<ArrowRight size={17}/>}</button>
      {documents.length===0&&<small className="onboarding-skip">Vous pourrez en ajouter plus tard depuis « Mes modèles CCTP ».</small>}
    </section>
  </main>;
}
