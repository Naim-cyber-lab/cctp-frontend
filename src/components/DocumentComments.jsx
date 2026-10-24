import { Check, MessageCircle, MessageSquarePlus, MessageSquareText, RotateCcw, Send, Trash2, X } from "lucide-react";
import { barPosition } from "../utils/selectionBar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createComment, deleteComment, getCctpPeople, listComments, updateComment } from "../api/client";
import { colorFor } from "../hooks/useLiveDocumentCollaboration";
import "../document-comments.css";

const HIGHLIGHT = "doc-comments";
const ACTIVE = "doc-comment-active";
const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
const initials = (email = "") => email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
const relative = (value) => {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "à l’instant";
  if (Math.abs(seconds) < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
};

const blockOf = (root, key) => root?.querySelector(`[data-collab-key="${CSS.escape(key || "")}"]`);
const textNodes = (block) => {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  return nodes;
};
/** Position (décalage dans le texte du bloc) d'un point du DOM. */
const offsetOf = (block, container, offset) => {
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(container, offset);
  return range.toString().length;
};
const rangeFor = (block, start, end) => {
  const nodes = textNodes(block);
  const point = (target) => {
    let left = target;
    for (const node of nodes) {
      if (left <= node.data.length) return [node, left];
      left -= node.data.length;
    }
    const last = nodes[nodes.length - 1];
    return last ? [last, last.data.length] : null;
  };
  const from = point(start), to = point(end);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(...from);
  range.setEnd(...to);
  return range;
};
/** Retrouve le passage commenté même si le texte a bougé depuis : position d'origine si elle est toujours valable, sinon la citation la plus proche. */
export const locate = (text, comment) => {
  if (text.slice(comment.start, comment.end) === comment.quote) return [comment.start, comment.end];
  const positions = [];
  for (let index = text.indexOf(comment.quote); index !== -1 && comment.quote; index = text.indexOf(comment.quote, index + 1)) positions.push(index);
  if (!positions.length) return null;
  const best = positions.reduce((a, b) => (Math.abs(b - comment.start) < Math.abs(a - comment.start) ? b : a));
  return [best, best + comment.quote.length];
};


const handleOf = (email = "") => email.split("@")[0];
/** Personnes citées dans un texte : « @prenom.nom » reconnu parmi les membres du CCTP. */
export const mentionedEmails = (text, members) => members.filter((member) => new RegExp(`(^|[^\\w.-])@${handleOf(member.email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`, "i").test(text)).map((member) => member.email);
/** Texte d'un commentaire avec les @mentions mises en évidence. */
export function MentionedText({ text, members }) {
  const handles = new Set(members.map((member) => handleOf(member.email).toLowerCase()));
  return text.split(/(@[\w.-]+)/g).map((part, index) => (part.startsWith("@") && handles.has(part.slice(1).toLowerCase()) ? <span key={index} className="mention-user" data-mention>{part}</span> : part));
}
/** Zone de saisie avec saisie semi-automatique des @mentions (membres du CCTP). */
export function MentionField({ value, onChange, members, multiline = false, onKeyDown, onEnter, placement = "down", ...props }) {
  const [menu, setMenu] = useState(null); // { options, index }
  const ref = useRef(null);
  const update = (text, caret) => {
    const match = /(^|\s)@([\w.-]*)$/.exec(text.slice(0, caret));
    if (!match) { setMenu(null); return; }
    const query = match[2].toLowerCase();
    const options = members.filter((member) => handleOf(member.email).toLowerCase().includes(query) || member.email.toLowerCase().includes(query)).slice(0, 6);
    setMenu(options.length ? { options, index: 0, query: match[2] } : null);
  };
  const choose = (member) => {
    const field = ref.current, caret = field.selectionStart;
    const before = value.slice(0, caret).replace(/@[\w.-]*$/, `@${handleOf(member.email)} `);
    const next = before + value.slice(caret);
    onChange(next); setMenu(null);
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(before.length, before.length); });
  };
  const Tag = multiline ? "textarea" : "input";
  return <span className="mention-field" style={{ position: "relative", display: "block" }}>
    <Tag ref={ref} {...props} value={value}
      onChange={(event) => { onChange(event.target.value); update(event.target.value, event.target.selectionStart); }}
      onKeyDown={(event) => {
        if (menu) {
          if (event.key === "ArrowDown") { event.preventDefault(); setMenu({ ...menu, index: (menu.index + 1) % menu.options.length }); return; }
          if (event.key === "ArrowUp") { event.preventDefault(); setMenu({ ...menu, index: (menu.index - 1 + menu.options.length) % menu.options.length }); return; }
          if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); choose(menu.options[menu.index]); return; }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMenu(null); return; }
        }
        onKeyDown?.(event);
      }} />
    {menu && <div className="mention-menu" role="listbox" data-mention-menu style={placement === "up" ? { left: 0, bottom: "100%", top: "auto" } : { left: 0, top: "100%" }}>
      {menu.options.map((member, index) => <button type="button" key={member.email} role="option" aria-selected={index === menu.index} className={index === menu.index ? "on" : ""} data-mention-option={member.email}
        onMouseDown={(event) => { event.preventDefault(); choose(member); }}>@{handleOf(member.email)}<small>{member.email}</small></button>)}
    </div>}
  </span>;
}

function Avatar({ email }) {
  return <span className="comment-avatar" style={{ "--collab-color": colorFor(email) }} title={email}>{initials(email)}</span>;
}

/** Commentaires sur le texte, comme Google Docs : on sélectionne un passage, « Commenter », la discussion s'affiche à droite,
 *  le passage reste surligné (sans rien écrire dans le document), on peut répondre, résoudre, supprimer ; tout est en direct. */
export function DocumentComments({ project, rootRef, readOnly, event, currentEmail, focusCommentId = null }) {
  const [comments, setComments] = useState([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // { blockKey, quote, start, end }
  const [text, setText] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [button, setButton] = useState(null); // position du bouton « Commenter »
  const [error, setError] = useState("");
  const [host, setHost] = useState(null);
  const [members, setMembers] = useState([]); // personnes que l'on peut citer avec « @ »
  const selectionRef = useRef(null);
  const isOwner = project.accessRole === "owner";

  useEffect(() => { setHost(document.querySelector(".editor-actions")); }, []);
  const load = useCallback(async () => {
    try { setComments(await listComments(project.id)); } catch (reason) { setError(reason.message); }
  }, [project.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getCctpPeople(project.id).then((people) => setMembers(people.filter((member) => member && member.email && member.email !== currentEmail))).catch(() => {});
  }, [project.id, currentEmail]);
  // lien reçu par notification / e-mail : on ouvre la discussion concernée
  const focusId = String(focusCommentId || "").split(":")[0];
  useEffect(() => {
    if (!focusId || !comments.length) return;
    const thread = comments.find((item) => item.id === focusId && !item.parentId) || comments.find((item) => item.id === focusId);
    const target = thread?.parentId ? comments.find((item) => item.id === thread.parentId) : thread;
    if (!target) return;
    setOpen(true); setActiveId(target.id); setShowResolved(true);
    setTimeout(() => blockOf(rootRef.current, target.blockKey)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  }, [focusCommentId, comments.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // modifications des autres en direct
  useEffect(() => {
    if (!event?.comment) return;
    const { action, comment } = event;
    setComments((items) => {
      if (action === "deleted") return items.filter((item) => item.id !== comment.id && item.parentId !== comment.id);
      return items.some((item) => item.id === comment.id) ? items.map((item) => (item.id === comment.id ? comment : item)) : [...items, comment];
    });
  }, [event]);

  const threads = useMemo(() => comments.filter((item) => !item.parentId).map((item) => ({ ...item, replies: comments.filter((reply) => reply.parentId === item.id) })), [comments]);
  const visible = threads.filter((thread) => showResolved || !thread.resolved);
  const [stale, setStale] = useState(() => new Set()); // commentaires dont le passage cité n'existe plus tel quel dans le document

  // surlignage des passages commentés (le HTML du document reste intact)
  const paint = useCallback(() => {
    const root = rootRef.current;
    const normal = [], active = [], lost = new Set();
    for (const thread of threads) {
      if (thread.resolved) continue;
      const block = blockOf(root, thread.blockKey);
      // le texte a changé depuis le commentaire : la citation d'origine (instantané) reste affichée, avec un avertissement
      if (!block) { if (root?.textContent) lost.add(thread.id); continue; }
      const found = locate(block.textContent, thread);
      if (!found) lost.add(thread.id);
      const range = found && rangeFor(block, found[0], found[1]);
      if (range) (thread.id === activeId ? active : normal).push(range);
    }
    setStale((current) => (current.size === lost.size && [...lost].every((id) => current.has(id)) ? current : lost));
    if (!supported()) return;
    normal.length ? CSS.highlights.set(HIGHLIGHT, new Highlight(...normal)) : CSS.highlights.delete(HIGHLIGHT);
    active.length ? CSS.highlights.set(ACTIVE, new Highlight(...active)) : CSS.highlights.delete(ACTIVE);
  }, [threads, activeId, rootRef]);
  useEffect(() => {
    paint();
    const root = rootRef.current;
    let timer;
    const later = () => { clearTimeout(timer); timer = setTimeout(paint, 150); };
    root?.addEventListener("input", later);
    root?.addEventListener("collab:remote-edit", later);
    return () => { clearTimeout(timer); root?.removeEventListener("input", later); root?.removeEventListener("collab:remote-edit", later); };
  }, [paint, rootRef]);
  useEffect(() => () => { if (supported()) { CSS.highlights.delete(HIGHLIGHT); CSS.highlights.delete(ACTIVE); } }, []);

  const startDraft = useCallback(() => {
    const info = selectionRef.current;
    if (!info) return;
    setDraft(info); setText(""); setOpen(true); setError(""); setButton(null);
  }, []);

  // sélection de texte -> bouton « Commenter » ; clic dans un passage commenté -> discussion
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const inspect = () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !root.contains(selection.anchorNode)) { selectionRef.current = null; setButton(null); return; }
      const range = selection.getRangeAt(0);
      const block = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest("[data-collab-key]");
      const endBlock = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement)?.closest("[data-collab-key]");
      const quote = selection.toString().replace(/\s+/g, " ").trim();
      if (selection.isCollapsed || !block || block !== endBlock || !quote) {
        selectionRef.current = null; setButton(null);
        if (selection.isCollapsed && block) {
          const caret = offsetOf(block, range.startContainer, range.startOffset);
          const hit = threads.find((thread) => thread.blockKey === block.dataset.collabKey && !thread.resolved && (() => { const found = locate(block.textContent, thread); return found && caret >= found[0] && caret <= found[1]; })());
          if (hit) { setActiveId(hit.id); setOpen(true); }
        }
        return;
      }
      const start = offsetOf(block, range.startContainer, range.startOffset);
      const end = offsetOf(block, range.endContainer, range.endOffset);
      selectionRef.current = { blockKey: block.dataset.collabKey, quote: block.textContent.slice(start, end), start, end };
      if (readOnly) return;
      const rect = range.getBoundingClientRect();
      setButton(barPosition(rect, 1));
    };
    const onKey = (event) => {
      if (event.key === "Escape" && selectionRef.current) { selectionRef.current = null; setButton(null); return; }
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "m") { event.preventDefault(); inspect(); startDraft(); }
    };
    document.addEventListener("selectionchange", inspect);
    root.addEventListener("click", inspect);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("selectionchange", inspect); root.removeEventListener("click", inspect); document.removeEventListener("keydown", onKey); };
  }, [rootRef, threads, readOnly, startDraft]);

  const submit = async () => {
    if (!text.trim() || !draft) return;
    try {
      const created = await createComment(project.id, { ...draft, body: text, mentions: mentionedEmails(text, members) });
      setComments((items) => (items.some((item) => item.id === created.id) ? items : [...items, created]));
      setActiveId(created.id); setDraft(null); setText(""); setError("");
    } catch (reason) { setError(reason.message); }
  };
  const reply = async (thread, body) => {
    try {
      const created = await createComment(project.id, { parentId: thread.id, body, mentions: mentionedEmails(body, members) });
      setComments((items) => (items.some((item) => item.id === created.id) ? items : [...items, created]));
    } catch (reason) { setError(reason.message); }
  };
  const change = async (thread, changes) => {
    try { const updated = await updateComment(project.id, thread.id, changes); setComments((items) => items.map((item) => (item.id === updated.id ? updated : item))); }
    catch (reason) { setError(reason.message); }
  };
  const remove = async (item) => {
    try { await deleteComment(project.id, item.id); setComments((items) => items.filter((entry) => entry.id !== item.id && entry.parentId !== item.id)); }
    catch (reason) { setError(reason.message); }
  };
  const goTo = (thread) => {
    setActiveId(thread.id);
    const block = blockOf(rootRef.current, thread.blockKey);
    block?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const openCount = threads.filter((thread) => !thread.resolved).length;
  const toggle = <button type="button" className={`secondary comments-toggle ${open ? "active" : ""}`} data-comments-toggle onClick={() => setOpen((value) => !value)} title="Commentaires (Ctrl+Alt+M pour commenter la sélection)">
    <MessageSquareText size={16} /> Commentaires{openCount > 0 && <b data-comments-count>{openCount}</b>}
  </button>;

  return <>
    {host && createPortal(toggle, host)}
    {button && !readOnly && <button type="button" className="comment-float sel-bar-btn" data-comment-add title="Ajouter une remarque liée à ce passage." aria-label="Commenter : ajouter une remarque liée à ce passage" style={{ top: button.top, left: button.left }} onMouseDown={(event) => { event.preventDefault(); startDraft(); }}><MessageSquarePlus size={15} /> Commenter</button>}
    {open && <aside className="comments-panel" data-comments-panel role="complementary" aria-label="Commentaires">
      <header><b>Commentaires</b><button type="button" aria-label="Fermer" onClick={() => setOpen(false)}><X size={16} /></button></header>
      {error && <div className="share-error" role="alert">{error}</div>}
      {draft && <section className="comment-card draft" data-comment-draft>
        <blockquote>{draft.quote.length > 140 ? `${draft.quote.slice(0, 140)}…` : draft.quote}</blockquote>
        <MentionField multiline autoFocus value={text} members={members} placeholder="Ajouter un commentaire — @ pour citer quelqu’un" aria-label="Nouveau commentaire" onChange={setText} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); } if (event.key === "Escape") setDraft(null); }} />
        <div className="comment-actions"><button type="button" onClick={() => setDraft(null)}>Annuler</button><button type="button" className="primary" data-comment-submit disabled={!text.trim()} onClick={submit}><Send size={13} /> Commenter</button></div>
      </section>}
      {!visible.length && !draft && <p className="comments-empty">{readOnly ? "Aucun commentaire." : "Sélectionnez un passage du texte puis « Commenter » pour lancer une discussion."}</p>}
      {visible.map((thread) => <ThreadCard key={thread.id} projectId={project.id} stale={stale.has(thread.id)} thread={thread} members={members} active={thread.id === activeId} readOnly={readOnly} currentEmail={currentEmail} isOwner={isOwner}
        onOpen={() => goTo(thread)} onReply={(body) => reply(thread, body)} onResolve={() => change(thread, { resolved: !thread.resolved })} onRemove={remove} />)}
      {threads.some((thread) => thread.resolved) && <button type="button" className="comments-resolved-toggle" data-comments-resolved onClick={() => setShowResolved((value) => !value)}>{showResolved ? "Masquer les discussions résolues" : `Afficher les discussions résolues (${threads.filter((thread) => thread.resolved).length})`}</button>}
    </aside>}
  </>;
}

function ThreadCard({ projectId, stale = false, thread, members, active, readOnly, currentEmail, isOwner, onOpen, onReply, onResolve, onRemove }) {
  const [reply, setReply] = useState("");
  const mine = (item) => item.email === currentEmail || isOwner;
  return <section className={`comment-card ${active ? "active" : ""} ${thread.resolved ? "resolved" : ""}`} data-comment-thread={thread.id} onClick={onOpen}>
    <blockquote>{thread.quote.length > 140 ? `${thread.quote.slice(0, 140)}…` : thread.quote}</blockquote>
    {stale && !thread.resolved && <small className="comment-stale" data-comment-stale title="Le texte cité n’apparaît plus tel quel : voici le passage tel qu’il était au moment du commentaire.">Passage modifié depuis ce commentaire</small>}
    {[thread, ...thread.replies].map((item) => <article key={item.id} data-comment-item={item.id}>
      <header><Avatar email={item.email} /><div><b>{item.email.split("@")[0]}</b><small>{relative(item.createdAt)}</small></div>
        {item === thread && !readOnly && <button type="button" className="icon" data-comment-resolve title={thread.resolved ? "Rouvrir la discussion" : "Résoudre la discussion"} aria-label={thread.resolved ? "Rouvrir la discussion" : "Résoudre la discussion"} onClick={(event) => { event.stopPropagation(); onResolve(); }}>{thread.resolved ? <RotateCcw size={14} /> : <Check size={14} />}</button>}
        {mine(item) && <button type="button" className="icon" data-comment-delete title="Supprimer" aria-label="Supprimer ce commentaire" onClick={(event) => { event.stopPropagation(); onRemove(item); }}><Trash2 size={13} /></button>}
      </header>
      <p><MentionedText text={item.body} members={members} /></p>
    </article>)}
    <button type="button" className="comment-to-discussion" data-comment-discuss title="Continuer cet échange avec l’équipe dans la discussion du CCTP (le commentaire reste attaché au document)."
      onClick={(event) => { event.stopPropagation(); window.dispatchEvent(new CustomEvent("cctp:discuss-comment", { detail: { projectId, blockKey: thread.blockKey, quote: thread.quote, author: thread.email.split("@")[0], body: thread.body } })); }}><MessageCircle size={13} /> Ouvrir dans Discussion</button>
    {!readOnly && !thread.resolved && <form onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (reply.trim()) { onReply(reply.trim()); setReply(""); } }}>
      <MentionField value={reply} members={members} placeholder="Répondre… (@ pour citer)" aria-label="Répondre au commentaire" data-comment-reply onChange={setReply} />
      {reply.trim() && <button type="submit" className="icon" data-comment-reply-send aria-label="Envoyer la réponse"><Send size={14} /></button>}
    </form>}
  </section>;
}
