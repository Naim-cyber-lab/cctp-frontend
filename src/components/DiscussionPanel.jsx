import { useEffect, useState } from "react";
import { FileText, Search } from "lucide-react";
import { MessageCircle, X } from "lucide-react";
import { TeamChat } from "./TeamChat";
import { getOrganization, listComments, listDiscussionProjects } from "../api/client";

/** « il y a 2 h » : horodatage relatif du dernier échange. */
function ago(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

/** Panneau « Discussion » : messagerie de l'agence accessible de partout (canal Général, groupes, conversations directes, appels).
 *  Il reste monté une fois ouvert : changer de page (CCTP, Estimation, Consultation) ne coupe ni la conversation ni l'appel en cours. */
export function DiscussionPanel({ open, onClose, user, realtime, projects, onImported, onOpenProject, onOpenProjectChat, intent }) {
  const [team, setTeam] = useState(null);
  const [tab, setTab] = useState("conversations");
  const [search, setSearch] = useState("");
  const [commentsOf, setCommentsOf] = useState({}); // projet → commentaires du CCTP (chargés à l'ouverture)
  const toggleComments = async (id) => {
    if (commentsOf[id]) { setCommentsOf(({ [id]: _closed, ...rest }) => rest); return; }
    setCommentsOf((current) => ({ ...current, [id]: { loading: true, rows: [] } }));
    try { const data = await listComments(id); const rows = (data.comments || data || []).filter((row) => !row.parentId).sort((a, b) => Number(a.resolved) - Number(b.resolved) || String(b.createdAt).localeCompare(String(a.createdAt))); setCommentsOf((current) => ({ ...current, [id]: { loading: false, rows } })); }
    catch { setCommentsOf((current) => ({ ...current, [id]: { loading: false, rows: [], failed: true } })); }
  };
  const [discussions, setDiscussions] = useState([]); // projets AYANT des échanges (réponse du serveur : un projet silencieux n'apparaît jamais)
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  useEffect(() => {
    if (!open || tab !== "projects") return undefined;
    let alive = true;
    const timer = setTimeout(() => { listDiscussionProjects(search.trim()).then((data) => { if (alive) { setDiscussions(data.projects || []); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); }); }, search.trim() ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, tab, search]);
  useEffect(() => { if (intent) setMounted(true); }, [intent]);
  useEffect(() => {
    if (!mounted) return undefined;
    let alive = true;
    const load = () => getOrganization().then((data) => { if (alive) setTeam(data); }).catch(() => {});
    load();
    const unsubscribe = realtime?.subscribe?.((event) => { if (event?.type === "team_changed") load(); });
    return () => { alive = false; unsubscribe?.(); };
  }, [mounted, realtime?.subscribe]);
  if (!mounted) return null;
  return <aside className="side-panel side-panel-rail" data-discussion-panel hidden={!open} role="dialog" aria-label="Discussion">
    <header><h2><MessageCircle size={15} style={{ verticalAlign: "-2px" }} /> Discussions</h2><button type="button" onClick={onClose} aria-label="Fermer" data-panel-close><X size={18} /></button></header>
    <nav className="tasks-page-tabs" style={{ margin: "10px 18px 0" }} aria-label="Discussions">
      <button type="button" className={tab === "conversations" ? "active" : ""} data-discussion-tab="conversations" onClick={() => setTab("conversations")}>Conversations</button>
      <button type="button" className={tab === "projects" ? "active" : ""} data-discussion-tab="projects" onClick={() => setTab("projects")}>Projets</button>
    </nav>
    {tab === "projects" && <div className="side-panel-body" data-discussion-projects>
      <label className="library-search" style={{ marginBottom: 10 }}><Search size={15} /><input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un projet…" aria-label="Rechercher un projet" /></label>
      {loaded && !discussions.length && <p className="panel-empty" data-discussion-projects-empty><b>{search.trim() ? "Aucun projet ne correspond" : "Aucune discussion de projet pour le moment"}</b><br />{search.trim() ? "Essayez un autre nom, un auteur ou un mot des échanges." : "Les commentaires et échanges liés à vos projets apparaîtront ici."}</p>}
      {discussions.map((item) => <article key={item.project_id} className="panel-task" role="button" tabIndex={0} data-project-discussion={item.project_id} data-unread={item.unread_count || undefined} onClick={() => onOpenProjectChat?.(item.project_id)} onKeyDown={(event) => { if (event.key === "Enter") onOpenProjectChat?.(item.project_id); }}>
        <b><FileText size={13} style={{ verticalAlign: "-2px" }} /> {item.project_name}{item.unread_count > 0 && <em className="tab-badge" data-discussion-unread style={{ marginLeft: 8 }}>{item.unread_count} nouveau{item.unread_count > 1 ? "x" : ""} message{item.unread_count > 1 ? "s" : ""}</em>}</b>
        <small data-discussion-meta>{item.discussion_count} échange{item.discussion_count > 1 ? "s" : ""}{item.last_activity_at ? ` · dernier message ${ago(item.last_activity_at)}` : ""}</small>
        {item.last_message_preview && <small data-discussion-preview>{item.last_author ? `${item.last_author} : ` : ""}« {item.last_message_preview} »</small>}
        {item.comment_count > 0 && <button type="button" className="secondary project-comments-toggle" data-project-comments-toggle={item.project_id} onClick={(event) => { event.stopPropagation(); toggleComments(item.project_id); }}>{commentsOf[item.project_id] ? "Masquer les commentaires" : "Commentaires du CCTP"}</button>}
        {commentsOf[item.project_id] && <ul className="project-comments" data-project-comments={item.project_id} onClick={(event) => event.stopPropagation()}>{commentsOf[item.project_id].loading ? <li className="panel-empty">Chargement…</li> : commentsOf[item.project_id].failed ? <li className="panel-empty">Commentaires indisponibles.</li> : commentsOf[item.project_id].rows.length === 0 ? <li className="panel-empty">Aucun commentaire sur ce CCTP.</li> : commentsOf[item.project_id].rows.map((row) => <li key={row.id} data-project-comment={row.id} role="button" tabIndex={0} onClick={() => onOpenProject?.(item.project_id)}><b>{String(row.email || "").split("@")[0]}{row.resolved ? " · résolu" : ""}</b>{row.quote && <em>« {row.quote.slice(0, 90)} »</em>}<span>{row.body}</span></li>)}</ul>}
      </article>)}
    </div>}
    <div className="side-panel-body" hidden={tab !== "conversations"}>
      {team && !team.organization
        ? <p className="panel-empty" data-discussion-empty>La discussion est réservée aux agences : créez ou rejoignez une agence depuis Paramètres › Espace agence.</p>
        : team ? <TeamChat rail visible={open} user={user} team={team} realtime={realtime} projects={projects} onImported={onImported} onOpenProject={(id) => { onClose(); onOpenProject?.(id); }} intent={intent} /> : <p className="panel-empty">Chargement…</p>}
    </div>
  </aside>;
}
