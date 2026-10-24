import { Building2, Eye, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getCctpEditRights, getDevisEditRights, getDevisSharing, listCctpShares, listDevisShares, removeCctpShare, removeDevisShare, setCctpEditRights, setDevisEditRights, setDevisInheritCctp, shareCctp, shareDevis, updateCctpShare, updateDevisShare } from "../api/client";

// Un seul composant de partage pour les CCTP et les DPGF : mêmes écrans, mêmes droits.
// Les membres de l'agence voient déjà tout : on règle QUI PEUT MODIFIER ; les invités externes (BET, architecte partenaire…) restent des partages nominatifs.
const API = {
  cctp: { list: listCctpShares, add: shareCctp, update: updateCctpShare, remove: removeCctpShare, rights: getCctpEditRights, setRights: setCctpEditRights, noun: "CCTP", title: "Partager ce CCTP" },
  devis: { list: listDevisShares, add: shareDevis, update: updateDevisShare, remove: removeDevisShare, rights: getDevisEditRights, setRights: setDevisEditRights, noun: "DPGF", title: "Partager ce DPGF" },
};

export function ShareCctpModal({ project, onClose, onChanged, kind = "cctp" }) {
  const api = API[kind];
  const [inherit, setInherit] = useState(false);
  const canManageShares = project.accessRole === "owner";
  const [shares, setShares] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("read");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rights, setRights] = useState(null); // { mode, members: [{userId, email, editor, creator}] }
  const [draftEditors, setDraftEditors] = useState([]);
  const agency = Boolean(project.agency);
  const load = async () => {
    try {
      const [access, editRights] = await Promise.all([api.list(project.id), agency ? api.rights(project.id).catch(() => null) : Promise.resolve(null)]);
      if (kind === "devis") setInherit(Boolean((await getDevisSharing(project.id).catch(() => ({}))).inheritCctpAccess));
      setShares(access);
      setRights(editRights);
      setDraftEditors((editRights?.members || []).filter((member) => member.editor).map((member) => member.userId));
      setError("");
    }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, [project.id]);
  const invite = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const invitedEmail = email.trim();
    try { await api.add(project.id, invitedEmail, role); setEmail(""); await load(); setNotice(`Invitation envoyée à ${invitedEmail}.`); onChanged?.(); }
    catch (reason) { setError(reason.message); setBusy(false); }
  };
  const changeRole = async (share, nextRole) => {
    setBusy(true);
    try { await api.update(project.id, share.id, nextRole); await load(); }
    catch (reason) { setError(reason.message); setBusy(false); }
  };
  const remove = async (share) => {
    setBusy(true);
    try { await api.remove(project.id, share.id); await load(); onChanged?.(); }
    catch (reason) { setError(reason.message); setBusy(false); }
  };
  const saveRights = async (mode, editors = draftEditors) => {
    setBusy(true); setError(""); setNotice("");
    try { await api.setRights(project.id, { mode, editors }); await load(); setNotice(mode === "INHERIT_WORKSPACE" ? "Les droits de l’agence s’appliquent." : "Modification restreinte aux éditeurs choisis."); onChanged?.(); }
    catch (reason) { setError(reason.message); setBusy(false); }
  };
  const restricted = rights?.mode === "RESTRICT_EDITORS";
  return <div className="share-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="share-dialog" role="dialog" aria-modal="true" aria-label={`Partager ${project.name}`}>
      <header><span><Users size={20}/></span><div><h2 data-share-title>{api.title}</h2><p>{agency ? "Tous les membres de l’agence voient ce document. Réglez qui peut le modifier, et invitez des personnes extérieures à l’agence." : canManageShares ? "Invitez de nouvelles personnes et gérez leurs droits d’accès." : "Invitez une nouvelle personne. Le créateur reste responsable de la gestion des droits existants."}</p></div><button aria-label="Fermer" onClick={onClose}><X size={18}/></button></header>
      {agency && <section className="edit-rights" data-edit-rights>
        <div className="agency-access" data-agency-access><Building2 size={18}/><div><b>Accès agence</b><small>Tous les membres de {project.workspaceName || "l’agence"} — lecture pour les lecteurs, modification selon les droits ci-dessous.</small></div></div>
        <h3>Droits de modification</h3>
        <div className="policy-options">
          <label className={!restricted ? "selected" : ""}><input type="radio" name="edit-mode" data-edit-mode="INHERIT_WORKSPACE" checked={!restricted} disabled={busy || !canManageShares} onChange={() => saveRights("INHERIT_WORKSPACE")} /><span>Utiliser les droits de l’agence<small>Administrateurs et membres modifient ; les lecteurs lisent.</small></span></label>
          <label className={restricted ? "selected" : ""}><input type="radio" name="edit-mode" data-edit-mode="RESTRICT_EDITORS" checked={restricted} disabled={busy || !canManageShares} onChange={() => saveRights("RESTRICT_EDITORS", draftEditors.length ? draftEditors : (rights?.members || []).filter((member) => member.creator).map((member) => member.userId))} /><span>Restreindre la modification<small>Seuls les éditeurs cochés modifient ; tous les autres membres lisent.</small></span></label>
        </div>
        {restricted && <ul data-editors-list>{(rights?.members || []).map((member) => <li key={member.userId}><label><input type="checkbox" data-editor={member.email} checked={draftEditors.includes(member.userId) || member.creator} disabled={busy || !canManageShares || member.creator} onChange={(event) => { const next = event.target.checked ? [...draftEditors, member.userId] : draftEditors.filter((id) => id !== member.userId); setDraftEditors(next); saveRights("RESTRICT_EDITORS", next); }} /> {member.email}{member.creator ? " (créateur)" : ""}</label></li>)}</ul>}
        {!canManageShares && <small>Seuls le créateur et un administrateur changent les droits de modification.</small>}
      </section>}
      <h3 className="share-external-title" data-external-title>{agency ? "Invités externes" : "Partager avec une personne"}</h3>
      <form onSubmit={invite}>
        <label className="share-email-field">Compte Calepin<input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder={agency ? "bet@cabinet-externe.fr" : "Adresse e-mail de la personne…"} autoComplete="off" aria-label="Adresse e-mail de la personne" /></label>
        <label>Droit<select value={role} onChange={(event)=>setRole(event.target.value)}><option value="read">Lecture</option><option value="write">Écriture</option></select></label>
        <button className="primary" disabled={busy || !email.trim()}><UserPlus size={15}/> Partager</button>
      </form>
      {kind === "devis" && <div className="share-inherit" data-share-devis-note>
        <p><b>Ce partage ne donne pas accès au CCTP associé.</b> Un lecteur du DPGF voit les lots, quantités, prix et totaux ; pour consulter le CCTP, il doit y avoir accès séparément.</p>
        {canManageShares && <label className="inline-check"><input type="checkbox" data-share-inherit checked={inherit} disabled={busy} onChange={async (event) => { setBusy(true); try { await setDevisInheritCctp(project.id, event.target.checked); setInherit(event.target.checked); } catch (reason) { setError(reason.message); } finally { setBusy(false); } }} /> Les invités externes de ce CCTP ont aussi accès à son DPGF</label>}
      </div>}
      {error && <div className="share-error" role="alert">{error}</div>}
      {notice && <div className="share-notice" role="status">{notice}</div>}
      <div className="share-members">
        <h3>{agency ? "Invités externes ayant accès" : "Personnes ayant accès"}</h3>
        {busy && !shares.length ? <p>Chargement…</p> : shares.length ? shares.map((share)=><article key={share.id}>
          <span>{share.role === "write" ? <Pencil size={15}/> : <Eye size={15}/>}<b>{share.email}</b></span>
          {canManageShares ? <select aria-label={`Droit de ${share.email}`} value={share.role} disabled={busy} onChange={(event)=>changeRole(share,event.target.value)}><option value="read">Lecture</option><option value="write">Écriture</option></select> : <em>{share.role === "write" ? "Écriture" : "Lecture"}</em>}
          {canManageShares ? <button aria-label={`Retirer ${share.email}`} disabled={busy} onClick={()=>remove(share)}><Trash2 size={15}/></button> : <span aria-hidden="true"/>}
        </article>) : <p>{agency ? "Aucun invité externe : seuls les membres de l’agence y ont accès." : kind === "devis" ? "Ce DPGF n’est pas encore partagé." : "Ce CCTP n’est pas encore partagé."}</p>}
      </div>
    </section>
  </div>;
}
