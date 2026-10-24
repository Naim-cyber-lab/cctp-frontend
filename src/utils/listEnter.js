const isEmpty = (node) => !String(node.textContent || "").replace(/[​\s]/g, "");

/** « Entrée » dans une liste (numéros, puces, cases) encore entièrement vide : la touche ajoute l'élément suivant (1. → 2.)
 * au lieu de quitter la liste, ce qui faisait disparaître le « 1. » que l'on venait d'ajouter. Dès qu'un élément contient du texte,
 * le comportement habituel est conservé (Entrée sur un élément vide termine la liste). Retourne true si la touche a été traitée. */
export function keepListOnEnter(event, onChange) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return false;
  const anchor = selection.anchorNode;
  const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
  const item = element?.closest?.("li");
  const list = item?.parentElement;
  if (!item || !list || !/^(UL|OL)$/.test(list.tagName)) return false;
  if (![...list.children].every(isEmpty)) return false;
  event.preventDefault();
  const next = document.createElement("li");
  next.appendChild(document.createElement("br"));
  item.after(next);
  const range = document.createRange();
  range.setStart(next, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  onChange?.(event);
  return true;
}
