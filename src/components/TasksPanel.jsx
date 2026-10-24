import { useEffect } from "react";
import { CircleCheckBig, X } from "lucide-react";
import { useMyTasks } from "../hooks/useMyTasks";

const day = 86400000;
/** « Aujourd'hui », « Demain », « Hier », sinon le jour de la semaine (dans la semaine) ou la date. */
export function dueLabel(value) {
  if (!value) return { text: "Sans échéance", late: false };
  const due = new Date(value);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(due).setHours(0, 0, 0, 0) - start.getTime()) / day);
  if (diff < 0) return { text: diff === -1 ? "Hier" : `En retard (${due.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })})`, late: true };
  if (diff === 0) return { text: "Aujourd'hui", late: false };
  if (diff === 1) return { text: "Demain", late: false };
  if (diff < 7) return { text: due.toLocaleDateString("fr-FR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase()), late: false };
  return { text: due.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), late: false };
}
const KIND_LABEL = { CCTP: "CCTP", CCTP_SECTION: "Lot du CCTP", ESTIMATE: "DPGF", DPGF_LINE: "Ligne de DPGF", CONSULTATION: "Consultation", PROJECT: "Projet" };

/** Panneau latéral « Mes tâches » : accessible de partout, sans quitter le document en cours. */
export function TasksPanel({ open, onClose, onSeeAll, onOpenTask }) {
  const { tasks, refresh } = useMyTasks();
  useEffect(() => { if (open) refresh(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);
  if (!open) return null;
  const ordered = [...tasks].sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity));
  return <aside className="side-panel" data-tasks-panel role="dialog" aria-label="Mes tâches">
    <header><h2><CircleCheckBig size={15} style={{ verticalAlign: "-2px" }} /> Mes tâches</h2><button type="button" onClick={onClose} aria-label="Fermer" data-panel-close><X size={18} /></button></header>
    <div className="side-panel-body">
      {ordered.length === 0 ? <p className="panel-empty" data-tasks-panel-empty>Aucune tâche en cours : tout est à jour.</p> : ordered.map((task) => {
        const due = dueLabel(task.dueDate);
        return <article key={task.id} className="panel-task" data-panel-task={task.id} role="button" tabIndex={0} onClick={() => onOpenTask?.(task)} onKeyDown={(event) => { if (event.key === "Enter") onOpenTask?.(task); }}>
          <b>{task.title}</b>
          <small>{task.targetLabel || task.cctpName || "—"}{task.chapterTitle ? ` · ${task.chapterTitle}` : ""} · {KIND_LABEL[task.targetType] || "CCTP"}</small>
          <small className={`due ${due.late ? "late" : ""}`}>{due.text}</small>
        </article>;
      })}
    </div>
    <div className="side-panel-footer"><button type="button" className="secondary" data-tasks-see-all onClick={onSeeAll}>Voir toutes les tâches</button></div>
  </aside>;
}
