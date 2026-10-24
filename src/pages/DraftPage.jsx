import { prefetchPreview } from "../utils/prefetch";
import {
  Archive,
  Check,
  ClipboardList,
  ChevronRight,
  Circle,
  Download,
  Eye,
  FileText,
  FolderOpen,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCatalog } from "../catalog/CatalogContext";
import { OrganizationTasks } from "../components/OrganizationTasks";
import { useMyTasks } from "../hooks/useMyTasks";
import "../draft-header.css";

// Pour un questionnaire structuré, le dénominateur est le nombre de questions réellement
// visibles après application des conditions, pas le total fixe du questionnaire canonique.
const chapterProgress = (section) => {
  if (!section) return 0;
  const state = section.questionnaire?.state;
  if (state && (state.project || state.works)) {
    const saved = section.questionnaire?.progress;
    if (
      saved &&
      Number.isFinite(saved.answered) &&
      Number.isFinite(saved.total) &&
      saved.total > 0
    )
      return Math.min(1, saved.answered / saved.total);
    const answered =
      Object.values(state.project || {}).filter(
        (value) =>
          value !== "" &&
          value != null &&
          (!Array.isArray(value) || value.length),
      ).length +
      (state.works || []).reduce(
        (sum, work) =>
          sum +
          Object.values(work.answers || {}).filter(
            (value) =>
              value !== "" &&
              value != null &&
              (!Array.isArray(value) || value.length),
          ).length,
        0,
      );
    return answered > 0 ? Math.min(0.99, answered / 115) : 0;
  }
  const length = String(section.content || "").trim().length;
  return length ? Math.min(1, length / 300) : 0;
};

export function DraftPage({
  project,
  projects,
  progress,
  getProgress,
  onEdit,
  onModify,
  onConsult,
  onOpenDocuments,
  onArchive,
  onNew,
  onOpen,
  onPreview,
  onReorder,
  onRemoveLot,
  onInlineSave,
}) {
  const { chapters } = useCatalog();
  const [orderedIds, setOrderedIds] = useState(project.selected);
  const [reorderError, setReorderError] = useState("");
  const projectOrderKey = project.selected.join("\u0000");
  const selected = orderedIds
    .map((id) => {
      const chapter = chapters.find((item) => item.id === id);
      return chapter
        ? {
            ...chapter,
            title: project.sections[id]?.customTitle || chapter.title,
          }
        : null;
    })
    .filter(Boolean);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [editingProject, setEditingProject] = useState(false);
  const [projectTitle, setProjectTitle] = useState(project.name);
  const [editingLot, setEditingLot] = useState(null);
  const [lotDraft, setLotDraft] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [lotToDelete, setLotToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [titleSaved, setTitleSaved] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lotMenu, setLotMenu] = useState(null); // menu ••• d'un lot : les actions destructives ne sont jamais à plat
  const lotMenuRef = useRef(null);
  const [lotMenuPos, setLotMenuPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!lotMenu) return undefined;
    const close = (event) => { if (!lotMenuRef.current?.contains(event.target)) setLotMenu(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [lotMenu]);
  const moreRef = useRef(null);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => { if (!moreRef.current?.contains(event.target)) setMoreOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setMoreOpen(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [moreOpen]);
  const myTasks = useMyTasks();
  const lastSavedTitle = useRef(project.name);
  const cancelProjectTitle = () => {
    setProjectTitle(project.name);
    setEditingProject(false);
  };
  // Le titre s'enregistre tout seul : un instant après la dernière frappe, et à la sortie du champ.
  const saveProjectTitle = async (close = false) => {
    const value = projectTitle.trim();
    if (!value) {
      if (close) cancelProjectTitle();
      return;
    }
    if (value === lastSavedTitle.current) {
      if (close) setEditingProject(false);
      return;
    }
    setSaving(true);
    try {
      await onInlineSave({ name: value });
      lastSavedTitle.current = value;
      setTitleSaved(true);
      if (close) setEditingProject(false);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!editingProject) return;
    setTitleSaved(false);
    const timer = setTimeout(() => saveProjectTitle(false), 700);
    return () => clearTimeout(timer);
  }, [projectTitle, editingProject]);
  useEffect(() => {
    lastSavedTitle.current = project.name;
  }, [project.name]);
  useEffect(() => {
    setOrderedIds(project.selected);
  }, [project.id, projectOrderKey]);
  const startDrag = (event, index) => {
    setDraggedIndex(index);
    setDropIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };
  const dropChapter = async (event, index) => {
    event.preventDefault();
    const from =
      draggedIndex ?? Number(event.dataTransfer.getData("text/plain"));
    setDraggedIndex(null);
    setDropIndex(null);
    if (!Number.isInteger(from) || from === index) return;
    const previous = [...orderedIds];
    const next = [...orderedIds];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    setReorderError("");
    setOrderedIds(next);
    try {
      await onReorder(from, index);
    } catch (error) {
      setOrderedIds(previous);
      setReorderError(error?.message || "L’ordre des lots n’a pas pu être enregistré.");
    }
  };
  return (
    <main className="draft-page draft-page-focused">
      <section className="draft-content">
        <header className="draft-heading">
          <div>
            <span className="eyebrow">CCTP</span>
            {editingProject ? (
              <div className="inline-project-title">
                <input
                  autoFocus
                  value={projectTitle}
                  onChange={(event) => setProjectTitle(event.target.value)}
                  onBlur={() => saveProjectTitle(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveProjectTitle(true);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      cancelProjectTitle();
                    }
                  }}
                  maxLength={100}
                />
                <small className="title-autosave">
                  {saving
                    ? "Enregistrement…"
                    : titleSaved
                      ? "✓ Enregistré automatiquement"
                      : "Les modifications s’enregistrent automatiquement"}
                </small>
              </div>
            ) : (
              <div className="draft-title-display">
                <h1
                  className="draft-title-editable"
                  role="button"
                  tabIndex={0}
                  title="Cliquer pour modifier le titre"
                  onClick={() => project.accessRole !== "read" && setEditingProject(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (project.accessRole !== "read") setEditingProject(true);
                    }
                  }}
                >
                  {project.name}
                </h1>
                <p className="draft-status-line" data-draft-status>{{ en_relecture: "En relecture", valide: "Validé" }[project.reviewStatus] || "Brouillon"} · {Math.round((project.selected.length * (progress || 0)) / 100)} lot{Math.round((project.selected.length * (progress || 0)) / 100) > 1 ? "s" : ""} sur {project.selected.length} prêt{Math.round((project.selected.length * (progress || 0)) / 100) > 1 ? "s" : ""}</p>
              </div>
            )}
          </div>
          <div className="draft-head-actions">
            <button
              className="primary add-lots-button"
              onClick={onModify}
              title="Ajouter ou retirer des lots"
            >
              <Plus size={16} /> Ajouter un lot
            </button>
            <button className="secondary" onClick={onPreview} onMouseEnter={() => prefetchPreview(project)} onFocus={() => prefetchPreview(project)} onTouchStart={() => prefetchPreview(project)}>
              <Eye size={16} /> Aperçu du CCTP
            </button>
            <div className="draft-more" ref={moreRef}>
              <button type="button" className="secondary draft-more-button" data-draft-more aria-haspopup="menu" aria-expanded={moreOpen} aria-label="Plus d’actions" onClick={() => setMoreOpen((value) => !value)}>
                <MoreHorizontal size={17} />
                {myTasks.forCctp(project.id) > 0 && <em className="task-badge" data-task-badge="cctp" title="Tâches qui vous sont assignées et ne sont pas terminées">{myTasks.forCctp(project.id)}</em>}
              </button>
              {moreOpen && <div className="sel-bar-menu draft-more-menu" role="menu" data-draft-menu>
                <button type="button" role="menuitem" data-cctp-tasks onClick={() => { setMoreOpen(false); setTasksOpen(true); }}><ClipboardList size={14} /> Tâches du CCTP{myTasks.forCctp(project.id) > 0 && <em className="task-badge menu-badge" data-task-badge="cctp-menu" title="Tâches qui vous sont assignées et ne sont pas terminées">{myTasks.forCctp(project.id)}</em>}</button>
                <button type="button" role="menuitem" data-draft-documents onClick={() => { setMoreOpen(false); onOpenDocuments?.(); }}><FolderOpen size={14} /> Documents du projet</button>
                <button type="button" role="menuitem" data-draft-export onClick={() => { setMoreOpen(false); onPreview(); }}><Download size={14} /> Exporter (depuis l’aperçu)</button>
                {project.accessRole !== "read" && onArchive && <button type="button" role="menuitem" data-draft-archive onClick={() => { setMoreOpen(false); onArchive(project.id, true); }}><Archive size={14} /> Archiver</button>}
              </div>}
            </div>
          </div>
        </header>
        {tasksOpen && <div className="task-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setTasksOpen(false)}><div className="task-modal" role="dialog" aria-modal="true" aria-label="Tâches du CCTP"><OrganizationTasks project={project} projects={projects} onClose={() => setTasksOpen(false)} /></div></div>}
        <div className="document-card">
          <div className="document-title">
            <div>
              <FileText />
              <span>
                <b>Cahier des Clauses Techniques Particulières</b>
                <small>Version de travail · sauvegardée automatiquement</small>
              </span>
            </div>
            <span className="status">
              {progress === 100 ? "Complet" : "En rédaction"}
            </span>
          </div>
          {reorderError && <div className="folder-error" role="alert">{reorderError}</div>}
          <div className="chapter-list">
            {selected.map((c, index) => {
              const section = project.sections[c.id];
              const chapterValue = chapterProgress(section);
              const isEditing = editingLot === c.id;
              return (
                <div
                  key={c.id}
                  className={`draft-row-shell ${isEditing ? "editing" : ""}`}
                >
                <div
                  className={`draft-row ${draggedIndex === index ? "is-dragging" : ""} ${dropIndex === index && draggedIndex !== index ? "is-drop-target" : ""}`}
                  draggable={!isEditing}
                  onDragStart={(event) => startDrag(event, index)}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDropIndex(null);
                  }}
                  onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropIndex((current) => current === index ? current : index);
                    }}
                    onDrop={(event) => dropChapter(event, index)}
                  >
                  <span
                    className="drag-handle"
                    title="Saisissez la ligne pour déplacer ce lot"
                      aria-label={`Déplacer ${c.title}`}
                    >
                      <GripVertical size={17} />
                    </span>
                    <button
                      className="draft-row-open"
                      onClick={() => onEdit(c.id)}
                    >
                      <span
                        className={`row-state ${chapterValue >= 1 ? "complete" : ""}`}
                      >
                        {chapterValue >= 1 ? (
                          <Check size={15} />
                        ) : (
                          <Circle size={15} />
                        )}
                      </span>
                      <span className="row-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {myTasks.forLot(project.id, c.id) > 0 && <em className="task-badge row" data-task-badge="lot" title="Tâches qui vous sont assignées sur ce lot">{myTasks.forLot(project.id, c.id)}</em>}
                      <span className="row-copy">
                        <b>{c.title}</b>
                        <small>
                          {section ? section.summary : "Lot à rédiger"}
                        </small>
                      </span>
                      {chapterValue >= 1 ? (
                        <span className="ready">Rédigé</span>
                      ) : chapterValue > 0 ? (
                        <span className="ready in-progress">
                          En cours · {Math.round(chapterValue * 100)} %
                        </span>
                      ) : (
                        <span className="ai-label">
                          <Sparkles size={13} /> Rédiger le lot
                        </span>
                      )}
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="row-quick-edit"
                      onClick={() => {
                        setEditingLot(isEditing ? null : c.id);
                        setLotDraft({
                          title: c.title,
                          content: section?.content || "",
                        });
                      }}
                      title="Modifier le titre et les paragraphes"
                    >
                      <Pencil size={15} />
                    </button>
                    {project.accessRole !== "read" && onRemoveLot && (
                      <div className="row-more" ref={lotMenu === c.id ? lotMenuRef : null}>
                        <button type="button" className="row-quick-edit" data-lot-more={c.id} aria-haspopup="menu" aria-expanded={lotMenu === c.id} title="Plus d’actions" aria-label={`Plus d’actions pour le lot ${c.title}`} onClick={(event) => { const r = event.currentTarget.getBoundingClientRect(); setLotMenuPos({ top: r.bottom + 4, left: Math.max(8, r.left) }); setLotMenu(lotMenu === c.id ? null : c.id); }}><MoreHorizontal size={15} /></button>
                        {lotMenu === c.id && <div className="sel-bar-menu row-more-menu" role="menu" data-lot-menu style={{ position: "fixed", top: lotMenuPos.top, left: lotMenuPos.left, right: "auto" }}>
                          <button type="button" role="menuitem" className="danger" data-lot-delete={c.id} onClick={() => { setLotMenu(null); setDeleteError(""); setLotToDelete(c); }}><Trash2 size={14} /> Supprimer le lot…</button>
                        </div>}
                      </div>
                    )}
                  </div>
                  {isEditing && (
                    <div className="inline-lot-editor">
                      <label>
                        <span>Titre du lot</span>
                        <input
                          autoFocus
                          value={lotDraft.title}
                          onChange={(event) =>
                            setLotDraft((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>Paragraphes du lot</span>
                        <textarea
                          value={lotDraft.content}
                          onChange={(event) =>
                            setLotDraft((current) => ({
                              ...current,
                              content: event.target.value,
                            }))
                          }
                          rows={12}
                        />
                      </label>
                      <footer>
                        <small>
                          Vous pouvez faire ici une correction rapide, ou ouvrir
                          le lot pour utiliser la mise en forme et l’IA.
                        </small>
                        <button
                          className="secondary"
                          onClick={() => setEditingLot(null)}
                        >
                          Annuler
                        </button>
                        <button
                          className="save-button"
                          disabled={saving || !lotDraft.title.trim()}
                          onClick={async () => {
                            setSaving(true);
                            const content = lotDraft.content.trim();
                            const html = content
                              .split(/\n\s*\n/)
                              .filter(Boolean)
                              .map(
                                (text) =>
                                  `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`,
                              )
                              .join("");
                            await onInlineSave({
                              sections: {
                                ...project.sections,
                                [c.id]: {
                                  ...(section || {}),
                                  customTitle: lotDraft.title.trim(),
                                  content,
                                  html,
                                  summary:
                                    content.slice(0, 92) ||
                                    "Chapitre à compléter",
                                },
                              },
                            });
                            setSaving(false);
                            setEditingLot(null);
                          }}
                        >
                          <Save size={15} />{" "}
                          {saving ? "Enregistrement…" : "Enregistrer"}
                        </button>
                      </footer>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {lotToDelete && (
        <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setLotToDelete(null); }}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" data-lot-confirm>
            <button className="confirm-close" onClick={() => setLotToDelete(null)} disabled={deleting} aria-label="Fermer"><X size={18} /></button>
            <span className="confirm-icon"><Trash2 size={22} /></span>
            <h2>Supprimer ce lot ?</h2>
            <p>Le lot <strong>« {lotToDelete.title} »</strong> sera retiré de ce CCTP et son texte rédigé sera supprimé. Vous pourrez le rajouter plus tard avec « Ajouter des lots », mais vide.</p>
            {deleteError && <div className="confirm-error">{deleteError}</div>}
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setLotToDelete(null)} disabled={deleting}>Annuler</button>
              <button className="confirm-delete" data-lot-confirm-delete disabled={deleting} onClick={async () => {
                setDeleting(true); setDeleteError("");
                try { await onRemoveLot(lotToDelete.id); setLotToDelete(null); }
                catch (error) { setDeleteError(error?.message || "Suppression impossible."); }
                finally { setDeleting(false); }
              }}><Trash2 size={15} /> {deleting ? "Suppression…" : "Supprimer le lot"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
