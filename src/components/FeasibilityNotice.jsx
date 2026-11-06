import { useState } from "react";
import { downloadFeasibilityNotice, editFeasibilityNoticeSection, generateFeasibilityNotice } from "../api/client";

const NOTICE_STATUS = { UP_TO_DATE: "✓ À jour", OUTDATED: "Notice à actualiser", NOT_GENERATED: "Non générée" };

/** Provenance interne d'un passage : « Ce passage provient de : Cadrage → Nature du projet… » (affichée dans l'interface, pas nécessairement dans l'export). */
function Provenance({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || !sources.length) return null;
  return <span className="notice-provenance">
    <button type="button" className="link-button" data-notice-source-toggle aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Masquer la provenance" : "Provenance"}</button>
    {open && <span className="notice-sources" data-notice-sources><b>Ce passage provient de :</b><ul>{sources.map((item) => <li key={`${item.kind}-${item.key}`} data-notice-source={item.kind}>{item.label}</li>)}</ul></span>}
  </span>;
}

function NoticeBlock({ block }) {
  if (block.type === "list") return <ul>{block.items.map((item, index) => <li key={index}>{item}<Provenance sources={(block.itemSources || [])[index]} /></li>)}</ul>;
  if (block.type === "paragraph") return <p>{block.text}<Provenance sources={block.sources} /></p>;
  if (block.type === "note") return <p className="feas-callout">{block.text}<Provenance sources={block.sources} /></p>;
  if (block.type === "keyfigures") return <div><dl className="feas-keyfigures">{block.items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><Provenance sources={block.sources} /></div>;
  if (block.type === "table") return <div className="table-scroll"><table className="feas-table feas-synthesis-table"><thead><tr>{block.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>)}</tbody></table><Provenance sources={block.sources} /></div>;
  return null;
}

// texte à plat d'une section : point de départ de la reformulation par le MOE
const flatten = (section) => section.blocks.flatMap((block) => block.type === "list" ? block.items.map((item) => `• ${item}`) : block.type === "table" ? block.rows.map((row) => row.join(" — ")) : block.type === "keyfigures" ? block.items.map((item) => `${item.label} : ${item.value}`) : [block.text || ""]).join("\n");

function Section({ section, editable, onEdit, onReset }) {
  const [editing, setEditing] = useState(false), [text, setText] = useState("");
  return <section className="feas-synthesis-section" data-notice-section={section.id} data-notice-edited={section.edited ? "true" : undefined}>
    <h3>{section.number}. {section.title}{section.edited && <small className="notice-edited" data-notice-edited-badge> · modifiée par le MOE</small>}</h3>
    {editing ? <div className="feas-edit"><textarea rows={Math.max(4, text.split("\n").length + 1)} value={text} data-notice-edit-text onChange={(event) => setText(event.target.value)} />
      <span><button type="button" className="secondary" data-notice-edit-save onClick={async () => { await onEdit(section.id, text); setEditing(false); }}>Enregistrer</button> <button type="button" className="link-button" onClick={() => setEditing(false)}>Annuler</button></span></div>
      : section.edited ? <><p className="notice-override" data-notice-override>{section.override}</p></> : section.blocks.map((block, index) => <NoticeBlock key={index} block={block} />)}
    {!editing && <p className="notice-section-actions">
      {section.edited ? <Provenance sources={section.sources} /> : null}
      {editable && <button type="button" className="link-button" data-notice-edit onClick={() => { setText(section.override ?? flatten(section)); setEditing(true); }}>Modifier ce passage</button>}
      {editable && section.edited && <button type="button" className="link-button" data-notice-reset onClick={() => onReset(section.id)}>Rétablir le texte généré</button>}</p>}
  </section>;
}

/** Notice : le livrable de l'étude initiale, produit depuis le travail effectué (cadrage, estimation, analyse, réserves et conclusion du MOE). Jamais de contenu générique de remplissage. */
export function Notice({ data, id, editable, onData, onFinalActions }) {
  const notice = data.notice;
  const [error, setError] = useState(""), [confirming, setConfirming] = useState(false), [changesOpen, setChangesOpen] = useState(false), [busy, setBusy] = useState(false);
  const generate = async (confirmOverwrite = false) => {
    setError(""); setBusy(true);
    try { onData(await generateFeasibilityNotice(id, confirmOverwrite)); setConfirming(false); }
    catch (reason) { if (/NOTICE_MANUAL_EDITS/.test(reason.message)) setConfirming(true); else setError(reason.message); }
    setBusy(false);
  };
  const edit = async (section, text) => { setError(""); try { onData(await editFeasibilityNoticeSection(id, section, text)); } catch (reason) { setError(reason.message); } };
  const download = async (format) => { setError(""); try { await downloadFeasibilityNotice(id, format, "notice-etude-initiale"); } catch (reason) { setError(reason.message); } };
  const doc = notice.document;
  return <section className="feas-panel feas-synthesis" data-feasibility-panel="notice" data-notice-status={notice.status}>
    {error && <div className="err" role="alert">{error}</div>}
    <header className="feas-synthesis-head"><span className="eyebrow">NOTICE</span><h2>Notice de l’étude initiale</h2>
      <p>Le livrable produit à l’issue de l’étude initiale, à partir du travail effectué dans les étapes précédentes.</p></header>
    {notice.status === "NOT_GENERATED" && <div className="feas-notice-empty" data-notice-empty>
      <p><b>Aucune notice n’a encore été générée.</b></p>
      {notice.available.length ? <p>Elle reprendra uniquement ce qui est établi : {notice.available.join(", ").toLowerCase()}. Aucune phrase générique n’est ajoutée pour remplir.</p> : <p>Aucune information confirmée ne permet encore de la rédiger : complétez le cadrage ou l’estimation.</p>}
      {editable && notice.available.length > 0 && <button type="button" className="primary" data-notice-generate disabled={busy} onClick={() => generate()}>Générer la notice</button>}</div>}
    {doc && <>
      <div className={`feas-notice-status st-${notice.status}`} data-notice-banner role="status">
        <b data-notice-state>{NOTICE_STATUS[notice.status]}</b>
        {notice.status === "UP_TO_DATE" && <small> · générée le {new Date(notice.generatedAt).toLocaleDateString("fr-FR")} par {notice.generatedBy}{notice.manualEdits ? " · avec des passages modifiés par le MOE" : ""}</small>}
        {notice.status === "OUTDATED" && <>
          <p data-notice-outdated>{notice.manualEdits ? "Certaines informations du projet ont changé." : `${notice.changes.length} information${notice.changes.length > 1 ? "s ont" : " a"} changé depuis la dernière génération.`}{notice.manualEdits ? ` Vos modifications manuelles sont conservées tant que vous ne les remplacez pas.` : ""}</p>
          <span className="feas-notice-actions"><button type="button" className="secondary" data-notice-changes onClick={() => setChangesOpen(!changesOpen)}>{changesOpen ? "Masquer les changements" : "Voir les changements"}</button>
            {editable && <button type="button" className="primary" data-notice-refresh disabled={busy} onClick={() => (notice.manualEdits ? setConfirming(true) : generate())}>Actualiser la notice</button>}</span></>}
        {confirming && <div className="feas-callout" data-notice-confirm><p>Actualiser remplacera les passages que vous avez modifiés par le texte généré.</p>
          <button type="button" className="primary" data-notice-confirm-replace disabled={busy} onClick={() => generate(true)}>Remplacer mes modifications</button> <button type="button" className="link-button" onClick={() => setConfirming(false)}>Annuler</button></div>}
        {changesOpen && <ul className="feas-changes" data-notice-change-list>{notice.changes.map((change) => <li key={change.key} data-notice-change={change.kind}><b>{change.label}</b> : {change.before ?? "—"} → <b>{change.after ?? "supprimé"}</b></li>)}</ul>}
      </div>
      <article data-notice-document>
        <h2 data-notice-title>{doc.title}</h2><p>{doc.project}</p>
        {doc.keyFigures.length > 0 && <section className="feas-key-box" data-notice-keyfigures><h3>CHIFFRES CLÉS</h3><dl className="feas-keyfigures">{doc.keyFigures.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}<Provenance sources={item.sources} /></dd></div>)}</dl></section>}
        {doc.sections.map((section) => <Section key={section.id} section={section} editable={editable} onEdit={edit} onReset={(sectionId) => edit(sectionId, "")} />)}
      </article>
      <p className="feas-synthesis-actions">{editable && notice.status === "UP_TO_DATE" && <button type="button" className="secondary" data-notice-regenerate disabled={busy} onClick={() => (notice.manualEdits ? setConfirming(true) : generate())}>Régénérer la notice</button>}</p>
    </>}
    {onFinalActions && onFinalActions({ hasDocument: Boolean(doc), upToDate: notice.status === "UP_TO_DATE", download })}
  </section>;
}
