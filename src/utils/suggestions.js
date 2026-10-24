// Mode suggestion façon Google Docs : les modifications ne touchent pas le texte, elles sont proposées.
//   - un ajout   = <ins data-sg="id" data-author="email">texte</ins>
//   - une suppression = <del data-sg="id" data-author="email">texte</del> (le texte reste visible, barré)
// Ces balises font partie du HTML du bloc : elles sont donc synchronisées en direct comme tout le reste. Accepter retire les balises
// en gardant le résultat voulu ; refuser revient au texte d'origine.

export const SG = "data-sg";
const newId = () => `sg${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
const elementOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement);
export const blockOf = (node) => elementOf(node)?.closest?.("[data-collab-key]") || null;
const sgOf = (node) => elementOf(node)?.closest?.("ins[data-sg], del[data-sg]") || null;

const make = (tag, id, author, color) => {
  const element = document.createElement(tag);
  element.setAttribute(SG, id);
  element.setAttribute("data-author", author);
  element.setAttribute("data-ts", String(Date.now()));
  element.style.setProperty("--sg", color);
  return element;
};
const sameKind = (element, tag, author) => element?.nodeType === 1 && element.tagName.toLowerCase() === tag && element.getAttribute("data-author") === author;

/** Fusionne une suggestion avec la voisine du même auteur et du même type (pas de morceaux collés les uns aux autres). */
const coalesce = (element) => {
  const tag = element.tagName.toLowerCase(), author = element.getAttribute("data-author");
  const previous = element.previousSibling;
  if (sameKind(previous, tag, author)) { while (element.firstChild) previous.appendChild(element.firstChild); element.remove(); element = previous; }
  const next = element.nextSibling;
  if (sameKind(next, tag, author)) { while (next.firstChild) element.appendChild(next.firstChild); next.remove(); }
  element.normalize();
  return element;
};

const fire = (block) => block?.dispatchEvent(new Event("input", { bubbles: true }));
const place = (node, offset) => { const range = document.createRange(); range.setStart(node, offset); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); };
const placeAfter = (node) => { const range = document.createRange(); range.setStartAfter(node); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); };
const placeBefore = (node) => { const range = document.createRange(); range.setStartBefore(node); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); };

const textNodesIn = (range, block) => {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) { if (range.intersectsNode(node)) nodes.push(node); }
  return nodes;
};

/** Propose la suppression de la sélection. Retourne le dernier élément <del> créé (ou null). */
function suggestDeletion(range, block, ctx, id) {
  const nodes = textNodesIn(range, block);
  let last = null;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.data.length;
    if (end <= start) continue;
    const owner = sgOf(node);
    if (owner) {
      // sur du texte que j'ai moi-même proposé : on le retire vraiment ; sur celui des autres ou déjà barré : rien
      if (owner.tagName === "INS" && owner.getAttribute("data-author") === ctx.email) {
        node.deleteData(start, end - start);
        if (!owner.textContent) { const parent = owner.parentNode; placeBefore(owner); owner.remove(); parent.normalize(); }
      }
      continue;
    }
    const tail = node.splitText(end);
    const middle = node.splitText(start);
    const del = make("del", id, ctx.email, ctx.color);
    middle.parentNode.insertBefore(del, middle);
    del.appendChild(middle);
    last = coalesce(del);
    void tail;
  }
  return last;
}

function insertAt(range, text, block, ctx, id, { lineBreak = false } = {}) {
  // pas de saisie à l'intérieur d'un texte barré ou d'une proposition d'un autre : on se place juste après
  const holder = sgOf(range.startContainer);
  if (holder && !(holder.tagName === "INS" && holder.getAttribute("data-author") === ctx.email)) { range.setStartAfter(holder); range.collapse(true); }
  const mine = sgOf(range.startContainer);
  if (mine && mine.tagName === "INS") {
    const node = lineBreak ? document.createElement("br") : document.createTextNode(text);
    range.insertNode(node);
    if (lineBreak) placeAfter(node); else { place(node, node.data.length); mine.normalize(); }
    return mine;
  }
  const ins = make("ins", id, ctx.email, ctx.color);
  const content = lineBreak ? document.createElement("br") : document.createTextNode(text);
  ins.appendChild(content);
  range.insertNode(ins);
  const merged = coalesce(ins);
  if (lineBreak) placeAfter(merged.lastChild); else { const last = merged.lastChild; place(last.nodeType === 3 ? last : merged, last.nodeType === 3 ? last.data.length : merged.childNodes.length); }
  return merged;
}

const KNOWN = /^(insert(Text|FromPaste|FromDrop|ReplacementText|Paragraph|LineBreak)|delete(Content|ByCut|Word|SoftLine|HardLine|ByDrag)(Backward|Forward)?|deleteByCut)$/;

/** Gère un événement beforeinput en mode suggestion. Retourne true si l'événement a été pris en charge (et annulé). */
export function handleSuggestInput(event, ctx) {
  const type = event.inputType || "";
  if (type.startsWith("history")) return false; // annuler / rétablir : géré ailleurs
  const block = blockOf(event.target);
  if (!block) return false;
  event.preventDefault();
  if (type.startsWith("format")) return true; // la mise en forme n'est pas proposable : on l'ignore
  if (!KNOWN.test(type)) return true;
  const selection = getSelection();
  if (!selection.rangeCount) return true;
  let range = selection.getRangeAt(0).cloneRange();
  const id = newId();
  const isDelete = type.startsWith("delete");
  if (isDelete && range.collapsed) {
    const forward = /Forward$/.test(type);
    const unit = /Word/.test(type) ? "word" : /Line/.test(type) ? "lineboundary" : "character";
    selection.modify("extend", forward ? "forward" : "backward", unit);
    range = selection.getRangeAt(0).cloneRange();
    if (range.collapsed) return true;
    // ne pas dépasser le bloc
    if (blockOf(range.startContainer) !== block || blockOf(range.endContainer) !== block) { selection.collapseToStart(); return true; }
    const del = suggestDeletion(range, block, ctx, id);
    if (del) (forward ? placeAfter(del) : placeBefore(del)); else if (forward) selection.collapseToEnd(); else selection.collapseToStart();
    fire(block);
    return true;
  }
  if (blockOf(range.startContainer) !== block || blockOf(range.endContainer) !== block) return true; // une sélection sur plusieurs blocs n'est pas proposable
  let del = null;
  if (!range.collapsed) {
    del = suggestDeletion(range, block, ctx, id);
    if (del) { const next = document.createRange(); next.setStartAfter(del); next.collapse(true); range = next; }
    else { range.collapse(false); }
  }
  if (isDelete) { if (del) placeAfter(del); fire(block); return true; }
  const text = type === "insertParagraph" || type === "insertLineBreak" ? "" : (event.data ?? event.dataTransfer?.getData("text/plain") ?? "");
  if (type !== "insertParagraph" && type !== "insertLineBreak" && !text) { if (del) fire(block); return true; }
  insertAt(range, text, block, ctx, id, { lineBreak: type === "insertParagraph" || type === "insertLineBreak" });
  fire(block);
  return true;
}

/** Suggestions en attente dans une zone : [{ id, author, ins: [texte], del: [texte], elements, block }] dans l'ordre du document. */
export function listSuggestions(root) {
  const groups = new Map();
  for (const element of root.querySelectorAll("ins[data-sg], del[data-sg]")) {
    const id = element.getAttribute(SG);
    if (!groups.has(id)) groups.set(id, { id, author: element.getAttribute("data-author") || "", ts: Number(element.getAttribute("data-ts")) || 0, color: element.style.getPropertyValue("--sg"), ins: [], del: [], elements: [], block: blockOf(element) });
    const group = groups.get(id);
    group.elements.push(element);
    (element.tagName === "INS" ? group.ins : group.del).push(element.textContent);
  }
  return [...groups.values()];
}

const unwrap = (element) => { const parent = element.parentNode; while (element.firstChild) parent.insertBefore(element.firstChild, element); element.remove(); parent.normalize(); };

/** Accepter : l'ajout devient du texte, la suppression est effective. Refuser : retour au texte d'origine. */
export function resolveSuggestion(group, accept) {
  for (const element of group.elements) {
    if (!element.isConnected) continue;
    const keep = element.tagName === "INS" ? accept : !accept;
    if (keep) unwrap(element); else element.remove();
  }
  fire(group.block);
}

export const resolveAll = (root, accept) => listSuggestions(root).forEach((group) => resolveSuggestion(group, accept));

/** innerText d'un bloc SANS les ajouts proposés (non encore acceptés) : c'est le texte « officiel » enregistré dans le contenu du lot. */
export function officialText(block) {
  const proposals = [...block.querySelectorAll("ins[data-sg]")];
  const saved = proposals.map((element) => element.style.display);
  proposals.forEach((element) => { element.style.display = "none"; });
  try { return block.innerText; } finally { proposals.forEach((element, index) => { element.style.display = saved[index]; }); }
}

/** Texte d'un bloc tel qu'il est AUJOURD'HUI (sans les ajouts proposés, avec les passages dont la suppression n'est que proposée). */
export function currentText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll("ins[data-sg]").forEach((element) => element.remove());
  return clone.innerText ?? clone.textContent ?? "";
}
