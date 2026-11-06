import { useRef, useState } from "react";
import { Calculator, CalendarRange, Check, FilePlus2, FileText, FileUp, ListChecks } from "lucide-react";
import { ImportCctpModal } from "./ImportCctpModal";

const MODULES = [
  { id: "feasibility", icon: Calculator, title: "Faisabilité", text: "Cadrer le projet et produire une première estimation." },
  { id: "cctp", icon: FileText, title: "CCTP", text: "Construire les prescriptions techniques et les ouvrages." },
  { id: "dpgf", icon: ListChecks, title: "DPGF", text: "Préparer ou compléter le chiffrage." },
  { id: "planning", icon: CalendarRange, title: "Planning", text: "Organiser le planning prévisionnel des travaux." },
];
const MODES = [
  { id: "FROM_DOCUMENTS", icon: FileUp, title: "À partir de documents", badge: "Recommandé", text: "Importez programme, plans, CCTP, DPGF, devis ou études. Calepin les utilisera pour préremplir votre projet." },
  { id: "EMPTY", icon: FilePlus2, title: "Projet vide", text: "Commencez manuellement. Vous pourrez ajouter vos documents à tout moment." },
];

function Choice({ selected, onSelect, Icon, title, text, badge, ...rest }) {
  return <button type="button" role="radio" aria-checked={selected} className={`new-entry-card${selected ? " selected" : ""}`} data-selected={selected ? "true" : "false"} onClick={onSelect} {...rest}
    style={{ textAlign: "left", padding: 16, display: "grid", gap: 6, position: "relative", cursor: "pointer", borderRadius: 14, background: selected ? "#eef6f1" : "#fff", border: selected ? "2px solid #1f5a46" : "1px solid #d9ded4" }}>
    {selected && <span aria-hidden="true" data-selected-mark style={{ position: "absolute", top: 10, right: 10, background: "#1f5a46", color: "#fff", borderRadius: 999, width: 22, height: 22, display: "grid", placeItems: "center" }}><Check size={14} /></span>}
    <Icon size={22} /><b>{title}{badge && <span className="canon-badge" style={{ marginLeft: 8, fontSize: 11 }} data-new-entry-badge>{badge}</span>}</b><small>{text}</small></button>;
}

/** « Nouveau projet » (HOME-NEWPROJECT-UX-02) : le PROJET (nom), la MANIÈRE de démarrer (project_creation_mode) et le PREMIER MODULE (initial_module) sont trois décisions distinctes ; le projet créé est toujours le même objet.
 *  L'import de documents passe par les Documents du projet (un seul référentiel), jamais par un second système. */
export function NewProjectEntry({ planningEnabled, onChoose, onImport, onExample, onCancel }) {
  const [importing, setImporting] = useState(false);
  const [name, setName] = useState(""), [mode, setMode] = useState(""), [module, setModule] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [draggingFiles, setDraggingFiles] = useState(false);
  const nameInput = useRef(null);
  const modules = MODULES.filter((entry) => entry.id !== "planning" || planningEnabled);
  const enteredName = () => name.trim() || nameInput.current?.value?.trim() || "";
  const ready = name.trim().length >= 2 && mode && module;
  const create = async () => {
    if (!ready) return;
    if (mode === "FROM_DOCUMENTS" && module === "cctp") { setImporting(true); return; } // import d'un CCTP existant : assistant d'import dédié
    setBusy(true); setError("");
    try { await onChoose(module, enteredName(), mode); } catch (reason) { setError(reason?.detail?.message || reason?.message || "Création impossible"); setBusy(false); }
  };
  const startFromDroppedFiles = async (files) => {
    if (!files.length || busy) return;
    const proposedName = enteredName() || files[0].name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Nouveau projet";
    // Le dépôt est une intention sans ambiguïté : on crée le projet, puis l'utilisateur voit immédiatement son document importé.
    setName(proposedName);
    setMode("FROM_DOCUMENTS");
    setModule("feasibility");
    setBusy(true); setError("");
    try { await onChoose("feasibility", proposedName, "FROM_DOCUMENTS", files); }
    catch (reason) { setError(reason?.detail?.message || reason?.message || "Création et import impossibles"); setBusy(false); }
  };
  if (importing) return <ImportCctpModal onClose={() => setImporting(false)} onImport={onImport} />;
  return <section className="new-entry" data-new-entry aria-labelledby="new-entry-title" style={{ maxWidth: 820, margin: "32px auto", padding: "0 16px", display: "grid", gap: 22 }}>
    <header><h1 id="new-entry-title" style={{ margin: 0 }}>Nouveau projet</h1>
      <p className="muted" data-new-entry-subtitle>Créez votre projet une seule fois. Vous pourrez ensuite utiliser tous les modules de Calepin.</p></header>
    <section aria-labelledby="ne-step1"><h2 id="ne-step1" style={{ fontSize: 16 }}>Nom du projet</h2>
      <input ref={nameInput} data-new-entry-name value={name} maxLength={100} aria-label="Nom du projet" placeholder="Maison de santé — Extension" onFocus={(event) => { if (!name && event.target.value) setName(event.target.value); }} onChange={(event) => setName(event.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16 }} /></section>
    <section aria-labelledby="ne-step2" className={`new-entry-start ${draggingFiles ? "is-file-dragging" : ""}`} onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDraggingFiles(true); } }} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDraggingFiles(false); }} onDrop={(event) => { event.preventDefault(); setDraggingFiles(false); startFromDroppedFiles([...event.dataTransfer.files]); }}><h2 id="ne-step2" style={{ fontSize: 16 }}>Comment souhaitez-vous démarrer ?</h2>
      <div role="radiogroup" aria-labelledby="ne-step2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {MODES.map(({ id, icon, title, text, badge }) => <Choice key={id} selected={mode === id} onSelect={() => setMode(id)} Icon={icon} title={title} text={text} badge={badge} data-new-entry-mode={id} disabled={busy} />)}</div></section>
    {draggingFiles && <div className="new-entry-drop-notice" role="status"><FileUp size={20}/> Relâchez pour créer le projet et importer ce document</div>}
    <section aria-labelledby="ne-step3"><h2 id="ne-step3" style={{ fontSize: 16 }}>Par quoi souhaitez-vous commencer ?</h2>
      <div role="radiogroup" aria-labelledby="ne-step3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {modules.map(({ id, icon, title, text }) => <Choice key={id} selected={module === id} onSelect={() => setModule(id)} Icon={icon} title={title} text={text} data-new-entry-choice={id} disabled={busy} />)}</div>
      <p className="muted" style={{ marginTop: 8 }} data-new-entry-note>Tous les modules restent accessibles ensuite : ce choix détermine seulement le premier écran ouvert.</p></section>
    {error && <div className="err" role="alert" data-new-entry-error>{error}</div>}
    <footer style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <button type="button" className="primary" data-new-entry-create disabled={!ready || busy} onClick={create}>Créer le projet</button>
      <button type="button" className="secondary" data-new-entry-cancel onClick={onCancel}>Annuler</button>
      {!ready && <small className="muted" data-new-entry-hint>{name.trim().length < 2 ? "Donnez un nom au projet." : !mode ? "Choisissez comment démarrer." : "Choisissez le premier module à ouvrir."}</small>}</footer>
    {onExample && <aside data-new-entry-discover style={{ borderTop: "1px solid #e2e6dd", paddingTop: 18 }}><h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Découvrir Calepin</h2>
      <p className="muted" style={{ margin: "0 0 10px" }}>Explorez un projet déjà rempli pour découvrir le parcours complet.</p>
      <button type="button" className="secondary" data-new-entry-example disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onExample(); } catch (reason) { setError(reason?.detail?.message || reason?.message || "Création impossible"); setBusy(false); } }}>Ouvrir l’exemple Maison de santé</button></aside>}
  </section>;
}
