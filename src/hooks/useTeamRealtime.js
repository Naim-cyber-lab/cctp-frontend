import { useCallback, useEffect, useRef, useState } from 'react';
import { chatSocketUrl, getOrganization, listConversations } from '../api/client';

// Connexion WebSocket unique de l'application au chat d'équipe : reconnexion automatique (délai croissant),
// diffusion des événements aux écrans qui s'y abonnent, et pastille « à traiter » de l'onglet Profil
// (messages non lus + demandes d'adhésion en attente pour un administrateur).
const MIN_DELAY = 1000;
const MAX_DELAY = 15000;

export function useTeamRealtime(user, options = {}) {
  const [connected, setConnected] = useState(false);
  const [badge, setBadge] = useState(0);
  const [libraryPending, setLibraryPending] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [toasts, setToasts] = useState([]); // notifications de mention affichées à l'écran
  const viewing = useRef(null); // discussion actuellement sous les yeux de l'utilisateur
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const setViewing = useCallback((conversationId) => {
    viewing.current = conversationId;
  }, []);
  const dismissToast = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);
  const listeners = useRef(new Set());
  const socketRef = useRef(null);
  const badgeTimer = useRef(null);

  const subscribe = useCallback((handler) => {
    listeners.current.add(handler);
    return () => listeners.current.delete(handler);
  }, []);

  const send = useCallback((payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const badgeRunning = useRef(false);
  const badgeAgain = useRef(false);
  const computeBadge = useCallback(async () => {
    if (badgeRunning.current) {
      badgeAgain.current = true; // un calcul est en cours : on en refait un après, avec l'état à jour
      return;
    }
    badgeRunning.current = true;
    try {
      const team = await getOrganization();
      if (!team.organization) { setBadge(0); setChatUnread(0); setLibraryPending(0); }
      else {
        const conversations = await listConversations();
        const unreadMessages = conversations.reduce((sum, item) => sum + (item.unread || 0), 0);
        setChatUnread(unreadMessages);
        setLibraryPending(team.pendingQuestionChanges || 0);
        setBadge(unreadMessages + (team.pendingRequests || 0) + (team.pendingQuestionChanges || 0));
      }
    } catch {
      /* la pastille est un confort : pas d'erreur affichée */
    } finally {
      badgeRunning.current = false;
      if (badgeAgain.current) {
        badgeAgain.current = false;
        computeBadge();
      }
    }
  }, []);
  const refreshBadge = useCallback(() => {
    clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(computeBadge, 250);
  }, [computeBadge]);

  useEffect(() => {
    if (!user) return undefined;
    let stopped = false;
    let delay = MIN_DELAY;
    let retry = null;
    let heartbeat = null;

    const emit = (event) => listeners.current.forEach((handler) => handler(event));

    // Mention reçue : bulle dans l'application (sauf si on regarde déjà cette discussion) ; en arrière-plan, notification du navigateur.
    const announceMention = (event) => {
      const seen = event.conversationId === viewing.current && !document.hidden;
      if (seen) return;
      setToasts((items) => [...items.filter((item) => item.id !== event.messageId), { ...event, id: event.messageId }].slice(-4));
      setTimeout(() => setToasts((items) => items.filter((item) => item.id !== event.messageId)), 10000);
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const label = event.scope === 'all' ? 'a mentionné toute l’équipe' : event.scope === 'here' ? 'a mentionné les membres en ligne' : 'vous a mentionné';
        const notification = new Notification(`${event.senderName} ${label}`, { body: event.snippet, tag: event.messageId });
        notification.onclick = () => {
          window.focus();
          optionsRef.current.onOpenChat?.(event.conversationId);
          notification.close();
        };
      }
    };

    const open = () => {
      if (stopped) return;
      const socket = new WebSocket(chatSocketUrl());
      socketRef.current = socket;
      socket.onopen = () => {
        delay = MIN_DELAY;
        setConnected(true);
        clearInterval(heartbeat);
        heartbeat = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('{"type":"ping"}'), 25000);
        emit({ type: '_open' });
        refreshBadge();
      };
      socket.onmessage = (message) => {
        let event;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }
        emit(event);
        if (event.type === 'mention') announceMention(event);
        if (['message', 'unread', 'team_changed', 'join_request', 'conversation', 'message_deleted'].includes(event.type)) refreshBadge();
      };
      socket.onclose = (event) => {
        clearInterval(heartbeat);
        setConnected(false);
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped || event.code === 4401) return; // 4401 : session expirée, inutile d'insister
        retry = setTimeout(open, delay);
        delay = Math.min(delay * 2, MAX_DELAY);
      };
      socket.onerror = () => socket.close();
    };
    open();

    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(badgeTimer.current);
      clearInterval(heartbeat);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user?.id, refreshBadge]);

  return { connected, badge, chatUnread, libraryPending, subscribe, send, refreshBadge, toasts, dismissToast, setViewing };
}
