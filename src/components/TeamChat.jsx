import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bell, Minus, CornerUpLeft, Download, File as FileIcon, FileText, Hash, LogOut, MessageSquarePlus, Paperclip, Pencil, Send, SmilePlus, Trash2, UserPlus, Users, X } from "lucide-react";
import {
  addConversationMembers,
  apiFetch,
  chatFileUrl,
  createConversation,
  deleteChatMessage,
  editChatMessage,
  getMessageSeen,
  importSharedCctp,
  leaveConversation,
  listChatMessages,
  listConversations,
  markConversationRead,
  openDirectConversation,
  reactToMessage,
  sendChatFiles,
  sendChatMessage,
} from "../api/client";
import { SharedCctpPreview } from "./SharedCctpPreview";
import { sharedCctpOpenTarget } from "../utils/sharedCctpNavigation";
import { VoiceBar } from "./VoiceBar";
import { useVoice } from "../hooks/VoiceContext";
import "../team-chat.css";

const TYPING_MS = 3500;
const time = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const clock = (iso) => {
  // « 14:32 » le jour même, « 03/10 à 14:32 » sinon : l’heure est toujours celle du navigateur de l’utilisateur.
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today ? time(iso) : `${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} à ${time(iso)}`;
};
const snippet = (text) => (text.length <= 140 ? text : `${text.slice(0, 139).trimEnd()}…`);
const day = (iso) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const initials = (name) => (name || "?").slice(0, 2).toUpperCase();
const newClientId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Fichiers acceptés (même liste que le serveur, qui contrôle aussi le contenu réel de chaque fichier).
const FILE_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "gif", "webp", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv", "md", "zip", "7z", "dwg", "dxf", "ifc"];
const FILE_ACCEPT = FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
const MAX_FILES = 5;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const fileExt = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
const sizeLabel = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`);
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "👀", "✅", "❌"]; // même palette que le serveur
const ROLE_LABEL = { admin: "Administrateur", member: "Membre", viewer: "Lecteur", validator: "Membre", writer: "Membre", reviewer: "Lecteur" };
const SPECIAL_MENTIONS = ["tous", "all", "everyone", "ici", "here"];
const titleOf = (conversation, meId) => (conversation.kind === "direct" ? conversation.members.find((member) => member.userId !== meId)?.name || "Conversation" : conversation.title);
const lastSeenLabel = (iso) => {
  if (!iso) return "hors ligne";
  const date = new Date(iso);
  return new Date().toDateString() === date.toDateString() ? `vu à ${time(iso)}` : `vu le ${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`;
};
// Repère les @mentions d'un texte : @nom d'un membre de la discussion, @tous, @ici (même règle que le serveur).
function renderBody(text, names, meName) {
  const parts = [];
  const pattern = /(?<![\w.+@-])@([\w.+-]+)/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    const token = match[1].replace(/[.+-]+$/, "");
    const lower = token.toLowerCase();
    const special = SPECIAL_MENTIONS.includes(lower);
    if (!token || !(special || names.has(lower))) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<mark key={match.index} className={`chat-mention${special ? " special" : ""}${lower === meName ? " me" : ""}`} data-chat-mention={lower}>@{token}</mark>);
    last = match.index + 1 + token.length;
  }
  parts.push(text.slice(last));
  return parts;
}

function Avatar({ name, online }) {
  return (
    <span className="chat-avatar" aria-hidden="true">
      {initials(name)}
      {online !== undefined && <i className={online ? "on" : ""} />}
    </span>
  );
}

export function TeamChat({ user, team, realtime, projects = [], onImported, onOpenProject, intent, visible = true, rail = false }) {
  const voice = useVoice();
  useEffect(() => (visible ? voice?.attachUI("workspace") : undefined), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const panelOpenRef = useRef(visible);
  panelOpenRef.current = visible;
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [railChat, setRailChat] = useState(false); // volet latéral (type Teams) : liste des discussions OU conversation ouverte
  const [railMin, setRailMin] = useState(false);
  const openConversation = (id) => { setActiveId(id); setRailChat(true); setRailMin(false); };
  const [threads, setThreads] = useState({}); // id -> { items, hasMore }
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState({}); // conversationId -> { userId: { name, until } }
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [groupDialog, setGroupDialog] = useState(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [seenOpen, setSeenOpen] = useState(null); // id du message dont on déplie « Vu par »
  const [seenDetail, setSeenDetail] = useState({}); // id du message -> [{ userId, name, seenAt }] (heures exactes)
  const [replyTo, setReplyTo] = useState(null); // message auquel on est en train de répondre
  const [editing, setEditing] = useState(null); // { id, text } : message en cours de modification
  const [confirmDelete, setConfirmDelete] = useState(null); // id du message dont on demande la confirmation de suppression
  const [pendingFiles, setPendingFiles] = useState([]); // fichiers choisis, envoyés avec le prochain message
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachMode, setAttachMode] = useState("menu"); // menu | cctp
  const [previewMessage, setPreviewMessage] = useState(null); // message dont on affiche l'aperçu du CCTP joint
  const fileInput = useRef(null);
  const [emojiFor, setEmojiFor] = useState(null); // id du message dont le sélecteur d'émoticônes est ouvert
  const [whoFor, setWhoFor] = useState(null); // id du message dont on déplie « qui a réagi à quoi »
  const [mention, setMention] = useState(null); // { query, start } : @… en cours de saisie
  const [mentionIndex, setMentionIndex] = useState(0);
  const [memberQuery, setMemberQuery] = useState("");
  const [notifyState, setNotifyState] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const seenOpenRef = useRef(null);
  seenOpenRef.current = seenOpen;
  const conversationsRef = useRef([]);
  const pendingCaret = useRef(null);
  const lastIntent = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const lastTyping = useRef(0);
  const activeRef = useRef(null);
  activeRef.current = activeId;

  const me = team.members.find((member) => member.email === user.email);
  const isAdmin = team.role === "admin";
  conversationsRef.current = conversations;
  const active = conversations.find((item) => item.id === activeId);
  const thread = threads[activeId];

  const loadConversations = useCallback(async () => {
    const items = await listConversations();
    setConversations(items);
    setActiveId((current) => (current && items.some((item) => item.id === current) ? current : items[0]?.id || null));
    return items;
  }, []);

  const loadThread = useCallback(async (id, before = "") => {
    const page = await listChatMessages(id, before);
    setThreads((state) => {
      const known = state[id]?.items || [];
      // Le serveur fait foi pour ce qu'il renvoie ; mais un message reçu en direct PENDANT le chargement est plus récent que la page
      // (partie avant lui) : on le garde, sinon la réponse tardive l'effacerait jusqu'au prochain rechargement.
      const newest = page.messages.length ? new Date(page.messages[page.messages.length - 1].createdAt) : null;
      const items = before ? [...page.messages, ...known] : [...page.messages, ...known.filter((item) => item.pending || item.failed || !newest || new Date(item.createdAt) > newest)];
      return { ...state, [id]: { items: dedupe(items), hasMore: page.hasMore } };
    });
  }, []);

  useEffect(() => {
    loadConversations().catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  }, [loadConversations]);

  // Replace le curseur après une mention choisie, avant toute nouvelle frappe (un setTimeout pouvait le ramener en arrière).
  useLayoutEffect(() => {
    if (pendingCaret.current == null) return;
    const textarea = inputRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  }, [draft]);

  // On prévient l'application de la discussion affichée : pas de bulle de notification pour ce que l'on a sous les yeux.
  useEffect(() => {
    // une discussion « sous les yeux » = panneau ouvert : fermé, les nouveaux messages restent « non lus » (pastille de l'en-tête) ; rouvert, elle est lue
    if (visible && activeId) markConversationRead(activeId).catch(() => {});
    realtime.setViewing?.(visible ? activeId : null);
    return () => realtime.setViewing?.(null);
  }, [activeId, realtime.setViewing, visible]);

  // Clic sur une notification de mention : on ouvre directement la discussion concernée.
  useEffect(() => {
    if (intent && intent.nonce !== lastIntent.current && conversations.some((item) => item.id === intent.conversationId)) {
      lastIntent.current = intent.nonce;
      openConversation(intent.conversationId);
    }
  }, [intent, conversations]);

  // Ouvrir une discussion : historique, puis « lu ».
  useEffect(() => {
    if (!activeId) return;
    setReplyTo(null);
    setSeenOpen(null);
    setEditing(null);
    setConfirmDelete(null);
    setPendingFiles([]);
    stickToBottom.current = true;
    loadThread(activeId).catch((reason) => setError(reason.message));
    markConversationRead(activeId).catch(() => {});
    setConversations((items) => items.map((item) => (item.id === activeId ? { ...item, unread: 0 } : item)));
  }, [activeId, loadThread]);

  // Événements temps réel.
  useEffect(() => {
    return realtime.subscribe((event) => {
      if (event.type === "_open") {
        loadConversations().catch(() => {});
        if (activeRef.current) loadThread(activeRef.current).catch(() => {});
      } else if (event.type === "message") {
        const message = event.message;
        const mine = message.senderId === me?.userId;
        const visible = panelOpenRef.current && message.conversationId === activeRef.current && !document.hidden;
        // Premier message d'une conversation que l'on ne connaît pas encore (ex. quelqu'un nous écrit en direct) : on la charge.
        if (!conversationsRef.current.some((item) => item.id === message.conversationId)) loadConversations().catch(() => {});
        setThreads((state) => {
          const current = state[message.conversationId];
          if (!current) return state;
          const items = current.items.filter((item) => !(item.pending && item.clientId && item.clientId === event.clientId));
          return { ...state, [message.conversationId]: { ...current, items: dedupe([...items, message]) } };
        });
        setConversations((items) =>
          sortConversations(items.map((item) =>
            item.id === message.conversationId
              ? { ...item, lastMessage: message, lastMessageAt: message.createdAt, unread: mine || visible ? item.unread : (item.unread || 0) + 1 }
              : item,
          )),
        );
        if (visible && !mine) markConversationRead(message.conversationId).catch(() => {});
        if (message.senderId) setTyping((state) => clearTyping(state, message.conversationId, message.senderId));
      } else if (event.type === "message_edited") {
        const edited = event.message;
        setThreads((state) => {
          const current = state[edited.conversationId];
          if (!current) return state;
          return {
            ...state,
            [edited.conversationId]: {
              ...current,
              items: current.items.map((item) =>
                item.id === edited.id ? { ...item, ...edited, replyTo: item.replyTo } : item.replyTo?.id === edited.id ? { ...item, replyTo: { ...item.replyTo, body: snippet(edited.body) } } : item,
              ),
            },
          };
        });
        setConversations((items) => items.map((item) => (item.id === edited.conversationId && item.lastMessage?.id === edited.id ? { ...item, lastMessage: { ...item.lastMessage, body: edited.body } } : item)));
      } else if (event.type === "conversation") {
        setConversations((items) => {
          const known = items.find((item) => item.id === event.conversation.id);
          const next = { ...event.conversation, unread: known?.unread ?? 0, mentions: known?.mentions ?? 0 };
          return sortConversations(known ? items.map((item) => (item.id === next.id ? next : item)) : [...items, next]);
        });
      } else if (event.type === "conversation_removed") {
        setConversations((items) => items.filter((item) => item.id !== event.conversationId));
        setActiveId((current) => (current === event.conversationId ? null : current));
      } else if (event.type === "unread") {
        setConversations((items) => items.map((item) => (item.id === event.conversationId ? { ...item, unread: event.unread, mentions: event.mentions ?? item.mentions } : item)));
      } else if (event.type === "reaction") {
        setThreads((state) => {
          const current = state[event.conversationId];
          if (!current) return state;
          return { ...state, [event.conversationId]: { ...current, items: current.items.map((item) => (item.id === event.messageId ? { ...item, reactions: event.reactions } : item)) } };
        });
      } else if (event.type === "mention") {
        const visible = panelOpenRef.current && event.conversationId === activeRef.current && !document.hidden;
        if (!visible) setConversations((items) => items.map((item) => (item.id === event.conversationId ? { ...item, mentions: (item.mentions || 0) + 1 } : item)));
      } else if (event.type === "message_deleted") {
        // L'aperçu de la liste ne doit pas garder le texte d'un message supprimé.
        setConversations((items) => items.map((item) => (item.id === event.conversationId && item.lastMessage?.id === event.messageId ? { ...item, lastMessage: { ...item.lastMessage, deleted: true, body: "", kind: "text" } } : item)));
        setThreads((state) => {
          const current = state[event.conversationId];
          if (!current) return state;
          return {
            ...state,
            [event.conversationId]: {
              ...current,
              items: current.items.map((item) =>
                item.id === event.messageId
                  ? { ...item, deleted: true, body: "", payload: {}, kind: "text" }
                  : item.replyTo?.id === event.messageId ? { ...item, replyTo: { ...item.replyTo, deleted: true, body: "" } } : item,
              ),
            },
          };
        });
      } else if (event.type === "typing") {
        setTyping((state) => ({ ...state, [event.conversationId]: { ...(state[event.conversationId] || {}), [event.userId]: { name: event.name, until: Date.now() + TYPING_MS } } }));
        setTimeout(() => setTyping((state) => ({ ...state })), TYPING_MS + 100);
      } else if (event.type === "read") {
        // Quelqu'un vient de lire la discussion : son « Vu par » se met à jour sous nos messages.
        setConversations((items) => items.map((item) => (item.id === event.conversationId ? { ...item, members: item.members.map((member) => (member.userId === event.userId ? { ...member, lastReadAt: event.readAt } : member)) } : item)));
        if (seenOpenRef.current) getMessageSeen(seenOpenRef.current).then((data) => setSeenDetail((state) => ({ ...state, [seenOpenRef.current]: data.members }))).catch(() => {});
      } else if (event.type === "presence") {
        setConversations((items) => items.map((item) => ({ ...item, members: item.members.map((member) => (member.userId === event.userId ? { ...member, online: event.online } : member)) })));
      } else if (event.type === "error") {
        if (event.clientId) {
          setThreads((state) => Object.fromEntries(Object.entries(state).map(([id, value]) => [id, { ...value, items: value.items.map((item) => (item.clientId === event.clientId ? { ...item, pending: false, failed: event.detail } : item)) }])));
        } else setError(event.detail);
      }
    });
  }, [realtime, me?.userId, loadConversations, loadThread]);

  // Défilement : on reste en bas tant que l'on n'est pas remonté lire l'historique.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [thread?.items.length, activeId]);

  const onScroll = () => {
    const list = listRef.current;
    if (list) stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  };

  const append = (id, message) =>
    setThreads((state) => ({ ...state, [id]: { hasMore: state[id]?.hasMore || false, items: dedupe([...(state[id]?.items || []), message]) } }));

  // Fichiers : on les vérifie tout de suite (le serveur refait ces contrôles, y compris sur le contenu réel).
  const addFiles = (list) => {
    const incoming = [...list];
    if (!incoming.length) return;
    const problems = [];
    const accepted = [];
    for (const file of incoming) {
      if (!FILE_EXTENSIONS.includes(fileExt(file.name))) problems.push(`« ${file.name} » : type non accepté (PDF, Word, Excel, PowerPoint, images, plans, archives…).`);
      else if (file.size > MAX_FILE_BYTES) problems.push(`« ${file.name} » dépasse 25 Mo.`);
      else if (file.size === 0) problems.push(`« ${file.name} » est vide.`);
      else accepted.push(file);
    }
    const room = MAX_FILES - pendingFiles.length;
    if (accepted.length > room) problems.push(`${MAX_FILES} fichiers au maximum par message.`);
    setPendingFiles((current) => [...current, ...accepted.slice(0, Math.max(0, room))]);
    setError(problems.join(" "));
    setPickerOpen(false);
  };

  const sendFiles = async () => {
    const quoted = replyTo;
    setUploading(true);
    setError("");
    try {
      const message = await sendChatFiles(activeId, pendingFiles, draft.trim(), quoted?.id || "");
      stickToBottom.current = true;
      setThreads((state) => ({ ...state, [activeId]: { hasMore: state[activeId]?.hasMore || false, items: dedupe([...(state[activeId]?.items || []), message]) } }));
      setPendingFiles([]);
      setDraft("");
      setReplyTo(null);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (cctpId = null) => {
    if (uploading) return;
    if (activeId && pendingFiles.length && !cctpId) return sendFiles();
    const body = draft.trim();
    if (!activeId || (!body && !cctpId)) return;
    setError("");
    const clientId = newClientId();
    const project = cctpId ? projects.find((item) => item.id === cctpId) : null;
    const quoted = replyTo;
    append(activeId, {
      replyTo: quoted ? { id: quoted.id, senderName: quoted.senderId === me?.userId ? "Vous" : quoted.senderName, body: quoted.deleted ? "" : quoted.body || (quoted.kind === "cctp" ? `📎 CCTP « ${quoted.payload?.name || ""} »` : ""), deleted: !!quoted.deleted } : null,
      id: `tmp-${clientId}`, clientId, pending: true, conversationId: activeId, senderId: me?.userId, senderEmail: user.email, senderName: user.email.split("@")[0],
      kind: cctpId ? "cctp" : "text", body, payload: cctpId ? { cctpId, name: project?.name || "CCTP", chapters: project?.selected?.length || 0 } : {}, createdAt: new Date().toISOString(),
    });
    stickToBottom.current = true;
    lastTyping.current = 0; // le prochain message annoncera de nouveau « écrit… »
    setDraft("");
    setPickerOpen(false);
    setReplyTo(null);
    if (realtime.send({ type: "send", conversationId: activeId, body, cctpId, clientId, replyToId: quoted?.id || null })) return;
    try {
      const message = await sendChatMessage(activeId, body, cctpId, quoted?.id || null);
      setThreads((state) => ({ ...state, [activeId]: { ...state[activeId], items: dedupe([...state[activeId].items.filter((item) => item.clientId !== clientId), message]) } }));
    } catch (reason) {
      setThreads((state) => ({ ...state, [activeId]: { ...state[activeId], items: state[activeId].items.map((item) => (item.clientId === clientId ? { ...item, pending: false, failed: reason.message } : item)) } }));
    }
  };

  // Menu d'autocomplétion : s'ouvre dès qu'on tape « @ » au début d'un mot.
  const detectMention = (value, caret) => {
    const found = /(?:^|[\s(])@([\w.+-]*)$/.exec(value.slice(0, caret));
    return found ? { query: found[1].toLowerCase(), start: caret - found[1].length - 1 } : null;
  };
  const mentionOptions = useMemo(() => {
    if (!mention || !active) return [];
    const query = mention.query;
    const people = active.members.filter((member) => member.userId !== me?.userId && (member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query)))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)) || Number(b.online) - Number(a.online))
      .slice(0, 7).map((member) => ({ name: member.name, label: member.email, online: member.online }));
    const everyone = active.members.length - 1;
    const specials = active.kind === "direct" ? [] : [
      { name: "tous", label: "Toute la discussion", hint: `${everyone} personne${everyone > 1 ? "s" : ""}`, special: true },
      { name: "ici", label: "Membres en ligne", hint: `${active.members.filter((member) => member.online && member.userId !== me?.userId).length} en ligne`, special: true },
    ].filter((option) => option.name.startsWith(query));
    return [...specials, ...people];
  }, [mention, active, me?.userId, team.role]);
  const pickMention = (option) => {
    const textarea = inputRef.current;
    const caret = textarea?.selectionStart ?? draft.length;
    const position = mention.start + option.name.length + 2;
    pendingCaret.current = position; // appliqué juste après la mise à jour du champ (voir useLayoutEffect)
    setDraft(`${draft.slice(0, mention.start)}@${option.name} ${draft.slice(caret)}`);
    setMention(null);
  };

  const startDirect = async (member) => {
    setError("");
    try {
      const conversation = await openDirectConversation(member.userId);
      setConversations((items) => (items.some((item) => item.id === conversation.id) ? items : sortConversations([...items, conversation])));
      openConversation(conversation.id);
      setMembersOpen(false);
      setAddOpen(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (reason) {
      setError(reason.message);
    }
  };

  const enableNotifications = async () => {
    if (typeof Notification !== "undefined") setNotifyState(await Notification.requestPermission());
  };

  const onType = (value, caret = value.length) => {
    setDraft(value);
    const found = detectMention(value, caret);
    setMention(found);
    setMentionIndex(0);
    const now = Date.now();
    if (value && activeId && now - lastTyping.current > 2500) {
      lastTyping.current = now;
      realtime.send({ type: "typing", conversationId: activeId });
    }
  };

  const startEdit = (message) => {
    setConfirmDelete(null);
    setEditing({ id: message.id, text: message.body, kind: message.kind });
  };

  const saveEdit = async () => {
    const { id, text, kind } = editing;
    if (!text.trim() && !["cctp", "file"].includes(kind)) return setError("Un message ne peut pas être vide : supprimez-le plutôt.");
    setError("");
    try {
      const updated = await editChatMessage(id, text.trim());
      setThreads((state) => ({ ...state, [updated.conversationId]: { ...state[updated.conversationId], items: state[updated.conversationId].items.map((item) => (item.id === id ? { ...item, ...updated, replyTo: item.replyTo } : item)) } }));
      setEditing(null);
    } catch (reason) {
      setError(reason.message);
    }
  };

  const confirmedDelete = async (id) => {
    setConfirmDelete(null);
    try {
      await deleteChatMessage(id);
    } catch (reason) {
      setError(reason.message);
    }
  };

  const react = async (message, emoji) => {
    setEmojiFor(null);
    setError("");
    try {
      const result = await reactToMessage(message.id, emoji);
      setThreads((state) => ({ ...state, [message.conversationId]: { ...state[message.conversationId], items: state[message.conversationId].items.map((item) => (item.id === message.id ? { ...item, reactions: result.reactions } : item)) } }));
    } catch (reason) {
      setError(reason.message);
    }
  };

  const startReply = (message) => {
    setReplyTo(message);
    inputRef.current?.focus();
  };

  // Cliquer sur une citation fait défiler jusqu’au message d’origine (s’il est déjà chargé) et le met en surbrillance.
  const jumpTo = (id) => {
    const target = listRef.current?.querySelector(`[data-message-id="${id}"]`);
    if (!target) return;
    stickToBottom.current = false;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.classList.add("chat-flash");
    setTimeout(() => target.classList.remove("chat-flash"), 1600);
  };

  const toggleSeen = (messageId) => {
    if (seenOpen === messageId) return setSeenOpen(null);
    setSeenOpen(messageId);
    getMessageSeen(messageId).then((data) => setSeenDetail((state) => ({ ...state, [messageId]: data.members }))).catch(() => {});
  };

  const retry = (message) => {
    setThreads((state) => ({ ...state, [activeId]: { ...state[activeId], items: state[activeId].items.filter((item) => item.id !== message.id) } }));
    setDraft(message.body);
  };

  const importCctp = async (message) => {
    setError("");
    try {
      const created = await importSharedCctp(message.id);
      const full = await apiFetch(`/cctps/${created.id}`);
      onImported?.(full);
      setNotice(`« ${created.name} » a été ajouté à vos CCTP.`);
    } catch (reason) {
      setError(reason.message);
    }
  };

  const openCctp = (message) => {
    const target = sharedCctpOpenTarget(message, me?.userId);
    if (target.type === "owned-preview") {
      onOpenProject?.(target.cctpId);
      return;
    }
    if (target.type === "shared-preview") setPreviewMessage(message);
  };

  const leave = async () => {
    try {
      await leaveConversation(activeId);
      setMembersOpen(false);
      await loadConversations();
    } catch (reason) {
      setError(reason.message);
    }
  };

  const typers = Object.values(typing[activeId] || {}).filter((item) => item.until > Date.now()).map((item) => item.name);
  const rows = useMemo(() => buildRows(thread?.items || []), [thread]);
  // « Vu par » : sous le dernier message que l'on a envoyé, qui l'a lu (dernière lecture postérieure au message).
  const lastMine = [...(thread?.items || [])].reverse().find((item) => item.senderId === me?.userId && !item.deleted && !item.pending && !item.failed && item.kind !== "system");
  const seenBy = (message) => (active?.members || []).filter((member) => member.userId !== me?.userId && member.lastReadAt && new Date(member.lastReadAt) >= new Date(message.createdAt));
  const others = team.members.filter((member) => member.userId !== me?.userId);
  const candidates = active ? others.filter((member) => !active.members.some((item) => item.userId === member.userId)) : [];
  const online = active ? active.members.filter((member) => member.online).length : 0;
  const names = new Set((active?.members || []).map((member) => member.name.toLowerCase()));
  const meName = (user.email || "").split("@")[0].toLowerCase();
  const peer = active?.kind === "direct" ? team.members.find((member) => member.userId !== me?.userId && active.members.some((item) => item.userId === member.userId)) : null;
  const directory = [...others].filter((member) => !memberQuery.trim() || member.email.toLowerCase().includes(memberQuery.trim().toLowerCase()))
    .sort((a, b) => Number(!!b.online) - Number(!!a.online) || a.email.localeCompare(b.email));
  const onlineTeam = others.filter((member) => member.online).length;
  const myProjects = projects.filter((item) => !item.archived);

  if (loading) return <div className="chat-state">Chargement des discussions…</div>;

  return (
    <section className={`team-chat${rail ? " is-rail" : ""}`} data-chat data-rail-view={rail ? (railChat ? "chat" : "list") : undefined} data-rail-min={rail && railChat && railMin ? "" : undefined}>
      <aside className="chat-list" aria-label="Discussions">
        <header>
          <h2>Discussions</h2>
          <button data-chat-new-group onClick={() => setGroupDialog({ title: "", ids: [] })} title="Créer un groupe"><MessageSquarePlus size={16} /></button>
        </header>
        <ul>
          {conversations.map((item) => (
            <li key={item.id}>
              <button className={item.id === activeId ? "active" : ""} data-chat-conversation={titleOf(item, me?.userId)} data-chat-kind={item.kind} onClick={() => { openConversation(item.id); setMembersOpen(false); setAddOpen(false); }}>
                {item.kind === "direct"
                  ? <Avatar name={titleOf(item, me?.userId)} online={!!item.members.find((member) => member.userId !== me?.userId)?.online} />
                  : <span className="chat-icon">{item.kind === "general" ? <Hash size={15} /> : <Users size={15} />}</span>}
                <span className="chat-name">
                  <b>{titleOf(item, me?.userId)}</b>
                  <small>{item.lastMessage ? `${item.lastMessage.senderName ? item.lastMessage.senderName + " : " : ""}${item.lastMessage.deleted ? "message supprimé" : item.lastMessage.kind === "cctp" ? "📎 CCTP" : item.lastMessage.kind === "file" ? `📎 ${item.lastMessage.payload?.files?.[0]?.name || "fichier"}` : item.lastMessage.body}` : "Aucun message"}</small>
                </span>
                {item.mentions > 0 && <em className="chat-at" data-chat-mention-count={item.mentions} title="Vous avez été mentionné">@</em>}
                {item.unread > 0 && <em data-chat-unread={item.unread}>{item.unread > 99 ? "99+" : item.unread}</em>}
              </button>
            </li>
          ))}
        </ul>

        <section className="chat-directory" data-chat-directory aria-label="Membres de l’équipe">
          <h3>Équipe · {team.members.length} <small>{onlineTeam + 1} en ligne</small></h3>
          {others.length > 6 && <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Rechercher un collègue…" aria-label="Rechercher un collègue" data-chat-member-search />}
          <ul>
            {directory.length === 0 && <li className="chat-directory-empty">{others.length === 0 ? "Vous êtes seul dans l’équipe pour l’instant." : "Aucun collègue ne correspond."}</li>}
            {directory.map((member) => (
              <li key={member.userId}>
                <button data-chat-member={member.email} data-online={member.online ? "true" : "false"} onClick={() => startDirect(member)} title={`Écrire à ${member.email}`}>
                  <Avatar name={member.email} online={!!member.online} />
                  <span className="chat-name"><b>{member.email.split("@")[0]}</b><small>{ROLE_LABEL[member.role] || member.role} · {member.online ? "en ligne" : lastSeenLabel(member.lastSeenAt)}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <div className={`chat-main${dragOver ? " drag-over" : ""}`}
        onDragOver={(event) => { if (event.dataTransfer?.types?.includes("Files")) { event.preventDefault(); setDragOver(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false); }}
        onDrop={(event) => { if (event.dataTransfer?.files?.length) { event.preventDefault(); setDragOver(false); addFiles(event.dataTransfer.files); } }}>
        {dragOver && <div className="chat-drop-hint" data-chat-drop-hint>Déposez vos fichiers pour les joindre au message</div>}
        {!active ? (
          <div className="chat-state">Choisissez une discussion.</div>
        ) : (
          <>
            <VoiceBar projectId="workspace" />
            <header className="chat-head">
              {rail && <div className="chat-window-controls"><button type="button" data-chat-minimize aria-label={railMin ? "Agrandir la conversation" : "Réduire la conversation"} title={railMin ? "Agrandir" : "Réduire"} onClick={() => setRailMin((value) => !value)}><Minus size={16} /></button><button type="button" data-chat-back aria-label="Fermer la conversation" title="Fermer" onClick={() => { setRailChat(false); setRailMin(false); }}><X size={16} /></button></div>}
              <div>
                <h2>{active.kind === "general" ? <Hash size={17} /> : active.kind === "direct" ? <Avatar name={titleOf(active, me?.userId)} online={!!peer?.online} /> : <Users size={17} />} {titleOf(active, me?.userId)}</h2>
                {active.kind === "direct" ? (
                  <small className="chat-presence" data-chat-presence>{peer ? `${peer.email} · ${peer.online ? "en ligne" : lastSeenLabel(peer.lastSeenAt)}` : ""}</small>
                ) : (
                  <button className="chat-members-toggle" data-chat-members-toggle onClick={() => setMembersOpen((value) => !value)}>
                    {active.members.length} membre{active.members.length > 1 ? "s" : ""} · {online} en ligne
                  </button>
                )}
              </div>
              <div className="chat-head-actions">
                {!realtime.connected && <span className="chat-offline" data-chat-offline>Reconnexion…</span>}
                {notifyState === "default" && <button onClick={enableNotifications} data-chat-notify-enable title="Être prévenu d’une mention même quand Calepin est en arrière-plan"><Bell size={14} /> Activer les notifications</button>}
                {active.kind === "group" && (
                  <>
                    <button onClick={() => setAddOpen((value) => !value)} data-chat-add-open><UserPlus size={14} /> Ajouter</button>
                    <button onClick={leave} data-chat-leave><LogOut size={14} /> Quitter</button>
                  </>
                )}
              </div>
            </header>

            {membersOpen && (
              <ul className="chat-members" data-chat-members>
                {active.members.map((member) => (
                  <li key={member.userId}><Avatar name={member.name} online={member.online} /><span>{member.email}</span><small>{member.online ? "en ligne" : "hors ligne"}</small></li>
                ))}
              </ul>
            )}
            {addOpen && (
              <div className="chat-add" data-chat-add>
                {candidates.length === 0 ? <small>Tous les membres de l’équipe sont déjà dans ce groupe.</small> : candidates.map((member) => (
                  <button key={member.userId} onClick={async () => { try { await addConversationMembers(active.id, [member.userId]); setAddOpen(false); } catch (reason) { setError(reason.message); } }}>
                    <Avatar name={member.email} /> {member.email}
                  </button>
                ))}
              </div>
            )}

            {error && <div className="login-error" role="alert">{error}</div>}
            {notice && <div className="team-notice" role="status" data-chat-notice>{notice}</div>}

            <div className="chat-messages" ref={listRef} onScroll={onScroll} data-chat-messages>
              {thread?.hasMore && <button className="chat-older" onClick={() => loadThread(activeId, thread.items[0]?.createdAt).catch((reason) => setError(reason.message))}>Afficher les messages plus anciens</button>}
              {thread && thread.items.length === 0 && <div className="chat-empty">Aucun message pour l’instant. Dites bonjour 👋</div>}
              {rows.map((row) =>
                row.type === "day" ? (
                  <div className="chat-day" key={row.key}>{row.label}</div>
                ) : row.message.kind === "system" ? (
                  <div className="chat-system" key={row.message.id} data-chat-system>{row.message.body}</div>
                ) : (
                  <article key={row.message.id} className={`chat-message ${row.message.senderId === me?.userId ? "mine" : ""} ${row.first ? "first" : ""} ${row.message.pending ? "pending" : ""} ${row.message.failed ? "failed" : ""} ${row.message.mentions?.users?.includes(me?.userId) ? "mentions-me" : ""}`} data-chat-message data-message-id={row.message.id} data-sender={row.message.senderEmail}>
                    {row.first && row.message.senderId !== me?.userId && <Avatar name={row.message.senderName} />}
                    <div className="chat-bubble">
                      {row.first && <header><b>{row.message.senderId === me?.userId ? "Vous" : row.message.senderName}</b>{row.message.senderFormer && <small className="chat-former" data-chat-former> — ancien membre</small>}<time>{time(row.message.createdAt)}</time></header>}
                      {row.message.replyTo && (
                        <blockquote className="chat-quote" data-chat-quote onClick={() => jumpTo(row.message.replyTo.id)}>
                          <b>{row.message.replyTo.senderName}</b>
                          <span>{row.message.replyTo.deleted ? "Message supprimé" : row.message.replyTo.body}</span>
                        </blockquote>
                      )}
                      {row.message.deleted ? (
                        <p className="chat-deleted">Message supprimé</p>
                      ) : (
                        <>
                          {row.message.kind === "cctp" && (
                            <div className="chat-cctp" data-chat-cctp role="button" tabIndex={row.message.pending ? -1 : 0}
                              aria-label={`Ouvrir l’aperçu du CCTP ${row.message.payload.name || ""}`}
                              aria-disabled={row.message.pending ? "true" : undefined}
                              title="Ouvrir l’aperçu du CCTP"
                              onClick={() => openCctp(row.message)}
                              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCctp(row.message); } }}>
                              <FileText size={20} />
                              <span><b>{row.message.payload.name}</b><small>{row.message.payload.chapters} chapitre{row.message.payload.chapters > 1 ? "s" : ""} · ouvrir l’aperçu</small></span>
                              <button type="button" data-chat-cctp-preview disabled={row.message.pending} onClick={(event) => { event.stopPropagation(); openCctp(row.message); }}>Ouvrir</button>
                              {row.message.senderId !== me?.userId && !row.message.pending && <button type="button" data-chat-import onClick={(event) => { event.stopPropagation(); importCctp(row.message); }}>Importer dans mes CCTP</button>}
                            </div>
                          )}
                          {row.message.kind === "file" && (
                            <div className="chat-files" data-chat-files>
                              {(row.message.payload.files || []).map((file) => file.image ? (
                                <a key={file.id} className="chat-image" href={chatFileUrl(file.id)} target="_blank" rel="noreferrer" data-chat-file={file.name} title={`${file.name} · ${sizeLabel(file.size)}`}>
                                  <img src={chatFileUrl(file.id)} alt={file.name} loading="lazy" data-chat-file-image />
                                </a>
                              ) : (
                                <div key={file.id} className="chat-file" data-chat-file={file.name}>
                                  <span className="chat-file-icon"><FileIcon size={18} /><i>{fileExt(file.name).slice(0, 4)}</i></span>
                                  <span className="chat-file-name"><b title={file.name}>{file.name}</b><small>{sizeLabel(file.size)}</small></span>
                                  {fileExt(file.name) === "pdf" && <a href={chatFileUrl(file.id)} target="_blank" rel="noreferrer" data-chat-file-open>Ouvrir</a>}
                                  <a href={chatFileUrl(file.id, { download: true })} download={file.name} data-chat-file-download><Download size={13} /> Télécharger</a>
                                </div>
                              ))}
                            </div>
                          )}
                          {editing?.id === row.message.id ? (
                            <div className="chat-editing" data-chat-editing>
                              <textarea
                                autoFocus value={editing.text} rows={2} maxLength={4000} aria-label="Modifier votre message" data-chat-edit-input
                                onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); saveEdit(); }
                                  else if (event.key === "Escape") setEditing(null);
                                }}
                              />
                              <div><button type="button" data-chat-edit-save onClick={saveEdit}>Enregistrer</button><button type="button" data-chat-edit-cancel onClick={() => setEditing(null)}>Annuler</button><small>Entrée pour enregistrer · Échap pour annuler</small></div>
                            </div>
                          ) : (
                            row.message.body && <p>{renderBody(row.message.body, names, meName)}{row.message.editedAt && <small className="chat-edited" data-chat-edited title={`Modifié ${clock(row.message.editedAt)}`}> (modifié)</small>}</p>
                          )}
                        </>
                      )}
                      {row.message.reactions?.length > 0 && !row.message.deleted && (
                        <div className="chat-reactions" data-chat-reactions>
                          {row.message.reactions.map((reaction) => {
                            const mineReacted = reaction.users.some((item) => item.userId === me?.userId);
                            const who = reaction.users.map((item) => (item.userId === me?.userId ? "Vous" : item.name)).join(", ");
                            return (
                              <button key={reaction.emoji} type="button" className={mineReacted ? "mine" : ""} data-chat-reaction={reaction.emoji} data-count={reaction.count} aria-pressed={mineReacted}
                                title={`${who} ${reaction.users.length > 1 ? "ont" : "a"} réagi avec ${reaction.emoji}`} onClick={() => react(row.message, reaction.emoji)}>
                                <span>{reaction.emoji}</span><b>{reaction.count}</b>
                              </button>
                            );
                          })}
                          <button type="button" className="chat-who" data-chat-reactions-who aria-expanded={whoFor === row.message.id} title="Voir qui a réagi" onClick={() => setWhoFor(whoFor === row.message.id ? null : row.message.id)}>Qui ?</button>
                          {whoFor === row.message.id && (
                            <ul className="chat-reactions-detail" data-chat-reactions-detail>
                              {row.message.reactions.map((reaction) => (
                                <li key={reaction.emoji}><span>{reaction.emoji}</span><b>{reaction.users.map((item) => (item.userId === me?.userId ? "Vous" : item.name)).join(", ")}</b></li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {emojiFor === row.message.id && (
                        <div className="chat-emoji-picker" data-chat-emoji-picker role="menu" aria-label="Réagir avec une émoticône">
                          {EMOJIS.map((emoji) => <button key={emoji} type="button" role="menuitem" data-chat-emoji={emoji} onClick={() => react(row.message, emoji)}>{emoji}</button>)}
                        </div>
                      )}
                      {row.message.id === lastMine?.id && active && (() => {
                        const readers = seenBy(row.message);
                        const others = active.members.filter((member) => member.userId !== me?.userId);
                        const label = readers.length === 0 ? "Envoyé" : readers.length === others.length ? "Vu par tous" : `Vu par ${readers.slice(0, 3).map((member) => member.name).join(", ")}${readers.length > 3 ? ` +${readers.length - 3}` : ""}`;
                        return (
                          <div className="chat-seen" data-chat-seen={readers.length === 0 ? "none" : readers.length === others.length ? "all" : "some"}>
                            <button type="button" onClick={() => toggleSeen(row.message.id)} aria-expanded={seenOpen === row.message.id}>{label}</button>
                            {seenOpen === row.message.id && (
                              <ul data-chat-seen-details>
                                {others.map((member) => {
                                  // Heure exacte à laquelle CE message a été vu (et non la dernière ouverture de la discussion).
                                  const exact = seenDetail[row.message.id]?.find((item) => item.userId === member.userId)?.seenAt;
                                  const seen = readers.some((reader) => reader.userId === member.userId);
                                  return <li key={member.userId}><span>{member.name}</span><small>{seen ? (exact ? `vu à ${clock(exact)}` : seenDetail[row.message.id] ? "vu" : "…") : "pas encore vu"}</small></li>;
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                      {row.message.pending && <small className="chat-status">Envoi…</small>}
                      {row.message.failed && <small className="chat-status err">Non envoyé : {row.message.failed} <button onClick={() => retry(row.message)}>Réessayer</button></small>}
                      {confirmDelete === row.message.id && (
                        <div className="chat-confirm" data-chat-delete-confirm role="alertdialog" aria-label="Confirmer la suppression">
                          <span>Supprimer ce message pour tout le monde ?</span>
                          <button type="button" data-chat-delete-yes onClick={() => confirmedDelete(row.message.id)}>Supprimer</button>
                          <button type="button" data-chat-delete-no onClick={() => setConfirmDelete(null)}>Annuler</button>
                        </div>
                      )}
                      {!row.message.deleted && !row.message.pending && !row.message.failed && row.message.kind !== "system" && (
                        <button className="chat-react" data-chat-react title="Réagir avec une émoticône" aria-label="Réagir avec une émoticône" onClick={() => setEmojiFor(emojiFor === row.message.id ? null : row.message.id)}><SmilePlus size={12} /></button>
                      )}
                      {!row.message.deleted && !row.message.pending && !row.message.failed && editing?.id !== row.message.id && (
                        <button className="chat-reply" data-chat-reply title="Répondre à ce message" aria-label="Répondre à ce message" onClick={() => startReply(row.message)}><CornerUpLeft size={12} /></button>
                      )}
                      {!row.message.deleted && !row.message.pending && !row.message.failed && row.message.senderId === me?.userId && row.message.kind !== "system" && editing?.id !== row.message.id && (
                        <button className="chat-edit" data-chat-edit title="Modifier ce message" aria-label="Modifier ce message" onClick={() => startEdit(row.message)}><Pencil size={12} /></button>
                      )}
                      {!row.message.deleted && !row.message.pending && editing?.id !== row.message.id && (row.message.senderId === me?.userId || isAdmin) && (
                        <button className="chat-delete" data-chat-delete title="Supprimer ce message" aria-label="Supprimer ce message" onClick={() => { setEditing(null); setConfirmDelete(row.message.id); }}><Trash2 size={12} /></button>
                      )}
                    </div>
                  </article>
                ),
              )}
            </div>

            <div className="chat-typing" data-chat-typing aria-live="polite">{typers.length > 0 && `${typers.join(", ")} ${typers.length > 1 ? "écrivent" : "écrit"}…`}</div>

            {pendingFiles.length > 0 && (
              <div className="chat-staged" data-chat-staged-list>
                {pendingFiles.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="chat-staged-item" data-chat-staged={file.name}>
                    {file.type.startsWith("image/") ? <img src={URL.createObjectURL(file)} alt="" /> : <FileIcon size={15} />}
                    <b title={file.name}>{file.name}</b><small>{sizeLabel(file.size)}</small>
                    <button type="button" aria-label={`Retirer ${file.name}`} data-chat-staged-remove onClick={() => setPendingFiles((current) => current.filter((_, i) => i !== index))}><X size={12} /></button>
                  </span>
                ))}
                {uploading && <small className="chat-uploading" data-chat-uploading>Envoi en cours…</small>}
              </div>
            )}
            {replyTo && (
              <div className="chat-replying" data-chat-replying>
                <CornerUpLeft size={14} />
                <span><b>Réponse à {replyTo.senderId === me?.userId ? "vous-même" : replyTo.senderName}</b><small>{replyTo.body || (replyTo.kind === "cctp" ? `📎 CCTP « ${replyTo.payload?.name || ""} »` : replyTo.kind === "file" ? `📎 ${replyTo.payload?.files?.[0]?.name || "fichier"}` : "")}</small></span>
                <button type="button" onClick={() => setReplyTo(null)} aria-label="Annuler la réponse" data-chat-reply-cancel><X size={14} /></button>
              </div>
            )}
            {mention && mentionOptions.length > 0 && (
              <ul className="chat-mention-menu" data-chat-mention-menu role="listbox" aria-label="Mentionner quelqu’un">
                {mentionOptions.map((option, index) => (
                  <li key={option.name} role="option" aria-selected={index === mentionIndex} className={index === mentionIndex ? "active" : ""} data-chat-mention-option={option.name}
                    onMouseDown={(event) => { event.preventDefault(); pickMention(option); }} onMouseEnter={() => setMentionIndex(index)}>
                    {option.special ? <span className="chat-icon"><Users size={14} /></span> : <Avatar name={option.name} online={option.online} />}
                    <span><b>@{option.name}</b><small>{option.label}{option.hint ? ` · ${option.hint}` : ""}</small></span>
                  </li>
                ))}
              </ul>
            )}
            <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <div className="chat-picker">
                <button type="button" data-chat-attach-open title="Joindre un fichier ou un CCTP" aria-label="Joindre un fichier ou un CCTP" onClick={() => { setAttachMode("menu"); setPickerOpen((value) => !value); }}><Paperclip size={17} /></button>
                <input ref={fileInput} type="file" multiple accept={FILE_ACCEPT} hidden data-chat-file-input onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
                {pickerOpen && (
                  <div className="chat-picker-menu" data-chat-cctp-menu>
                    <header><b>{attachMode === "cctp" ? "Envoyer un de mes CCTP" : "Joindre"}</b><button type="button" onClick={() => setPickerOpen(false)} aria-label="Fermer"><X size={14} /></button></header>
                    {attachMode === "menu" ? (
                      <>
                        <button type="button" data-chat-attach-file onClick={() => fileInput.current?.click()}><FileIcon size={14} /> Fichier ou image<small>PDF, Word, Excel, images, plans… (25 Mo max)</small></button>
                        <button type="button" data-chat-attach-cctp onClick={() => setAttachMode("cctp")}><FileText size={14} /> Un de mes CCTP<small>le destinataire pourra l’ouvrir et l’importer</small></button>
                      </>
                    ) : myProjects.length === 0 ? <small>Vous n’avez pas encore de CCTP.</small> : myProjects.map((item) => (
                      <button type="button" key={item.id} data-chat-cctp-pick={item.name} onClick={() => submit(item.id)}><FileText size={14} /> {item.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <textarea
                onPaste={(event) => { if (event.clipboardData?.files?.length) { event.preventDefault(); addFiles(event.clipboardData.files); } }}
                ref={inputRef} data-chat-input rows={1} value={draft} placeholder={active.kind === "direct" ? `Écrire à ${titleOf(active, me?.userId)}…` : `Écrire à ${active.title}… (@ pour mentionner)`} aria-label="Votre message" maxLength={4000}
                onChange={(event) => onType(event.target.value, event.target.selectionStart)}
                onKeyDown={(event) => {
                  if (mention && mentionOptions.length > 0) {
                    if (event.key === "ArrowDown") { event.preventDefault(); return setMentionIndex((index) => (index + 1) % mentionOptions.length); }
                    if (event.key === "ArrowUp") { event.preventDefault(); return setMentionIndex((index) => (index - 1 + mentionOptions.length) % mentionOptions.length); }
                    if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); return pickMention(mentionOptions[mentionIndex]); }
                    if (event.key === "Escape") { event.preventDefault(); return setMention(null); }
                  }
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
                  else if (event.key === "Escape" && replyTo) setReplyTo(null);
                }}
              />
              <button className="chat-send" data-chat-send disabled={uploading || (!draft.trim() && pendingFiles.length === 0)} aria-label="Envoyer"><Send size={16} /></button>
            </form>
          </>
        )}
      </div>

      {previewMessage && (
        <SharedCctpPreview
          message={previewMessage}
          onClose={() => setPreviewMessage(null)}
          onImport={async (message) => { await importCctp(message); setPreviewMessage(null); }}
          onOpenOwn={(id) => { setPreviewMessage(null); onOpenProject?.(id); }}
        />
      )}

      {groupDialog && (
        <div className="export-backdrop" role="dialog" aria-modal="true" data-chat-group-dialog>
          <form className="export-dialog" onSubmit={async (event) => {
            event.preventDefault();
            try {
              const created = await createConversation(groupDialog.title, groupDialog.ids);
              setGroupDialog(null);
              await loadConversations();
              openConversation(created.id);
            } catch (reason) {
              setGroupDialog({ ...groupDialog, error: reason.message });
            }
          }}>
            <header><h2>Nouveau groupe</h2><button type="button" className="export-close" onClick={() => setGroupDialog(null)} aria-label="Fermer"><X size={18} /></button></header>
            <label>Nom du groupe<input value={groupDialog.title} maxLength={120} placeholder="Ex. Chantier Lyon" onChange={(event) => setGroupDialog({ ...groupDialog, title: event.target.value })} data-chat-group-title required autoFocus /></label>
            <fieldset>
              <legend>Participants</legend>
              {others.length === 0 && <small>Aucun autre membre dans l’équipe pour l’instant.</small>}
              {others.map((member) => (
                <label key={member.userId}>
                  <input type="checkbox" checked={groupDialog.ids.includes(member.userId)} data-chat-group-member={member.email}
                    onChange={(event) => setGroupDialog({ ...groupDialog, ids: event.target.checked ? [...groupDialog.ids, member.userId] : groupDialog.ids.filter((id) => id !== member.userId) })} />
                  {member.email}
                </label>
              ))}
            </fieldset>
            {groupDialog.error && <div className="login-error">{groupDialog.error}</div>}
            <footer><span /><button className="export-submit" data-chat-group-create disabled={!groupDialog.title.trim() || groupDialog.ids.length === 0}>Créer le groupe</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => (seen.has(item.id) ? false : seen.add(item.id))).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function sortConversations(items) {
  return [...items].sort((a, b) => (a.kind === "general" ? -1 : b.kind === "general" ? 1 : new Date(b.lastMessageAt) - new Date(a.lastMessageAt)));
}

function clearTyping(state, conversationId, userId) {
  if (!state[conversationId]?.[userId]) return state;
  const { [userId]: _removed, ...rest } = state[conversationId];
  return { ...state, [conversationId]: rest };
}

/** Intercale les séparateurs de jour et regroupe les messages successifs d'un même auteur (moins de 5 min). */
function buildRows(items) {
  const rows = [];
  let previous = null;
  for (const message of items) {
    const label = day(message.createdAt);
    if (!previous || day(previous.createdAt) !== label) rows.push({ type: "day", key: `day-${label}`, label });
    const first = !previous || previous.kind === "system" || message.kind === "system" || previous.senderId !== message.senderId || new Date(message.createdAt) - new Date(previous.createdAt) > 5 * 60 * 1000 || day(previous.createdAt) !== label;
    rows.push({ type: "message", message, first });
    previous = message;
  }
  return rows;
}
