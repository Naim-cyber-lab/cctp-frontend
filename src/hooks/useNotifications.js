import { useCallback, useEffect, useState } from "react";
import { listNotifications, markNotificationsRead } from "../api/client";

/** Notifications de commentaires : chargées à la connexion, complétées en direct (WebSocket d'équipe), avec bulle à l'arrivée. */
export function useNotifications(user, realtime) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const refresh = useCallback(async () => {
    if (!user) return;
    try { const data = await listNotifications(); setItems(data.items); setUnread(data.unread); } catch { /* la cloche ne doit jamais bloquer le site */ }
  }, [user]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!realtime?.subscribe) return undefined;
    return realtime.subscribe((event) => {
      if (event?.type === "_open") refresh();
      if (event?.type !== "notification" || !event.notification) return;
      const notification = event.notification;
      setItems((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50));
      setUnread((count) => count + 1);
      setToasts((current) => [...current, notification]);
      setTimeout(() => setToasts((current) => current.filter((item) => item.id !== notification.id)), 12000);
    });
  }, [realtime?.subscribe, refresh]);
  const markRead = useCallback(async (ids) => {
    setItems((current) => current.map((item) => (!ids || ids.includes(item.id) ? { ...item, read: true } : item)));
    setUnread((count) => (ids ? Math.max(0, count - ids.length) : 0));
    try { await markNotificationsRead(ids); } catch { /* sera resynchronisé au prochain chargement */ }
  }, []);
  const dismissToast = useCallback((id) => setToasts((current) => current.filter((item) => item.id !== id)), []);
  return { items, unread, toasts, markRead, dismissToast, refresh };
}
