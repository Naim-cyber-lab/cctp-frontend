import { useCallback, useEffect, useState } from "react";
import { getWritingBlocks, listProjectsForBlocks, previewWritingBlockOverride, publishWritingBlockOverride, restoreWritingBlock, saveWritingBlockOverride } from "../api/client";

/** Bibliothèque › Ouvrages & rédaction › Blocs de rédaction : les textes Standard Calepin du CCTP Plâtrerie et les dérogations de l'agence.
 *  Le Standard n'est jamais modifié : une dérogation (brouillon → publiée) remplace le texte d'un paragraphe complet dans les chapitres que l'agence (re)génère. */
export function WritingBlocksLibrary({ query = "", canPublish = true, focusKey = "" }) {
  const [data, setData] = useState(null);
  const [section, setSection] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState({});
  const [editing, setEditing] = useState(null);   // { id, text }
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [activation, setActivation] = useState("");
  const [projects, setProjects] = useState([]);
  const [test, setTest] = useState(null);       // { id, projectId, result } : « Tester sur un projet » (aperçu avant / après, rien n'est enregistré)
  const [review, setReview] = useState(null);   // { id } : revue d'impact avant publication
  useEffect(() => { listProjectsForBlocks().then((list) => setProjects((list || []).filter((p) => (p.selected || []).includes("06")))).catch(() => setProjects([])); }, []);
  const load = useCallback(() => getWritingBlocks({ q: query.trim(), section, origin, activation }).then((result) => { setData(result); setError(""); }).catch((e) => setError(e.message || "Blocs indisponibles.")), [query, section, origin, activation]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn, done) => { setBusy(true); setError(""); setMessage(""); try { await fn(); await load(); setMessage(done); } catch (e) { setError(e.message || "Action impossible."); } finally { setBusy(false); } };
  if (error && !data) return <p className="err" role="alert" data-writing-blocks-error>{error}</p>;
  if (!data) return <p className="pln-muted" data-writing-blocks-loading>Chargement des blocs de rédaction…</p>;
  const grouped = data.blocks.reduce((acc, block) => ({ ...acc, [block.section]: [...(acc[block.section] || []), block] }), {});
  return <section data-writing-blocks>
    <p className="pln-muted">Les textes que Calepin utilise pour rédiger le CCTP Plâtrerie. Le Standard Calepin n’est jamais modifié : vous pouvez adapter un paragraphe complet pour votre agence. Votre texte s’applique aux chapitres que vous (re)générez ; <b>les CCTP déjà rédigés ne changent pas</b>.</p>
    {error && <div className="err" role="alert" data-writing-blocks-error>{error}</div>}
    {message && <p className="ok" role="status" data-writing-blocks-message>{message}</p>}
    <div data-writing-blocks-filters style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
      {[["", "Tous"], ["CALEPIN_STANDARD", "Standard Calepin"], ["AGENCY", "Personnalisés par l’agence"]].map(([id, label]) => <button key={id || "all"} type="button" className={origin === id ? "primary" : "secondary"} data-writing-blocks-origin={id || "all"} onClick={() => setOrigin(id)}>{label}</button>)}
      <span className="muted" style={{ alignSelf: "center" }}>·</span>
      {[["", "Toute activation"], ["ALWAYS", "Toujours"], ["CONDITIONAL", "Conditionnels"]].map(([id, label]) => <button key={id || "any"} type="button" className={activation === id ? "primary" : "secondary"} data-writing-blocks-activation={id || "any"} onClick={() => setActivation(id)}>{label}</button>)}
    </div>
    <label>Section <select data-writing-blocks-section value={section} onChange={(e) => setSection(e.target.value)}><option value="">Toutes les sections ({data.count})</option>{(data.sections || []).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
    {!data.blocks.length && <p className="pln-muted" data-writing-blocks-empty>Aucun bloc ne correspond à cette recherche.</p>}
    {(data.clauses || []).length > 0 && <div data-writing-clauses style={{ marginTop: 12 }}>
      <h3>Clauses de l’agence <small className="muted">({data.clauses.length})</small></h3>
      <p className="pln-muted">Créées et validées dans « Clauses » ; présentées ici avec les blocs Calepin pour voir tout ce qui compose vos CCTP. Elles sont proposées au MOE, jamais insérées seules.</p>
      <ul className="plain-list" style={{ display: "grid", gap: 8 }}>{data.clauses.map((clause) => <li key={clause.id} className="card" data-agency-clause={clause.id} data-activation={clause.activation}>
        <b>{clause.label}</b>
        <p style={{ margin: "4px 0" }}>{clause.text.length > 220 ? `${clause.text.slice(0, 220)}…` : clause.text}</p>
        <small className="muted" data-clause-scope>{clause.originLabel} · {clause.lotLabel} · {clause.familyLabel} · {clause.section} · version {clause.version} · {clause.status === "validated" ? "validée" : clause.status === "rejected" ? "refusée" : "à valider"}</small>
        <small className="muted" data-clause-activation style={{ display: "block" }}>{clause.activationLabel}{clause.tags.length ? ` · étiquettes : ${clause.tags.join(", ")}` : ""}</small></li>)}</ul></div>}
    {Object.entries(grouped).map(([title, blocks]) => <div key={title} data-writing-blocks-group={title} style={{ marginTop: 12 }}>
      <h3>{title} <small className="muted">({blocks.length})</small></h3>
      <ul className="plain-list" style={{ display: "grid", gap: 8 }}>{blocks.map((block) => <li key={block.id} className="card" data-focused={focusKey && focusKey === block.id ? "true" : "false"} ref={focusKey && focusKey === block.id ? (node) => node?.scrollIntoView?.({ block: "center" }) : undefined} data-writing-block={block.id} data-origin={block.origin} data-reachable={block.reachable ? "true" : "false"} data-editable={block.editable ? "true" : "false"} style={{ padding: 10 }}>
        <p style={{ margin: 0 }}>{open[block.id] || block.text.length <= 220 ? block.text : `${block.text.slice(0, 220)}…`}
          {block.text.length > 220 && <> <button type="button" className="link-button" data-writing-block-toggle onClick={() => setOpen({ ...open, [block.id]: !open[block.id] })}>{open[block.id] ? "Réduire" : "Voir tout"}</button></>}</p>
        <small className="muted" data-writing-block-meta>{block.originLabel} · version {block.version} · {block.status}</small>
        <small className="muted" data-writing-block-activation style={{ display: "block" }}>{block.activationLabel}</small>
        {block.draft && <small data-writing-block-draft style={{ display: "block" }}><b>Brouillon en cours</b> (version {block.draft.version}) : pas encore appliqué.</small>}
        {block.standardChanged && <small className="err" data-writing-block-standard-changed style={{ display: "block" }}>Le texte Standard a évolué depuis votre adaptation : relisez-la.</small>}
        {editing?.id === block.id
          ? <div data-writing-block-editor style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {block.kind === "template" && <small className="muted" data-writing-block-variables style={{ display: "block" }}>Ce paragraphe contient des informations du projet : {block.variables.map((v) => `{${v}}`).join(", ")}. Gardez-les dans votre texte, leur valeur vient toujours du projet.</small>}
            <fieldset data-writing-block-mode style={{ border: 0, padding: 0, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[["REPLACE", "Remplacer le paragraphe"], ["COMPLETE", "Ajouter une phrase après"], ["DISABLE", "Ne pas écrire ce paragraphe"]].map(([value, label]) => <label key={value} className="inline-check"><input type="radio" name={`mode-${block.id}`} data-writing-block-mode-option={value} checked={(editing.mode || "REPLACE") === value} onChange={() => setEditing({ ...editing, mode: value, text: value === "REPLACE" && !editing.text ? block.text : editing.text })} /> {label}</label>)}</fieldset>
            {(editing.mode || "REPLACE") !== "DISABLE" && <textarea rows={5} data-writing-block-text value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} aria-label="Texte de votre agence pour ce paragraphe" />}
            <section data-writing-block-diff style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <div><b>AVANT — Standard Calepin</b><p style={{ margin: 0 }} className="muted">{block.standardText}</p></div>
              <div><b>APRÈS — Version de votre agence</b><p style={{ margin: 0 }}>{(editing.mode || "REPLACE") === "DISABLE" ? "Ce paragraphe ne sera pas écrit." : (editing.mode === "COMPLETE" ? `${block.standardText} ${editing.text}` : editing.text) || "…"}</p></div>
            </section>
            <div data-writing-block-test style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label>Tester sur un projet <select data-writing-block-test-project value={test?.id === block.id ? test.projectId : ""} onChange={(e) => setTest({ id: block.id, projectId: e.target.value, result: null })}><option value="">Choisir un projet</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <button type="button" className="secondary" data-writing-block-test-run disabled={busy || !(test?.id === block.id && test.projectId)} onClick={() => act(async () => { const result = await previewWritingBlockOverride(block.id, { project_id: test.projectId, mode: editing.mode || "REPLACE", text: editing.text || "" }); setTest({ ...test, result }); }, "Aperçu calculé : rien n’est enregistré.")}>Voir le résultat</button>
            </div>
            {test?.id === block.id && test.result && <section data-writing-block-test-result className="muted" style={{ fontSize: 13 }}>
              <p style={{ margin: 0 }}>{test.result.message}</p>
              {test.result.changed && <><p style={{ margin: "4px 0 0" }}><b>Avant :</b> {test.result.before.join(" / ") || "—"}</p><p style={{ margin: 0 }}><b>Après :</b> {test.result.after.join(" / ") || "—"}</p></>}
              <p style={{ margin: "4px 0 0" }}><b>Impact :</b> {test.result.impact.text}</p></section>}
            <div><button type="button" className="secondary" onClick={() => setEditing(null)}>Annuler</button> <button type="button" className="primary" data-writing-block-save disabled={busy || ((editing.mode || "REPLACE") === "REPLACE" && (editing.text.trim().length < 20 || editing.text.trim() === block.standardText.trim())) || (editing.mode === "COMPLETE" && editing.text.trim().length < 5)}
              onClick={() => act(async () => { await saveWritingBlockOverride(block.id, editing.text, editing.mode || "REPLACE"); setEditing(null); }, "Brouillon enregistré. Publiez-le pour l’appliquer aux prochains chapitres générés.")}>Enregistrer le brouillon</button></div></div>
          : <span className="pln-inline" style={{ marginTop: 6 }}>
            {block.editable
              ? <button type="button" className="link-button" data-writing-block-edit onClick={() => setEditing({ id: block.id, mode: block.draft?.mode || block.override?.mode || "REPLACE", text: block.draft ? block.draft.text : (block.override && block.override.mode !== "REPLACE" ? "" : block.text) })}>{block.origin === "AGENCY" ? "Modifier la version de mon agence" : "Adapter pour mon agence"}</button>
              : <small className="muted" data-writing-block-not-editable title="Ce paragraphe est mêlé à une phrase qui contient des informations du projet, ou son effet n’a pas pu être vérifié : le remplacer seul casserait la phrase.">Non modifiable seul</small>}
            {block.draft && canPublish && <button type="button" className="link-button" data-writing-block-publish disabled={busy} onClick={() => setReview({ id: block.id })}>Relire l’impact et publier</button>}
            {review?.id === block.id && <section data-writing-block-review className="card" style={{ flexBasis: "100%" }}>
              <p style={{ margin: 0 }}><b>Revue avant publication</b> — {({ REPLACE: "remplace", COMPLETE: "complète", DISABLE: "désactive" })[block.draft?.mode || "REPLACE"]} ce paragraphe pour votre agence.</p>
              <p className="muted" style={{ margin: "4px 0" }}>AVANT : {block.standardText}</p>
              <p style={{ margin: "4px 0" }}>APRÈS : {block.draft?.mode === "DISABLE" ? "paragraphe non écrit" : block.draft?.mode === "COMPLETE" ? `${block.standardText} ${block.draft.text}` : block.draft?.text}</p>
              <p className="muted" style={{ margin: "4px 0" }}>Impact : s’applique aux chapitres que vous (re)générez ; les CCTP déjà rédigés et les projets gelés ne changent pas.</p>
              <button type="button" className="secondary" onClick={() => setReview(null)}>Retour</button> <button type="button" className="primary" data-writing-block-publish-confirm disabled={busy} onClick={() => act(async () => { await publishWritingBlockOverride(block.id); setReview(null); }, "Publié pour votre agence. Les CCTP déjà rédigés ne sont pas modifiés.")}>Publier</button></section>}
            {block.origin === "AGENCY" && canPublish && <button type="button" className="link-button" data-writing-block-restore disabled={busy} onClick={() => act(() => restoreWritingBlock(block.id), "Standard Calepin rétabli pour ce paragraphe.")}>Rétablir le Standard</button>}
          </span>}
      </li>)}</ul>
    </div>)}
  </section>;
}
