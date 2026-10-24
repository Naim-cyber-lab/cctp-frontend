/** Barre d'actions sur un passage sélectionné : « Similaires | Commenter | ••• » forment UNE seule barre compacte.
 *  Chaque composant pose son bouton dans son emplacement (largeur fixe), côte à côte, au-dessus de la sélection si la place le permet. */
const WIDTHS = [138, 122, 42];
const TOTAL = WIDTHS.reduce((sum, value) => sum + value, 0);

export function barPosition(rect, slot) {
  const above = rect.top - 46 >= 8;
  const top = Math.max(8, Math.min(window.innerHeight - 46, above ? rect.top - 46 : rect.bottom + 8)); // toujours visible, même si la sélection dépasse de l'écran
  const left = Math.max(8, Math.min(window.innerWidth - TOTAL - 8, rect.left)) + WIDTHS.slice(0, slot).reduce((sum, value) => sum + value, 0);
  return { top, left };
}
