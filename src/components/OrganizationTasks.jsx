import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CheckCircle2, Circle, ClipboardList, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { createOrganizationTask, createOrganizationTaskColumn, deleteOrganizationTask, deleteOrganizationTaskColumn, listConsultations, listWorkspaceMembers, listOrganizationTaskColumns, listOrganizationTasks, renameOrganizationTaskColumn, updateOrganizationTask } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useWorkspaces } from "../hooks/useWorkspaces";
import "../organization-tasks.css";

const DEFAULT_COLUMNS = [{ id: "todo", name: "À faire", color: "#9aa9a1", isDone: false }, { id: "in_progress", name: "En cours", color: "#e6a837", isDone: false }, { id: "done", name: "Terminée", color: "#3a8b69", isDone: true }];

const TARGET_TYPES = [["CCTP", "CCTP entier"], ["CCTP_SECTION", "Lot d’un CCTP"], ["ESTIMATE", "DPGF"], ["CONSULTATION", "Consultation"], ["PROJECT", "Projet (libre)"]];

export function OrganizationTasks({ projects = [], project = null, currentEmail: emailProp = "", onClose = null, scope = "team", onOpenTarget = null, focusTaskId = null }) {
  const auth = useAuth();
  const currentEmail = emailProp || auth?.user?.email || "";
  const fixedProject = project || null;
  const { role } = useWorkspaces();
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [columnMenu, setColumnMenu] = useState(null);
  const [editingColumn, setEditingColumn] = useState(null);
  const [newColumn, setNewColumn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const availableProjects = fixedProject ? [fixedProject] : projects.filter((item) => !item.archived && item.accessRole !== "read");
  const firstProject = availableProjects[0];
  const [form, setForm] = useState({ title: "", description: "", cctpId: fixedProject?.id || firstProject?.id || "", chapterId: "", assigneeId: "", dueDate: "", targetType: "CCTP", consultationId: "", projectLabel: "" });
  const [consultations, setConsultations] = useState([]);
  const selectedProject = availableProjects.find((item) => item.id === form.cctpId) || fixedProject;
  const canManage = ["admin", "member"].includes(role);

  useEffect(() => {
    if (!columnMenu) return undefined;
    const closeOnOutside = (event) => {
      if (!event.target.closest(".column-menu, [data-column-menu]")) setColumnMenu(null);
    };
    const closeOnEscape = (event) => { if (event.key === "Escape") setColumnMenu(null); };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [columnMenu]);

  const notifyChanged = () => window.dispatchEvent(new Event("cctp:tasks-changed"));
  const load = async () => {
    try {
      const [people, rows, boardColumns] = await Promise.all([
        listWorkspaceMembers(),
        listOrganizationTasks(fixedProject?.id || ""),
        listOrganizationTaskColumns(),
      ]);
      setMembers(people);
      setTasks(rows);
      setColumns(boardColumns.length ? boardColumns : DEFAULT_COLUMNS);
      setForm((current) => ({ ...current, assigneeId: current.assigneeId || people.find((item) => item.email === currentEmail)?.userId || people[0]?.userId || "" }));
    } catch (reason) { setError(reason.message); }
  };
  useEffect(() => { load(); }, [fixedProject?.id]);
  // Ouverture depuis le panneau « Tâches » de l'en-tête : la tâche cliquée est amenée à l'écran et mise en évidence quelques secondes.
  const [detailId, setDetailId] = useState(null); // tâche ouverte en plein écran
  const [highlightId, setHighlightId] = useState(focusTaskId);
  useEffect(() => {
    if (!highlightId || !tasks.some((task) => task.id === highlightId)) return undefined;
    document.querySelector(`[data-task="${highlightId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(timer);
  }, [highlightId, tasks.length]);
  const isMine = (task) => String(task.assigneeEmail || "").toLowerCase() === String(currentEmail || "").toLowerCase();
  const [onlyMine, setOnlyMine] = useState(scope === "mine");
  useEffect(() => { setOnlyMine(scope === "mine"); }, [scope]);
  const isDone = (task) => Boolean(columns.find((column) => column.id === task.status)?.isDone);
  const mineOpen = tasks.filter((task) => isMine(task) && !isDone(task));
  const visibleTasks = onlyMine ? tasks.filter(isMine) : tasks;
  const grouped = useMemo(() => columns.map((column) => [column, visibleTasks.filter((task) => task.status === column.id)]), [columns, tasks, onlyMine, currentEmail]);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const type = fixedProject ? "CCTP" : form.targetType;
      const target = type === "CONSULTATION" ? { targetType: "CONSULTATION", targetId: form.consultationId } : type === "PROJECT" ? { targetType: "PROJECT", targetLabel: form.projectLabel.trim(), cctpId: undefined } : type === "ESTIMATE" ? { targetType: "ESTIMATE", cctpId: form.cctpId } : type === "CCTP_SECTION" ? { chapterId: form.chapterId || null } : {};
      const created = await createOrganizationTask({
        cctpId: type === "PROJECT" || type === "CONSULTATION" ? undefined : form.cctpId, chapterId: type === "CCTP_SECTION" ? (form.chapterId || null) : null, ...target, assigneeId: form.assigneeId,
        title: form.title.trim(), description: form.description.trim(),
        dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`).toISOString() : null,
      });
      setTasks((items) => [created, ...items]);
      notifyChanged();
      setForm((current) => ({ ...current, title: "", description: "", chapterId: "", dueDate: "" }));
      setCreating(false);
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  const patch = async (task, changes) => {
    setError("");
    try { const next = await updateOrganizationTask(task.id, changes); setTasks((items) => items.map((item) => item.id === task.id ? next : item)); notifyChanged(); }
    catch (reason) { setError(reason.message); }
  };
  const remove = async (task) => {
    setError("");
    try { await deleteOrganizationTask(task.id); setTasks((items) => items.filter((item) => item.id !== task.id)); notifyChanged(); }
    catch (reason) { setError(reason.message); }
  };
  const addColumn = async (name) => {
    if (!name.trim()) return;
    try { const item = await createOrganizationTaskColumn(name.trim()); setColumns((rows) => [...rows, item]); setNewColumn(false); }
    catch (reason) { setError(reason.message); }
  };
  const renameColumn = async (column, name) => {
    if (!name.trim()) return;
    try { const item = await renameOrganizationTaskColumn(column.id, name.trim()); setColumns((rows) => rows.map((row) => row.id === column.id ? item : row)); setEditingColumn(null); setColumnMenu(null); }
    catch (reason) { setError(reason.message); }
  };
  const removeColumn = async (column) => {
    const destination = columns.find((item) => item.id !== column.id);
    if (!destination || !window.confirm(`Supprimer « ${column.name} » ? Les tâches seront déplacées vers « ${destination.name} ».`)) return;
    try { await deleteOrganizationTaskColumn(column.id, destination.id); setTasks((rows) => rows.map((task) => task.status === column.id ? { ...task, status: destination.id } : task)); setColumns((rows) => rows.filter((item) => item.id !== column.id)); setColumnMenu(null); notifyChanged(); }
    catch (reason) { setError(reason.message); }
  };

  // Glisser-déposer d'une colonne à l'autre, comme dans Trello : la carte change de colonne tout de suite, et revient si le serveur refuse.
  const [draggedId, setDraggedId] = useState(null);
  const [dropColumn, setDropColumn] = useState(null);
  const canMove = (task) => canManage || task.assigneeEmail === currentEmail;
  const moveTask = async (taskId, status) => {
    const task = tasks.find((item) => item.id === taskId);
    setDraggedId(null); setDropColumn(null);
    if (!task || task.status === status || !canMove(task)) return;
    const previous = task.status;
    setError("");
    setTasks((items) => items.map((item) => item.id === taskId ? { ...item, status } : item));
    try {
      const next = await updateOrganizationTask(taskId, { status });
      setTasks((items) => items.map((item) => item.id === taskId ? next : item));
      notifyChanged();
    } catch (reason) {
      setTasks((items) => items.map((item) => item.id === taskId ? { ...item, status: previous } : item));
      setError(reason.message);
    }
  };
  const loadConsultations = async (cctpId) => {
    try { setConsultations(await listConsultations(cctpId)); } catch { setConsultations([]); }
  };
  // Le formulaire s'ouvre seulement après « Nouvelle tâche » ; le CCTP par défaut est pris à ce moment-là, quand la liste des projets est chargée.
  const openCreate = () => {
    setForm((current) => ({ ...current, cctpId: fixedProject?.id || (availableProjects.some((item) => item.id === current.cctpId) ? current.cctpId : availableProjects[0]?.id || "") }));
    setCreating(true);
  };
  const openCount = tasks.filter((task) => !isDone(task)).length;
  const doneCount = tasks.length - openCount;
  return <section className={`organization-tasks ${fixedProject ? "in-cctp" : ""}`} data-organization-tasks>
    <header className="tasks-hero"><span className="tasks-title"><i><ClipboardList size={20} /></i><span><b>{scope === "mine" ? "Mes tâches" : "Tâches de l’agence"}</b><small>{fixedProject ? `Pilotage de « ${fixedProject.name} »` : "Pilotage transverse des CCTP et des lots"}</small></span></span><div className="tasks-actions"><span className="tasks-summary"><b>{openCount}</b> active{openCount > 1 ? "s" : ""}<i /> <b>{doneCount}</b> terminée{doneCount > 1 ? "s" : ""}</span>{role === "admin" && <button className="secondary column-add-trigger" data-column-add onClick={() => setNewColumn(true)}><Plus size={15} /> Ajouter une colonne</button>}{canManage && <button className="primary" data-task-new onClick={openCreate}><Plus size={15} /> Nouvelle tâche</button>}{onClose && <button className="icon close" aria-label="Fermer" title="Fermer" onClick={onClose}><X size={19} /></button>}</div></header>
    {error && <div className="login-error" role="alert">{error}</div>}
    {/* le grand bandeau rouge explicatif est retiré (UX-22) : la pastille se comprend au survol et relève de l’onboarding */}
    {newColumn && <form className="new-column-panel" onSubmit={(event) => { event.preventDefault(); addColumn(event.currentTarget.elements.name.value); }}><span><Plus size={17} /></span><label><b>Nouvelle colonne</b><small>Ajoutez une étape à votre flux de travail.</small></label><input name="name" autoFocus required placeholder="Ex. À valider" maxLength={50} /><button type="button" onClick={() => setNewColumn(false)}>Annuler</button><button className="primary">Ajouter</button></form>}
    {creating && <div className="task-create-backdrop" data-task-create-modal onMouseDown={(event) => event.target === event.currentTarget && setCreating(false)}><form className="task-form task-form-modal" data-task-form role="dialog" aria-modal="true" aria-label="Créer une tâche" onSubmit={submit}>
      <div className="task-form-heading"><span><Plus size={16} /></span><div><b>Créer une tâche</b><small>Définissez précisément le responsable et le périmètre d’intervention.</small></div></div>
      <label className="task-title-field">Intitulé<input autoFocus required minLength={2} maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex. Vérifier les performances acoustiques" /></label>
      {!fixedProject && <label>Type de ressource<select data-task-target-type value={form.targetType} onChange={(event) => setForm({ ...form, targetType: event.target.value, chapterId: "", consultationId: "" })}>{TARGET_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
      {form.targetType === "PROJECT" && !fixedProject && <label>Projet<input required value={form.projectLabel} maxLength={200} onChange={(event) => setForm({ ...form, projectLabel: event.target.value })} placeholder="Ex. Réunion de chantier École Voltaire" /></label>}
      {(form.targetType !== "PROJECT" || fixedProject) && <label>CCTP<select required value={form.cctpId} disabled={Boolean(fixedProject)} onChange={(event) => { const cctpId = event.target.value; setForm({ ...form, cctpId, chapterId: "", consultationId: "" }); }}>{!form.cctpId && <option value="">Choisir un CCTP…</option>}{availableProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {form.targetType === "CONSULTATION" && !fixedProject && <label>Consultation<select required data-task-consultation value={form.consultationId} onFocus={() => loadConsultations(form.cctpId)} onChange={(event) => setForm({ ...form, consultationId: event.target.value })}><option value="">Choisir…</option>{consultations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {(form.targetType === "CCTP_SECTION" || fixedProject) && <label>Échelle<select value={form.chapterId} onChange={(event) => setForm({ ...form, chapterId: event.target.value })}><option value="">Tout le CCTP</option>{(selectedProject?.selected || []).map((id, index) => <option key={id} value={id}>Lot {String(index + 1).padStart(2, "0")} · {selectedProject.sections?.[id]?.customTitle || selectedProject.sections?.[id]?.title || id}</option>)}</select></label>}
      <label>Assignée à<select required value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>{members.map((member) => <option key={member.userId} value={member.userId}>{member.email}{member.email === currentEmail ? " (vous)" : ""}</option>)}</select></label>
      <label>Échéance<input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
      <label className="wide">Détails<textarea rows={2} maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Consigne ou résultat attendu…" /></label>
      <footer><span>La personne assignée la retrouve dans le panneau « Tâches » de l’en-tête et reçoit une notification.</span><button type="button" onClick={() => setCreating(false)}>Annuler</button><button className="primary" disabled={busy || !form.title.trim() || !form.cctpId || !form.assigneeId}>{busy ? "Création…" : "Créer et assigner"}</button></footer>
    </form></div>}
    <div className="task-board-scroll"><div className="task-board">{grouped.map(([column, rows], columnIndex) => <div className={`task-column ${column.isDone ? "done" : ""} ${dropColumn === column.id && draggedId ? "drop-target" : ""}`} key={column.id} data-task-column={column.id}
      onDragOver={(event) => { if (!draggedId) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dropColumn !== column.id) setDropColumn(column.id); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropColumn((current) => (current === column.id ? null : current)); }}
      onDrop={(event) => { event.preventDefault(); moveTask(draggedId || event.dataTransfer.getData("text/plain"), column.id); }}><h3 style={{ "--column-color": column.color }}><span>{editingColumn === column.id ? <form className="column-name-form" onSubmit={(event) => { event.preventDefault(); renameColumn(column, event.currentTarget.elements.name.value); }}><input name="name" autoFocus defaultValue={column.name} maxLength={50} /><button aria-label="Valider"><Check size={13} /></button></form> : column.name}</span><span className="column-tools"><em>{rows.length}</em>{role === "admin" && <button className="column-menu-button" aria-label={`Options de la colonne ${column.name}`} data-column-menu={column.id} onClick={() => setColumnMenu((value) => value === column.id ? null : column.id)}><MoreHorizontal size={16} /></button>}{columnMenu === column.id && <div className="column-menu"><button onClick={() => { setEditingColumn(column.id); setColumnMenu(null); }}><Pencil size={13} /> Renommer</button><button className="danger" disabled={columns.length <= 1} onClick={() => removeColumn(column)}><Trash2 size={13} /> Supprimer</button></div>}</span></h3><div className="task-column-content">{rows.length === 0 && <div className="column-empty">Aucune tâche</div>}{rows.map((task) => <article key={task.id} data-task={task.id} onClick={(event) => { if (!event.target.closest("button, a, input, select")) setDetailId(task.id); }} className={`${draggedId === task.id ? "is-dragging" : ""} ${canMove(task) ? "can-drag" : ""} ${highlightId === task.id ? "task-focus" : ""}`} draggable={canMove(task)}
        onDragStart={(event) => { if (!canMove(task)) { event.preventDefault(); return; } setDraggedId(task.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); }}
        onDragEnd={() => { setDraggedId(null); setDropColumn(null); }}><header>{isMine(task) && !column.isDone && <i className="task-mine-dot" data-task-mine title="Cette tâche vous est assignée et n’est pas terminée" aria-label="Tâche qui vous est assignée" />}<button className="task-check" title="Faire avancer la tâche" onClick={() => patch(task, { status: columns[columnIndex + 1]?.id || columns[0].id })}>{column.isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}</button><b>{task.title}</b>{canManage && <button className="icon danger" title="Supprimer" aria-label="Supprimer la tâche" onClick={() => remove(task)}><Trash2 size={14} /></button>}</header>{isMine(task) && !column.isDone && <div className="task-mine-row" data-task-mine-row><span className="task-mine-chip">Assignée à vous</span><button type="button" className="task-finish" data-task-finish title="Marquer cette tâche comme terminée : la pastille rouge disparaît" onClick={() => patch(task, { status: columns.find((item) => item.isDone)?.id || columns.at(-1).id })}><CheckCircle2 size={13} /> Terminer</button></div>}{task.description && <p>{task.description}</p>}<div className="task-scope"><span>{task.chapterId ? `LOT · ${task.chapterTitle || task.chapterId}` : "CCTP COMPLET"}</span><small>{task.cctpName}</small></div><footer><span className="task-assignee"><i>{task.assigneeEmail.slice(0, 1).toUpperCase()}</i>{task.assigneeEmail}</span>{task.dueDate && <time><CalendarDays size={12} /> {new Date(task.dueDate).toLocaleDateString("fr-FR")}</time>}</footer></article>)}</div></div>)}</div></div>
    {detailId && (() => {
      const task = tasks.find((item) => item.id === detailId);
      if (!task) return null;
      const column = columns.find((item) => item.id === task.status);
      return <div className="task-detail-backdrop" data-task-detail-modal onMouseDown={(event) => event.target === event.currentTarget && setDetailId(null)}>
        <article className="task-detail" role="dialog" aria-modal="true" aria-label={task.title} data-task-detail tabIndex={-1} ref={(node) => node?.focus()} onKeyDown={(event) => event.key === "Escape" && setDetailId(null)}>
          <header><div><small>{column?.name || "Tâche"}{task.targetType ? ` · ${(TARGET_TYPES.find(([id]) => id === task.targetType) || [])[1] || task.targetType}` : ""}</small><h2>{task.title}</h2></div><button type="button" className="icon close" aria-label="Fermer" data-task-detail-close onClick={() => setDetailId(null)}><X size={20} /></button></header>
          <dl><div><dt>Assignée à</dt><dd>{task.assigneeEmail}</dd></div>{task.dueDate && <div><dt>Échéance</dt><dd>{new Date(task.dueDate).toLocaleDateString("fr-FR")}</dd></div>}<div><dt>Périmètre</dt><dd>{task.chapterId ? `Lot · ${task.chapterTitle || task.chapterId}` : "CCTP complet"}{task.cctpName ? ` — ${task.cctpName}` : ""}</dd></div></dl>
          <section><h3>Description</h3><p data-task-detail-description>{task.description || "Aucune description."}</p></section>
        </article>
      </div>;
    })()}
  </section>;
}
