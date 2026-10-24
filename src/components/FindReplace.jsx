import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "../find-replace.css";

const BLOCK_LEVEL = "div, p, li, td, th, tr, h1, h2, h3, h4, h5, h6, figcaption, blockquote";

/** Toutes les occurrences du texte dans les zones modifiables du document (chapitres, titres, textes d'introduction…), sous forme de Range :
 *  aucune modification du document pour les repérer (surbrillance par l'API CSS Custom Highlight). */
export function findRanges(root, query, caseSensitive) {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLocaleLowerCase("fr");
  const ranges = [];
  for (const block of root.querySelectorAll("[data-collab-key]")) {
    if (block.closest("[data-cctp-chat], .comments-panel, .suggestions-panel")) continue;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let text = "";
    const map = []; // pour chaque caractère de `text` : { node, offset } (ou null pour une coupure de paragraphe)
    let previous = null, node;
    while ((node = walker.nextNode())) {
      const holder = node.parentElement?.closest(BLOCK_LEVEL) || block;
      if (previous && holder !== previous) { text += "\n"; map.push(null); }
      previous = holder;
      for (let offset = 0; offset < node.data.length; offset += 1) { text += node.data[offset]; map.push({ node, offset }); }
    }
    const haystack = caseSensitive ? text : text.toLocaleLowerCase("fr");
    if (haystack.length !== text.length) continue; // majuscules/minuscules qui changent la longueur : on ne risque pas de décaler les positions
    for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + Math.max(1, needle.length))) {
      const first = map[index], last = map[index + needle.length - 1];
      if (!first || !last) continue;
      const range = document.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset + 1);
      ranges.push(range);
    }
  }
  return ranges;
}

const supportsHighlights = () => typeof Highlight !== "undefined" && typeof CSS !== "undefined" && !!CSS.highlights;

/** Rechercher / remplacer dans le document (Ctrl+F, Ctrl+H) : barre flottante, résultats surlignés, précédent / suivant, remplacer / tout remplacer. */
export function FindReplace({ rootRef, readOnly, onChanged }) {
  const [open, setOpen] = useState(false);
  const [withReplace, setWithReplace] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0);
  const [notice, setNotice] = useState("");
  const rangesRef = useRef([]), findInput = useRef(null), currentRef = useRef(0);
  currentRef.current = current;

  const paint = useCallback((index) => {
    if (!supportsHighlights()) return;
    const ranges = rangesRef.current;
    CSS.highlights.set("find-match", new Highlight(...ranges));
    if (ranges[index]) CSS.highlights.set("find-current", new Highlight(ranges[index])); else CSS.highlights.delete("find-current");
  }, []);
  const clearPaint = () => { if (supportsHighlights()) { CSS.highlights.delete("find-match"); CSS.highlights.delete("find-current"); } };
  const reveal = (index) => { const range = rangesRef.current[index]; range?.startContainer?.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" }); };

  const search = useCallback((keepIndex = false) => {
    const root = rootRef.current;
    if (!root) return;
    rangesRef.current = findRanges(root, query, caseSensitive);
    const count = rangesRef.current.length;
    const index = keepIndex ? Math.min(currentRef.current, Math.max(0, count - 1)) : 0;
    setTotal(count); setCurrent(index); paint(index);
    if (!keepIndex && count) reveal(index);
  }, [rootRef, query, caseSensitive, paint]);

  // recherche au fil de la frappe, et mise à jour quand le document change (frappe, modification d'un collègue)
  useEffect(() => { if (!open) return undefined; const timer = setTimeout(() => search(false), 120); return () => clearTimeout(timer); }, [open, query, caseSensitive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return undefined;
    let timer;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => search(true), 350); };
    root.addEventListener("input", later); root.addEventListener("collab:remote-edit", later);
    return () => { clearTimeout(timer); root.removeEventListener("input", later); root.removeEventListener("collab:remote-edit", later); };
  }, [open, search, rootRef]);
  useEffect(() => { if (!open) { clearPaint(); rangesRef.current = []; } return clearPaint; }, [open]);

  const openBar = useCallback((replace = false) => {
    const selection = window.getSelection();
    const picked = selection && !selection.isCollapsed ? selection.toString().trim() : "";
    if (picked && picked.length <= 120 && !picked.includes("\n")) setQuery(picked);
    setOpen(true); setWithReplace(replace && !readOnly); setNotice("");
    setTimeout(() => { findInput.current?.focus(); findInput.current?.select(); }, 0);
  }, [readOnly]);
  const close = () => { setOpen(false); setNotice(""); };

  // Ctrl+F / Ctrl+H (à la place de la recherche du navigateur, qui ne voit pas le texte modifiable de la même façon), Échap pour fermer
  useEffect(() => {
    const onKey = (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f") { event.preventDefault(); openBar(false); }
      else if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "h" && !readOnly) { event.preventDefault(); openBar(true); }
      else if (event.key === "Escape" && open && document.activeElement?.closest?.("[data-find-bar]")) { event.preventDefault(); close(); }
    };
    const onCommand = (event) => openBar(!!event.detail?.replace);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("cctp:find", onCommand);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("cctp:find", onCommand); };
  }, [open, openBar, readOnly]);

  const move = (direction) => {
    const count = rangesRef.current.length;
    if (!count) return;
    const next = (currentRef.current + direction + count) % count;
    setCurrent(next); paint(next); reveal(next);
  };
  // Remplacer = écrire à la place de la sélection : comme une frappe, donc synchronisé en direct, annulable, et transformé en proposition en mode suggestion
  const replaceRange = (range) => {
    const block = range.startContainer.parentElement?.closest("[data-collab-key]");
    if (!block) return false;
    block.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    return replacement ? document.execCommand("insertText", false, replacement) : document.execCommand("delete");
  };
  const replaceCurrent = () => {
    if (readOnly) return;
    const range = rangesRef.current[currentRef.current];
    if (!range) return;
    if (replaceRange(range)) onChanged?.();
    setTimeout(() => { search(true); findInput.current?.focus(); }, 60);
  };
  const replaceAll = () => {
    if (readOnly || !rangesRef.current.length) return;
    const ranges = [...rangesRef.current];
    let done = 0;
    for (let index = ranges.length - 1; index >= 0; index -= 1) if (replaceRange(ranges[index])) done += 1; // de la fin vers le début : les positions restent valables
    if (done) onChanged?.();
    setNotice(`${done} remplacement${done > 1 ? "s" : ""}`);
    setTimeout(() => { search(false); findInput.current?.focus(); }, 60);
  };

  if (!open) return null;
  return <div className="find-bar" data-find-bar role="search" aria-label="Rechercher dans le document">
    <div className="find-row">
      <Search size={14} />
      <input ref={findInput} value={query} placeholder="Rechercher" aria-label="Rechercher" data-find-input onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); move(event.shiftKey ? -1 : 1); } }} />
      <span className="find-count" data-find-count>{query ? (total ? `${current + 1} sur ${total}` : "Aucun résultat") : ""}</span>
      <button type="button" className={caseSensitive ? "on" : ""} title="Respecter la casse" aria-pressed={caseSensitive} data-find-case onClick={() => setCaseSensitive((value) => !value)}>Aa</button>
      <button type="button" title="Précédent (Maj + Entrée)" aria-label="Précédent" data-find-prev disabled={!total} onClick={() => move(-1)}><ChevronUp size={15} /></button>
      <button type="button" title="Suivant (Entrée)" aria-label="Suivant" data-find-next disabled={!total} onClick={() => move(1)}><ChevronDown size={15} /></button>
      {!readOnly && <button type="button" title="Remplacer" aria-label="Afficher le remplacement" aria-pressed={withReplace} data-find-toggle-replace className={withReplace ? "on" : ""} onClick={() => setWithReplace((value) => !value)}><Replace size={15} /></button>}
      <button type="button" title="Fermer (Échap)" aria-label="Fermer la recherche" data-find-close onClick={close}><X size={15} /></button>
    </div>
    {withReplace && !readOnly && <div className="find-row">
      <Replace size={14} />
      <input value={replacement} placeholder="Remplacer par" aria-label="Remplacer par" data-replace-input onChange={(event) => setReplacement(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); replaceCurrent(); } }} />
      <button type="button" className="text" data-replace-one disabled={!total} onClick={replaceCurrent}>Remplacer</button>
      <button type="button" className="text" data-replace-all disabled={!total} onClick={replaceAll}>Tout remplacer</button>
    </div>}
    {notice && <small className="find-notice" data-find-notice>{notice}</small>}
  </div>;
}
