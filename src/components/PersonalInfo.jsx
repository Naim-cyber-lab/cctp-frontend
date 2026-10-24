import '../personal-info.css';
import { useState } from 'react';
import { Check, Mail, Pencil } from 'lucide-react';
import { changeEmail, updateProfile } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// Le changement d'adresse met à jour le compte connecté, ce qui peut remonter la page : le message de réussite survit à ce remontage
let emailJustChanged = false;

/** Informations personnelles du profil : nom, prénom, entreprise, et changement d'adresse e-mail (mot de passe exigé). */
export function PersonalInfo({ user }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: user.firstName || '', lastName: user.lastName || '', company: user.company || '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState({ newEmail: '', password: '' });
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailDone, setEmailDone] = useState(emailJustChanged);
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const set = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); setSaved(false); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      updateUser(await updateProfile(form));
      setSaved(true); setEditing(false);
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  };
  const saveEmail = async () => {
    setEmailBusy(true); setEmailError(''); setEmailDone(false); emailJustChanged = false;
    try {
      const updated = await changeEmail(email.newEmail.trim(), email.password);
      emailJustChanged = true;
      updateUser(updated);
      setEmail({ newEmail: '', password: '' }); setEmailOpen(false); setEmailDone(true);
    } catch (reason) { setEmailError(reason.message); }
    finally { setEmailBusy(false); }
  };

  return (
    <div className="personal-info" data-personal-info>
      {!editing ? (
        <>
          <label>Nom</label>
          <p data-personal-name>{fullName || <em>Non renseigné</em>}</p>
          <label>Entreprise</label>
          <p data-personal-company>{user.company || <em>Non renseignée</em>}</p>
        </>
      ) : (
        <div className="personal-info-form">
          <label>Prénom<input data-field="firstName" value={form.firstName} maxLength={80} onChange={set('firstName')} autoComplete="given-name" /></label>
          <label>Nom<input data-field="lastName" value={form.lastName} maxLength={80} onChange={set('lastName')} autoComplete="family-name" /></label>
          <label>Entreprise<input data-field="company" value={form.company} maxLength={160} onChange={set('company')} autoComplete="organization" /></label>
          {error && <div className="login-error" role="alert">{error}</div>}
        </div>
      )}
      <label>Adresse e-mail</label>
      <p className="profile-email"><Mail size={15} />{user.email}</p>
      {editing && !emailOpen && (
        <div className="personal-info-actions">
          <button type="button" className="secondary" data-email-open onClick={() => { setEmailOpen(true); setEmailDone(false); emailJustChanged = false; }}>Changer d’adresse e-mail</button>
          {emailDone && <span className="personal-info-ok" data-email-done><Check size={14} /> Adresse e-mail modifiée</span>}
        </div>
      )}
      {!editing && (
        <div className="personal-info-actions">
          <button type="button" className="secondary" data-personal-edit onClick={() => { setEditing(true); setSaved(false); }}><Pencil size={14} /> Modifier mes informations</button>
          {saved && <span className="personal-info-ok"><Check size={14} /> Enregistré</span>}
          {emailDone && <span className="personal-info-ok" data-email-done><Check size={14} /> Adresse e-mail modifiée</span>}
        </div>
      )}
      {emailOpen && editing && (
        <div className="personal-info-form" data-email-form>
          <label>Nouvelle adresse e-mail<input data-field="newEmail" type="email" value={email.newEmail} onChange={(event) => setEmail((current) => ({ ...current, newEmail: event.target.value }))} autoComplete="email" /></label>
          <label>Mot de passe actuel<input data-field="password" type="password" value={email.password} onChange={(event) => setEmail((current) => ({ ...current, password: event.target.value }))} autoComplete="current-password" /></label>
          {emailError && <div className="login-error" role="alert" data-email-error>{emailError}</div>}
          <div className="personal-info-actions">
            <button type="button" className="secondary" onClick={() => { setEmailOpen(false); setEmailError(''); }}>Annuler</button>
            <button type="button" className="primary" data-email-save disabled={emailBusy || !email.newEmail.trim() || !email.password} onClick={saveEmail}>{emailBusy ? 'Modification…' : 'Modifier l’adresse'}</button>
          </div>
        </div>
      )}
      {editing && (
        <div className="personal-info-actions personal-info-footer" data-personal-footer>
          <button type="button" className="secondary" onClick={() => { setEditing(false); setEmailOpen(false); setEmailError(''); setError(''); setForm({ firstName: user.firstName || '', lastName: user.lastName || '', company: user.company || '' }); }}>Annuler</button>
          <button type="button" className="primary" data-personal-save disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      )}
    </div>
  );
}
