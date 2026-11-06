import { Fragment, useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { apiFetch } from "../api/client";

/** Pattern transversal de personnalisation contextuelle (INLINE-PERSONALIZATION-CORE-01) : le crayon ✏️ signifie TOUJOURS « Personnaliser cet élément pour mon agence ».
 *  Modifier la valeur affichée agit sur ce projet ; le crayon change le comportement proposé sur les futurs projets (brouillon agence → impact → publication, dans la Bibliothèque). */
export function InlinePersonalizationTrigger({ onOpen, label = "Personnaliser pour mon agence" }) {
  return <button type="button" className="inline-pencil" data-inline-personalize title={label} aria-label={label} onClick={(event) => { event.stopPropagation?.(); onOpen(event); }} onPointerDown={(event) => event.stopPropagation?.()}><Pencil size={14} /></button>;
}

export const openLibraryAt = (projectId, target) => window.dispatchEvent(new CustomEvent("calepin:open-library", { detail: { projectId, target } }));

/** Drawer commun : élément actuel · pourquoi · Standard · version de l'agence · options · impact (avant/après sur ce projet) · brouillon · lien exact vers la Bibliothèque. */
export function InlinePersonalizationDrawer({ target, onClose, onViewCctp }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  const [preview, setPreview] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  useEffect(() => {
    apiFetch("/personalization/resolve", { method: "POST", body: JSON.stringify(target) }).then((result) => { setInfo(result); setText(result.textInput?.initial || ""); }).catch((e) => setError(e?.detail?.message || e.message || "Élément introuvable."));
  }, [target.entityId, target.projectId]);
  const run = async (fn) => { setBusy(true); setError(""); try { await fn(); } catch (e) { setError(e?.detail?.message || e.message || "Action impossible."); } finally { setBusy(false); } };
  const entityId = info?.entity?.entityId || target.entityId;
  const needsText = info?.textInput?.modes?.includes(choice);
  const change = { projectId: target.projectId, entityId, choice, lineKey: entityId, treatment: choice, text: needsText ? text : "" };
  const canEdit = info?.permissions?.canEdit;
  return <aside className="inline-drawer" role="dialog" aria-label="Personnalisation" data-inline-drawer style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(460px, 100vw)", background: "var(--paper, #fff)", boxShadow: "-4px 0 24px rgba(0,0,0,.18)", padding: 16, overflowY: "auto", zIndex: 60, display: "grid", gap: 10, alignContent: "start" }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
      <div><small className="eyebrow" data-inline-heading>{canEdit === false ? "CONFIGURATION APPLIQUÉE" : info?.heading || "PERSONNALISER POUR MON AGENCE"}</small><h3 style={{ margin: "2px 0" }} data-inline-title>{info?.title || "…"}</h3></div>
      <button type="button" className="secondary" aria-label="Fermer" data-inline-close onClick={onClose}><X size={14} /></button></header>
    {error && <div className="err" role="alert" data-inline-error>{error}</div>}
    {info && <>
      <section data-inline-current><b>Élément actuel</b><dl style={{ margin: "4px 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px" }}>{info.current.map((row) => <Fragment key={row.label}><dt className="muted">{row.label}</dt><dd style={{ margin: 0 }}>{row.value}</dd></Fragment>)}</dl></section>
      <section data-inline-why><b>Pourquoi Calepin fait cela ?</b><p style={{ margin: "4px 0" }}>{info.why.text}</p>
        {info.why.rule && <small className="muted">Règle de génération : {info.why.rule}</small>}
        {onViewCctp && <div><button type="button" className="link-button" data-inline-view-cctp onClick={onViewCctp}>Voir dans le CCTP</button></div>}</section>
      <section data-inline-standard><b>STANDARD CALEPIN</b><p style={{ margin: "4px 0" }}>{info.standard.text}</p></section>
      <section data-inline-agency><b>VERSION DE MON AGENCE</b>
        {info.agency ? <p style={{ margin: "4px 0" }}>{info.agency.name} — {info.agency.effectLabel} · {info.agency.status === "PUBLISHED" ? "publiée" : "brouillon"} (version {info.agency.version})</p> : <p className="muted" style={{ margin: "4px 0" }}>Aucune personnalisation : le Standard s’applique.</p>}</section>
      {canEdit && <section data-inline-options><b>{info.choiceLabel || "Que doit faire Calepin pour cet élément ?"}</b>
        {info.options.map((o) => <label key={o.value} className="inline-check" style={{ display: "block" }}><input type="radio" name="inline-treatment" data-inline-option={o.value} checked={choice === o.value} onChange={() => { setChoice(o.value); setPreview(null); setSaved(null); }} /> {o.label}{o.current ? " (actuel)" : ""}</label>)}</section>}
      {canEdit && info.textInput && needsText && <label data-inline-text style={{ display: "grid", gap: 4 }}>{info.textInput.label}<textarea rows={6} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); setSaved(null); }} data-inline-text-input /></label>}
      {preview && <section data-inline-impact><b>Impact sur ce projet</b>
        <p style={{ margin: "4px 0" }}><b>AVANT</b> : {preview.before.join(" · ") || "—"}</p><p style={{ margin: "4px 0" }}><b>APRÈS</b> : {preview.after.join(" · ") || "—"}</p>
        <small className="muted">{preview.changed ? "Cette personnalisation changerait ce projet si vous l’appliquiez." : "Aucun changement sur ce projet."} {preview.note}</small></section>}
      {saved && <p className="ok" role="status" data-inline-saved>{saved.note}</p>}
      <p className="muted" data-inline-scope style={{ margin: 0 }}>{info.scopeNote}</p>
      <p className="muted" data-inline-price style={{ margin: 0 }}>{info.price?.note}</p>
      {info.note && <p className="muted" data-inline-note style={{ margin: 0 }}>{info.note}</p>}
      <footer style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "sticky", bottom: 0, background: "var(--paper, #fff)", padding: "8px 0" }}>
        {canEdit && info.actions && <button type="button" className="secondary" data-inline-preview disabled={busy || !choice || (needsText && !text.trim())} onClick={() => run(async () => setPreview(await apiFetch(info.actions.preview, { method: "POST", body: JSON.stringify(change) })))}>Tester sur ce projet</button>}
        {canEdit && info.actions && <button type="button" className="primary" data-inline-draft disabled={busy || !choice || (needsText && !text.trim())} onClick={() => run(async () => { const result = await apiFetch(info.actions.draft, { method: "POST", body: JSON.stringify(change) }); setSaved(result); setInfo({ ...info, libraryTarget: result.libraryTarget, agency: { name: result.rule.name, effectLabel: result.rule.effectLabel, status: "DRAFT", version: result.rule.version } }); })}>Enregistrer en brouillon</button>}
        <button type="button" className="link-button" data-inline-library onClick={() => openLibraryAt(target.projectId, info.libraryTarget)}>Voir dans la Bibliothèque</button></footer>
      <small className="muted">Brouillon agence → impact → validation → publication : la règle se publie dans {info.libraryTarget.label}.</small>
    </>}
  </aside>;
}

/** Hôte unique des crayons des écrans qui n'ont pas leur propre drawer (questionnaire…) : écoute l'événement calepin:inline-personalize. Les tâches du Planning sont gérées par leur page. */
export function InlinePersonalizationHost({ projectId }) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    const handler = (event) => { const detail = event.detail || {}; if (detail.entityType && detail.entityType !== "planning_task") setTarget({ entityType: detail.entityType, entityId: detail.entityId, projectId: detail.projectId || projectId }); };
    window.addEventListener("calepin:inline-personalize", handler);
    return () => window.removeEventListener("calepin:inline-personalize", handler);
  }, [projectId]);
  return target && target.projectId ? <InlinePersonalizationDrawer key={`${target.entityType}:${target.entityId}`} target={target} onClose={() => setTarget(null)} /> : null;
}
