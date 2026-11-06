import { ArrowRight, CalendarRange, CheckCircle2, CircleAlert, ClipboardCheck, FileSpreadsheet, FileText, FolderOpen, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getDevisSummary, getFeasibilitySummary, getPlanning, listAttachments, listConsultations } from "../api/client";
import { summarizeProject } from "../utils/projectFacts";
import { cctpStatusLabel } from "../utils/statuses";

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));

const frDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
/** Résumé du planning : tâches, durée et dates ; « non généré » quand il n'existe pas encore (jamais inventé). */
function planningSummary(planning) {
  if (!planning?.exists) return { value: "Non généré", hint: "Générer le planning", pct: 0 };
  const tasks = (planning.rows || []).filter((row) => row.row_type === "TASK");
  if (!tasks.length) return { value: "Aucune tâche", hint: "Ajouter des tâches", pct: 0 };
  const starts = tasks.map((row) => row.start).filter(Boolean).sort(), finishes = tasks.map((row) => row.finish).filter(Boolean).sort();
  const period = starts.length && finishes.length ? `${frDate(starts[0])} → ${frDate(finishes[finishes.length - 1])}` : "";
  const dated = tasks.filter((row) => row.start && row.finish).length;
  return { value: `${tasks.length} tâche${tasks.length > 1 ? "s" : ""}${period ? ` · ${period}` : ""}`, hint: dated < tasks.length ? `${tasks.length - dated} tâche${tasks.length - dated > 1 ? "s" : ""} sans date` : "", pct: dated / tasks.length * 100 };
}

export function ProjectOverviewPage({ project, progress = 0, onNavigate, planningEnabled = false }) {
  const [facts, setFacts] = useState({ estimate: null, consultations: [], documents: [], feasibility: null, planning: null });
  useEffect(() => {
    let live = true;
    Promise.allSettled([getDevisSummary(project.id), listConsultations(project.id), listAttachments(project.id), getFeasibilitySummary(project.id), planningEnabled ? getPlanning(project.id) : Promise.reject(new Error("off"))]).then(([estimate, consultations, documents, feasibility, planning]) => {
      if (!live) return;
      setFacts({
        estimate: estimate.status === "fulfilled" ? estimate.value : null,
        consultations: consultations.status === "fulfilled" ? consultations.value : [],
        documents: documents.status === "fulfilled" ? (documents.value.attachments || documents.value || []) : [],
        feasibility: feasibility.status === "fulfilled" ? feasibility.value : null,
        planning: planning.status === "fulfilled" ? planning.value : null,
      });
    });
    return () => { live = false; };
  }, [project.id, planningEnabled]);
  const summary = useMemo(() => summarizeProject({ project, progress, estimate: facts.estimate, consultations: facts.consultations, documents: facts.documents, feasibility: facts.feasibility }), [project, progress, facts]);
  const cctpTotal = project.selected?.length || 0;
  const cctpReady = Math.round(cctpTotal * clamp(progress) / 100);
  const estimateTotal = facts.estimate?.total || cctpTotal;
  const estimateReady = facts.estimate?.complete || 0;
  const openConsultations = facts.consultations.filter((item) => !["CLOSED", "AWARDED", "ARCHIVED"].includes(item.status)).length;

  const next = summary.next;
  const [demoKey, setDemoKey] = useState(project.sections?.__document?.seedKey || null);
  useEffect(() => { let live = true; if (!demoKey) apiFetch(`/cctps/${project.id}`).then((full) => { if (live) setDemoKey(full?.sections?.__document?.seedKey || null); }).catch(() => {}); return () => { live = false; }; }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [resetting, setResetting] = useState(false), [confirmReset, setConfirmReset] = useState(false);
  const resetDemo = async () => { setResetting(true); try { await apiFetch(`/demo-seed/${demoKey}?reset=true`, { method: "POST", body: "{}" }); window.location.assign(window.location.pathname); } catch { setResetting(false); } };
  const stageNext = { cctp: summary.bricks.cctp, estimate: summary.bricks.estimate, consultation: summary.bricks.consultation };
  const cards = [
    { id: "feasibility", label: "Faisabilité", Icon: ClipboardCheck, value: summary.feasibility.label, pct: summary.feasibility.pct, hint: summary.feasibility.exists ? "" : summary.feasibility.action, cta: summary.feasibility.cta },
    { id: "cctp", label: "CCTP", Icon: FileText, value: `${cctpReady} / ${cctpTotal || 0} lots prêts`, pct: progress },
    { id: "estimate", label: "DPGF", Icon: FileSpreadsheet, value: `${estimateReady} / ${estimateTotal || 0} postes chiffrés`, pct: estimateTotal ? estimateReady / estimateTotal * 100 : 0 },
    ...(planningEnabled ? [(() => { const plan = planningSummary(facts.planning); return { id: "planning", label: "Planning", Icon: CalendarRange, value: plan.value, pct: plan.pct, hint: plan.hint }; })()] : []),
    { id: "consultation", label: "Consultation", Icon: Send, value: `${openConsultations} ouverte${openConsultations > 1 ? "s" : ""}`, pct: openConsultations ? 100 : 0 },
    { id: "documents", label: "Documents", Icon: FolderOpen, value: `${facts.documents.length} fichier${facts.documents.length > 1 ? "s" : ""}`, pct: facts.documents.length ? 100 : 0 },
  ];
  return <main className="project-overview layout-portfolio" data-project-overview>
    <header className="project-overview-head"><div><span className="eyebrow">VUE D’ENSEMBLE</span><h1>{project.name}</h1><p>Retrouvez l’état du projet et ouvrez directement la partie sur laquelle travailler.</p></div><span className={`project-health ${progress >= 100 ? "ready" : "active"}`}>{progress >= 100 ? <CheckCircle2 size={16}/> : <CircleAlert size={16}/>} {progress >= 100 ? "CCTP prêt" : "Projet en cours"}</span></header>
    {demoKey && <aside className="demo-reset" data-demo-reset-box style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 12px" }}><small className="muted">Projet exemple : vous pouvez le modifier librement.</small>
      {!confirmReset ? <button type="button" className="secondary" data-demo-reset onClick={() => setConfirmReset(true)}>Réinitialiser le projet exemple</button>
        : <><span>Les modifications de cet exemple seront perdues (les documents publics sont conservés).</span><button type="button" className="primary" data-demo-reset-confirm disabled={resetting} onClick={resetDemo}>{resetting ? "Réinitialisation…" : "Confirmer"}</button><button type="button" className="link-button" onClick={() => setConfirmReset(false)}>Annuler</button></>}</aside>}
    <section className="project-points" data-project-points>{summary.points.length === 0
      ? <p className="project-points-empty" data-points-empty><CheckCircle2 size={16}/> Rien à traiter pour le moment.</p>
      : <><h2>{summary.attention} point{summary.attention > 1 ? "s" : ""} nécessite{summary.attention > 1 ? "nt" : ""} votre attention</h2><ul>{summary.points.map((point) => <li key={point.id}><button type="button" data-project-point={point.id} onClick={() => onNavigate(point.section)}><span>•</span> {point.label} <ArrowRight size={14}/></button></li>)}</ul></>}
    </section>
    <section className="project-stage-grid">{cards.map(({ id, label, Icon, value, pct, hint, steps, cta }) => <button type="button" key={id} className="project-stage" data-project-stage={id} onClick={() => onNavigate(id)}><header><span><Icon size={19}/></span><ArrowRight size={16}/></header><h2>{label}</h2><p>{value}</p>{steps?.length > 0 && <ul className="stage-steps" data-feasibility-steps>{steps.map((step) => <li key={step.key} data-step={step.key} data-step-status={step.status}><span>{step.label}</span><b>{{ COMPLETED: "✓", IN_PROGRESS: "En cours", NOT_STARTED: "—" }[step.status]}</b></li>)}</ul>}{cta && <small className="stage-next" data-feasibility-cta-overview>{cta} →</small>}{hint && <small className="stage-next" data-stage-next={id}>{hint} →</small>}{stageNext[id] && <small className="stage-next" data-stage-next={id}>{stageNext[id].detail} → {stageNext[id].label}</small>}<div className="stage-progress"><i style={{ width: `${clamp(pct)}%` }}/></div></button>)}</section>
    <section className="project-overview-meta"><div><small>DERNIÈRE MODIFICATION</small><b>{project.updatedAt ? new Date(project.updatedAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "À l’instant"}</b></div><div><small>RESPONSABLE</small><b>{String(project.updatedByEmail || project.ownerEmail || "").split("@")[0] || "—"}</b></div><div><small>ÉTAT</small><b>{cctpStatusLabel(project.reviewStatus)}</b></div></section>
  </main>;
}
