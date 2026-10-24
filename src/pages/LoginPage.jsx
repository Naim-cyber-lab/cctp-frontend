import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, FileCheck2, LockKeyhole, Mail, MailCheck, UserPlus } from 'lucide-react';
import { Logo } from '../components/Logo';

export function LoginPage({onLogin,onRegister,onForgotPassword}){
 const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[error,setError]=useState(''),[accountExists,setAccountExists]=useState(false),[loading,setLoading]=useState(false),[sentTo,setSentTo]=useState('');
 const registering=mode==='register',forgot=mode==='forgot';
 const switchMode=next=>{setMode(next);setError('');setAccountExists(false);setPassword('');setShowPassword(false);setSentTo('')};
 const requestPasswordReset=async()=>{
  setError('');setAccountExists(false);setLoading(true);
  try{await onForgotPassword(email);setSentTo(email)}
  catch(reason){setError(reason.message)}
  finally{setLoading(false)}
 };
 const submit=async event=>{
  event.preventDefault();setError('');setLoading(true);
  try{
   if(registering){await onRegister(email);setSentTo(email)}
   else if(forgot){await onForgotPassword(email);setSentTo(email)}
   else await onLogin(email,password);
  }
  catch(reason){setError(reason.message);setAccountExists(registering&&/compte existe déjà/i.test(reason.message))}
  finally{setLoading(false)}
 };
 if(sentTo)return <main className="login-page"><section className="login-brand"><Logo/><div><span className="eyebrow">STUDIO CCTP</span><h1>Vos pièces écrites,<br/>structurées simplement.</h1><p>Créez, rédigez et retrouvez tous vos CCTP dans un espace de travail privé.</p></div><small>Calepin · Assistant de rédaction technique</small></section><section className="login-form-wrap"><div className="login-form"><span className="login-lock"><MailCheck size={21}/></span><h2>Vérifiez votre boîte mail</h2><p>Un email vient d’être envoyé à <strong>{sentTo}</strong> {registering?'pour définir votre mot de passe et activer votre compte.':'avec un lien pour choisir un nouveau mot de passe.'} Le lien est valable 24 heures.</p><button className="secondary" onClick={()=>switchMode('login')}>Retour à la connexion</button></div></section></main>;
 return <main className="login-page"><section className="login-brand"><Logo/><div><span className="eyebrow">STUDIO CCTP</span><h1>Vos pièces écrites,<br/>structurées simplement.</h1><p>Créez, rédigez et retrouvez tous vos CCTP dans un espace de travail privé.</p><div className="login-benefit"><FileCheck2 size={20}/><span><b>Un espace sécurisé</b><small>Chaque projet reste associé à votre compte.</small></span></div></div><small>Calepin · Assistant de rédaction technique</small></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><span className="login-lock">{registering?<UserPlus size={21}/>:<LockKeyhole size={21}/>}</span><h2>{registering?'Créer votre compte':forgot?'Mot de passe oublié':'Bienvenue'}</h2><p>{registering?'Indiquez votre email : vous recevrez un lien pour définir votre mot de passe.':forgot?'Indiquez votre email pour recevoir un lien de réinitialisation.':'Connectez-vous pour accéder à vos CCTP.'}</p>{!forgot&&<div className="auth-mode"><button type="button" className={!registering?'active':''} onClick={()=>switchMode('login')}>Connexion</button><button type="button" className={registering?'active':''} onClick={()=>switchMode('register')}>Créer un compte</button></div>}<label><span>Adresse email</span><div><Mail size={16}/><input type="email" value={email} onChange={event=>{setEmail(event.target.value);setAccountExists(false);setError('')}} autoComplete="email" required placeholder="nom@entreprise.fr"/></div></label>{!registering&&!forgot&&<label><span>Mot de passe</span><div><LockKeyhole size={16}/><input type={showPassword?'text':'password'} value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" minLength={6} required placeholder="Votre mot de passe"/><button type="button" className="password-toggle" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} title={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}{error&&<div className="login-error">{error}{accountExists&&<button type="button" className="login-error-action" onClick={requestPasswordReset} disabled={loading}>Recevoir un lien pour réinitialiser mon mot de passe</button>}</div>}<button className="primary login-submit" disabled={loading}>{loading?(registering||forgot?'Envoi…':'Connexion…'):(registering?'Créer mon compte':forgot?'Envoyer le lien':'Se connecter')} {!loading&&<ArrowRight size={17}/>}</button>{!registering&&!forgot&&<button type="button" className="login-forgot" onClick={()=>switchMode('forgot')}>Mot de passe oublié ?</button>}{forgot&&<button type="button" className="login-forgot" onClick={()=>switchMode('login')}>Retour à la connexion</button>}<small className="privacy">Connexion sécurisée · Vos données restent privées</small></form></section></main>;
}
