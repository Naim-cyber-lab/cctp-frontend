const normal = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
const HIGHLIGHT = "ai-change";
const BLOCKS = "p,div,li,h1,h2,h3,h4,h5,h6,td";

/** Lignes du nouveau texte qui n'existaient pas dans l'ancien (ajoutées ou modifiées) ; chaque ligne de l'ancien texte ne « consomme » qu'une ligne du nouveau. */
export function changedLines(before, after) {
  const available = new Map();
  for (const line of String(before || "").split("\n").map(normal).filter(Boolean)) available.set(line, (available.get(line) || 0) + 1);
  const changed = new Set();
  for (const line of String(after || "").split("\n").map(normal).filter((item) => item.length >= 3)) {
    const left = available.get(line) || 0;
    if (left > 0) available.set(line, left - 1);
    else changed.add(line);
  }
  return changed;
}

export const highlightSupported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

/** Met en évidence (sans toucher au HTML du document : le texte enregistré reste intact) les blocs dont le texte figure dans `changed`. Retourne leur nombre. */
export function markChanges(root, changed) {
  clearMarks();
  if (!root || !changed?.size || !highlightSupported()) return 0;
  const ranges = [];
  let first = null;
  for (const block of root.querySelectorAll(BLOCKS)) {
    if (block.querySelector(BLOCKS)) continue; // seuls les blocs « feuilles » portent du texte
    if (!changed.has(normal(block.innerText))) continue;
    const range = document.createRange();
    range.selectNodeContents(block);
    ranges.push(range);
    first = first || block;
  }
  if (ranges.length) {
    CSS.highlights.set(HIGHLIGHT, new Highlight(...ranges));
    first?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }
  return ranges.length;
}

export function clearMarks() {
  if (highlightSupported()) CSS.highlights.delete(HIGHLIGHT);
}
