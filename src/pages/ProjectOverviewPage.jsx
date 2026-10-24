import { ArrowRight, CheckCircle2, CircleAlert, FileSpreadsheet, FileText, FolderOpen, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getDevisSummary, listAttachments, listConsultations } from "../api/client";
import { summarizeProject } from "../utils/projectFacts";
import { cctpStatusLabel } from "../utils/statuses";

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));

export function ProjectOverviewPage({ project, progress = 0, onNavigate }) {
  const [facts, setFacts] = useState({ estimate: null, consultations: [], documents: [] });
  useEffect(() => {
    let live = true;
    Promise.allSettled([getDevisSummary(project.id), listConsultations(project.id), listAttachments(project.id)]).then(([estimate, consultations, documents]) => {
      if (!live) return;
      setFacts({
        estimate: estimate.status === "fulfilled" ? estimate.value : null,
        consultations: consultations.status === "fulfilled" ? consultations.value : [],
        documents: documents.status === "fulfilled" ? (documents.value.attachments || documents.value || []) : [],
      });
    });
    return () => { live = false; };
  }, [project.id]);
  const summary = useMemo(() => summarizeProject({ project, progress, estimate: facts.estimate, consultations: facts.consultations, documents: facts.documents }), [project, progress, facts]);
  const cctpTotal = project.selected?.length || 0;
  const cctpReady = Math.round(cctpTotal * clamp(progress) / 100);
  const estimateTotal = facts.estimate?.total || cctpTotal;
  const estimateReady = facts.estimate?.complete || 0;
  const openConsultations = facts.consultations.filter((item) => !["CLOSED", "AWARDED", "ARCHIVED"].includes(item.status)).length;

  const next = summary.next;
  const stageNext = { cctp: summary.bricks.cctp, estimate: summary.bricks.estimate, consultation: summary.bricks.consultation };
  const cards = [
    { id: "cctp", label: "CCTP", Icon: FileText, value: `${cctpReady} / ${cctpTotal || 0} lots prêts`, pct: progress },
    { id: "estimate", label: "DPGF", Icon: FileSpreadsheet, value: `${estimateReady} / ${estimateTotal || 0} postes chiffrés`, pct: estimateTotal ? estimateReady / estimateTotal * 100 : 0 },
    { id: "consultation", label: "Consultation", Icon: Send, value: `${openConsultations} ouverte${openConsultations > 1 ? "s" : ""}`, pct: openConsultations ? 100 : 0 },
    { id: "documents", label: "Documents", Icon: FolderOpen, value: `${facts.documents.length} fichier${facts.documents.length > 1 ? "s" : ""}`, pct: facts.documents.length ? 100 : 0 },
  ];
  return <main className="project-overview layout-portfolio" data-project-overview>
    <header className="project-overview-head"><div><span className="eyebrow">VUE D’ENSEMBLE</span><h1>{project.name}</h1><p>Retrouvez l’état du projet et ouvrez directement la partie sur laquelle travailler.</p></div><span className={`project-health ${progress >= 100 ? "ready" : "active"}`}>{progress >= 100 ? <CheckCircle2 size={16}/> : <CircleAlert size={16}/>} {progress >= 100 ? "CCTP prêt" : "Projet en cours"}</span></header>
    <section className="project-points" data-project-points>{summary.points.length === 0
      ? <p className="project-points-empty" data-points-empty><CheckCircle2 size={16}/> Rien à traiter pour le moment.</p>
      : <><h2>{summary.attention} point{summary.attention > 1 ? "s" : ""} nécessite{summary.attention > 1 ? "nt" : ""} votre attention</h2><ul>{summary.points.map((point) => <li key={point.id}><button type="button" data-project-point={point.id} onClick={() => onNavigate(point.section)}><span>•</span> {point.label} <ArrowRight size={14}/></button></li>)}</ul></>}
    </section>
    <section className="project-stage-grid">{cards.map(({ id, label, Icon, value, pct }) => <button type="button" key={id} className="project-stage" data-project-stage={id} onClick={() => onNavigate(id)}><header><span><Icon size={19}/></span><ArrowRight size={16}/></header><h2>{label}</h2><p>{value}</p>{stageNext[id] && <small className="stage-next" data-stage-next={id}>{stageNext[id].detail} → {stageNext[id].label}</small>}<div className="stage-progress"><i style={{ width: `${clamp(pct)}%` }}/></div></button>)}</section>
    <section className="project-overview-meta"><div><small>DERNIÈRE MODIFICATION</small><b>{project.updatedAt ? new Date(project.updatedAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "À l’instant"}</b></div><div><small>RESPONSABLE</small><b>{String(project.updatedByEmail || project.ownerEmail || "").split("@")[0] || "—"}</b></div><div><small>ÉTAT</small><b>{cctpStatusLabel(project.reviewStatus)}</b></div></section>
  </main>;
}
