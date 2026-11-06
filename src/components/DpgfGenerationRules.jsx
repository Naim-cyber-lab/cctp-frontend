import { useCallback, useEffect, useState } from "react";
import { archiveDpgfRule, detectDpgfRuleCandidates, dismissDpgfRuleCandidate, draftDpgfRuleCandidate, getDpgfRuleImpact, getDpgfStructure, listDpgfRuleCandidates, listDpgfRules, publishDpgfRule, saveDpgfRule } from "../api/client";

const STATUS = { DRAFT: "Brouillon", PUBLISHED: "Publiée", ARCHIVED: "Archivée" };
const NEEDS_TARGET = new Set(["CREATE_MAIN_LINE", "CREATE_PLUS_VALUE", "CREATE_ACCESSORY_LINE", "CREATE_OPTION_LINE", "CREATE_ADMIN_LINE"]);
const EMPTY = { name: "", effect: "CREATE_PLUS_VALUE", target_catalog_item: "", quantity_policy: "FROM_QUESTIONNAIRE", description: "" };

/** Bibliothèque › DPGF › Règles de génération CCTP → DPGF : ce que Calepin fait d'une exigence du CCTP dans la DPGF. Brouillon, publication, archivage ; les projets existants ne changent jamais seuls. */
export function DpgfGenerationRules({ canPublish = true, focusKey = "", onOpenPrices }) {
  const [candidates, setCandidates] = useState(null);
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState(null);          // { rule_key, version, data, projectId } : aperçu d'impact ouvert
  const [conflictPrompt, setConflictPrompt] = useState(null);   // { rule, conflicts } : publication bloquée par un conflit
  const openImpact = async (rule, projectId = "") => {
    setError("");
    try { setImpact({ rule_key: rule.rule_key, version: rule.version, projectId, data: await getDpgfRuleImpact(rule.rule_key, { version: rule.version, cctpId: projectId || undefined }) }); }
    catch (e) { setError(e.message || "Aperçu impossible."); }
  };
  const publish = async (rule, acknowledge = false) => {
    setBusy(true); setError(""); setMessage("");
    try { await publishDpgfRule(rule.rule_key, rule.version, acknowledge); setConflictPrompt(null); setImpact(null); await load(); setMessage("Règle publiée pour les nouveaux projets. Les projets existants ne changent pas."); }
    catch (e) { if (e.detail?.code === "RULE_CONFLICT") setConflictPrompt({ rule, conflicts: e.detail.conflicts || [] }); else setError(e.message || "Publication impossible."); }
    finally { setBusy(false); }
  };
  const load = useCallback(async () => { try { setData(await listDpgfRules()); } catch (e) { setError(e.message || "Lecture impossible."); } }, []);
  useEffect(() => { load(); getDpgfStructure("").then((r) => setCatalog(r.items || [])).catch(() => {}); }, [load]);
  const act = async (fn, done) => { setBusy(true); setError(""); setMessage(""); try { await fn(); await load(); setMessage(done); } catch (e) { setError(e.message || "Action impossible."); } finally { setBusy(false); } };
  const needsTarget = NEEDS_TARGET.has(form.effect);
  const edit = (rule) => { setEditing(rule.rule_key); setForm({ name: rule.name, effect: rule.effect, target_catalog_item: rule.target_catalog_item || "", quantity_policy: rule.quantity_policy, description: rule.description || "" }); setOpen(true); };
  const save = () => act(async () => { await saveDpgfRule({ ...form, rule_key: editing || undefined, target_catalog_item: form.target_catalog_item || null }); setForm(EMPTY); setEditing(null); setOpen(false); }, "Brouillon enregistré. Publiez-le pour l’appliquer aux nouveaux projets.");
  if (!data) return error ? <p className="err" role="alert" data-dpgf-rules-error>{error}</p> : <p className="pln-muted">Chargement des règles…</p>;
  return <section data-dpgf-generation-rules>
    <p className="pln-muted">Ces règles décident comment les ouvrages et exigences du CCTP deviennent des lignes de la DPGF. Une règle publiée s’applique aux nouveaux projets ; <b>vos projets existants gardent leur version</b>.</p>
    <section data-dpgf-rule-suggestions className="card" style={{ margin: "8px 0" }}>
      <b>Suggestions issues de vos anciens dossiers</b>
      <p className="pln-muted" style={{ margin: "4px 0" }}>Calepin relit les lignes que vous avez validées dans l’historique et signale les régularités répétées. Une suggestion n’est pas une règle : elle ne s’applique à rien tant que vous ne la transformez pas en brouillon, puis ne la publiez.</p>
      <button type="button" className="secondary" data-dpgf-suggest-run disabled={busy} onClick={() => act(async () => { const result = await detectDpgfRuleCandidates(); setCandidates(result.candidates); }, "Suggestions mises à jour.")}>Chercher dans mes anciens dossiers</button>
      {candidates && !candidates.length && <p className="pln-muted" data-dpgf-suggest-empty>Aucune régularité répétée (au moins 3 dossiers, 70 %) à vous proposer pour l’instant.</p>}
      {candidates && candidates.length > 0 && <ul className="plain-list" data-dpgf-suggest-list>{candidates.map((c) => <li key={c.id} data-dpgf-suggestion={c.target}>
        <span data-dpgf-suggestion-text>{c.statement}</span> <small className="muted">({c.effectLabel} · {c.support.projectsWithRole}/{c.support.projects} dossiers)</small>
        <small className="muted" style={{ display: "block" }}>{(c.support.examples || []).map((e) => `${e.project} : ${e.designation}`).join(" · ")}</small>
        <span className="pln-inline"><button type="button" className="link-button" data-dpgf-suggestion-draft disabled={busy} onClick={() => act(async () => { await draftDpgfRuleCandidate(c.id); setCandidates((await listDpgfRuleCandidates()).candidates); }, "Brouillon créé : relisez-le, simulez son impact, puis publiez-le.")}>Créer un brouillon de règle</button>
          <button type="button" className="link-button" data-dpgf-suggestion-dismiss disabled={busy} onClick={() => act(async () => { await dismissDpgfRuleCandidate(c.id); setCandidates((await listDpgfRuleCandidates()).candidates); }, "Suggestion écartée.")}>Écarter</button></span></li>)}</ul>}
    </section>
    <p className="pln-muted" data-dpgf-rules-priority>Ordre de priorité : règle du projet, puis règle de l’agence, puis Standard Calepin.</p>
    {error && <div className="err" role="alert" data-dpgf-rules-error>{error}</div>}
    {message && <p className="ok" role="status" data-dpgf-rules-message>{message}</p>}
    <button type="button" className="primary" data-dpgf-rule-new onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }}>+ Nouvelle règle</button>
    {open && <div className="card" data-dpgf-rule-form>
      <label>Nom de la règle<input data-dpgf-rule-name value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Parement hydrofuge en plus-value" /></label>
      <label>Ce que fait Calepin<select data-dpgf-rule-effect value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value })}>{data.effects.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
      {needsTarget && <label>Poste concerné<select data-dpgf-rule-target value={form.target_catalog_item} onChange={(e) => setForm({ ...form, target_catalog_item: e.target.value })}><option value="">Choisir un poste…</option>{catalog.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>}
      <label>Quantité<select data-dpgf-rule-quantity value={form.quantity_policy} onChange={(e) => setForm({ ...form, quantity_policy: e.target.value })}>{data.quantityPolicies.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></label>
      <label>Description (facultatif)<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <div><button type="button" className="secondary" onClick={() => { setOpen(false); setEditing(null); }}>Annuler</button> <button type="button" className="primary" data-dpgf-rule-save disabled={busy || !form.name.trim() || (needsTarget && !form.target_catalog_item)} onClick={save}>Enregistrer le brouillon</button></div>
    </div>}
    {conflictPrompt && <div className="err" role="alert" data-dpgf-rule-conflict>
      <b>Conflit avec une autre règle de l’agence</b>
      <ul>{conflictPrompt.conflicts.map((c, i) => <li key={i} data-dpgf-conflict={c.code}>{c.message}</li>)}</ul>
      <button type="button" className="secondary" onClick={() => setConflictPrompt(null)}>Corriger avant de publier</button>{" "}
      <button type="button" className="primary" data-dpgf-rule-publish-anyway disabled={busy} onClick={() => publish(conflictPrompt.rule, true)}>Publier malgré le conflit</button>
    </div>}
    {impact && <aside className="card" data-dpgf-impact style={{ display: "grid", gap: 8, margin: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><b>Impact de « {impact.data.rule} » (version {impact.data.version})</b><button type="button" className="link-button" data-dpgf-impact-close onClick={() => setImpact(null)}>Fermer</button></div>
      <section><h4>Ce que fait actuellement Calepin</h4><p data-dpgf-impact-standard>{impact.data.whatCalepinDoes}</p></section>
      <section><h4>Votre personnalisation</h4><p data-dpgf-impact-custom>{impact.data.yourCustomization}</p></section>
      <section><h4>Impact</h4><p data-dpgf-impact-text>{impact.data.impact}</p></section>
      {impact.data.conflicts.length > 0 && <section data-dpgf-impact-conflicts><h4>Conflits à examiner</h4><ul>{impact.data.conflicts.map((c, i) => <li key={i} data-dpgf-conflict={c.code}>{c.message}</li>)}</ul></section>}
      <section><h4>Tester cette règle sur un projet</h4>
        <select data-dpgf-impact-project aria-label="Projet à simuler" value={impact.projectId} onChange={(e) => openImpact({ rule_key: impact.rule_key, version: impact.version }, e.target.value)}>
          <option value="">Choisir un projet…</option>{impact.data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {impact.data.simulation && <div data-dpgf-simulation>
          <p><b>Avant</b> : {impact.data.simulation.before} lignes DPGF · <b>Après</b> : {impact.data.simulation.after} lignes</p>
          {impact.data.simulation.added.length > 0 && <ul>{impact.data.simulation.added.map((l, i) => <li key={i}>+ {l.designation} ({l.unit || "—"}) · quantité {l.quantity}</li>)}</ul>}
          {impact.data.simulation.removed.length > 0 && <ul>{impact.data.simulation.removed.map((l, i) => <li key={i}>− {l.designation}</li>)}</ul>}
          <p className="pln-muted" data-dpgf-simulation-note>{impact.data.simulation.note} Simulation : le projet n’est pas modifié.</p></div>}
      </section>
      {impact.data.adoptionSummary && <ul data-rule-adoption-summary>
        <li>{impact.data.adoptionSummary.future} projet{impact.data.adoptionSummary.future > 1 ? "s" : ""} sans saisie : la règle s’appliquera telle quelle.</li>
        <li>{impact.data.adoptionSummary.canUpdate} projet{impact.data.adoptionSummary.canUpdate > 1 ? "s" : ""} en cours : une mise à jour pourra leur être proposée.</li>
        <li>{impact.data.adoptionSummary.frozen} projet{impact.data.adoptionSummary.frozen > 1 ? "s" : ""} déjà envoyé{impact.data.adoptionSummary.frozen > 1 ? "s" : ""} en consultation : non modifié{impact.data.adoptionSummary.frozen > 1 ? "s" : ""}.</li></ul>}
      <small className="pln-muted">{impact.data.inProgressNote}</small>
    </aside>}
    {!data.agency.length && <p className="pln-muted" data-dpgf-rules-empty>Aucune règle d’agence pour l’instant : Calepin applique son Standard.</p>}
    <ul className="plain-list" data-dpgf-rules-list>{data.agency.map((rule) => <li key={rule.rule_key} data-dpgf-rule={rule.rule_key} data-status={rule.status} data-focused={focusKey === rule.rule_key ? "true" : "false"} style={focusKey === rule.rule_key ? { outline: "2px solid var(--accent, #315f51)", borderRadius: 6 } : undefined} ref={focusKey === rule.rule_key ? (node) => node?.scrollIntoView?.({ block: "center" }) : undefined}>
      <b>{rule.name}</b> · {rule.effectLabel} · <span data-dpgf-rule-status>{STATUS[rule.status]}</span> · version {rule.version} · Personnalisé par l’agence
      <span className="pln-inline">
        {rule.status === "DRAFT" && <button type="button" className="link-button" data-dpgf-rule-edit onClick={() => edit(rule)}>Modifier</button>}
        {rule.status === "PUBLISHED" && <button type="button" className="link-button" data-dpgf-rule-newversion onClick={() => edit(rule)}>Nouvelle version</button>}
        <button type="button" className="link-button" data-dpgf-rule-impact onClick={() => openImpact(rule)}>Voir l’impact</button>
        {rule.target_catalog_item && onOpenPrices && <button type="button" className="link-button" data-dpgf-rule-prices onClick={() => onOpenPrices(rule.target_catalog_item)}>Voir les références de prix associées</button>}
        {rule.status === "DRAFT" && canPublish && <button type="button" className="link-button" data-dpgf-rule-publish disabled={busy} onClick={() => publish(rule)}>Publier</button>}
        {rule.status !== "ARCHIVED" && canPublish && <button type="button" className="link-button" data-dpgf-rule-archive disabled={busy} onClick={() => act(() => archiveDpgfRule(rule.rule_key), "Règle archivée.")}>Archiver</button>}
      </span></li>)}</ul>
  </section>;
}
