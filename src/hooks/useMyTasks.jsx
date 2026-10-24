import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listOrganizationTasks } from "../api/client";

const EMPTY = { tasks: [], count: 0, forCctp: () => 0, forLot: () => 0, refresh: () => {} };
const MyTasksContext = createContext(EMPTY);

/** Tâches qui me sont assignées et ne sont pas terminées : alimente les pastilles rouges (bouton Tâches d'un CCTP, lots, Profil › Mon équipe). */
export function MyTasksProvider({ user, realtime, children }) {
  const [tasks, setTasks] = useState([]);
  const email = String(user?.email || "").toLowerCase();
  const refresh = useCallback(async () => {
    if (!email) { setTasks([]); return; }
    try {
      const rows = await listOrganizationTasks();
      setTasks(rows.filter((task) => String(task.assigneeEmail || "").toLowerCase() === email && task.status !== "done"));
    } catch {
      setTasks([]); // pas d'équipe, ou service indisponible : aucune pastille
    }
  }, [email]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const unsubscribe = realtime?.subscribe?.((event) => { if (event?.type === "team_task_changed" || event?.type === "_open") refresh(); });
    const onVisible = () => { if (document.visibilityState !== "hidden") refresh(); };
    window.addEventListener("cctp:tasks-changed", refresh);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(onVisible, 60000);
    return () => { unsubscribe?.(); window.removeEventListener("cctp:tasks-changed", refresh); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); clearInterval(timer); };
  }, [realtime?.subscribe, refresh]);

  const value = useMemo(() => ({
    tasks, count: tasks.length, refresh,
    forCctp: (cctpId) => tasks.filter((task) => task.cctpId === cctpId).length,
    forLot: (cctpId, chapterId) => tasks.filter((task) => task.cctpId === cctpId && task.chapterId === chapterId).length,
  }), [tasks, refresh]);
  return <MyTasksContext.Provider value={value}>{children}</MyTasksContext.Provider>;
}

export const useMyTasks = () => useContext(MyTasksContext);
