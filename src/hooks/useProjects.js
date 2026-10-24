import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiFetch,
  createFolder,
  deleteFolder,
  importCctp,
  listFolders,
  renameFolder,
  uploadReferenceCctp,
} from "../api/client";

const byLastUpdate = (a, b) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
const latestFirst = (items) => [...items].sort(byLastUpdate);

export function useProjects(user) {
  const [projects, setProjects] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Affichage optimiste : l'écran change tout de suite, la demande part en même temps ; si le serveur refuse, on revient en arrière et on le dit.
  const projectsRef = useRef([]);
  projectsRef.current = projects;
  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let remote = await apiFetch("/cctps?summary=true");
      const migrated = localStorage.getItem("calepin-api-migrated");
      if (!remote.length && !migrated) {
        const local = JSON.parse(
          localStorage.getItem("calepin-projects") || "[]",
        );
        for (const item of local) {
          await apiFetch("/cctps", {
            method: "POST",
            body: JSON.stringify({
              name: item.name,
              selected: item.selected,
              sections: item.sections || {},
            }),
          });
        }
        localStorage.setItem("calepin-api-migrated", "1");
        if (local.length) remote = await apiFetch("/cctps?summary=true");
      }
      setProjects(latestFirst(remote));
      setFolders(await listFolders().catch(() => []));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);
  // Rafraîchissement discret de la liste (nouveau CCTP partagé, renommage par un collègue…) : sans écran de chargement et
  // sans écraser un CCTP déjà ouvert (ses chapitres complets sont conservés).
  const refreshQuiet = useCallback(async () => {
    if (!user) return;
    try {
      const remote = await apiFetch("/cctps?summary=true");
      setProjects((current) => {
        const known = new Map(current.map((item) => [item.id, item]));
        return latestFirst(remote.map((item) => {
          const have = known.get(item.id);
          return have && !have.summaryOnly ? { ...item, sections: have.sections, evaluations: have.evaluations, summaryOnly: false } : item;
        }));
      });
    } catch { /* la prochaine tentative réessaiera */ }
  }, [user]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const createProject = async (name, selected, cover = {}) => {
    const project = await apiFetch("/cctps", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        selected,
        sections: {},
        cover,
      }),
    });
    setProjects((items) => latestFirst([project, ...items]));
    return project;
  };
  const importProject = async (file, name = "") => {
    const project = await importCctp(file, name);
    setProjects((items) => latestFirst([project, ...items]));
    uploadReferenceCctp(file).catch(() => {});
    return project;
  };
  const loadProject = async (id) => {
    const project = await apiFetch(`/cctps/${id}`);
    // première consultation : le « Nouveau » disparaît (le serveur l'enregistre aussi)
    const opened = project.isNew ? { ...project, isNew: false } : project;
    setProjects((items) =>
      items.map((item) => (item.id === id ? opened : item)),
    );
    return opened;
  };
  // Changements simples (nom, archivage, dossier, statut) : sûrs à afficher avant la réponse du serveur. Les enregistrements de chapitres restent « confirmés d'abord ».
  const SIMPLE_CHANGES = ["name", "archived", "folderId", "reviewStatus"];
  const optimisticChange = (id, changes) => {
    const before = projectsRef.current.find((item) => item.id === id);
    if (!before || !Object.keys(changes).every((key) => SIMPLE_CHANGES.includes(key))) return null;
    const previous = Object.fromEntries(Object.keys(changes).map((key) => [key, before[key]]));
    setProjects((items) => items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    return () => setProjects((items) => items.map((item) => (item.id === id ? { ...item, ...previous } : item)));
  };
  const updateProject = async (id, changes) => {
    const undo = optimisticChange(id, changes);
    try {
      const project = await apiFetch(`/cctps/${id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setProjects((items) =>
        latestFirst(items.map((p) => (p.id === id ? project : p))),
      );
      return project;
    } catch (err) {
      if (undo) { undo(); setError(err.message); }
      throw err;
    }
  };
  const deleteProject = async (id) => {
    const index = projectsRef.current.findIndex((item) => item.id === id);
    const removed = projectsRef.current[index];
    setProjects((items) => items.filter((project) => project.id !== id)); // la carte disparaît tout de suite
    apiFetch(`/cctps/${id}`, { method: "DELETE" }).catch((err) => {
      if (removed) setProjects((items) => (items.some((item) => item.id === id) ? items : latestFirst([removed, ...items])));
      setError(`Suppression impossible : ${err.message}`);
    });
  };
  const addProject = (project) =>
    setProjects((items) =>
      latestFirst([project, ...items.filter((item) => item.id !== project.id)]),
    );
  const archiveProject = async (id, archived = true) =>
    updateProject(id, { archived }).catch(() => null); // l'erreur est déjà affichée et le changement annulé
  const sortFolders = (items) =>
    [...items].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const addFolder = async (name) => {
    const folder = await createFolder(name);
    setFolders((items) => sortFolders([...items, folder]));
    return folder;
  };
  const editFolder = async (id, name) => {
    const folder = await renameFolder(id, name);
    setFolders((items) =>
      sortFolders(items.map((item) => (item.id === id ? folder : item))),
    );
    return folder;
  };
  const removeFolder = async (id) => {
    const folder = folders.find((item) => item.id === id);
    const moved = projectsRef.current.filter((item) => item.folderId === id).map((item) => item.id);
    setFolders((items) => items.filter((item) => item.id !== id)); // le dossier disparaît tout de suite
    setProjects((items) =>
      items.map((item) =>
        item.folderId === id ? { ...item, folderId: null } : item,
      ),
    );
    deleteFolder(id).catch((err) => {
      if (folder) setFolders((items) => sortFolders([...items.filter((item) => item.id !== id), folder]));
      setProjects((items) => items.map((item) => (moved.includes(item.id) ? { ...item, folderId: id } : item)));
      setError(`Suppression du dossier impossible : ${err.message}`);
    });
  };
  // Rangement : ne passe pas par updateProject (qui renvoie le CCTP complet et remplacerait le résumé de la liste).
  const patchProject = async (id, changes) => {
    const undo = optimisticChange(id, changes); // le CCTP change de dossier / de statut sous le doigt, sans attendre
    try {
      // Un CCTP partagé avec moi se range dans MON dossier (classement personnel) : route dédiée
      const mine = projectsRef.current.find((item) => item.id === id);
      const ownFolderOnly = mine && mine.accessRole && mine.accessRole !== "owner" && Object.keys(changes).length === 1 && "folderId" in changes;
      const project = await apiFetch(ownFolderOnly ? `/cctps/${id}/my-folder` : `/cctps/${id}`, {
        method: ownFolderOnly ? "PUT" : "PATCH",
        body: JSON.stringify(changes),
      });
      setProjects((items) =>
        items.map((item) => (item.id === id ? { ...item, ...project } : item)),
      );
      return project;
    } catch (err) {
      if (undo) undo();
      setError(err.message);
      return null;
    }
  };
  const saveSection = async (projectId, chapterId, section) => {
    const project = await apiFetch(
      `/cctps/${projectId}/sections/${chapterId}`,
      { method: "PUT", body: JSON.stringify({ section }) },
    );
    setProjects((items) =>
      latestFirst(items.map((p) => (p.id === projectId ? project : p))),
    );
    return project;
  };
  const getProgress = (project) =>
    project?.selected.length
      ? Math.round(
          (Math.min(
            project.completedCount ??
              Object.keys(project.sections).filter((id) =>
                project.selected.includes(id),
              ).length,
            project.selected.length,
          ) /
            project.selected.length) *
            100,
        )
      : 0;
  return {
    projects,
    folders,
    addFolder,
    editFolder,
    removeFolder,
    patchProject,
    loading,
    error,
    createProject,
    importProject,
    loadProject,
    updateProject,
    deleteProject,
    archiveProject,
    saveSection,
    getProgress,
    refresh,
    refreshQuiet,
    addProject,
  };
}
