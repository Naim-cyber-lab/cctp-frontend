import { Bold, Clipboard, Copy, Italic, MousePointerClick, Replace, Scissors, Search, Underline } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../find-replace.css";

/** Clic droit dans le texte : couper, copier, coller, mise en forme rapide, rechercher… (comme dans Word).
 *  Le menu agit sur la sélection sans la perdre ; « Coller » insère du texte brut (jamais de code collé tel quel). */
export function EditorContextMenu({ rootRef, readOnly }) {
  const [menu, setMenu] = useState(null); // { x, y, selected }
  const [hint, setHint] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onContext = (event) => {
      const block = event.target.closest?.("[data-collab-key]");
      if (!block || block.closest("[data-cctp-chat]")) return;
      event.preventDefault();
      const selection = window.getSelection();
      setHint("");
      setMenu({ x: event.clientX, y: event.clientY, selected: !!selection && !selection.isCollapsed });
    };
    root.addEventListener("contextmenu", onContext);
    return () => root.removeEventListener("contextmenu", onContext);
  }, [rootRef]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setMenu(null); };
    const escape = (event) => { if (event.key === "Escape") setMenu(null); };
    const hide = () => setMenu(null);
    document.addEventListener("mousedown", close, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { document.removeEventListener("mousedown", close, true); document.removeEventListener("keydown", escape, true); window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [menu]);

  if (!menu) return null;
  const run = (action) => (event) => { event.preventDefault(); action(); };
  const exec = (command) => run(() => { document.execCommand(command); setMenu(null); });
  // Couper / copier : si le navigateur refuse la commande classique, on passe par l'API du presse-papiers (même résultat pour la personne)
  const clip = (cut) => run(async () => {
    const text = window.getSelection()?.toString() || "";
    let done = document.execCommand(cut ? "cut" : "copy");
    if (!done && text) {
      try { await navigator.clipboard.writeText(text); done = cut ? document.execCommand("delete") : true; } catch { setHint("Le navigateur refuse l'accès au presse-papiers : utilisez Ctrl + " + (cut ? "X" : "C") + "."); return; }
    }
    setMenu(null);
  });
  const paste = run(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) document.execCommand("insertText", false, text);
      setMenu(null);
    } catch {
      setHint("Le navigateur refuse l'accès au presse-papiers : utilisez Ctrl + V.");
    }
  });
  const find = (replace) => run(() => { setMenu(null); window.dispatchEvent(new CustomEvent("cctp:find", { detail: { replace } })); });
  const left = Math.min(menu.x, window.innerWidth - 230), top = Math.min(menu.y, window.innerHeight - (readOnly ? 150 : 330));
  return createPortal(<div className="editor-context-menu" ref={ref} role="menu" data-context-menu style={{ left, top }}>
    {!readOnly && <button type="button" role="menuitem" data-ctx="cut" disabled={!menu.selected} onMouseDown={clip(true)}><Scissors size={14} /> Couper <kbd>Ctrl+X</kbd></button>}
    <button type="button" role="menuitem" data-ctx="copy" disabled={!menu.selected} onMouseDown={clip(false)}><Copy size={14} /> Copier <kbd>Ctrl+C</kbd></button>
    {!readOnly && <button type="button" role="menuitem" data-ctx="paste" onMouseDown={paste}><Clipboard size={14} /> Coller (texte seul) <kbd>Ctrl+V</kbd></button>}
    {hint && <small className="ctx-hint" data-ctx-hint>{hint}</small>}
    {!readOnly && <>
      <hr />
      <div className="ctx-format">
        <button type="button" role="menuitem" data-ctx="bold" title="Gras" disabled={!menu.selected} onMouseDown={exec("bold")}><Bold size={14} /></button>
        <button type="button" role="menuitem" data-ctx="italic" title="Italique" disabled={!menu.selected} onMouseDown={exec("italic")}><Italic size={14} /></button>
        <button type="button" role="menuitem" data-ctx="underline" title="Souligné" disabled={!menu.selected} onMouseDown={exec("underline")}><Underline size={14} /></button>
      </div>
    </>}
    <hr />
    <button type="button" role="menuitem" data-ctx="find" onMouseDown={find(false)}><Search size={14} /> Rechercher… <kbd>Ctrl+F</kbd></button>
    {!readOnly && <button type="button" role="menuitem" data-ctx="replace" onMouseDown={find(true)}><Replace size={14} /> Remplacer… <kbd>Ctrl+H</kbd></button>}
    <button type="button" role="menuitem" data-ctx="select-all" onMouseDown={exec("selectAll")}><MousePointerClick size={14} /> Tout sélectionner <kbd>Ctrl+A</kbd></button>
  </div>, document.body);
}
