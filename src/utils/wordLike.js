// Gestes « comme Word » dans l'éditeur du CCTP : retrait, styles de titre, déplacement dans les tableaux.
// Les changements faits directement dans le DOM (classe, marge) doivent ensuite émettre un événement « input » pour être synchronisés en direct.

const elementOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement);

/** Paragraphe (enfant direct du corps du chapitre) qui contient ce point de la sélection. */
export function topBlock(node) {
  let element = elementOf(node);
  const body = element?.closest?.(".rich-chapter-body");
  if (!body) return null;
  while (element && element.parentElement !== body) element = element.parentElement;
  return element && element !== body ? element : null;
}

export const INDENT_STEP = 36; // px (≈ 1 cm)
export const INDENT_MAX = 360;

/** Augmente (+1) ou diminue (−1) le retrait d'un paragraphe ; retourne le nouveau retrait en px. */
export function indentBlock(block, direction) {
  const current = parseInt(block.style.marginLeft, 10) || 0;
  const next = Math.max(0, Math.min(INDENT_MAX, current + direction * INDENT_STEP));
  if (next) block.style.marginLeft = `${next}px`;
  else block.style.removeProperty("margin-left");
  if (!block.getAttribute("style")) block.removeAttribute("style");
  return next;
}

export const STYLE_DEPTH = { h1: 1, h2: 2, h3: 3 };
export const STYLE_LABELS = { p: "Normal", h1: "Titre 1", h2: "Titre 2", h3: "Titre 3" };
export const styleOf = (block) => (STYLE_DEPTH[block?.getAttribute?.("data-doc-style")] ? block.getAttribute("data-doc-style") : "p");

/** Cellule suivante / précédente d'un tableau (Tab / Maj+Tab). En fin de tableau, Tab ajoute une ligne comme dans Word. */
export function moveInTable(cell, backwards) {
  const table = cell.closest("table");
  const cells = [...table.querySelectorAll("th, td")].filter((item) => item.closest("table") === table);
  const index = cells.indexOf(cell);
  let target = cells[index + (backwards ? -1 : 1)];
  let added = false;
  if (!target && !backwards) {
    const row = cell.closest("tr");
    const clone = row.cloneNode(true);
    clone.querySelectorAll("th, td").forEach((item) => { item.innerHTML = "<br>"; });
    row.after(clone);
    target = clone.querySelector("th, td");
    added = true;
  }
  if (!target) return { target: null, added };
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return { target, added };
}
