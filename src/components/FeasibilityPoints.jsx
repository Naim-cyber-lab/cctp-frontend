import { useEffect, useRef, useState } from "react";
import { FeasibilityRulesBanner, WhyPoint } from "./FeasibilityRulesLibrary";
import { actOnFeasibilityConsistency, actOnFeasibilityIssue, getFeasibilityChecklist, patchFeasibilityChecklist, refreshFeasibilityChecklist, uploadAttachment } from "../api/client";

// Points à traiter (FEAS V2.4) : UNE liste pour ce qui s'appelait « Analyse » et « Études & actions ». Un point = une carte (raison, impact, état, responsable, actions) ; jamais deux lignes pour le même sujet.
const CATEGORIES = [["PROGRAM", "Programme"], ["TECHNICAL", "Technique"], ["REGULATORY", "Réglementaire"], ["SITE", "Site"], ["ECONOMIC", "Économie"], ["SCHEDULE", "Planning"]];
const AXIS_CATEGORY = { PROGRAM: "PROGRAM", TECHNICAL: "TECHNICAL", REGULATORY: "REGULATORY", ECONOMIC: "ECONOMIC", SCHEDULE_OPERATION: "SCHEDULE" };
const TAG_CATEGORY = { FOUNDATIONS: "SITE", STRUCTURE: "TECHNICAL", DECONSTRUCTION: "TECHNICAL", ENERGY: "TECHNICAL", REGULATORY: "REGULATORY", CALENDAR: "SCHEDULE", OPERATIONS: "SCHEDULE", ACCESSIBILITY: "ECONOMIC", ECONOMIC: "ECONOMIC" };
const DOC_CATEGORY_OF = { "new-geotechnical": "geotechnique", "renovation-asbestos": "diagnostics", "old-building-structure": "diagnostics", "lead-known": "diagnostics", "reg-plu": "urbanisme", "new-topography": "topographie", "renovation-survey": "plans", "tech-plans-unreliable": "plans" };
const CANON_STATE = { TO_ORDER: ["À faire", "todo"], TO_DO: ["À faire", "todo"], ORDERED: ["Prévu", "planned"], IN_PROGRESS: ["Prévu", "planned"], AVAILABLE: ["Résolu", "done"], NOT_REQUIRED: ["Non applicable", "na"], CANCELLED: ["Annulé", "na"] };
const RESPONSIBLES = ["MOE", "MOA", "BET", "ARCHITECTE", "CLIENT"];
const SUBJECTS = [["amiante", /amiante/], ["structure", /structur/], ["sol", /geotech|\bsol\b|donnees de sol/], ["energie", /energ/], ["phasage", /phasage|site occupe/], ["patrimoine", /patrimon|abf/], ["accessibilite", /accessib|ascenseur/]];
const fold = (text) => String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const subjectsOf = (text) => SUBJECTS.filter(([, re]) => re.test(fold(text))).map(([key]) => key);
const errorText = (reason) => reason?.detail?.message || reason?.message || "Une erreur est survenue";

export function PointsToTreat({ legacy, state, update }) {
  const { data, id, editable, run, goTab } = legacy;
  const [checklist, setChecklist] = useState(null), [showClosed, setShowClosed] = useState(false), [note, setNote] = useState({}), [fail, setFail] = useState("");
  const fileInput = useRef(null), uploadFor = useRef(null);
  useEffect(() => { getFeasibilityChecklist(id).then(setChecklist).catch(() => setChecklist({ items: [], canEdit: false })); }, [id, data.updatedAt]);

  // --- UNE liste persistée (state.investigations) : points de l'analyse, du cadrage détaillé et saisis à la main ; le serveur les fusionne sans doublon ---
  const cards = (state.investigations || []).map((inv, index) => ({ inv, index })).map(({ inv, index }) => {
    const [stateLabel, stateKey] = CANON_STATE[inv.status] || [inv.status, "todo"];
    const legacy = Boolean(inv.legacy_key);
    return { key: `C-${inv.id}`, origin: legacy ? "ANALYSIS" : "CANON", category: inv.category || TAG_CATEGORY[(inv.blocking_for || [])[0]] || "PROGRAM", title: inv.label, reason: inv.purpose || inv.result_summary, impact: inv.impact || ((inv.blocking_for || []).length ? "Conditionne le chiffrage et la décision." : null),
      stateKey: inv.reserve_retained && stateKey === "todo" ? "todo" : stateKey, stateLabel: inv.reserve_retained && stateKey === "todo" ? "Retenu comme réserve" : stateLabel, closed: ["AVAILABLE", "NOT_REQUIRED", "CANCELLED"].includes(inv.status), inv, index,
      kind: inv.item_type === "DOCUMENT" ? "DOCUMENT" : ["VALIDATION", "ACTION"].includes(inv.item_type) ? "CONFIRM" : "STUDY" };
  });
  const open = cards.filter((card) => !card.closed);
  const count = (kind) => open.filter((card) => card.kind === kind).length;

  const actLegacy = (issue, action, extra = {}) => run(() => actOnFeasibilityIssue(id, issue.id, { action, ...extra }));
  const issueOf = (card) => ({ id: card.inv.legacy_issue_id, ruleKey: card.inv.rule_key });
  const handleLegacy = async (issue, action) => {
    if (["fill", "fix_framing", "choose_value", "add_hypothesis"].includes(action)) return goTab("cadrage");
    if (action === "review_estimate") return goTab("estimation");
    if (action === "comment") { setNote({ ...note, [issue.id]: note[issue.id] ?? "" }); return null; }
    if (action === "add_document") { uploadFor.current = { legacy: issue }; fileInput.current?.click(); return null; }
    return actLegacy(issue, action);
  };
  const setCanon = (index, change) => update((s) => { Object.assign(s.investigations[index], change, { user_confirmed: true }); });
  const upload = async (files) => {
    const target = uploadFor.current;
    if (!target || !files.length) return;
    setFail("");
    try {
      for (const file of files) await uploadAttachment(id, "", file, target.legacy ? (DOC_CATEGORY_OF[target.legacy.ruleKey] || "etudes") : "etudes", "FEASIBILITY");
      if (target.legacy) await run(() => refreshFeasibilityChecklist(id)); // le document reçu clôt le point (réévaluation automatique)
      setCanon(target.index, { status: "AVAILABLE", result_summary: `Document reçu : ${files.map((f) => f.name).join(", ")}` });
    } catch (reason) { setFail(errorText(reason)); }
  };
  const addPoint = () => update((s) => { s.investigations.push({ id: `INV-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, label: "Nouveau point à traiter", status: "TO_DO", item_type: "OTHER", origin: "USER", result_summary: null, source_refs: [], blocking_for: [], trigger_refs: [], auto_generated: false, user_confirmed: true }); });

  return <section className="feas-panel feas-points" data-feasibility-panel="points" data-overall-status={data.analysis?.overall?.status}>
    <input ref={fileInput} type="file" hidden multiple data-issue-file onChange={(event) => { upload([...event.target.files]); event.target.value = ""; }} />
    <h2>Ce qu’il reste à sécuriser</h2>
    <p className="feas-intro">Les éléments qui doivent encore être vérifiés, obtenus ou décidés.</p>
    <p className="feas-note" data-points-summary>{open.length} point{open.length > 1 ? "s" : ""} identifié{open.length > 1 ? "s" : ""} · {count("DOCUMENT")} document{count("DOCUMENT") > 1 ? "s" : ""} à obtenir · {count("CONFIRM")} décision{count("CONFIRM") > 1 ? "s" : ""} ou confirmation{count("CONFIRM") > 1 ? "s" : ""} · {count("STUDY")} vérification{count("STUDY") > 1 ? "s" : ""}</p>
    {fail && <div className="err" role="alert" data-points-error>{fail}</div>}
    {(data.consistency || []).length > 0 && <section className="feas-consistency" data-consistency-section><h3>Incohérences à lever</h3>
      <ul>{data.consistency.map((item) => <li key={item.id} className={`feas-consistency-item st-${item.status}`} data-consistency={item.ruleKey} data-consistency-status={item.status}><b>{item.typeLabel}</b><p>{item.message}</p>
        {editable && <span className="feas-issue-actions">{item.actions.map((action) => <button key={action.id} type="button" data-consistency-action={action.id} onClick={() => (action.id === "fix_framing" ? goTab("cadrage") : run(() => actOnFeasibilityConsistency(id, item.id, { action: action.id })))}>{action.label}</button>)}</span>}</li>)}</ul></section>}
    <label className="inline-check"><input type="checkbox" data-points-show-closed checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} /> Afficher les points traités</label>
    {editable && <p><button type="button" className="secondary" data-points-add onClick={addPoint}>+ Ajouter un point</button></p>}
    {CATEGORIES.map(([key, label]) => {
      const shown = cards.filter((card) => card.category === key && (showClosed || !card.closed));
      return <details key={key} className="feas-axis" data-points-category={key} open={shown.length > 0}><summary><b>{label}</b><span className="feas-badge" data-points-count>{shown.length ? `${shown.length} point${shown.length > 1 ? "s" : ""}` : "Rien à signaler"}</span></summary>
        <FeasibilityRulesBanner id={id} editable={editable} onChanged={() => window.location.reload()} />
        <ul className="feas-issues">{shown.map((card) => <li key={card.key} className={`feas-issue state-${card.stateKey}`} data-point={card.key} data-point-origin={card.origin} data-point-state={card.stateKey}
          {...(card.origin === "ANALYSIS" ? { "data-issue": card.inv.rule_key, "data-issue-state": card.stateKey } : {})}>
          <div className="feas-issue-main">
            <div className="feas-issue-head"><b data-point-title>{card.title}</b><span className={`feas-badge st-${card.stateKey}`} data-point-state-label>{card.stateLabel}</span></div>
            {card.reason && <p data-point-reason>{card.reason}</p>}
            {card.inv.rule_id && <WhyPoint id={id} ruleId={card.inv.rule_id} />}
            {card.impact && <p className="muted" data-point-impact><b>Impact :</b> {card.impact}</p>}
            {card.inv.result_summary && card.inv.status === "AVAILABLE" && <small data-point-result>{card.inv.result_summary}</small>}
            {note[card.key] !== undefined && <div className="feas-edit"><textarea rows={2} value={note[card.key]} data-issue-note placeholder="Commentaire du MOE" onChange={(event) => setNote({ ...note, [card.key]: event.target.value })} />
              <button type="button" className="secondary" data-issue-note-save disabled={!note[card.key].trim()} onClick={() => { setCanon(card.index, { user_note: note[card.key].trim() }); const next = { ...note }; delete next[card.key]; setNote(next); }}>Enregistrer</button></div>}
            {card.inv.user_note && note[card.key] === undefined && <small className="muted" data-point-note>Note : {card.inv.user_note}</small>}
            <label className="feas-responsible">Responsable <select data-point-responsible disabled={!editable} value={card.inv.owner || ""} onChange={(event) => setCanon(card.index, { owner: event.target.value || null })}>
              <option value="">—</option>{RESPONSIBLES.map((name) => <option key={name}>{name}</option>)}</select></label>
          </div>
          {editable && <span className="feas-issue-actions">
            {(card.inv.legacy_actions || []).filter((action) => ["fill", "fix_framing", "choose_value", "add_hypothesis", "review_estimate"].includes(action.id)).map((action) => <button key={action.id} type="button" data-issue-action={action.id} onClick={() => handleLegacy(issueOf(card), action.id)}>{action.label}</button>)}
            {(card.inv.legacy_actions || []).some((action) => action.id === "comment") && <button type="button" data-issue-action="comment" onClick={() => setNote({ ...note, [card.key]: note[card.key] ?? (card.inv.user_note || "") })}>Commenter</button>}
            <button type="button" data-point-action="document" onClick={() => { uploadFor.current = card.origin === "ANALYSIS" ? { legacy: issueOf(card), index: card.index } : { index: card.index }; fileInput.current?.click(); }}>Ajouter le document</button>
            <button type="button" data-point-action="plan" onClick={() => setCanon(card.index, { status: "ORDERED" })}>Marquer comme prévu</button>
            <button type="button" data-point-action="resolve" onClick={() => setCanon(card.index, { status: "AVAILABLE" })}>Résoudre</button>
            <button type="button" data-point-action="na" onClick={() => setCanon(card.index, { status: "NOT_REQUIRED" })}>Non applicable</button>
            {card.closed && <button type="button" data-point-action="reopen" onClick={() => setCanon(card.index, { status: "TO_DO" })}>Rouvrir</button>}</span>}
        </li>)}</ul>
        {!shown.length && <p className="feas-note" data-points-clear>Pas de point à traiter dans cette catégorie à ce stade.</p>}
      </details>;
    })}
  </section>;
}
