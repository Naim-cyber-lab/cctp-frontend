import { useState } from "react";
import { FileDown, X } from "lucide-react";
import "../export-dialog.css";

const FORMATS = [
  { id: "docx", label: "Word", hint: "Modifiable, titres Titre 1 à 4 et sommaire avec numéros de page" },
  { id: "pdf", label: "PDF", hint: "Prêt à envoyer, sommaire cliquable" },
];
const CONTENT = [
  { id: "cover", label: "Page de garde" },
  { id: "toc", label: "Sommaire cliquable" },
  { id: "footer", label: "Pied de page et numérotation" },
];

export function ExportDialog({ title, template, busy, hasVersions, onExport, onClose }) {
  const [format, setFormat] = useState("docx");
  const [options, setOptions] = useState({ cover: true, toc: true, footer: true });
  const [version, setVersion] = useState("active");
  const styles = template?.headingStyles || [];
  const font = String(template?.fontFamily || "Arial").split(",")[0].replace(/["']/g, "");
  const filename = `${String(title || "CCTP").replace(/[^a-zA-Z0-9À-ÿ_-]+/g, "-")}.${format}`;
  return (
    <div className="export-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="export-dialog" role="dialog" aria-label="Exporter le CCTP">
        <header>
          <h2>Exporter le CCTP</h2>
          <button className="export-close" onClick={onClose} aria-label="Fermer"><X size={17} /></button>
        </header>
        <div className="export-formats" role="radiogroup" aria-label="Format">
          {FORMATS.map((item) => (
            <button key={item.id} role="radio" aria-checked={format === item.id} className={format === item.id ? "active" : ""} onClick={() => setFormat(item.id)}>
              <b>{item.label}</b>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
        <fieldset>
          <legend>Contenu</legend>
          {CONTENT.map((item) => (
            <label key={item.id}>
              <input type="checkbox" checked={options[item.id]} onChange={(event) => setOptions((current) => ({ ...current, [item.id]: event.target.checked }))} />
              {item.label}
            </label>
          ))}
        </fieldset>
        {hasVersions && (
          <fieldset data-export-versions>
            <legend>Version du texte</legend>
            {[["active", "Version affichée"], ["notice", "Notice descriptive seule"], ["cctp", "CCTP détaillé seul"], ["both", "Les deux (notice puis CCTP)"]].map(([id, label]) => (
              <label key={id}>
                <input type="radio" name="export-version" checked={version === id} onChange={() => setVersion(id)} />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        <div className="export-style" aria-label="Mise en forme appliquée">
          <b>Mise en forme appliquée</b>
          <span>Police {font}{template?.fontSizePt ? ` ${template.fontSizePt} pt` : ""}</span>
          {styles.length > 0 && <span>Titres {styles.map((item) => `${item.sizePt} pt`).join(" · ")}</span>}
          {template?.marginLeftMm && <span>Marges {template.marginTopMm}/{template.marginRightMm}/{template.marginBottomMm}/{template.marginLeftMm} mm</span>}
        </div>
        <footer>
          <small>Fichier : <b>{filename}</b></small>
          <button className="export-submit" disabled={busy} onClick={() => onExport(format, hasVersions ? { ...options, version } : options)}>
            <FileDown size={16} /> {busy ? "Préparation…" : "Télécharger"}
          </button>
        </footer>
      </section>
    </div>
  );
}
