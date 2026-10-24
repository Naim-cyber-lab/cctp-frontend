import { ChevronDown, Copy, CornerUpLeft, FileText, ImagePlus, MessageCircle, MoreHorizontal, Pencil, Pin, PinOff, Quote, Send, SmilePlus, Trash2, X } from "lucide-react";
import { barPosition } from "../utils/selectionBar";
import { useCallback, useEffect, useRef, useState } from "react";
import { MentionField, MentionedText } from "./DocumentComments";
import { cctpChatImageUrl, getCctpPeople, deleteCctpChat, editCctpChat, getCctpChatRead, listCctpChat, markCctpChatRead, pinCctpChat, reactCctpChat, sendCctpChat, sendCctpChatImages } from "../api/client";
import { selectionQuote, showQuote } from "../utils/chatQuote";
import { VoiceBar } from "./VoiceBar";
import { useVoice } from "../hooks/VoiceContext";
import { colorFor } from "../hooks/useLiveDocumentCollaboration";
import "../cctp-chat.css";

const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "👀", "✅", "❌"]; // même palette que la messagerie d'équipe
const initials = (email = "") => email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
const hour = (value) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const day = (value) => new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const WIDE = 1500;
const MAX_IMAGES = 5;
const IMAGE = /^image\/(png|jpeg|gif|webp)$/;

/** Discussion instantanée autour d'un CCTP partagé : apparaît d'elle-même dans l'aperçu dès que plusieurs personnes ont accès au document.
 *  Comme la messagerie d'équipe : images, réponses, réactions, modification et suppression de ses messages. */
export function CctpChat({ projectId, currentEmail, currentUserId = "", isOwner = false, canPin = true, subscribe }) {
  const [messages, setMessages] = useState([]);
  const voice = useVoice();
  const [open, setOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= WIDE || window.__pendingProjectChat === projectId));
  // « Discussion du projet » demandée depuis le panneau Discussion : le salon du projet s'ouvre
  useEffect(() => {
    const show = (event) => { if (event.detail?.projectId === projectId) setOpen(true); };
    window.addEventListener("cctp:open-project-chat", show);
    if (window.__pendingProjectChat === projectId) { setOpen(true); window.__pendingProjectChat = null; }
    return () => window.removeEventListener("cctp:open-project-chat", show);
  }, [projectId]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  // « Ouvrir dans Discussion » depuis un commentaire : la discussion s'ouvre avec le passage cité et le commentaire d'origine prérempli (le commentaire reste dans le document)
  useEffect(() => {
    const discuss = (event) => {
      const detail = event.detail || {};
      if (detail.projectId !== projectId) return;
      setOpen(true);
      setQuote({ blockKey: detail.blockKey, text: detail.quote });
      setDraft(`Discussion autour du commentaire de ${detail.author} : « ${detail.body} »
`);
      setTimeout(() => document.querySelector("[data-cctp-chat-input]")?.focus(), 120);
    };
    window.addEventListener("cctp:discuss-comment", discuss);
    return () => window.removeEventListener("cctp:discuss-comment", discuss);
  }, [projectId]);
  const [images, setImages] = useState([]); // { file, url }
  const [viewingImage, setViewingImage] = useState(null); // { url, name } — visionneuse interne, sans nouvel onglet
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null); // { id, text }
  const [picker, setPicker] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState("");
  const tmpRef = useRef(0), outbox = useRef(new Map()); // envois en cours ou échoués : on peut les rejouer
  const myName = currentEmail.split("@")[0];
  const [quote, setQuote] = useState(null); // passage du document cité dans le message en cours
  const [moreOpen, setMoreOpen] = useState(false);
  const [selected, setSelected] = useState(null); // sélection du document proposée à la citation (bouton « Discuter »)
  const [readMark, setReadMark] = useState(null); // heure de ma dernière visite : ce qui est plus récent est « nouveau »
  const [loaded, setLoaded] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const listRef = useRef(null), fileRef = useRef(null), openRef = useRef(open), emailRef = useRef(currentEmail);
  openRef.current = open; emailRef.current = currentEmail;

  const [people, setPeople] = useState([]); // toutes les personnes ayant accès (surlignage des « @ », y compris celles qui me citent)
  const members = people.filter((member) => member.email !== currentEmail); // personnes que l'on peut citer avec « @ »
  useEffect(() => { getCctpPeople(projectId).then((list) => setPeople(list.filter((member) => member && member.email))).catch(() => {}); }, [projectId]);
  const upsert = useCallback((message) => setMessages((items) => (items.some((item) => item.id === message.id) ? items.map((item) => (item.id === message.id ? message : item)) : [...items, message])), []);
  // les citations des autres messages suivent le message d'origine (modifié ou supprimé) sans recharger
  const patchQuotes = (items, id, patch) => items.map((item) => (item.replyTo?.id === id ? { ...item, replyTo: { ...item.replyTo, ...patch } } : item));
  const upsertWithQuotes = useCallback((message) => setMessages((items) => {
    const next = items.some((item) => item.id === message.id) ? items.map((item) => (item.id === message.id ? message : item)) : [...items, message];
    return patchQuotes(next, message.id, { body: (message.body || "").slice(0, 140) });
  }), []);
  const deletedState = (items, id) => patchQuotes(items.map((item) => (item.id === id ? { ...item, deleted: true, body: "", files: [], reactions: [], quote: null, pinned: false, editedAt: null } : item)), id, { deleted: true, body: "" });
  const mentionsMe = (message) => {
    if (!message || message.deleted || message.email === emailRef.current) return false;
    const handle = emailRef.current.split("@")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\w.-])@${handle}(?![\\w.-])`, "i").test(message.body || "") || (!!currentUserId && message.replyTo?.userId === currentUserId);
  };
  useEffect(() => {
    let alive = true;
    Promise.all([listCctpChat(projectId), getCctpChatRead(projectId).catch(() => ({ lastReadAt: null }))]).then(([items, state]) => {
      if (!alive) return;
      const since = state.lastReadAt ? new Date(state.lastReadAt).getTime() : 0;
      setMessages(items); setReadMark(since); setLoaded(true);
      setTimeout(() => { if (alive) listCctpChat(projectId).then((fresh) => { if (alive) setMessages((current) => [...fresh, ...current.filter((item) => item.pending || item.failed)]); }).catch(() => {}); }, 2000);
      const fresh = items.filter((item) => !item.deleted && item.email !== emailRef.current && new Date(item.createdAt).getTime() > since);
      if (!openRef.current) setUnread(fresh.length);
      if (!openRef.current && fresh.some(mentionsMe)) setOpen(true); // quelqu'un m'a cité ou répondu pendant mon absence : la discussion s'ouvre
    }).catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  // « vu » : on enregistre mon passage quand la discussion est ouverte (le repère « nouveaux messages » reste en place jusqu'à la fermeture)
  const readTimer = useRef(0);
  const scheduleRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => { if (openRef.current && !document.hidden) markCctpChatRead(projectId).catch(() => {}); }, 1200);
  }, [projectId]);
  useEffect(() => () => clearTimeout(readTimer.current), []);
  useEffect(() => subscribe?.((event) => {
    if (event.action === "created" || event.action === "edited") {
      if (event.action === "created" && event.message.email === emailRef.current) {
        setMessages((items) => { const index = items.findIndex((item) => item.pending && item.body === event.message.body && (item.files?.length || 0) === (event.message.files?.length || 0)); return index < 0 ? items : items.filter((_, position) => position !== index); });
      }
      upsertWithQuotes(event.message);
      if (event.action === "created" && event.message.email !== emailRef.current) {
        if (!openRef.current) {
          setUnread((count) => count + 1);
          if (mentionsMe(event.message)) setOpen(true); // cité ou réponse à mon message : la discussion s'ouvre toute seule
        } else scheduleRead();
      }
    } else if (event.action === "pinned") {
      upsertWithQuotes(event.message);
    } else if (event.action === "deleted") {
      setMessages((items) => deletedState(items, event.messageId));
    } else if (event.action === "reaction") {
      setMessages((items) => items.map((item) => (item.id === event.messageId ? { ...item, reactions: event.reactions } : item)));
    }
  }), [subscribe, upsertWithQuotes, scheduleRead]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setUnread(0); if (loaded) scheduleRead(); } }, [open, messages.length, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // à l'ouverture on se place sur « Nouveaux messages » (sinon en bas) ; ensuite on suit la conversation
  const firstNew = loaded && readMark !== null ? messages.find((item) => item.email !== currentEmail && !item.deleted && new Date(item.createdAt).getTime() > readMark) : null;
  const placedRef = useRef(false);
  useEffect(() => { if (!open) placedRef.current = false; }, [open]);
  useEffect(() => {
    const node = listRef.current;
    if (!node || !open || !loaded) return;
    if (!placedRef.current) {
      placedRef.current = true;
      const marker = node.querySelector("[data-cctp-chat-new]");
      if (marker) { node.scrollTop = Math.max(0, marker.offsetTop - 12); return; }
    }
    node.scrollTop = node.scrollHeight;
  }, [messages.length, open, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setOpen(false); markCctpChatRead(projectId).catch(() => {}); setReadMark(Date.now()); };
  // tant que la discussion est affichée, c'est elle qui porte les commandes du vocal (sinon un petit bandeau flottant prend le relais)
  useEffect(() => (open ? voice?.attachUI(projectId) : undefined), [open, projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  // le document se décale pour que le panneau ne recouvre jamais le papier
  useEffect(() => {
    document.body.dataset.chatPanel = open ? "open" : "closed";
    return () => { delete document.body.dataset.chatPanel; };
  }, [open]);
  useEffect(() => {
    if (!viewingImage) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setViewingImage(null); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [viewingImage]);
  // La barre d'outils peut tenir sur une ou deux lignes selon la largeur. Le panneau commence toujours juste dessous.
  useEffect(() => {
    if (!open) return undefined;
    const toolbar = document.querySelector(".rich-toolbar");
    if (!toolbar) return undefined;
    const place = () => document.documentElement.style.setProperty("--cctp-chat-top", `${Math.ceil(toolbar.getBoundingClientRect().bottom + 8)}px`);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(toolbar);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      document.documentElement.style.removeProperty("--cctp-chat-top");
    };
  }, [open]);

  // sélection dans le document : bouton « Discuter » pour citer le passage dans la discussion
  useEffect(() => {
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setSelected(selectionQuote())); };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    return () => { document.removeEventListener("selectionchange", update); window.removeEventListener("scroll", update, true); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => { if (!selected) setMoreOpen(false); }, [selected]);
  useEffect(() => {
    if (!selected) return undefined;
    const escape = (event) => { if (event.key === "Escape") { setMoreOpen(false); setSelected(null); } };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selected]);
  const quoteSelection = () => {
    if (!selected) return;
    setQuote({ blockKey: selected.blockKey, text: selected.text });
    setOpen(true);
    setSelected(null);
    setTimeout(() => document.querySelector("[data-cctp-chat-input]")?.focus(), 80);
  };
  const goToPassage = (passage) => { if (!showQuote(passage)) { setError("Ce passage n'existe plus tel quel dans le document."); setTimeout(() => setError(""), 4000); } };
  const pin = (message, pinned) => {
    if (message.pending || message.failed) return;
    setError("");
    upsertWithQuotes({ ...message, pinned, pinnedAt: pinned ? new Date().toISOString() : null, pinnedBy: pinned ? myName : null }); // l'épingle apparaît tout de suite
    pinCctpChat(projectId, message.id, pinned).then(upsertWithQuotes).catch((reason) => { upsertWithQuotes(message); setError(reason.message); });
  };

  const addImages = (files) => {
    const accepted = [...files].filter((file) => IMAGE.test(file.type));
    setError(accepted.length < files.length ? "Seules les images (PNG, JPG, GIF, WebP) peuvent être jointes." : "");
    setImages((current) => [...current, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_IMAGES));
  };
  const removeImage = (url) => setImages((current) => { URL.revokeObjectURL(url); return current.filter((item) => item.url !== url); });

  const deliver = async (temp, snap) => {
    try {
      const message = snap.images.length
        ? await sendCctpChatImages(projectId, snap.images.map((item) => item.file), snap.body, snap.replyTo?.id || "", snap.quote)
        : await sendCctpChat(projectId, snap.body, snap.replyTo?.id || null, snap.quote);
      setMessages((items) => { const rest = items.filter((item) => item.id !== temp.id); return rest.some((item) => item.id === message.id) ? rest : [...rest, message]; });
      outbox.current.delete(temp.id);
      snap.images.forEach((item) => URL.revokeObjectURL(item.url));
    } catch (reason) {
      setMessages((items) => items.map((item) => (item.id === temp.id ? { ...item, pending: false, failed: true, failure: reason.message || "Message non envoyé" } : item)));
    }
  };
  // Le message apparaît tout de suite (légèrement grisé) et se confirme quand le serveur répond ; en cas d'échec il reste, avec « Réessayer ».
  const send = (submit) => {
    submit?.preventDefault();
    const body = draft.trim();
    if (!body && !images.length && !quote) return;
    tmpRef.current += 1;
    const tempId = `tmp-${Date.now()}-${tmpRef.current}`;
    const snap = { body, images: [...images], replyTo, quote };
    const temp = {
      id: tempId, pending: true, userId: currentUserId, email: currentEmail, name: myName, body, deleted: false, createdAt: new Date().toISOString(), editedAt: null,
      replyTo: replyTo ? { id: replyTo.id, userId: "", name: replyTo.name === "vous" ? myName : replyTo.name, body: replyTo.body, deleted: false } : null,
      files: snap.images.map((item, index) => ({ id: `${tempId}-${index}`, name: item.file.name, size: item.file.size, image: true, localUrl: item.url })),
      quote: quote || null, reactions: [], pinned: false,
    };
    outbox.current.set(tempId, { temp, snap });
    setMessages((items) => [...items, temp]);
    setDraft(""); setReplyTo(null); setQuote(null); setImages([]); setError("");
    deliver(temp, snap);
  };
  const retry = (message) => {
    const entry = outbox.current.get(message.id);
    if (!entry) return;
    setMessages((items) => items.map((item) => (item.id === message.id ? { ...item, pending: true, failed: false, failure: "" } : item)));
    deliver(entry.temp, entry.snap);
  };
  const discard = (message) => {
    const entry = outbox.current.get(message.id);
    entry?.snap.images.forEach((item) => URL.revokeObjectURL(item.url));
    outbox.current.delete(message.id);
    setMessages((items) => items.filter((item) => item.id !== message.id));
  };
  const saveEdit = () => {
    if (!editing) return;
    const text = editing.text.trim();
    const original = messages.find((item) => item.id === editing.id);
    if (!text && !original?.files?.length) { setError("Un message ne peut pas être vide : supprimez-le plutôt."); return; }
    setEditing(null); setError("");
    if (original && text === original.body) return;
    setMessages((items) => items.map((item) => (item.id === original.id ? { ...item, body: text, editedAt: new Date().toISOString() } : item)));
    editCctpChat(projectId, original.id, text).then(upsertWithQuotes).catch((reason) => { upsertWithQuotes(original); setError(reason.message); });
  };
  const markDeleted = (id) => setMessages((items) => deletedState(items, id));
  const remove = (id) => {
    setConfirmDelete(null);
    const original = messages.find((item) => item.id === id);
    markDeleted(id); // le message devient « supprimé » tout de suite
    deleteCctpChat(projectId, id).catch((reason) => { if (original) upsertWithQuotes(original); setError(reason.message); });
  };
  const react = (message, emoji) => {
    setPicker(null);
    if (message.pending || message.failed) return;
    const before = message.reactions || [];
    const mine = (user) => (currentUserId ? user.userId === currentUserId : user.name === myName);
    const existing = before.find((item) => item.emoji === emoji);
    let next;
    if (existing && existing.users.some(mine)) {
      const users = existing.users.filter((user) => !mine(user));
      next = users.length ? before.map((item) => (item.emoji === emoji ? { ...item, count: users.length, users } : item)) : before.filter((item) => item.emoji !== emoji);
    } else if (existing) next = before.map((item) => (item.emoji === emoji ? { ...item, count: item.count + 1, users: [...item.users, { userId: currentUserId, name: myName }] } : item));
    else next = [...before, { emoji, count: 1, users: [{ userId: currentUserId, name: myName }] }];
    const set = (reactions) => setMessages((items) => items.map((item) => (item.id === message.id ? { ...item, reactions } : item)));
    set(next); // la pastille change tout de suite
    reactCctpChat(projectId, message.id, emoji).then((result) => set(result.reactions)).catch((reason) => { set(before); setError(reason.message); });
  };
  const jumpTo = (id) => { const node = listRef.current?.querySelector(`[data-message-id="${id}"]`); node?.scrollIntoView({ block: "center", behavior: "smooth" }); node?.classList.add("flash"); setTimeout(() => node?.classList.remove("flash"), 1200); };

  const pinned = messages.filter((item) => item.pinned && !item.deleted).sort((a, b) => (b.pinnedAt || "").localeCompare(a.pinnedAt || ""));
  const slot = selected ? barPosition(selected.rect, 2) : null;
  // « ••• » : actions secondaires sur le passage sélectionné (la discussion n'est plus un gros bouton de premier niveau)
  const discuss = selected ? <>
    <button type="button" className="cctp-chat-discuss sel-bar-btn" data-cctp-chat-more aria-haspopup="menu" aria-expanded={moreOpen} aria-label="Plus d'actions" style={{ left: slot.left, top: slot.top }}
      onMouseDown={(event) => { event.preventDefault(); setMoreOpen((value) => !value); }}><MoreHorizontal size={16} /></button>
    {moreOpen && <div className="sel-bar-menu" role="menu" data-selection-menu style={{ left: Math.max(8, Math.min(window.innerWidth - 220, slot.left - 170)), top: slot.top + 40 }}>
      <button type="button" role="menuitem" data-cctp-chat-discuss title="Partager ce passage avec votre équipe dans Discussion." onMouseDown={(event) => { event.preventDefault(); setMoreOpen(false); quoteSelection(); }}><Quote size={14} /> Envoyer dans Discussion</button>
      <button type="button" role="menuitem" data-selection-copy title="Copier le texte du passage dans le presse-papiers." onMouseDown={(event) => { event.preventDefault(); setMoreOpen(false); navigator.clipboard?.writeText(selected.text).catch(() => {}); }}><Copy size={14} /> Copier le passage</button>
    </div>}
  </> : null;
  if (!open) {
    return <>{discuss}<button type="button" className="cctp-chat-fab" data-cctp-chat-toggle aria-label="Ouvrir la discussion du CCTP" onClick={() => setOpen(true)}>
      <MessageCircle size={20} />{unread > 0 && <em data-cctp-chat-unread>{unread > 99 ? "99+" : unread}</em>}
    </button></>;
  }
  const newMarker = firstNew?.id;
  let lastDay = "";
  return <>{discuss}{viewingImage && <div className="cctp-chat-lightbox" data-cctp-chat-lightbox role="dialog" aria-modal="true" aria-label={`Aperçu de ${viewingImage.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingImage(null); }}>
    <button type="button" className="cctp-chat-lightbox-close" data-cctp-chat-lightbox-close aria-label="Fermer l’aperçu" onClick={() => setViewingImage(null)}><X size={22} /></button>
    <figure><img src={viewingImage.url} alt={viewingImage.name} /><figcaption>{viewingImage.name}</figcaption></figure>
  </div>}<aside className="cctp-chat" data-cctp-chat aria-label="Discussion du CCTP"
    onDragOver={(event) => { if (event.dataTransfer?.types?.includes("Files")) event.preventDefault(); }}
    onDrop={(event) => { if (event.dataTransfer?.files?.length) { event.preventDefault(); addImages(event.dataTransfer.files); } }}>
    <header><MessageCircle size={16} /><b>Discussion du CCTP</b>
      <button type="button" data-cctp-chat-toggle aria-label="Réduire la discussion" onClick={close}><X size={16} /></button></header>
    <VoiceBar projectId={projectId} />
    {pinned.length > 0 && <div className="cctp-chat-pins" data-cctp-chat-pins>
      <button type="button" className="cctp-chat-pin-top" data-cctp-chat-pins-toggle aria-expanded={pinsOpen} onClick={() => setPinsOpen((value) => !value)}>
        <Pin size={13} /><span><b>{pinned.length > 1 ? `${pinned.length} messages épinglés` : "Message épinglé"}</b><small data-cctp-chat-pin-latest>{pinned[0].body || (pinned[0].files?.length ? "📷 Image" : "Passage cité")}</small></span>
        <ChevronDown size={13} className={pinsOpen ? "open" : ""} /></button>
      {pinsOpen && <ul data-cctp-chat-pin-list>
        {pinned.map((item) => <li key={item.id} data-cctp-chat-pinned={item.id}>
          <button type="button" className="go" onClick={() => jumpTo(item.id)}><b>{item.name}</b><span>{item.body || (item.files?.length ? "📷 Image" : "Passage cité")}</span></button>
          {canPin && <button type="button" className="unpin" aria-label="Retirer l'épingle" data-cctp-chat-unpin onClick={() => pin(item, false)}><PinOff size={13} /></button>}
        </li>)}
      </ul>}
    </div>}
    <div className="cctp-chat-list" ref={listRef} data-cctp-chat-list onClick={() => setPicker(null)}>
      {!messages.length && <p className="cctp-chat-empty">Discutez de ce CCTP avec les personnes qui y ont accès. Les messages sont vus en direct par tous.</p>}
      {messages.map((message) => {
        const mine = message.email === currentEmail;
        const label = day(message.createdAt), separator = label !== lastDay;
        lastDay = label;
        return <div key={message.id}>
          {separator && <div className="cctp-chat-day">{label}</div>}
          {message.id === newMarker && <div className="cctp-chat-new" data-cctp-chat-new><span>Nouveaux messages</span></div>}
          <div className={`cctp-chat-message ${mine ? "mine" : ""} ${message.deleted ? "is-deleted" : ""} ${message.pinned ? "is-pinned" : ""} ${message.pending ? "is-pending" : ""} ${message.failed ? "is-failed" : ""}`} data-cctp-chat-message data-message-id={message.id}>
            {!mine && <span className="cctp-chat-avatar" style={{ background: colorFor(message.email) }} title={message.email}>{initials(message.email)}</span>}
            <div className="cctp-chat-bubble">
              <small>{message.pinned && <Pin size={9} className="pin-mark" data-cctp-chat-pin-mark />}{mine ? "Vous" : message.name} · {hour(message.createdAt)}</small>
              {message.replyTo && <blockquote className="cctp-chat-quote" data-cctp-chat-quote onClick={() => jumpTo(message.replyTo.id)}><b>{message.replyTo.name}</b><span>{message.replyTo.deleted ? "Message supprimé" : message.replyTo.body}</span></blockquote>}
              {!message.deleted && message.quote && <button type="button" className="cctp-chat-passage" data-cctp-chat-passage title="Aller au passage dans le document" onClick={() => goToPassage(message.quote)}><FileText size={13} /><span>{message.quote.text}</span></button>}
              {message.deleted ? <p className="cctp-chat-deleted" data-cctp-chat-deleted>Message supprimé</p> : <>
                {message.files?.length > 0 && <div className="cctp-chat-images" data-cctp-chat-images>
                  {message.files.map((file) => { const url = file.localUrl || cctpChatImageUrl(projectId, file.id); return <button type="button" key={file.id} title={`Aperçu de ${file.name}`} onClick={() => setViewingImage({ url, name: file.name })}><img src={url} alt={file.name} loading="lazy" data-cctp-chat-image /></button>; })}
                </div>}
                {editing?.id === message.id
                  ? <div className="cctp-chat-editing" data-cctp-chat-editing>
                    <MentionField multiline autoFocus rows={2} maxLength={4000} value={editing.text} members={members} placement="up" aria-label="Modifier votre message" data-cctp-chat-edit-input onChange={(text) => setEditing({ ...editing, text })}
                      onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); saveEdit(); } else if (event.key === "Escape") setEditing(null); }} />
                    <div><button type="button" data-cctp-chat-edit-save onClick={saveEdit}>Enregistrer</button><button type="button" data-cctp-chat-edit-cancel onClick={() => setEditing(null)}>Annuler</button></div>
                  </div>
                  : message.body && <p><MentionedText text={message.body} members={people} />{message.editedAt && <em className="cctp-chat-edited" data-cctp-chat-edited> (modifié)</em>}</p>}
              </>}
              {!message.deleted && message.reactions?.length > 0 && <div className="cctp-chat-reactions" data-cctp-chat-reactions>
                {message.reactions.map((reaction) => {
                  const own = reaction.users.some((item) => (currentUserId ? item.userId === currentUserId : item.name === myName));
                  return <button key={reaction.emoji} type="button" className={own ? "mine" : ""} data-cctp-chat-reaction={reaction.emoji} data-count={reaction.count} aria-pressed={own}
                    title={`${reaction.users.map((item) => item.name).join(", ")} : ${reaction.emoji}`} onClick={() => react(message, reaction.emoji)}><span>{reaction.emoji}</span><b>{reaction.count}</b></button>;
                })}
              </div>}
              {picker === message.id && <div className="cctp-chat-emojis" data-cctp-chat-emoji-picker role="menu">{EMOJIS.map((emoji) => <button key={emoji} type="button" role="menuitem" data-cctp-chat-emoji={emoji} onClick={() => react(message, emoji)}>{emoji}</button>)}</div>}
              {confirmDelete === message.id && <div className="cctp-chat-confirm" data-cctp-chat-confirm>Supprimer ce message ? <button type="button" data-cctp-chat-confirm-yes onClick={() => remove(message.id)}>Supprimer</button><button type="button" onClick={() => setConfirmDelete(null)}>Annuler</button></div>}
              {message.failed && <div className="cctp-chat-failed" data-cctp-chat-failed role="alert"><span>Non envoyé{message.failure ? ` : ${message.failure}` : ""}</span><button type="button" data-cctp-chat-retry onClick={() => retry(message)}>Réessayer</button><button type="button" data-cctp-chat-discard onClick={() => discard(message)}>Supprimer</button></div>}
              {!message.deleted && !message.pending && !message.failed && editing?.id !== message.id && <div className="cctp-chat-actions" data-cctp-chat-actions>
                <button type="button" title="Réagir" aria-label="Réagir" data-cctp-chat-react onClick={(event) => { event.stopPropagation(); setPicker(picker === message.id ? null : message.id); }}><SmilePlus size={13} /></button>
                <button type="button" title="Répondre" aria-label="Répondre" data-cctp-chat-reply onClick={() => setReplyTo({ id: message.id, name: mine ? "vous" : message.name, body: message.body || "📷 Image" })}><CornerUpLeft size={13} /></button>
                {canPin && <button type="button" title={message.pinned ? "Retirer l'épingle" : "Épingler en haut de la discussion"} aria-label={message.pinned ? "Retirer l'épingle" : "Épingler"} data-cctp-chat-pin onClick={() => pin(message, !message.pinned)}>{message.pinned ? <PinOff size={13} /> : <Pin size={13} />}</button>}
                {mine && <button type="button" title="Modifier" aria-label="Modifier" data-cctp-chat-edit onClick={() => setEditing({ id: message.id, text: message.body })}><Pencil size={13} /></button>}
                {(mine || isOwner) && <button type="button" title="Supprimer" aria-label="Supprimer" data-cctp-chat-delete onClick={() => setConfirmDelete(message.id)}><Trash2 size={13} /></button>}
              </div>}
            </div>
          </div>
        </div>;
      })}
    </div>
    {error && <div className="cctp-chat-error" role="alert" data-cctp-chat-error>{error}</div>}
    {quote && <div className="cctp-chat-quoting" data-cctp-chat-quoting><FileText size={13} /><span><b>Passage du document</b>{quote.text}</span><button type="button" aria-label="Retirer la citation" onClick={() => setQuote(null)}><X size={13} /></button></div>}
    {replyTo && <div className="cctp-chat-replying" data-cctp-chat-replying><CornerUpLeft size={13} /><span>Réponse à <b>{replyTo.name}</b> : {replyTo.body}</span><button type="button" aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}><X size={13} /></button></div>}
    {images.length > 0 && <div className="cctp-chat-pending" data-cctp-chat-pending>
      {images.map((item) => <span key={item.url}><img src={item.url} alt={item.file.name} /><button type="button" aria-label={`Retirer ${item.file.name}`} onClick={() => removeImage(item.url)}><X size={11} /></button></span>)}
    </div>}
    <form className="cctp-chat-form" onSubmit={send}>
      <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/gif,image/webp" data-cctp-chat-file onChange={(event) => { addImages(event.target.files); event.target.value = ""; }} />
      <button type="button" className="ghost" title="Joindre une image" aria-label="Joindre une image" data-cctp-chat-attach disabled={images.length >= MAX_IMAGES} onClick={() => fileRef.current?.click()}><ImagePlus size={16} /></button>
      <MentionField multiline data-cctp-chat-input rows={1} value={draft} members={members} placement="up" placeholder="Écrire un message…" aria-label="Message" onChange={setDraft}
        onPaste={(event) => { const files = [...(event.clipboardData?.files || [])].filter((file) => IMAGE.test(file.type)); if (files.length) { event.preventDefault(); addImages(files); } }}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
      <button type="submit" data-cctp-chat-send aria-label="Envoyer" disabled={!draft.trim() && !images.length && !quote}><Send size={16} /></button>
    </form>
  </aside></>;
}

