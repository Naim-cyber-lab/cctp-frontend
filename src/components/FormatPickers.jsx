import { useEffect, useRef, useState } from "react";
import "../word-like.css";

export const TEXT_COLORS = ["#000000", "#434343", "#7f7f7f", "#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#16a085", "#2980b9", "#1f3a93", "#8e44ad", "#d6336c"];
export const HIGHLIGHTS = ["#fff176", "#b9f6ca", "#80deea", "#f8bbd0", "#ffcc80", "#d1c4e9"];

/** Bouton « couleur » avec palette : le clic sur une pastille applique la couleur à la sélection (sans faire perdre la sélection du texte). */
export function ColorPicker({ icon: Icon, title, colors, current, onPick, noneLabel, dataKey, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return <div className="color-picker" ref={ref} data-color-picker={dataKey}>
    <button type="button" className="color-picker-trigger" title={title} aria-haspopup="menu" aria-expanded={open} disabled={disabled}
      onMouseDown={(event) => { event.preventDefault(); setOpen((value) => !value); }}>
      <Icon size={16} /><i style={{ background: current || "transparent" }} />
    </button>
    {open && <div className="color-picker-menu" role="menu" data-color-menu={dataKey}>
      <div className="color-grid">
        {colors.map((color) => <button key={color} type="button" role="menuitem" className="swatch" style={{ background: color }} aria-label={`${title} ${color}`} data-color={color}
          onMouseDown={(event) => { event.preventDefault(); onPick(color); setOpen(false); }} />)}
      </div>
      <button type="button" role="menuitem" className="color-none" data-color-none onMouseDown={(event) => { event.preventDefault(); onPick(null); setOpen(false); }}>{noneLabel}</button>
    </div>}
  </div>;
}
