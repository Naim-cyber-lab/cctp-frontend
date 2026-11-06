import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { actOnFeasibilityConsistency, actOnFeasibilityIssue, getFeasibilityChecklist, getFeasibilityComparables, getFeasibilityMacroReferences, patchFeasibilityChecklist, proposeFeasibilityStructure,
  refreshFeasibilityChecklist, saveFeasibilityEstimate, saveFeasibilityMacroReference, saveFeasibilityReserves, setFeasibilityConclusion, uploadAttachment, validateFeasibility } from "../api/client";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const euro = (value) => (value === null || value === undefined || value === "" ? "—" : money.format(value));
const AXIS_ICON = { NOT_ASSESSED: "○", OK_AT_THIS_STAGE: "✓", POINTS_TO_CONFIRM: "⚠", RESERVATIONS: "⚠", INSUFFICIENT_INFORMATION: "○" };
const DOC_CATEGORY_OF = { "new-geotechnical": "geotechnique", "renovation-asbestos": "diagnostics", "old-building-structure": "diagnostics", "lead-known": "diagnostics", "reg-plu": "urbanisme", "new-topography": "topographie", "renovation-survey": "plans", "tech-plans-unreliable": "plans" };

/** Analyse de faisabilité : état des cinq axes, contrôles de cohérence, puis des points expliqués (pourquoi, impact) avec des actions métier. Aucun score, aucune conclusion automatique. */
export function Analyse({ data, id, editable, run, goTab, onData, register }) {
  const { axes, counts } = data.analysis;
  const [showClosed, setShowClosed] = useState(false), [commenting, setCommenting] = useState(null), [note, setNote] = useState(""), [openAxis, setOpenAxis] = useState({});
  const fileInput = useRef(null), uploadFor = useRef(null);
  const act = (issue, action, extra = {}) => run(() => actOnFeasibilityIssue(id, issue.id, { action, ...extra }));
  const handle = async (issue, action) => {
    if (action === "fill" || action === "fix_framing" || action === "choose_value" || action === "add_hypothesis") return goTab("cadrage");
    if (action === "review_estimate") return goTab("estimation");
    if (action === "comment") { setCommenting(issue.id); setNote(""); return null; }
    if (action === "add_document") { uploadFor.current = issue; fileInput.current?.click(); return null; }
    return act(issue, action);
  };
  const upload = async (files) => {
    const issue = uploadFor.current;
    if (!issue || !files.length) return;
    for (const file of files) await uploadAttachment(id, "", file, DOC_CATEGORY_OF[issue.ruleKey] || "etudes", "FEASIBILITY").catch(() => {});
    await run(() => refreshFeasibilityChecklist(id)); // le document reçu clôt le point (réévaluation automatique)
  };
  const scrollTo = (key) => { setOpenAxis((current) => ({ ...current, [key]: true })); requestAnimationFrame(() => document.querySelector(`[data-axis="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  return <section className="feas-panel" data-feasibility-panel="analyse" data-overall-status={data.analysis.overall.status}>
    <input ref={fileInput} type="file" hidden multiple data-issue-file onChange={(event) => { upload([...event.target.files]); event.target.value = ""; }} />
    <section className="feas-state" data-analysis-state aria-label="Faisabilité — état actuel">
      <h2>FAISABILITÉ — ÉTAT ACTUEL</h2>
      <ul>{axes.map((axis) => <li key={axis.key}><button type="button" className={`feas-state-axis st-${axis.status}`} data-axis-summary={axis.key} data-axis-status={axis.status} onClick={() => scrollTo(axis.key)}><span aria-hidden="true">{AXIS_ICON[axis.status]}</span><b>{axis.label}</b><em data-axis-headline>{axis.headline}</em></button></li>)}</ul>
      <p className="feas-note" data-analysis-counts>{counts.open} point{counts.open > 1 ? "s" : ""} ouvert{counts.open > 1 ? "s" : ""}{counts.important ? ` dont ${counts.important} important${counts.important > 1 ? "s" : ""}` : ""}. Aucun score : seuls les cinq axes et leurs points comptent.</p>
    </section>
    {data.estimate.budget !== null && data.estimate.totals.counts.estimated > 0 && <section className="feas-budget-box" data-analysis-budget aria-label="Budget et estimation">
      <h3>Budget et estimation</h3>
      <dl className="feas-gap"><dt>Budget MOA</dt><dd>{euro(data.estimate.budget)}</dd><dt>{data.estimate.totals.complete ? "Estimation" : "Estimation (partielle)"}</dt><dd>{euro(data.estimate.totals.central)}</dd>
        {data.estimate.totals.gap !== null && <><dt>Écart</dt><dd data-analysis-budget-gap>{data.estimate.totals.gap > 0 ? "+" : ""}{euro(data.estimate.totals.gap)}{data.estimate.totals.gapPercent !== null ? ` (${data.estimate.totals.gap > 0 ? "+" : ""}${String(data.estimate.totals.gapPercent).replace(".", ",")} %)` : ""}</dd></>}</dl>
      {!data.estimate.totals.complete && <small className="feas-note">{data.estimate.totals.counts.toEstimate} lot{data.estimate.totals.counts.toEstimate > 1 ? "s restent" : " reste"} à estimer : comparaison provisoire.</small>}
    </section>}
    {data.consistency.length > 0 && <section className="feas-consistency" data-consistency-section>
      <h3>Contrôles de cohérence</h3>
      <ul>{data.consistency.map((item) => <li key={item.id} className={`feas-consistency-item st-${item.status}`} data-consistency={item.ruleKey} data-consistency-status={item.status}>
        <b>{item.typeLabel}</b><p>{item.message}</p>
        <small>{item.status === "OPEN" ? "Les informations concernées ne sont pas utilisées dans l’analyse, la synthèse ni l’estimation tant que ce point est ouvert." : "Conservé tel quel par le MOE."}</small>
        {editable && <span className="feas-issue-actions">{item.actions.map((action) => <button key={action.id} type="button" data-consistency-action={action.id} onClick={() => (action.id === "fix_framing" ? goTab("cadrage") : run(() => actOnFeasibilityConsistency(id, item.id, { action: action.id === "accept" ? "accept" : "reopen" })))}>{action.label}</button>)}</span>}
      </li>)}</ul>
    </section>}
    <label className="inline-check"><input type="checkbox" data-analysis-show-closed checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} /> Afficher les points traités</label>
    {axes.map((axis) => {
      const shown = axis.issues.filter((issue) => showClosed || !["RESOLVED", "NOT_APPLICABLE"].includes(issue.status));
      return <details key={axis.key} className={`feas-axis st-${axis.status}`} data-axis={axis.key} data-axis-status={axis.status} open={openAxis[axis.key] ?? (axis.open > 0 || axis.status === "NOT_ASSESSED")} onToggle={(event) => { const opened = event.currentTarget.open; setOpenAxis((current) => ({ ...current, [axis.key]: opened })); }}>
        <summary><b>{axis.label}</b><span className={`feas-badge ax-${axis.status}`} data-axis-badge>{axis.headline}</span></summary>
        {axis.status === "NOT_ASSESSED" && <p className="feas-note">Aucune information de cet axe n’est encore renseignée : complétez le cadrage pour lancer l’analyse.</p>}
        {shown.length > 0 ? <ul className="feas-issues">{shown.map((issue) => <li key={issue.id} className={`feas-issue state-${issue.stateKey}`} data-issue={issue.ruleKey} data-issue-status={issue.status} data-issue-state={issue.stateKey} data-issue-type={issue.type}>
          <div className="feas-issue-main">
            <div className="feas-issue-head"><b data-issue-title>{issue.title}</b><span className={`feas-badge st-${issue.stateKey}`} data-issue-state-label>{issue.stateLabel}</span>{issue.important && issue.stateKey !== "DONE" && <small className="feas-important" data-issue-important>Important</small>}</div>
            <dl className="feas-why">
              <dt>Pourquoi ce point ?</dt><dd data-issue-why>{issue.why}{issue.trigger.length > 0 && <ul className="feas-trigger" data-issue-trigger>{issue.trigger.map((item) => <li key={item.key}>{item.label} = {item.value}</li>)}</ul>}
                <small data-issue-rule>Règle automatique « {issue.triggerRuleId} »{issue.documentIds.length ? ` · ${issue.documentIds.length} document${issue.documentIds.length > 1 ? "s" : ""} lié${issue.documentIds.length > 1 ? "s" : ""} à cet axe` : ""}</small></dd>
              <dt>Impact potentiel</dt><dd data-issue-impact>{issue.impact}</dd>
            </dl>
            {issue.stateKey === "DONE" || issue.stateKey === "RESERVED" || issue.stateKey === "PLANNED" ? <small className="feas-issue-state" data-issue-resolution>{issue.auto ? "Traité automatiquement : les données du projet ont été mises à jour." : `${issue.resolutionNote || issue.stateLabel}${issue.decidedBy ? ` — décision du MOE (${issue.decidedBy}${issue.resolvedAt ? `, ${new Date(issue.resolvedAt).toLocaleDateString("fr-FR")}` : ""})` : ""}`}</small> : issue.resolutionNote ? <small className="feas-issue-state" data-issue-comment>{issue.resolutionNote}</small> : null}
            {commenting === issue.id && <div className="feas-edit"><textarea rows={2} value={note} data-issue-note placeholder="Commentaire du MOE" onChange={(event) => setNote(event.target.value)} /><button type="button" className="secondary" data-issue-note-save disabled={!note.trim()} onClick={async () => { await act(issue, "comment", { note }); setCommenting(null); }}>Enregistrer</button></div>}
          </div>
          {editable && <span className="feas-issue-actions">{issue.actions.map((action) => <button key={action.id} type="button" data-issue-action={action.id} onClick={() => handle(issue, action.id)}>{action.label}</button>)}</span>}
        </li>)}</ul> : axis.status !== "NOT_ASSESSED" && <p className="feas-note" data-axis-clear>Pas de point majeur identifié à ce stade.</p>}
        {axis.documents.length > 0 && <small className="feas-axis-docs" data-axis-documents>Documents liés : {axis.documents.map((doc) => doc.filename).join(", ")}</small>}
      </details>;
    })}
    <DecisionForm data={data} id={id} editable={editable} onData={onData} register={register} />
  </section>;
}

const BLANK_LINE = { label: "", method: "MANUAL", lineStatus: "TO_ESTIMATE", amountHt: "", baseValue: "", ratio: "", low: "", high: "", sourceLabel: "", sourceIds: [] };
const num = (value) => (value === "" || value === null || value === undefined ? null : Number(value));

/** Estimation globale du projet, volontairement distincte d'une DPGF par lots. */
export function GlobalEstimation({ data, id, editable, run, register }) {
  const existing = data.estimate.lines?.[0] || {};
  const [form, setForm] = useState({ amount: existing.amountHt ?? existing.retained ?? "", low: existing.low ?? "", high: existing.high ?? "", comment: existing.comment ?? "" });
  const [state, setState] = useState("");
  const timer = useRef(null), dirty = useRef(false), formRef = useRef(form);
  formRef.current = form;
  const save = async () => {
    if (!dirty.current) return;
    setState("saving");
    const value = formRef.current;
    const empty = value.amount === "" && value.low === "" && value.high === "" && !value.comment.trim();
    const payload = empty ? [] : [{ label: "Estimation globale du projet", method: "MANUAL", lineStatus: value.amount === "" ? "TO_ESTIMATE" : "ESTIMATED", amountHt: num(value.amount), low: num(value.low), high: num(value.high), comment: value.comment, sourceIds: [], sourceLabel: "Saisie MOE" }];
    const result = await run(() => saveFeasibilityEstimate(id, payload));
    if (!result) { setState("error"); throw new Error("Enregistrement impossible"); }
    dirty.current = false; setState("saved");
  };
  const change = (key) => (event) => { setForm((current) => ({ ...current, [key]: event.target.value })); dirty.current = true; setState(""); clearTimeout(timer.current); timer.current = setTimeout(() => save().catch(() => {}), 900); };
  useEffect(() => { register?.("estimation", save); });
  useEffect(() => () => { clearTimeout(timer.current); register?.("estimation", null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="feas-panel" data-feasibility-panel="estimation" data-estimation-scope="project">
    <h2>Estimation globale du projet</h2>
    <p className="feas-intro">Saisissez un premier ordre de grandeur pour l’ensemble de l’opération. Le découpage détaillé par lots sera réalisé ultérieurement dans la DPGF.</p>
    <div className="feas-edit"><label>Montant central HT<input type="number" min="0" step="any" value={form.amount} disabled={!editable} data-global-estimate-amount onChange={change("amount")} /></label><label>Fourchette basse<input type="number" min="0" step="any" value={form.low} disabled={!editable} data-global-estimate-low onChange={change("low")} /></label><label>Fourchette haute<input type="number" min="0" step="any" value={form.high} disabled={!editable} data-global-estimate-high onChange={change("high")} /></label></div>
    <label>Hypothèses et périmètre<textarea rows={4} value={form.comment} disabled={!editable} data-global-estimate-comment placeholder="Méthode, exclusions et principales hypothèses…" onChange={change("comment")} /></label>
    <p className="feas-autosave" role="status">{state === "saving" ? "Enregistrement…" : state === "error" ? "Enregistrement impossible" : state === "saved" ? "✓ Enregistré automatiquement" : "Enregistrement automatique"}</p>
  </section>;
}

/** Estimation argumentée : lots proposés (jamais leurs prix), méthode par lot, montant retenu par le MOE, fourchette, provenance, complétude. Enregistrement automatique. */
export function Estimation({ data, id, editable, run, goTab, register }) {
  const estimate = data.estimate;
  const [lines, setLines] = useState(estimate.lines), [saveState, setSaveState] = useState(""), [panel, setPanel] = useState(null);
  const version = useRef(0), timer = useRef(null), mounted = useRef(false), pending = useRef(null), inflight = useRef(null);
  useEffect(() => { if (!version.current || !timer.current) setLines(estimate.lines); }, [estimate.lines]);
  const area = data.facts.find((fact) => fact.key === "area_m2" && ["CONFIRMED", "HYPOTHESIS"].includes(fact.status))?.value ?? null;
  const toPayload = (line) => ({ lotId: line.lotId || "", label: line.label, method: line.method, lineStatus: line.lineStatus, amountHt: num(line.amountHt ?? line.retained), baseValue: num(line.baseValue), baseUnit: line.baseUnit || "m² SDP", ratio: num(line.ratio),
    low: num(line.low), high: num(line.high), sourceIds: line.sourceIds || [], sourceLabel: line.sourceLabel || "", comment: line.comment || "" });
  // enregistre maintenant ce qui attend (utilisé par le minuteur ET avant de changer d'étape) ; échoue franchement si l'enregistrement échoue
  const flush = async () => {
    clearTimeout(timer.current); timer.current = null;
    if (!pending.current) { if (inflight.current) await inflight.current; return; }
    const next = pending.current, mine = version.current;
    pending.current = null;
    const job = (async () => {
      const result = await run(() => saveFeasibilityEstimate(id, next.filter((line) => String(line.label).trim()).map(toPayload)));
      if (!result) { setSaveState("error"); throw new Error("Enregistrement impossible"); }
      setSaveState("saved"); if (mine === version.current) setLines(result.estimate.lines);
    })();
    inflight.current = job;
    try { await job; } finally { if (inflight.current === job) inflight.current = null; }
  };
  const persist = (next) => {
    version.current += 1;
    pending.current = next;
    clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(() => { flush().catch(() => {}); }, 900);
  };
  useEffect(() => { register?.("estimation", flush); });
  useEffect(() => () => { clearTimeout(timer.current); register?.("estimation", null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (index, patch) => { const next = lines.map((line, i) => (i === index ? { ...line, ...patch } : line)); setLines(next); persist(next); };
  const addLine = () => { const next = [...lines, { ...BLANK_LINE }]; setLines(next); };
  const removeLine = (index) => { const next = lines.filter((_, i) => i !== index); setLines(next); persist(next); };
  mounted.current = true;
  const totals = estimate.totals, budget = estimate.budget;
  const applyRatio = (index, ratio, sourceLabel, sourceIds, method) => { const line = lines[index]; change(index, { method, ratio, sourceLabel, sourceIds, baseValue: line.baseValue || area || "", lineStatus: "ESTIMATED", amountHt: "" }); setPanel(null); };
  const openReferences = async (index) => { const line = lines[index]; const [refs] = await Promise.all([getFeasibilityMacroReferences(id, line.label)]); setPanel({ index, kind: "AGENCY_REFERENCE", items: refs.items }); };
  const openComparables = async (index) => { const found = await getFeasibilityComparables(id, lines[index].label); setPanel({ index, kind: "COMPARABLE", ...found }); };
  const saveReference = async (line) => { if (!line.id) return; try { await saveFeasibilityMacroReference(id, line.id); setPanel({ index: -1, kind: "SAVED" }); } catch (reason) { setPanel({ index: -1, kind: "ERROR", message: reason.message }); } };
  const verdict = totals.gap === null ? null : totals.gap > 0 ? "L’estimation dépasse actuellement l’enveloppe annoncée." : "L’estimation est actuellement dans l’enveloppe annoncée.";
  return <section className="feas-panel" data-feasibility-panel="estimation">
    <h2>Estimation de faisabilité</h2>
    <p className="feas-intro">Calepin propose les lots pertinents, jamais leurs prix. Pour chaque lot, choisissez une méthode ; le montant retenu reste celui du MOE, avec sa provenance.</p>
    <p className="feas-toolbar">{editable && <><button type="button" className="secondary" data-estimate-structure disabled={!data.lotSuggestions.length} title={data.lotSuggestions.length ? "" : "Renseignez d’abord la nature du projet dans le cadrage"} onClick={() => run(() => proposeFeasibilityStructure(id))}>Proposer une structure de lots</button>
      <button type="button" className="secondary" data-estimate-add onClick={addLine}><Plus size={14} /> Ajouter un lot</button></>}
      <span className="feas-autosave" data-estimate-autosave role="status">{saveState === "saving" ? "Enregistrement…" : saveState === "error" ? "Enregistrement impossible" : saveState === "saved" ? "✓ Enregistré automatiquement" : "Enregistrement automatique"}</span></p>
    {!lines.length && <p className="panel-empty" data-estimate-empty>Aucun lot pour l’instant. {data.lotSuggestions.length ? "« Proposer une structure de lots » ajoute les lots usuels de ce type d’opération." : "Renseignez la nature du projet pour obtenir une structure de lots."}</p>}
    <ul className="feas-estimate-lines" data-feasibility-estimate>{lines.map((line, index) => <li key={line.id || index} className={`feas-estimate-line st-${line.lineStatus}`} data-estimate-line data-estimate-line-status={line.lineStatus}>
      <div className="feas-estimate-row">
        <input value={line.label} disabled={!editable} data-estimate-label placeholder="Lot" onChange={(event) => change(index, { label: event.target.value })} />
        <select value={line.lineStatus} disabled={!editable} data-estimate-status aria-label="Avancement du lot" onChange={(event) => change(index, { lineStatus: event.target.value })}>{Object.entries(data.lineStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        {line.lineStatus !== "NOT_CONCERNED" && <select value={line.method} disabled={!editable} data-estimate-method aria-label="Méthode de chiffrage" onChange={(event) => change(index, { method: event.target.value, baseValue: event.target.value === "MANUAL" ? line.baseValue : (line.baseValue || area || "") })}>{Object.entries(data.methods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
        {editable && <button type="button" className="row-quick-edit" aria-label="Retirer le lot" data-estimate-remove onClick={() => removeLine(index)}><Trash2 size={14} /></button>}
      </div>
      {line.lineStatus !== "NOT_CONCERNED" && <div className="feas-estimate-detail">
        {line.method !== "MANUAL" && <><label>Base ({line.baseUnit || "m² SDP"})<input type="number" min="0" step="any" value={line.baseValue ?? ""} disabled={!editable} data-estimate-base onChange={(event) => change(index, { baseValue: event.target.value })} /></label>
          <label>Ratio (€/{(line.baseUnit || "m²").split(" ")[0]})<input type="number" min="0" step="any" value={line.ratio ?? ""} disabled={!editable} data-estimate-ratio onChange={(event) => change(index, { ratio: event.target.value, amountHt: "" })} /></label>
          <span className="feas-calc" data-estimate-calculated>Calcul : {line.calculated !== null && line.calculated !== undefined ? euro(line.calculated) : "—"}</span></>}
        {editable && line.method === "AGENCY_REFERENCE" && <button type="button" className="secondary" data-estimate-pick-reference onClick={() => openReferences(index)}>Choisir une référence agence</button>}
        {editable && line.method === "COMPARABLE" && <button type="button" className="secondary" data-estimate-pick-comparables onClick={() => openComparables(index)}>Voir les projets comparables</button>}
        <label>Montant retenu HT<input type="number" min="0" step="any" value={line.amountHt ?? line.retained ?? ""} placeholder={line.calculated ? String(line.calculated) : ""} disabled={!editable} data-estimate-amount onChange={(event) => change(index, { amountHt: event.target.value })} /></label>
        <label className="feas-range">Fourchette bas<input type="number" min="0" step="any" value={line.low ?? ""} disabled={!editable} data-estimate-low onChange={(event) => change(index, { low: event.target.value })} /></label>
        <label className="feas-range">haut<input type="number" min="0" step="any" value={line.high ?? ""} disabled={!editable} data-estimate-high onChange={(event) => change(index, { high: event.target.value })} /></label>
        {editable && line.id && line.ratio ? <button type="button" className="link-button" data-estimate-save-reference onClick={() => saveReference(line)}>Enregistrer ce ratio comme référence agence</button> : null}
      </div>}
      <small className="feas-provenance-line" data-estimate-provenance>{line.provenance}</small>
      {panel && panel.index === index && panel.kind === "AGENCY_REFERENCE" && <div className="feas-source-panel" data-reference-panel>{panel.items.length ? <ul>{panel.items.map((item) => <li key={item.id}><button type="button" data-reference-use={item.id} onClick={() => applyRatio(index, item.ratio, `${item.designation}${item.sourceProject ? ` (${item.sourceProject})` : ""}`, [item.id], "AGENCY_REFERENCE")}>{item.designation} — {item.ratio} {item.unit}</button></li>)}</ul> : <p>Aucune référence macro de l’agence pour ce lot. Enregistrez un ratio comme référence pour la retrouver ici.</p>}</div>}
      {panel && panel.index === index && panel.kind === "COMPARABLE" && <div className="feas-source-panel" data-comparables-panel>{panel.items.length ? <>
        <ul>{panel.items.map((item) => <li key={item.projectId} data-comparable>{item.project} · {item.area} m² · {item.label} : {item.ratio} €/m²</li>)}</ul>
        <p><b data-comparables-median>Médiane : {panel.median} €/m²</b> <button type="button" className="secondary" data-comparables-use onClick={() => applyRatio(index, panel.median, `${panel.items.length} projet${panel.items.length > 1 ? "s" : ""} agence comparable${panel.items.length > 1 ? "s" : ""} (médiane)`, panel.items.map((item) => item.projectId), "COMPARABLE")}>Utiliser la médiane comme hypothèse</button></p></> : <p>{panel.reason}</p>}</div>}
    </li>)}</ul>
    {panel && panel.index === -1 && <p className="price-message" data-reference-feedback role="status">{panel.kind === "SAVED" ? "Ratio enregistré dans la bibliothèque agence (références de prix, granularité macro)." : panel.message}</p>}
    <section className="feas-totals" data-estimate-totals>
      <p className="feas-completeness" data-estimate-completeness>{totals.counts.lots} lot{totals.counts.lots > 1 ? "s" : ""} · {totals.counts.estimated} chiffré{totals.counts.estimated > 1 ? "s" : ""} · {totals.counts.toEstimate} à chiffrer · {totals.counts.notConcerned} non concerné{totals.counts.notConcerned > 1 ? "s" : ""}</p>
      {totals.complete
        ? <dl className="feas-gap"><dt>Estimation centrale</dt><dd data-estimate-total>{euro(totals.central)}</dd>{totals.hasRange && <><dt>Fourchette</dt><dd data-estimate-range>{euro(totals.low)} – {euro(totals.high)}</dd></>}</dl>
        : totals.counts.estimated > 0 && <p className="feas-warning" data-estimate-partial role="alert">Total actuellement chiffré : <b data-estimate-total>{euro(totals.central)}</b><br />⚠ {totals.counts.toEstimate} lot{totals.counts.toEstimate > 1 ? "s restent" : " reste"} à estimer : ce total n’est pas l’estimation finale.</p>}
      {budget !== null && totals.counts.estimated > 0 && <dl className="feas-gap" data-estimate-gap><dt>Budget MOA</dt><dd>{euro(budget)}</dd><dt>{totals.complete ? "Estimation centrale" : "Total chiffré à ce jour"}</dt><dd>{euro(totals.central)}</dd>
        <dt>Écart</dt><dd data-estimate-gap-value>{totals.gap > 0 ? "+" : ""}{euro(totals.gap)}{totals.gapPercent !== null ? ` (${totals.gap > 0 ? "+" : ""}${String(totals.gapPercent).replace(".", ",")} %)` : ""}</dd></dl>}
      {verdict && totals.complete && <p data-estimate-verdict>{verdict}</p>}
      {verdict && !totals.complete && <p className="feas-note">Comparaison provisoire : elle sera significative quand tous les lots seront chiffrés.</p>}
      {totals.gap > 0 && totals.complete && <p><button type="button" className="secondary" onClick={() => goTab("analyse")}>Voir le point « Écart avec l’enveloppe » dans l’analyse</button></p>}
    </section>
    <p className="feas-note">Calepin n’en déduit aucune conclusion : la décision de faisabilité appartient au MOE.</p>
  </section>;
}

/** À obtenir : une vraie liste d'actions (objet, pourquoi, responsable, état, lien avec l'analyse). Une seule source : les points d'analyse. */
export function Obtenir({ id, editable, data, goTab }) {
  const [state, setState] = useState(null), [error, setError] = useState("");
  useEffect(() => { getFeasibilityChecklist(id).then(setState).catch((reason) => setError(reason.message)); }, [id, data.updatedAt, data.facts.length]);
  const act = async (action) => { try { setState(await action()); } catch (reason) { setError(reason.message); } };
  const KINDS = [["DOCUMENT", "Documents à obtenir"], ["STUDY", "Études à vérifier"], ["CONFIRM", "Informations et décisions à confirmer"]];
  return <section className="feas-panel" data-feasibility-panel="obtenir">
    <h2>Pour poursuivre le projet</h2>{error && <div className="err" role="alert">{error}</div>}
    <p className="feas-intro">Cette liste se construit seule à partir des points de l’analyse : un document reçu clôt le point, un point traité coche l’élément.</p>
    {editable && <p><button type="button" className="secondary" data-checklist-refresh onClick={() => act(() => refreshFeasibilityChecklist(id))}>Actualiser la liste</button></p>}
    {state && state.items.length > 0 && <p className="feas-note" data-checklist-summary>{state.items.length} élément{state.items.length > 1 ? "s" : ""} identifié{state.items.length > 1 ? "s" : ""} · {state.items.filter((item) => item.status === "RECEIVED").length} reçu{state.items.filter((item) => item.status === "RECEIVED").length > 1 ? "s" : ""} · {state.items.filter((item) => ["TO_OBTAIN", "REQUESTED"].includes(item.status)).length} restant à obtenir</p>}
    {!state ? <p className="panel-empty">Chargement…</p> : state.items.length === 0 ? <p className="panel-empty" data-checklist-empty>Rien à obtenir pour l’instant : la liste se remplit quand l’analyse relève des documents, études ou décisions à rassembler.</p> :
      KINDS.map(([kind, title]) => { const rows = state.items.filter((item) => item.kind === kind); return rows.length ? <section key={kind} className="feas-group"><h3>{title}</h3><ul>{rows.map((item) => <li key={item.id} className="feas-check" data-checklist-item={item.key} data-checklist-status={item.status}>
        <div><b>{item.label}</b>
          <small data-checklist-why>Pourquoi : {item.why}</small>
          {item.issue && <small data-checklist-link>Lié à l’analyse : <button type="button" className="link-button" onClick={() => goTab("analyse")}>{item.issue.title}</button> ({item.issue.axisLabel})</small>}
          {item.attachmentName && <small data-checklist-attached>Document rattaché : {item.attachmentName}</small>}</div>
        <span className="feas-check-actions">
          <label>État<select value={item.status} disabled={!state.canEdit} data-checklist-select onChange={(event) => act(() => patchFeasibilityChecklist(id, item.id, { status: event.target.value }))}>{state.statuses.map((status) => <option key={status} value={status}>{state.statusLabels[status]}</option>)}</select></label>
          <label>Responsable<select value={item.responsible} disabled={!state.canEdit} data-checklist-responsible onChange={(event) => act(() => patchFeasibilityChecklist(id, item.id, { responsible: event.target.value }))}><option value="">—</option>{state.responsibles.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          {state.canEdit && item.kind !== "CONFIRM" && <select value={item.attachmentId || ""} data-checklist-attach onChange={(event) => event.target.value && act(() => patchFeasibilityChecklist(id, item.id, { attachmentId: event.target.value }))}><option value="">Ajouter lorsqu’il sera reçu…</option>{state.documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.filename}</option>)}</select>}</span>
      </li>)}</ul></section> : null; })}
  </section>;
}

/** Conclusion du MOE : conclusion choisie par le MOE, réserves possibles (cochées par lui), commentaire, suite envisagée. Calepin ne choisit jamais. */
export function DecisionForm({ data, id, editable, onData, register }) {
  const [conclusion, setConclusion] = useState(data.conclusion || ""), [comment, setComment] = useState(data.conclusionComment || ""), [nextStep, setNextStep] = useState(data.nextStep || ""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [saveState, setSaveState] = useState("");
  const candidates = useMemo(() => data.analysis.issues.filter((issue) => ["OPEN", "PLANNED", "ACCEPTED_AS_RESERVATION"].includes(issue.status)), [data.analysis.issues]);
  const reservesByIssue = useMemo(() => Object.fromEntries(data.reserves.filter((reserve) => reserve.issueId).map((reserve) => [reserve.issueId, reserve])), [data.reserves]);
  const [selected, setSelected] = useState(() => Object.fromEntries(candidates.map((issue) => [issue.id, issue.id in reservesByIssue ? true : false])));
  const [texts, setTexts] = useState(() => Object.fromEntries(candidates.map((issue) => [issue.id, reservesByIssue[issue.id]?.text || issue.suggestedReserve])));
  const [inNotice, setInNotice] = useState(() => Object.fromEntries(data.reserves.map((reserve) => [reserve.issueId || reserve.id, reserve.includeInNotice !== false])));
  const [manual, setManual] = useState(() => data.reserves.filter((reserve) => !reserve.issueId).map((reserve) => ({ id: reserve.id, text: reserve.text })));
  useEffect(() => { setSelected((current) => Object.fromEntries(candidates.map((issue) => [issue.id, issue.id in current ? current[issue.id] : issue.id in reservesByIssue]))); setTexts((current) => Object.fromEntries(candidates.map((issue) => [issue.id, current[issue.id] || reservesByIssue[issue.id]?.text || issue.suggestedReserve]))); }, [candidates]); // eslint-disable-line react-hooks/exhaustive-deps
  const payloadReserves = () => [...candidates.filter((issue) => selected[issue.id] && (texts[issue.id] || "").trim()).map((issue) => ({ id: reservesByIssue[issue.id]?.id, text: texts[issue.id], issueId: issue.id, includeInNotice: inNotice[issue.id] !== false })), ...manual.filter((item) => item.text.trim()).map((item) => ({ id: item.id, text: item.text, includeInNotice: inNotice[item.id || "manual"] !== false }))];
  // enregistrement automatique : la conclusion, les réserves, le commentaire et la suite s'enregistrent seuls (minuteur) et avant tout changement d'étape (flush)
  const latest = useRef({}), timer = useRef(null), inflight = useRef(null), dirty = useRef(false);
  latest.current = { conclusion, comment, nextStep, reserves: payloadReserves() };
  const persist = async () => {
    const { conclusion: choice, comment: note, nextStep: step, reserves } = latest.current;
    setSaveState("saving");
    let next = await saveFeasibilityReserves(id, { reserves, nextStep: step });
    if (choice) next = await setFeasibilityConclusion(id, { conclusion: choice, comment: note, nextStep: step });
    dirty.current = false;
    setSaveState("saved"); setError("");
    onData(next);
    return next;
  };
  const flush = async () => {
    clearTimeout(timer.current); timer.current = null;
    if (dirty.current) { const job = persist(); inflight.current = job; try { await job; } catch (reason) { setSaveState("error"); setError(reason.message); throw reason; } finally { if (inflight.current === job) inflight.current = null; } }
    else if (inflight.current) await inflight.current;
  };
  const schedule = (delay = 900) => { dirty.current = true; clearTimeout(timer.current); setSaveState("saving"); timer.current = setTimeout(() => { flush().catch(() => {}); }, delay); };
  useEffect(() => { register?.("decision", flush); });
  useEffect(() => () => { clearTimeout(timer.current); register?.("decision", null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const validate = async () => { setBusy(true); setError(""); try { await flush(); onData(await validateFeasibility(id)); } catch (reason) { setError(reason.message); } setBusy(false); };
  const locked = !editable || data.status === "VALIDATED";
  const noticeToggle = (key) => <label className="inline-check feas-in-notice"><input type="checkbox" disabled={locked} data-reserve-notice checked={inNotice[key] !== false} onChange={(event) => { setInNotice((current) => ({ ...current, [key]: event.target.checked })); schedule(); }} /> Afficher dans la Notice</label>;
  return <section className="feas-decision-form" data-decision-form id="feas-decision">
    <h3>Décision du MOE</h3>
    {data.conclusionHints.length > 0 && <div className="feas-hints" data-conclusion-hints><b>Points à considérer</b><ul>{data.conclusionHints.map((hint) => <li key={hint}>{hint}</li>)}</ul><small>Ces points sont des repères : Calepin ne choisit pas la conclusion.</small></div>}
    {error && <div className="err" role="alert" data-validate-error>{error}</div>}
    <fieldset className="feas-conclusions" data-conclusion-options disabled={locked}><legend>Conclusion</legend>{Object.entries(data.conclusions).map(([key, label]) => <label key={key} className="inline-check"><input type="radio" name="conclusion" data-conclusion={key} checked={conclusion === key} onChange={() => { setConclusion(key); latest.current.conclusion = key; schedule(50); }} /> {label}</label>)}</fieldset>
    <section className="feas-reserves" data-reserves><h4>Réserves retenues</h4>
      <p className="feas-note">Calepin propose les points encore ouverts ; vous choisissez ceux qui deviennent des réserves de votre conclusion et ceux qui figurent dans la Notice. Cocher une réserve ne change pas la conclusion.</p>
      {candidates.length === 0 && <p className="feas-note">Aucun point ouvert à proposer.</p>}
      <details className="feas-reserve-candidates" data-reserve-candidates open={!Object.values(selected).some(Boolean)}><summary>{Object.values(selected).filter(Boolean).length} réserve(s) retenue(s) · points ouverts pouvant en devenir ({candidates.length})</summary>
      <ul>{candidates.map((issue) => <li key={issue.id} data-reserve-candidate={issue.ruleKey}><label className="inline-check"><input type="checkbox" disabled={locked} data-reserve-select checked={!!selected[issue.id]} onChange={(event) => { setSelected((current) => ({ ...current, [issue.id]: event.target.checked })); schedule(); }} /> <span>{issue.title}</span></label>
        {reservesByIssue[issue.id]?.selectedBy && <small className="feas-note" data-reserve-selected-by>Réserve retenue par {reservesByIssue[issue.id].selectedBy}</small>}
        {selected[issue.id] && <><textarea rows={2} value={texts[issue.id] || ""} disabled={locked} data-reserve-text onChange={(event) => { setTexts((current) => ({ ...current, [issue.id]: event.target.value })); schedule(); }} />{noticeToggle(issue.id)}</>}</li>)}</ul></details>
      {manual.map((item, index) => <div key={item.id || index} className="feas-edit" data-reserve><textarea rows={2} value={item.text} disabled={locked} data-reserve-text onChange={(event) => { setManual((current) => current.map((entry, i) => (i === index ? { ...entry, text: event.target.value } : entry))); schedule(); }} />{noticeToggle(item.id || "manual")}{!locked && <button type="button" className="secondary" data-reserve-delete aria-label="Supprimer la réserve" onClick={() => { setManual((current) => current.filter((_, i) => i !== index)); schedule(50); }}><Trash2 size={14} /></button>}</div>)}
      {!locked && <p><button type="button" className="secondary" data-reserve-add onClick={() => setManual((current) => [...current, { text: "" }])}><Plus size={14} /> Ajouter une réserve</button></p>}
    </section>
    <label>Commentaire du MOE<textarea rows={3} data-conclusion-comment value={comment} disabled={locked} onChange={(event) => { setComment(event.target.value); schedule(); }} /></label>
    <label>Suite envisagée (choisie par le MOE)<input list="feas-next-steps" data-next-step value={nextStep} disabled={locked} placeholder="Choisissez ou saisissez la suite" onChange={(event) => { setNextStep(event.target.value); schedule(); }} /></label>
    <datalist id="feas-next-steps">{(data.nextSteps || []).map((step) => <option key={step} value={step} />)}</datalist>
    <p className="feas-autosave" data-decision-autosave role="status">{saveState === "saving" ? "Enregistrement…" : saveState === "error" ? "Enregistrement impossible" : saveState === "saved" ? "✓ Enregistré automatiquement" : "Enregistrement automatique"}</p>
    {!locked && data.canValidate && <p className="price-modal-actions"><button type="button" className="primary" data-validate-confirm disabled={busy || !conclusion} onClick={validate}>Valider la faisabilité</button></p>}
    {data.status === "VALIDATED" && <p className="feas-note" data-decision-validated>Faisabilité validée par {data.validatedBy}{data.validatedAt ? ` le ${new Date(data.validatedAt).toLocaleDateString("fr-FR")}` : ""}.</p>}
  </section>;
}
