import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listWorkspaces, switchWorkspace } from "../api/client";

const EMPTY = { spaces: [], active: null, role: null, isAdmin: false, isAgency: false, canWrite: true, loading: true, reload: () => {}, switchTo: async () => {} };
const WorkspaceContext = createContext(EMPTY);

/** Espaces de travail de la personne (agences + espace personnel) et celui qui est affiché : toute l'application est filtrée par lui. */
export function WorkspaceProvider({ user, realtime, children }) {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const email = user?.email;
  const reload = useCallback(async () => {
    if (!email) return;
    try { setSpaces(await listWorkspaces()); } catch { setSpaces([]); } finally { setLoading(false); }
  }, [email]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => realtime?.subscribe?.((event) => { if (event?.type === "team_changed") reload(); }), [realtime?.subscribe, reload]);
  // Changer d'espace recharge l'application : aucune requête métier ne doit pouvoir mélanger les données de deux espaces.
  const switchTo = useCallback(async (workspaceId) => {
    await switchWorkspace(workspaceId);
    window.location.reload();
  }, []);
  const value = useMemo(() => {
    const active = spaces.find((item) => item.active) || null;
    return { spaces, active, role: active?.role || null, isAdmin: active?.role === "admin", isAgency: active?.type === "ORGANIZATION", canWrite: active?.role !== "viewer", loading, reload, switchTo };
  }, [spaces, loading, reload, switchTo]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspaces = () => useContext(WorkspaceContext);
