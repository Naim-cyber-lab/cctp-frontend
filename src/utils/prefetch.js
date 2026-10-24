import { prefetchGet } from "../api/client";

/** Prépare l'ouverture de l'aperçu pendant que la personne est encore sur la page précédente : le code de la page (déjà demandé au survol du bouton)
 *  et les données dont elle a besoin partent en parallèle, au lieu d'attendre que la page soit chargée pour les demander une à une. */
let editorCode = null;
export const prefetchEditorCode = () => { if (!editorCode) editorCode = import("../pages/DocumentEditorPage").catch(() => { editorCode = null; }); return editorCode; };

export function prefetchPreview(project) {
  if (!project?.id) return;
  prefetchEditorCode();
  prefetchGet(`/cctps/${project.id}/access`);
  prefetchGet("/cctps/cover-suggestions");
  prefetchGet("/organization");
  if (project.shared) {
    prefetchGet(`/cctps/${project.id}/chat`);
    prefetchGet(`/cctps/${project.id}/chat/read`);
    prefetchGet(`/cctps/${project.id}/voice`);
  }
}
