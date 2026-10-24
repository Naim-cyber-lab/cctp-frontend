import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Building2, Check, Globe2, MailPlus, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import {
  acceptWorkspaceRequest, addOrganizationMember, cancelOrganizationInvitation, createOrganization, getOrganization, getWorkspaceDomain, listWorkspaceRequests,
  myWorkspaceRequests, rejectWorkspaceRequest, removeOrganizationMember, removeWorkspaceDomain, renameOrganization, setWorkspaceDomainPolicy, updateOrganizationMember, verifyWorkspaceDomain,
} from "../api/client";
import { useWorkspaces } from "../hooks/useWorkspaces";

export const ROLE_LABEL = { admin: "Administrateur", member: "Membre", viewer: "Lecteur" };
const SECTIONS = [["info", "Informations", Building2], ["members", "Membres", Users], ["invitations", "Invitations", MailPlus], ["roles", "Rôles et permissions", BadgeCheck], ["domain", "Domaine professionnel", Globe2], ["security", "Sécurité", ShieldCheck]];
const MATRIX = [
  ["Voir les CCTP", true, true, true], ["Voir les DPGF", true, true, true], ["Modifier par défaut", true, true, false], ["Créer un document", true, true, false],
  ["Modifier la bibliothèque agence", true, "selon droit", false], ["Inviter des membres", true, false, false], ["Gérer les rôles", true, false, false], ["Paramétrer l’espace", true, false, false],
];
const cell = (value) => value === true ? <span className="yes">✓</span> : value === false ? <span className="no">—</span> : <span>{value}</span>;

/** Paramètres › Espace agence : informations, membres, invitations, rôles et permissions, domaine professionnel, sécurité.
 *  Sans agence (espace personnel) : création d'une agence et reprise des documents personnels. */
export function AgencySettings({ user }) {
  const { reload: reloadSpaces, active } = useWorkspaces();
  const [team, setTeam] = useState(null);
  const [section, setSection] = useState("info");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [info, setInfo] = useState({ name: "", address: "", logo: "" });
  const [invite, setInvite] = useState({ email: "", role: "member", library: false });
  const [domain, setDomain] = useState(null);
  const [requests, setRequests] = useState([]);
  const [mine, setMine] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await getOrganization();
      setTeam(data);
      if (data.organization) {
        setInfo({ name: data.organization.name, address: data.organization.address || "", logo: data.organization.logo || "" });
        if (data.role === "admin") {
          setDomain(await getWorkspaceDomain().catch(() => null));
          setRequests(await listWorkspaceRequests().catch(() => []));
        }
      } else setMine(await myWorkspaceRequests().catch(() => []));
    } catch (reason) { setError(reason.message); }
  }, []);
  useEffect(() => { load(); }, [load, active?.id]);
  const act = async (action, success = "") => {
    setBusy(true); setError(""); setNotice("");
    try { await action(); if (success) setNotice(success); await load(); await reloadSpaces(); } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };

  if (!team) return <section className="settings-section"><p>{error || "Chargement…"}</p></section>;

  if (!team.organization)
    return <div className="settings-stack" data-agency-solo>
      <section className="settings-section" data-team-create>
        <h2><Building2 size={19} /> Vous travaillez dans votre espace personnel</h2>
        <p>Créez l’espace de votre agence : vous en serez l’administrateur. Les CCTP, DPGF, consultations, tâches, dossiers, la bibliothèque et la discussion y sont communs à tous ses membres.{team.publicDomain ? ` Votre adresse (@${team.emailDomain}) est une adresse grand public : elle ne rejoint jamais une agence automatiquement.` : ""}</p>
        <form onSubmit={(event) => { event.preventDefault(); act(async () => { await createOrganization(name); setName(""); }); }}>
          <div className="grid-2"><label>Nom de l’agence<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Batipro Études" minLength={2} required aria-label="Nom de l’agence" /></label><label>&nbsp;<button className="primary" disabled={busy || name.trim().length < 2}>Créer mon agence</button></label></div>
        </form>
        {mine.length > 0 && <div className="settings-notice" data-my-requests>Demande en attente : {mine.map((item) => item.workspaceName).join(", ")} — un administrateur doit l’accepter.</div>}
        {error && <div className="login-error">{error}</div>}
      </section>
    </div>;

  const organization = team.organization;
  const isAdmin = team.role === "admin";
  const members = team.members || [];
  return <div className="settings-layout" data-agency-settings>
    <nav className="settings-nav" aria-label="Espace agence">
      {SECTIONS.map(([id, label, Icon]) => <button key={id} type="button" className={section === id ? "active" : ""} data-settings-section={id} onClick={() => setSection(id)}><Icon size={15} /> {label}{id === "invitations" && (team.invitations?.length + requests.length) > 0 && <em className="tab-badge">{team.invitations.length + requests.length}</em>}</button>)}
    </nav>
    <div className="settings-stack">
      {error && <div className="login-error" role="alert">{error}</div>}
      {notice && <div className="settings-notice" role="status">{notice}</div>}

      {section === "info" && <section className="settings-section" data-section="info">
        <h2>Informations de l’agence</h2>
        <form onSubmit={(event) => { event.preventDefault(); act(() => renameOrganization(info.name, { address: info.address, logo: info.logo }), "Informations enregistrées."); }}>
          <div className="grid-2">
            <label>Nom de l’agence<input value={info.name} disabled={!isAdmin} onChange={(event) => setInfo({ ...info, name: event.target.value })} minLength={2} required data-agency-name /></label>
            <label>Adresse<input value={info.address} disabled={!isAdmin} onChange={(event) => setInfo({ ...info, address: event.target.value })} placeholder="12 rue de l’Atelier, 75011 Paris" data-agency-address /></label>
            <label>Logo (image, 300 Ko max)<span style={{ display: "flex", alignItems: "center", gap: 10 }}>{info.logo ? <img src={info.logo} alt="Logo de l’agence" data-agency-logo style={{ height: 38, maxWidth: 120, objectFit: "contain", border: "1px solid #e3e9e5", borderRadius: 8, padding: 3, background: "#fff" }} /> : <small>Aucun logo</small>}
              {isAdmin && <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-agency-logo-input onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 300 * 1024) { setError("Le logo dépasse 300 Ko."); return; } const reader = new FileReader(); reader.onload = () => setInfo((current) => ({ ...current, logo: String(reader.result) })); reader.readAsDataURL(file); }} />}
              {isAdmin && info.logo && <button type="button" className="secondary" onClick={() => setInfo({ ...info, logo: "" })}>Retirer</button>}</span></label>
          </div>
          {isAdmin ? <p><button className="primary" disabled={busy}>Enregistrer</button></p> : <p className="settings-readonly">Seul un administrateur modifie ces informations.</p>}
        </form>
        <p>Votre rôle : <b>{ROLE_LABEL[team.role]}</b> · {team.seats} membre{team.seats > 1 ? "s" : ""}.</p>
      </section>}

      {section === "members" && <section className="settings-section" data-section="members" data-team-members>
        <h2>Membres</h2>
        <ul className="settings-members">
          {members.map((member) => <li key={member.userId} data-member={member.email} className={member.disabled ? "disabled" : ""}>
            <span className="who"><b>{member.email}{member.email === user?.email && " (vous)"}</b><small>{member.disabled ? "Désactivé" : ROLE_LABEL[member.role]}{member.role === "member" && member.canManageLibrary ? " · gère la bibliothèque" : ""} · {{ domain: "domaine professionnel", invite: "invité", request: "demande acceptée", created: "fondateur" }[member.joinedVia] || ""}</small></span>
            {isAdmin ? <span className="actions">
              <select value={member.role} aria-label={`Rôle de ${member.email}`} disabled={busy} onChange={(event) => act(() => updateOrganizationMember(member.userId, { role: event.target.value }))}>{Object.entries(ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              {member.role === "member" && <label className="inline-check"><input type="checkbox" checked={member.canManageLibrary} disabled={busy} onChange={(event) => act(() => updateOrganizationMember(member.userId, { canManageLibrary: event.target.checked }))} data-library-permission /> bibliothèque</label>}
              {member.email !== user?.email && <button type="button" disabled={busy} data-member-toggle onClick={() => act(() => updateOrganizationMember(member.userId, { disabled: !member.disabled }))}>{member.disabled ? "Réactiver" : "Désactiver"}</button>}
              {member.email !== user?.email && <button type="button" disabled={busy} aria-label={`Retirer ${member.email}`} onClick={() => { if (window.confirm(`Retirer ${member.email} de l’espace ? Ses documents, commentaires, historique et tâches passées sont conservés.`)) act(() => removeOrganizationMember(member.userId)); }}><Trash2 size={13} /> Retirer</button>}
            </span> : <span className="pill">{ROLE_LABEL[member.role]}</span>}
          </li>)}
        </ul>
        <p className="settings-readonly">Retirer ou désactiver un membre ne supprime jamais ses documents, ses commentaires, l’historique ni ses tâches passées : il perd seulement l’accès.</p>
      </section>}

      {section === "invitations" && <section className="settings-section" data-section="invitations">
        <h2>Invitations</h2>
        {isAdmin ? <>
          <form className="team-invite" data-team-invite onSubmit={(event) => { event.preventDefault(); act(async () => { await addOrganizationMember(invite.email, invite.role, invite.library); setInvite({ email: "", role: "member", library: false }); }, "Invitation enregistrée."); }}>
            <div className="grid-2">
              <label>Adresse e-mail<input type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="paul@agence.fr (n’importe quel domaine)" aria-label="E-mail du collaborateur" required /></label>
              <label>Rôle<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })} aria-label="Rôle">{Object.entries(ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            </div>
            <p><button className="primary" disabled={busy || !invite.email}><UserPlus size={14} /> Inviter</button> <small>Si la personne a déjà un compte elle rejoint l’espace tout de suite ; sinon elle reçoit un e-mail et l’espace s’ajoute dès que son adresse est confirmée.</small></p>
          </form>
          {team.invitations?.length > 0 && <div className="team-invitations" data-team-invitations><h3>Invitations en attente</h3><ul className="settings-members">{team.invitations.map((item) => <li key={item.id} data-invitation={item.email}><span className="who"><b>{item.email}</b><small>{ROLE_LABEL[item.role]}</small></span><button type="button" disabled={busy} aria-label={`Annuler l’invitation de ${item.email}`} onClick={() => act(() => cancelOrganizationInvitation(item.id))}><X size={13} /> Annuler</button></li>)}</ul></div>}
          {requests.length > 0 && <div data-join-requests><h3>Demandes pour rejoindre l’agence</h3><ul className="settings-members">{requests.map((item) => <li key={item.id} data-join-request={item.email}><span className="who"><b>{item.email}</b><small>adresse du domaine professionnel</small></span><span className="actions"><button type="button" disabled={busy} data-accept onClick={() => act(() => acceptWorkspaceRequest(item.id, "member"), `${item.email} a rejoint l’agence.`)}><Check size={13} /> Accepter</button><button type="button" disabled={busy} data-reject onClick={() => act(() => rejectWorkspaceRequest(item.id))}><X size={13} /> Refuser</button></span></li>)}</ul></div>}
        </> : <p className="settings-readonly">Seul un administrateur invite de nouveaux membres.</p>}
      </section>}

      {section === "roles" && <section className="settings-section" data-section="roles">
        <h2>Rôles et permissions</h2>
        <p>Trois rôles suffisent : tout le monde voit les ressources de l’agence ; les droits portent surtout sur la <b>modification</b>. Un document peut aussi restreindre sa modification à quelques éditeurs (bouton « Partager »).</p>
        <table className="roles-table" data-roles-table><thead><tr><th>Fonction</th><th>Admin</th><th>Membre</th><th>Lecteur</th></tr></thead><tbody>{MATRIX.map(([label, a, m, v]) => <tr key={label}><td>{label}</td><td>{cell(a)}</td><td>{cell(m)}</td><td>{cell(v)}</td></tr>)}</tbody></table>
        <p className="settings-readonly">« Lecture seule » d’un CCTP n’est pas « lecture seule » dans la discussion : un lecteur participe aux conversations.</p>
      </section>}

      {section === "domain" && <section className="settings-section" data-section="domain">
        <h2>Domaine professionnel</h2>
        <p>Pour que vos collègues rejoignent l’agence avec leur adresse professionnelle, vérifiez votre domaine puis choisissez le comportement des nouveaux comptes. Les adresses grand public (gmail, outlook, hotmail, yahoo…) ne sont jamais un domaine d’entreprise.</p>
        {isAdmin && domain ? <>
          <p data-domain-state>{domain.verified ? <><BadgeCheck size={15} style={{ verticalAlign: "-3px" }} /> Domaine vérifié : <b>{domain.domain}</b></> : <>Domaine non vérifié{domain.myDomain ? <> — votre adresse est en <b>@{domain.myDomain}</b></> : null}.</>}</p>
          {(!domain.verified || domain.myDomain !== domain.domain) && domain.canVerify && <p><button type="button" className="secondary" disabled={busy} data-domain-verify onClick={() => act(() => verifyWorkspaceDomain(), "Domaine vérifié.")}>Vérifier @{domain.myDomain} avec mon adresse</button> <small>Votre adresse, déjà confirmée par code, prouve que vous possédez une boîte de ce domaine.</small></p>}
          {!domain.canVerify && !domain.verified && <p className="settings-readonly">Votre adresse est une adresse grand public : elle ne peut pas servir à vérifier un domaine d’entreprise.</p>}
          <div className="policy-options" data-domain-policy>
            {[["INVITE_ONLY", "Invitation uniquement", "Personne n’entre sans invitation d’un administrateur."], ["REQUEST", "Demander à rejoindre", "Les nouveaux comptes du domaine envoient une demande ; un administrateur l’accepte."], ["AUTO", "Rejoindre automatiquement", "Les nouveaux comptes du domaine entrent dans l’agence avec le rôle Membre."]].map(([id, label, hint]) =>
              <label key={id} className={domain.policy === id ? "selected" : ""}><input type="radio" name="policy" checked={domain.policy === id} disabled={busy || (id !== "INVITE_ONLY" && !domain.verified)} onChange={() => act(() => setWorkspaceDomainPolicy(id), "Comportement enregistré.")} data-policy={id} /><span>{label}<small>{hint}{id !== "INVITE_ONLY" && !domain.verified ? " (domaine à vérifier d’abord)" : ""}</small></span></label>)}
          </div>
          {domain.domain && <p><button type="button" className="secondary" disabled={busy} onClick={() => act(() => removeWorkspaceDomain(), "Domaine retiré.")}>Retirer le domaine</button></p>}
        </> : <p className="settings-readonly">Seul un administrateur gère le domaine professionnel. {organization.emailDomain ? `Domaine : ${organization.emailDomain}${organization.domainVerified ? " (vérifié)" : ""}.` : ""}</p>}
      </section>}

      {section === "security" && <section className="settings-section" data-section="security">
        <h2>Sécurité</h2>
        <ul className="settings-members">
          <li><span className="who"><b>Accès cloisonné par espace</b><small>Un document d’une autre agence est introuvable, même avec son identifiant ; un invité externe ne voit que ce qui lui est partagé.</small></span></li>
          <li><span className="who"><b>Adresse e-mail confirmée obligatoire</b><small>Aucun compte n’accède à l’application tant que son adresse n’est pas confirmée par code.</small></span></li>
          <li><span className="who"><b>Départ d’un collaborateur</b><small>Il perd immédiatement l’accès ; ses CCTP, commentaires, historique et tâches restent dans l’agence.</small></span></li>
          <li><span className="who"><b>Administrateurs</b><small>{members.filter((member) => member.role === "admin").map((member) => member.email).join(", ")} — l’agence garde toujours au moins un administrateur.</small></span></li>
        </ul>
        <p className="settings-readonly">Connexion unique (SSO), hébergement dédié et journal d’audit complet ne sont pas encore disponibles.</p>
      </section>}
    </div>
  </div>;
}
