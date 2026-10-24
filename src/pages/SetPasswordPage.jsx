import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { Logo } from '../components/Logo';

export function SetPasswordPage({token,onSetPassword}){
 const [password,setPasswordValue]=useState(''),[confirmation,setConfirmation]=useState(''),[showPassword,setShowPassword]=useState(false),[showConfirmation,setShowConfirmation]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false),[done,setDone]=useState(false);
 const submit=async event=>{
  event.preventDefault();setError('');
  if(password!==confirmation){setError('Les deux mots de passe ne correspondent pas.');return}
  setLoading(true);
  try{await onSetPassword(token,password);setDone(true);window.location.href='/'}
  catch(reason){setError(reason.message)}
  finally{setLoading(false)}
 };
 return <main className="login-page"><section className="login-brand"><Logo/><div><span className="eyebrow">STUDIO CCTP</span><h1>Une dernière étape<br/>avant de commencer.</h1><p>Choisissez le mot de passe qui protégera votre espace CCTP.</p></div><small>Calepin · Assistant de rédaction technique</small></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><span className="login-lock"><LockKeyhole size={21}/></span><h2>Définissez votre mot de passe</h2><p>Ce lien est valable 24 heures et ne peut être utilisé qu’une seule fois.</p><label><span>Nouveau mot de passe</span><div><LockKeyhole size={16}/><input type={showPassword?'text':'password'} value={password} onChange={event=>setPasswordValue(event.target.value)} autoComplete="new-password" minLength={8} required placeholder="Votre mot de passe" autoFocus/><button type="button" className="password-toggle" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} title={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label><small className="password-help">8 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</small><label><span>Confirmer le mot de passe</span><div><LockKeyhole size={16}/><input type={showConfirmation?'text':'password'} value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required placeholder="Saisissez-le à nouveau"/><button type="button" className="password-toggle" onClick={()=>setShowConfirmation(value=>!value)} aria-label={showConfirmation?'Masquer la confirmation':'Afficher la confirmation'} title={showConfirmation?'Masquer la confirmation':'Afficher la confirmation'}>{showConfirmation?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>{error&&<div className="login-error">{error}</div>}<button className="primary login-submit" disabled={loading||done}>{done?'Redirection…':loading?'Enregistrement…':'Définir mon mot de passe'} {!loading&&!done&&<ArrowRight size={17}/>}</button><small className="privacy">Connexion sécurisée · Vos données restent privées</small></form></section></main>;
}
