// Projets : les derniers consultés remontent en haut de la liste (et non les derniers créés). Mémorisé dans le navigateur de l'utilisateur ; sans effet si le stockage est indisponible.
const KEY = "calepin.projects.opened";

export function readOpened() {
  try { const value = JSON.parse(window.localStorage.getItem(KEY) || "{}"); return value && typeof value === "object" ? value : {}; } catch { return {}; }
}

export function markOpened(projectId) {
  if (!projectId) return;
  try {
    const opened = readOpened();
    opened[projectId] = Date.now();
    const recent = Object.entries(opened).sort((a, b) => b[1] - a[1]).slice(0, 200);   // borné : pas de croissance infinie
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* stockage indisponible : l'ordre reste celui du serveur */ }
}

/** Tri stable : projets déjà consultés d'abord (le plus récent en tête), puis les autres dans l'ordre d'origine. */
export function byLastOpened(projects, opened = readOpened()) {
  return projects.map((project, index) => ({ project, index })).sort((a, b) => (opened[b.project.id] || 0) - (opened[a.project.id] || 0) || a.index - b.index).map((entry) => entry.project);
}
