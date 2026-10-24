import {
  Archive,
  ArrowRight,
  Check,
  Clock3,
  FileText,
  FileUp,
  Folder,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ImportCctpModal } from "../components/ImportCctpModal";
import { ShareCctpModal } from "../components/ShareCctpModal";
import { ProjectMembers } from "../components/ProjectMembers";
import { chapters as lotCatalog } from "../data/chapters";
import { useWorkspaces } from "../hooks/useWorkspaces";
import { useProjectFacts } from "../hooks/useProjectFacts";
import { summarizeProject } from "../utils/projectFacts";
import { CCTP_STATUS, cctpStatusLabel } from "../utils/statuses";

const dateLabel = (value) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

const REVIEW_STATUSES = [
  { id: "brouillon", label: CCTP_STATUS.brouillon.label },
  { id: "en_relecture", label: CCTP_STATUS.en_relecture.label },
  { id: "valide", label: CCTP_STATUS.valide.label },
];
const statusLabel = (id) => cctpStatusLabel(id);
const handle = (email) => String(email || "").split("@")[0] || "—";
const ago = (value) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 1440) return `il y a ${Math.round(minutes / 60)} h`;
  return `le ${dateLabel(value)}`;
};
/** Nom des lots d'un CCTP (recherche par lot) : catalogue + intitulé personnalisé quand les chapitres sont chargés. */
const lotNames = (project) => (project.selected || []).map((id) => `${lotCatalog.find((item) => item.id === id)?.title || ""} ${project.sections?.[id]?.customTitle || ""}`).join(" ");

export function ProjectsPage({
  projects,
  getProgress,
  portfolio = false,
  onNew,
  onOpen,
  onDelete,
  onArchive,
  onImport,
  folders = [],
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onPatch,
  onRefresh,
  variant = "personal",
}) {
  const team = variant === "team"; // ancien onglet « CCTP partagés » : supprimé, tous les CCTP de l'espace sont communs
  const { active, canWrite } = useWorkspaces();
  const Root = team ? "section" : "main";
  const [folderFilter, setFolderFilter] = useState("all"),
    [statusFilter, setStatusFilter] = useState("all"),
    [folderForm, setFolderForm] = useState(null),
    [folderError, setFolderError] = useState(""),
    [folderPending, setFolderPending] = useState(null);
  const [pending, setPending] = useState(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [importOpen, setImportOpen] = useState(false),
    [showArchived, setShowArchived] = useState(false),
    [openMenu, setOpenMenu] = useState(null),
    [search, setSearch] = useState("");
  const [draggedProject, setDraggedProject] = useState(null),
    [dropFolder, setDropFolder] = useState(null),
    [renameError, setRenameError] = useState("");
  const [sharing, setSharing] = useState(null);
  const menuRef = useRef(null);
  const activeFilter =
    folderFilter === "all" ||
    folderFilter === "none" ||
    folders.some((item) => item.id === folderFilter)
      ? folderFilter
      : "all";
  const inScope = projects.filter(
    (project) => Boolean(project.archived) === showArchived && (!team || project.shared),
  );
  const countIn = (filter) =>
    inScope.filter(
      (project) =>
        filter === "all" ||
        (filter === "none" ? !project.folderId : project.folderId === filter),
    ).length;
  const visible = inScope.filter(
    (project) =>
      `${project.name} ${lotNames(project)}`.toLowerCase().includes(search.trim().toLowerCase()) &&
      (activeFilter === "all" ||
        (activeFilter === "none"
          ? !project.folderId
          : project.folderId === activeFilter)) &&
      (statusFilter === "all" ||
        (project.reviewStatus || "brouillon") === statusFilter),
  );
  const facts = useProjectFacts(visible, portfolio); // état estimation / consultation de chaque projet affiché (page Projets)
  const currentFolder = folders.find((item) => item.id === activeFilter);
  const submitFolder = async (event) => {
    event.preventDefault();
    setFolderError("");
    try {
      if (folderForm.id) {
        await onRenameFolder(folderForm.id, folderForm.name);
      } else {
        const created = await onCreateFolder(folderForm.name);
        setFolderFilter(created.id);
      }
      setFolderForm(null);
    } catch (error) {
      setFolderError(error.message);
    }
  };
  const removeFolder = async () => {
    try {
      await onDeleteFolder(folderPending.id);
      setFolderFilter("all");
      setFolderPending(null);
    } catch (error) {
      setFolderError(error.message);
      setFolderPending(null);
    }
  };
  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(pending.id);
      setPending(null);
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleting(false);
    }
  };
  const changeArchive = async (project, archived) => {
    setOpenMenu(null);
    await onArchive(project.id, archived);
  };
  useEffect(() => {
    if (!openMenu) return;
    const close = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpenMenu(null);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [openMenu]);
  const moveProject = async (folderId) => {
    if (!draggedProject) return;
    const project = draggedProject;
    setDraggedProject(null);
    setDropFolder(null);
    if ((project.folderId || null) === (folderId || null)) return;
    await onPatch(project.id, { folderId });
  };
  return (
    <Root className={`projects-page ${team ? "projects-page-team" : ""}`} {...(team ? { "data-team-shared": "" } : {})}>
      {!team && <section className="library-head">
        <div>
          <span className="eyebrow">{active?.type === "ORGANIZATION" ? `DOCUMENTS · ${active.name.toUpperCase()}` : "MES DOCUMENTS"}</span>
          <h1>{showArchived ? "Projets archivés" : "Vos projets"}</h1>
          <p>
            {showArchived
              ? "Retrouvez les documents mis de côté et restaurez-les à tout moment."
              : "Pilotez chaque opération, du CCTP à la consultation, depuis un espace unique."}
          </p>
        </div>
      </section>}
      {importOpen && (
        <ImportCctpModal
          onClose={() => setImportOpen(false)}
          onImport={onImport}
        />
      )}
      {sharing && <ShareCctpModal project={sharing} onClose={()=>setSharing(null)} onChanged={onRefresh}/>} 
      <div className="library-toolbar">
        {!team && <nav className="project-tabs">
          <button
            className={!showArchived ? "active" : ""}
            onClick={() => {
              setShowArchived(false);
              setOpenMenu(null);
            }}
          >
            <FileText size={15} /> Projets actifs{" "}
            <b>{projects.filter((item) => !item.archived).length}</b>
          </button>
          <button
            className={showArchived ? "active" : ""}
            onClick={() => {
              setShowArchived(true);
              setOpenMenu(null);
            }}
          >
            <Archive size={15} /> Archives{" "}
            <b>{projects.filter((item) => item.archived).length}</b>
          </button>
        </nav>}
        <label className="library-search">
          <Search size={15} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              showArchived
                ? "Rechercher dans les archives…"
                : "Rechercher un projet…"
            }
            aria-label="Rechercher un projet"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Effacer la recherche"
            >
              <X size={14} />
            </button>
          )}
        </label>
        {!team && <div className="library-actions">
          <button
            className="secondary"
            title="Ouvre un PDF ou Word comme un CCTP à modifier"
            disabled={!canWrite}
            onClick={() => setImportOpen(true)}
          >
            <FileUp size={17} /> Importer
          </button>
          <button className="primary" onClick={onNew} disabled={!canWrite} title={canWrite ? undefined : "Votre rôle de lecteur ne permet pas de créer un document"}>
            <Plus size={17} /> Nouveau projet
          </button>
        </div>}
      </div>
      <section className="folder-bar" data-folder-bar aria-label="Dossiers">
        <div className="folder-chips">
          <button
            type="button"
            className={activeFilter === "all" ? "active" : ""}
            data-folder-chip="all"
            onClick={() => setFolderFilter("all")}
          >
            Tous <b>{countIn("all")}</b>
          </button>
          <button
            type="button"
            className={`${activeFilter === "none" ? "active " : ""}${dropFolder === "none" ? "drop-target" : ""}`}
            data-folder-chip="none"
            onClick={() => setFolderFilter("none")}
            onDragOver={(event) => {
              event.preventDefault();
              setDropFolder("none");
            }}
            onDragLeave={() => setDropFolder(null)}
            onDrop={(event) => {
              event.preventDefault();
              moveProject(null);
            }}
          >
            Sans dossier <b>{countIn("none")}</b>
          </button>
          {folders.map((folder) => (
            <button
              type="button"
              key={folder.id}
              className={`${activeFilter === folder.id ? "active " : ""}${dropFolder === folder.id ? "drop-target" : ""}`}
              data-folder-chip={folder.id}
              onClick={() => setFolderFilter(folder.id)}
              onDragOver={(event) => {
                event.preventDefault();
                setDropFolder(folder.id);
              }}
              onDragLeave={() => setDropFolder(null)}
              onDrop={(event) => {
                event.preventDefault();
                moveProject(folder.id);
              }}
            >
              <Folder size={13} /> {folder.name} <b>{countIn(folder.id)}</b>
            </button>
          ))}
          <button
            type="button"
            className="folder-add"
            data-folder-add
            title="Créer un dossier"
            aria-label="Créer un dossier"
            onClick={() => {
              setFolderError("");
              setFolderForm({ id: null, name: "" });
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="folder-side">
          {currentFolder && (
            <span className="folder-tools">
              <button
                type="button"
                data-folder-rename
                title="Renommer ce dossier"
                aria-label="Renommer ce dossier"
                onClick={() => {
                  setFolderError("");
                  setFolderForm({
                    id: currentFolder.id,
                    name: currentFolder.name,
                  });
                }}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                data-folder-delete
                className="danger"
                title="Supprimer ce dossier (les CCTP sont conservés)"
                aria-label="Supprimer ce dossier"
                onClick={() => setFolderPending(currentFolder)}
              >
                <Trash2 size={14} />
              </button>
            </span>
          )}
          <label className="status-filter">
            Statut{" "}
            <select
              data-status-filter
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Tous</option>
              {REVIEW_STATUSES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {folderForm && (
        <form className="folder-form" data-folder-form onSubmit={submitFolder}>
          <input
            autoFocus
            data-folder-name
            maxLength={80}
            value={folderForm.name}
            onChange={(event) =>
              setFolderForm({ ...folderForm, name: event.target.value })
            }
            placeholder="Nom du dossier (ex. Résidence Les Érables)"
            aria-label="Nom du dossier"
          />
          <button
            type="submit"
            className="primary"
            disabled={!folderForm.name.trim()}
          >
            <Check size={14} /> {folderForm.id ? "Renommer" : "Créer"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setFolderForm(null)}
          >
            Annuler
          </button>
        </form>
      )}
      {folderError && (
        <div className="folder-error" role="alert">
          {folderError}
        </div>
      )}
      {renameError && (
        <div className="folder-error" role="alert">
          {renameError}
        </div>
      )}
      {visible.length === 0 ? (
        <section className="empty-library">
          {team && !search && inScope.length === 0 ? (
            <p className="team-shared-empty" data-shared-empty>Aucun CCTP ne vous a été partagé pour l’instant. Quand un membre de l’équipe partage un CCTP avec vous, il apparaît ici.</p>
          ) : team && !search ? (
            <p className="team-shared-empty" data-shared-filter-empty>Aucun CCTP partagé dans ce dossier ou avec ce statut.</p>
          ) : search ? (
            <>
              <span>
                <Search size={28} />
              </span>
              <h2>Aucun résultat</h2>
              <p>Aucun projet ne correspond à « {search} ».</p>
            </>
          ) : (
            <>
              <span>
                {showArchived ? <Archive size={28} /> : <FileText size={28} />}
              </span>
              <h2>
                {showArchived
                  ? "Aucun projet archivé"
                  : "Commencez votre premier projet"}
              </h2>
              <p>
                {showArchived
                  ? "Les documents archivés apparaîtront ici et pourront être restaurés."
                  : "Donnez-lui un titre, définissez ses lots puis avancez du CCTP jusqu’à la consultation."}
              </p>
              {!showArchived && (
                <button className="primary" onClick={onNew}>
                  <Plus size={17} /> Créer un projet
                </button>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="projects-grid">
          {visible.map((project) => {
            const progress = getProgress(project);
            const chapterCount = Object.keys(project.sections).filter(
              (key) => !key.startsWith("__"),
            ).length;
            return (
              <article
                className={`project-card ${draggedProject?.id === project.id ? "is-dragging" : ""}`}
                key={project.id}
                draggable={!project.archived}
                onDragStart={() => setDraggedProject(project)}
                onDragEnd={() => {
                  setDraggedProject(null);
                  setDropFolder(null);
                }}
                data-project-card={project.id}
                {...(team ? { [project.accessRole === "owner" ? "data-shared-mine" : "data-shared-project"]: project.id } : {})}
              >
                <div
                  className="project-card-open"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(project.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpen(project.id);
                    }
                  }}
                >
                  <div className="project-card-top">
                    <span>
                      <FileText size={20} />
                    </span>
                    {project.isNew && <em className="project-new-badge" data-new-badge>Nouveau</em>}
                    <i
                      data-review-badge={project.reviewStatus || "brouillon"}
                      className={`review-${project.reviewStatus || "brouillon"}`}
                    >
                      {project.archived
                        ? "Archivé"
                        : statusLabel(project.reviewStatus)}
                    </i>
                  </div>
                  <h2 className="project-name">{project.name}</h2>
                  {project.folderId && (
                    <small className="project-folder">
                      <Folder size={12} />{" "}
                      {
                        folders.find((item) => item.id === project.folderId)
                          ?.name
                      }
                    </small>
                  )}
                  <small className="project-credit" data-project-credit title={`Créé par ${handle(project.ownerEmail)}${project.createdAt ? ` le ${dateLabel(project.createdAt)}` : ""}`}>
                    <span>Modifié {ago(project.updatedAt)} par <b>{handle(project.updatedByEmail || project.ownerEmail)}</b>{project.external && <i className="external-badge" data-external-badge>Invité externe</i>}{project.editMode === "RESTRICT_EDITORS" && <i className="restricted-badge" data-restricted-badge title="Seuls certains membres peuvent modifier ce CCTP">Modification restreinte</i>}</span>
                    {project.reviewedByEmail && (project.reviewStatus === "en_relecture" || project.reviewStatus === "valide") && <span data-reviewed-by>{project.reviewStatus === "valide" ? "Validé" : "Relu"} par <b>{handle(project.reviewedByEmail)}</b></span>}
                  </small>
                  {project.shared && <ProjectMembers project={project}/>}
                  {portfolio ? (() => {
                    const pulse = summarizeProject({ project, progress, estimate: facts[project.id]?.estimate, consultations: facts[project.id]?.consultations || [] });
                    const loaded = Boolean(facts[project.id]) || project.archived;
                    return <ul className="project-bricks" data-project-bricks>
                      <li data-brick="cctp"><b>CCTP</b><span>{pulse.cctp.ready} / {pulse.cctp.total} lot{pulse.cctp.total > 1 ? "s" : ""} prêt{pulse.cctp.ready > 1 ? "s" : ""}</span></li>
                      <li data-brick="estimate"><b>DPGF</b><span>{loaded ? (pulse.estimate.total ? `${pulse.estimate.done} / ${pulse.estimate.total} postes chiffrés` : "Pas encore chiffrée") : "…"}</span></li>
                      <li data-brick="consultation"><b>Consultation</b><span>{loaded ? (pulse.consultations.total ? `${pulse.consultations.open} ouverte${pulse.consultations.open > 1 ? "s" : ""} · ${pulse.consultations.received} offre${pulse.consultations.received > 1 ? "s" : ""} reçue${pulse.consultations.received > 1 ? "s" : ""}` : "Aucune consultation") : "…"}</span></li>
                      {loaded && pulse.attention > 0 && <li className="attention" data-brick-attention><b>{pulse.attention} point{pulse.attention > 1 ? "s" : ""} à traiter</b></li>}
                      {loaded && <li className="next" data-brick-next><b>Prochaine action</b><span>{pulse.next.label}</span></li>}
                      <li className="project-bricks-progress"><div className="project-progress"><i><span style={{ width: `${progress}%` }} /></i><b>{progress}%</b></div></li>
                    </ul>;
                  })() : <>
                  <p data-project-lots>
                    {project.selected.length} lot{project.selected.length > 1 ? "s" : ""} · {Math.round((project.selected.length * progress) / 100)} prêt{Math.round((project.selected.length * progress) / 100) > 1 ? "s" : ""}
                  </p>
                  <div className="project-progress">
                    <i>
                      <span style={{ width: `${progress}%` }} />
                    </i>
                    <b>{progress}%</b>
                  </div></>}
                  <footer>
                    <span />
                    <ArrowRight size={17} />
                  </footer>
                </div>
                <div
                  className="project-menu-wrap"
                  ref={openMenu === project.id ? menuRef : null}
                >
                  <button
                    className="project-more"
                    onClick={() =>
                      setOpenMenu(openMenu === project.id ? null : project.id)
                    }
                    aria-expanded={openMenu === project.id}
                    aria-haspopup="menu"
                    aria-label={`Actions pour ${project.name}`}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                  {openMenu === project.id && (
                    <div className="project-action-menu" role="menu">
                      {project.accessRole !== "read" && <button onClick={()=>{setOpenMenu(null);setSharing(project)}}><Share2 size={14}/> Partager</button>}
                      <label>
                        Dossier
                        <select
                          data-move-folder
                          value={project.folderId || ""}
                          onChange={async (event) => {
                            setOpenMenu(null);
                            await onPatch(project.id, {
                              folderId: event.target.value || null,
                            });
                          }}
                        >
                          <option value="">Sans dossier</option>
                          {folders.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {project.accessRole === "owner" && <label>
                        Statut
                        <select
                          data-review-status
                          value={project.reviewStatus || "brouillon"}
                          onChange={async (event) => {
                            setOpenMenu(null);
                            await onPatch(project.id, {
                              reviewStatus: event.target.value,
                            });
                          }}
                        >
                          {REVIEW_STATUSES.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>}
                      {project.accessRole === "owner" && (project.archived ? (
                        <button onClick={() => changeArchive(project, false)}>
                          <RotateCcw size={14} /> Restaurer
                        </button>
                      ) : (
                        <button onClick={() => changeArchive(project, true)}>
                          <Archive size={14} /> Archiver
                        </button>
                      ))}
                      {project.accessRole === "owner" && <button
                        className="danger"
                        onClick={() => {
                          setOpenMenu(null);
                          setDeleteError("");
                          setPending(project);
                        }}
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
      {folderPending && (
        <div
          className="confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFolderPending(null);
          }}
        >
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            data-folder-confirm
          >
            <button
              className="confirm-close"
              onClick={() => setFolderPending(null)}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
            <span className="confirm-icon">
              <Folder size={22} />
            </span>
            <h2>Supprimer ce dossier ?</h2>
            <p>
              Le dossier <strong>« {folderPending.name} »</strong> sera
              supprimé. Les CCTP qu’il contient ne sont pas supprimés : ils
              repassent dans « Sans dossier ».
            </p>
            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setFolderPending(null)}
              >
                Annuler
              </button>
              <button
                className="confirm-delete"
                data-folder-confirm-delete
                onClick={removeFolder}
              >
                <Trash2 size={15} /> Supprimer le dossier
              </button>
            </div>
          </section>
        </div>
      )}
      {pending && (
        <div
          className="confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting)
              setPending(null);
          }}
        >
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <button
              className="confirm-close"
              onClick={() => setPending(null)}
              disabled={deleting}
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
            <span className="confirm-icon">
              <Trash2 size={22} />
            </span>
            <h2 id="delete-title">Supprimer ce CCTP ?</h2>
            <p>
              Vous êtes sur le point de supprimer{" "}
              <strong>« {pending.name} »</strong>. Ses chapitres et ses pièces
              jointes seront définitivement supprimés.
            </p>
            {deleteError && <div className="confirm-error">{deleteError}</div>}
            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setPending(null)}
                disabled={deleting}
              >
                Annuler
              </button>
              <button
                className="confirm-delete"
                onClick={confirmDelete}
                disabled={deleting}
              >
                <Trash2 size={15} />
                {deleting ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </section>
        </div>
      )}
    </Root>
  );
}
