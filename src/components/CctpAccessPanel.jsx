import { Building2, Clock3, Crown, Eye, History, Pencil, RotateCcw, Share2, Trash2, Users, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getCctpAccess, getCctpPeople, listLiveHistory, removeCctpShare, restoreLiveVersion, updateCctpShare } from "../api/client";
import { colorFor } from "../hooks/useLiveDocumentCollaboration";
import { ShareCctpModal } from "./ShareCctpModal";
import { VersionHistory } from "./VersionHistory";

const ROLE_LABEL = { read: "Lecture seule", write: "Écriture" };
const initials = (email = "") => email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
const relative = (value) => {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "à l’instant";
  if (Math.abs(seconds) < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
};
const blockLabel = (key = "") => {
  if (key.startsWith("body-")) return `Lot ${key.slice(5)}`;
  if (key.startsWith("title-")) return `Titre du lot ${key.slice(6)}`;
  if (key.startsWith("code-") || key.startsWith("number-")) return `Numérotation du lot ${key.split("-")[1]}`;
  return { coverTitle: "Page de garde", coverLabel: "Page de garde", subtitle: "Page de garde", coverContacts: "Page de garde", introTitle: "Introduction", introText: "Introduction", footer: "Pied de page" }[key] || key;
};
const plain = (html = "") => new DOMParser().parseFromString(html, "text/html").body.textContent.replace(/\s+/g, " ").trim();

function Avatar({ email, editing, self = false, title, followed = false }) {
  const className = `collab-avatar ${editing ? "is-editing" : ""} ${self ? "is-self" : ""} ${followed ? "is-followed" : ""}`;
  const style = { "--collab-color": colorFor(email) };
  // Un clic sur l'avatar d'un collègue amène à l'endroit où il travaille ; un second clic le suit en continu (comme « suivre » de Google Slides)
  if (self) return <span className={className} data-collab-self style={style} title={title || email}>{initials(email)}</span>;
  return <button type="button" className={className} data-collab-peer={email} data-collab-followed={followed || undefined} style={style} title={`${title || email} — cliquer pour aller là où cette personne travaille`}
    onClick={() => window.dispatchEvent(new CustomEvent("collab:follow", { detail: { email, mode: followed ? "stop" : "toggle" } }))}>{initials(email)}</button>;
}

/** Qui a accès au CCTP ouvert (droits), qui est présent en ce moment, et l'historique des modifications — comme le bandeau de Google Docs.
 *  Tout le monde voit la liste ; seul le créateur peut modifier ou retirer un droit ; l'historique se restaure en écriture. */
// Pas de rechargement de la liste des CCTP ici : il remplacerait le CCTP ouvert par son résumé et fermerait l'éditeur.
export function CctpAccessPanel({ project, presence = [], currentEmail = "", currentLocation = "CCTP", editingNow = false }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("people");
  const [access, setAccess] = useState(null);
  const [people, setPeople] = useState([]);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [followed, setFollowed] = useState(null);
  const [typingEmails, setTypingEmails] = useState([]);
  useEffect(() => {
    const onFollowing = (event) => setFollowed(event.detail?.email || null);
    const onTyping = (event) => setTypingEmails(event.detail?.emails || []);
    window.addEventListener("collab:following", onFollowing); window.addEventListener("collab:typing", onTyping);
    return () => { window.removeEventListener("collab:following", onFollowing); window.removeEventListener("collab:typing", onTyping); };
  }, []);
  const isOwner = project.accessRole === "owner";
  const canRestore = project.accessRole !== "read";

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const load = useCallback(async () => {
    try { setAccess(await getCctpAccess(project.id)); setPeople(await getCctpPeople(project.id).catch(() => [])); setError(""); }
    catch (reason) { setError(reason.message); }
  }, [project.id]);
  useEffect(() => { load(); }, [load, project.shared]);
  const loadHistory = useCallback(async () => {
    try { setHistory(await listLiveHistory(project.id)); setError(""); }
    catch (reason) { setError(reason.message); }
  }, [project.id]);
  useEffect(() => { if (open && tab === "history") loadHistory(); }, [open, tab, loadHistory]);

  const act = async (work, after = load) => {
    setBusy(true); setError("");
    try { await work(); await after(); }
    catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };

  const members = access?.members || [];
  if (!project.shared && !isOwner && !project.agency) return null;
  const others = presence.filter((member) => member.email !== currentEmail);
  const heartbeatMe = presence.find((member) => member.email === currentEmail);
  const me = { ...(heartbeatMe || {}), email: currentEmail, editing: project.accessRole !== "read" && editingNow, location: currentLocation };
  const presentBy = new Map(presence.map((member) => [member.email, member]));
  const count = Math.max(people.length, members.length + (access?.owner ? 1 : 0));
  const myLabel = project.accessRole === "read" ? "Lecture seule" : project.accessRole === "write" ? "Écriture" : "Créateur";

  return <>
    <div className="cctp-access-bar" data-collab-bar>
      <div className="collab-avatars" data-collab-avatars aria-label="Personnes présentes dans ce CCTP">
        <Avatar email={me.email} editing={me.editing} self title={`Vous · ${me.editing ? "modifiez" : "consultez"} · ${me.location}`}/>
        {others.slice(0, 4).map((member) => <Avatar key={member.userId} email={member.email} editing={member.editing} followed={followed === member.email} title={`${member.email} · ${member.editing ? "modifie" : "consulte"} · ${member.location}`}/>)}
        {others.length > 4 && <span className="collab-avatar more">+{others.length - 4}</span>}
      </div>
      <span className={`collab-live-copy ${me.editing ? "is-editing" : ""}`} data-collab-self-status><i/>{me.editing ? "Vous modifiez" : "Vous consultez"}</span>
      {followed && <span className="collab-follow-note" data-collab-following>Vous suivez {followed.split("@")[0]} · <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("collab:follow", { detail: { email: followed, mode: "stop" } }))}>arrêter</button></span>}
      {typingEmails.length > 0 && <span className="collab-typing-note" data-collab-typing>✎ {typingEmails.slice(0, 2).map((email) => email.split("@")[0]).join(", ")}{typingEmails.length > 2 ? ` +${typingEmails.length - 2}` : ""} écrit…</span>}
      <button type="button" className="cctp-access-pill" data-access-toggle onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Users size={15}/> {myLabel} · {count || 1} personne{count > 1 ? "s" : ""}
      </button>
      {/* « Enregistré » n'apportait rien : l'enregistrement est automatique ; on ne signale que la perte de connexion */}
      {!online && <span className="collab-status off" data-collab-status><WifiOff size={12}/> Hors connexion</span>}
    </div>
    {open && <aside className="cctp-access-panel" data-access-panel role="dialog" aria-label="Accès à ce CCTP">
      <header><b>{tab === "people" ? "Accès à ce CCTP" : "Historique des modifications"}</b><button type="button" aria-label="Fermer" onClick={() => setOpen(false)}><X size={16}/></button></header>
      <nav className="cctp-access-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "people"} data-tab="people" className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}><Users size={13}/> Personnes</button>
        <button type="button" role="tab" aria-selected={tab === "history"} data-tab="history" className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}><History size={13}/> Historique</button>
      </nav>
      {error && <div className="share-error" role="alert">{error}</div>}
      {tab === "people" ? <>
        <p className="cctp-access-me">Votre droit : <em data-my-role={project.accessRole}>{project.accessRole === "owner" ? "Créateur (tous les droits)" : ROLE_LABEL[project.accessRole] || "Lecture seule"}</em></p>
        <ul>
          {access?.workspace?.type === "ORGANIZATION" && <li data-agency-row><span><Building2 size={14}/><b>Tous les membres de {access.workspace.name}</b></span><em>{access.editRights?.mode === "RESTRICT_EDITORS" ? `Modification restreinte : ${access.editRights.editors.map((editor) => editor.email.split("@")[0]).join(", ")}` : "Modification selon les droits de l’agence"}</em></li>}
          {access?.owner && <li data-member-role="owner" data-member-email={access.owner.email}><span><Avatar email={access.owner.email} editing={presentBy.get(access.owner.email)?.editing}/><b>{access.owner.email}</b>{presentBy.has(access.owner.email) && <small className="collab-here">● en ligne</small>}</span><em className="role-owner"><Crown size={10}/> Créateur</em></li>}
          {members.map((member) => <li key={member.id} data-member-role={member.role} data-member-email={member.email}>
            <span><Avatar email={member.email} editing={presentBy.get(member.email)?.editing}/><b>{member.email}</b>{presentBy.has(member.email) && <small className="collab-here">● {presentBy.get(member.email).editing ? "modifie" : "consulte"} · {presentBy.get(member.email).location}</small>}</span>
            {isOwner ? <>
              <select aria-label={`Droit de ${member.email}`} value={member.role} disabled={busy} onChange={(event) => act(() => updateCctpShare(project.id, member.id, event.target.value))}>
                <option value="read">Lecture seule</option><option value="write">Écriture</option>
              </select>
              <button type="button" aria-label={`Retirer ${member.email}`} title="Retirer l’accès" disabled={busy} onClick={() => act(() => removeCctpShare(project.id, member.id))}><Trash2 size={14}/></button>
            </> : <em className={`role-${member.role}`}>{member.role === "write" ? <Pencil size={10}/> : <Eye size={10}/>} {ROLE_LABEL[member.role]}</em>}
          </li>)}
          {access && !members.length && <li className="cctp-access-empty">{access.workspace?.type === "ORGANIZATION" ? "Aucun invité externe." : "Ce CCTP n’est partagé avec personne."}</li>}
        </ul>
        {isOwner
          ? <button type="button" className="cctp-access-invite" data-access-invite onClick={() => setInviting(true)}><Share2 size={14}/> Inviter quelqu’un</button>
          : <small className="cctp-access-note">Seuls le créateur et un administrateur modifient ou retirent les droits.</small>}
      </> : <VersionHistory project={project} canRestore={canRestore} />}
    </aside>}
    {inviting && <ShareCctpModal project={project} onClose={() => { setInviting(false); load(); }} onChanged={load}/>}
  </>;
}
