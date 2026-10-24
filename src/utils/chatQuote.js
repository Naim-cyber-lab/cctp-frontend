// Passage du document cité dans la discussion : on retient le bloc (data-collab-key) et le texte sélectionné,
// puis on retrouve ce texte plus tard (même si le document a bougé) pour l'afficher et le surligner.

const elementOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement);
const strip = (text) => text.replace(/\s+/g, "");

/** Passage actuellement sélectionné dans le document : { blockKey, text, rect } ou null (rien de sélectionné, ou sélection hors d'un bloc). */
export function selectionQuote() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const start = elementOf(range.startContainer)?.closest?.("[data-collab-key]");
  const end = elementOf(range.endContainer)?.closest?.("[data-collab-key]");
  if (!start || start !== end) return null;
  const text = range.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2) return null;
  const rects = range.getClientRects();
  const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  return { blockKey: start.dataset.collabKey, text: text.slice(0, 400), rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
}

/** Retrouve le passage dans le document : Range ou null si le texte n'existe plus tel quel. */
export function locateQuote(quote) {
  const block = document.querySelector(`[data-collab-key="${CSS.escape(quote.blockKey)}"]`);
  if (!block) return null;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const chars = []; // un élément par caractère non blanc : { node, offset }
  let node;
  while ((node = walker.nextNode())) {
    for (let offset = 0; offset < node.data.length; offset += 1) if (!/\s/.test(node.data[offset])) chars.push({ node, offset });
  }
  const haystack = chars.map(({ node: item, offset }) => item.data[offset]).join("");
  const needle = strip(quote.text);
  const index = needle ? haystack.indexOf(needle) : -1;
  if (index < 0) return null;
  const first = chars[index], last = chars[index + needle.length - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

let clearTimer = 0;
/** Fait défiler jusqu'au passage et le surligne quelques secondes. Retourne false si le passage est introuvable. */
export function showQuote(quote) {
  const range = locateQuote(quote);
  if (!range) return false;
  elementOf(range.startContainer)?.scrollIntoView({ block: "center", behavior: "smooth" });
  if (typeof Highlight !== "undefined" && CSS.highlights) {
    CSS.highlights.set("chat-quote", new Highlight(range));
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => CSS.highlights.delete("chat-quote"), 3000);
  }
  return true;
}
