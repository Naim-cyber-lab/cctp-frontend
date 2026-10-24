import { HelpOnboarding } from "./components/HelpOnboarding";
import { apiFetch } from "./api/client";
import { ArrowLeft, BookOpenCheck, FileText } from "lucide-react";
import { MyTasksProvider } from "./hooks/useMyTasks";
import { listenNotificationClicks, syncPush } from "./utils/push";
import { prefetchPreview } from "./utils/prefetch";
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Topbar } from "./components/Topbar";
import { useTeamRealtime } from "./hooks/useTeamRealtime";
import { MentionToasts } from "./components/MentionToasts";
import { ShareToasts } from "./components/ShareToasts";
import { NotificationToasts } from "./components/NotificationBell";
import { useNotifications } from "./hooks/useNotifications";
import { CatalogProvider, useCatalog } from "./catalog/CatalogContext";
import { useProjects } from "./hooks/useProjects";
import { WorkspaceProvider, useWorkspaces } from "./hooks/useWorkspaces";
import { TasksPanel } from "./components/TasksPanel";
import { DiscussionPanel } from "./components/DiscussionPanel";
import { PersonalDocumentsPanel } from "./components/PersonalDocumentsPanel";
import { useAuth } from "./auth/AuthContext";
import { AiUnavailableModal } from "./components/AiUnavailableModal";
import { renumberSection } from "./utils/chapterNumbering";
import { useCctpPresence } from "./hooks/useCctpPresence";
import { CctpAccessPanel } from "./components/CctpAccessPanel";
import { ProjectNav } from "./components/ProjectNav";

const lazyNamed = (loader, name) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));
const ProjectsPage = lazyNamed(() => import("./pages/ProjectsPage"), "ProjectsPage");
const SelectionPage = lazyNamed(() => import("./pages/SelectionPage"), "SelectionPage");
const DraftPage = lazyNamed(() => import("./pages/DraftPage"), "DraftPage");
const AssistantPage = lazyNamed(() => import("./pages/AssistantPage"), "AssistantPage");
const LoginPage = lazyNamed(() => import("./pages/LoginPage"), "LoginPage");
const SetPasswordPage = lazyNamed(
  () => import("./pages/SetPasswordPage"),
  "SetPasswordPage",
);
const DocumentEditorPage = lazyNamed(
  () => import("./pages/DocumentEditorPage"),
  "DocumentEditorPage",
);
const CctpOnboardingPage = lazyNamed(
  () => import("./pages/CctpOnboardingPage"),
  "CctpOnboardingPage",
);
const ConsultationsPage = lazyNamed(() => import("./pages/ConsultationsPage"), "ConsultationsPage");
const CompanyPortalPage = lazyNamed(() => import("./pages/CompanyPortalPage"), "CompanyPortalPage");
const QuotesPage = lazyNamed(() => import("./pages/QuotesPage"), "QuotesPage");
const ProfilePage = lazyNamed(() => import("./pages/ProfilePage"), "ProfilePage");
const TasksPage = lazyNamed(() => import("./pages/TasksPage"), "TasksPage");
const AgencyLibraryPage = lazyNamed(() => import("./pages/AgencyLibraryPage"), "AgencyLibraryPage");
const VerifyAccountPage = lazyNamed(() => import("./pages/VerifyAccountPage"), "VerifyAccountPage");
const ProjectOverviewPage = lazyNamed(() => import("./pages/ProjectOverviewPage"), "ProjectOverviewPage");
const ProjectDocumentsPage = lazyNamed(() => import("./pages/ProjectDocumentsPage"), "ProjectDocumentsPage");
const FeasibilityPage = lazyNamed(() => import("./pages/FeasibilityPage"), "FeasibilityPage");

function RouteLoader({ label = "Chargement…" }) {
  return (
    <div className="route-loader" role="status" aria-live="polite">
      <span className="route-loader-spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function App() {
  const {
    user,
    loading: authLoading,
    login,
    register,
    setPassword,
    forgotPassword,
    sendVerificationCode,
    verifyCode,
    completeOnboarding,
    logout,
  } = useAuth();
  const consultationToken = new URLSearchParams(window.location.search).get("consultation");
  if (consultationToken)
    return (
      <Suspense fallback={<RouteLoader label="Ouverture du dossier de consultation…" />}>
        <CompanyPortalPage token={consultationToken} />
      </Suspense>
    );
  const passwordToken = new URLSearchParams(window.location.search).get("token");
  if (window.location.pathname === "/set-password" && passwordToken)
    return (
      <Suspense fallback={<RouteLoader label="Ouverture du lien sécurisé…" />}>
        <SetPasswordPage token={passwordToken} onSetPassword={setPassword} />
      </Suspense>
    );
  if (authLoading)
    return <div className="auth-loading">Chargement de votre espace…</div>;
  if (!user)
    return (
      <Suspense fallback={<RouteLoader label="Ouverture…" />}>
        <LoginPage
          onLogin={login}
          onRegister={register}
          onForgotPassword={forgotPassword}
        />
      </Suspense>
    );
  // Tant que l'adresse e-mail n'est pas confirmée, rien d'autre que cet écran n'est accessible (le serveur refuse aussi toute autre requête).
  if (!user.isVerified)
    return (
      <Suspense fallback={<RouteLoader label="Ouverture…" />}>
        <VerifyAccountPage email={user.email} onSend={sendVerificationCode} onVerify={verifyCode} onLogout={logout} />
      </Suspense>
    );
  if (!user.onboardingCompleted)
    return (
      <Suspense fallback={<RouteLoader />}>
        <CctpOnboardingPage onComplete={completeOnboarding} onLogout={logout} />
      </Suspense>
    );
  return (
    <CatalogProvider>
      <AuthenticatedApp user={user} onLogout={logout} />
    </CatalogProvider>
  );
}

function AuthenticatedApp({ user, onLogout }) {
  const {
    chapters,
    loading: catalogLoading,
    error: catalogError,
  } = useCatalog();
  const {
    projects,
    loading,
    error,
    createProject,
    importProject,
    loadProject,
    updateProject,
    deleteProject,
    archiveProject,
    folders,
    addFolder,
    editFolder,
    removeFolder,
    patchProject,
    saveSection,
    getProgress,
    addProject,
    refresh,
    refreshQuiet,
  } = useProjects(user);
  const openChatRef = useRef(null);
  const invitationOpenedRef = useRef(false);
  const realtime = useTeamRealtime(user, { onOpenChat: (id) => openChatRef.current?.(id) });
  const [teamIntent, setTeamIntent] = useState(null); // conversation à ouvrir dans le panneau Discussion (clic sur une mention)
  const [tasksOpen, setTasksOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  // Un clic en dehors des panneaux « Tâches » / « Discussion » les ferme (pas seulement la croix) ; les boutons de l'en-tête, les fenêtres ouvertes depuis un panneau et le dock vocal sont ignorés.
  useEffect(() => {
    if (!tasksOpen && !discussionOpen) return undefined;
    const closeOutside = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.isConnected) return;
      if (target.closest("[data-tasks-panel], [data-discussion-panel], .topbar-function, [role='dialog'], [role='alertdialog'], .voice-dock-wrap, .modal-backdrop, .task-create-backdrop, .task-modal-backdrop")) return;
      setTasksOpen(false); setDiscussionOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [tasksOpen, discussionOpen]);
  useEffect(() => { const open = () => setDiscussionOpen(true); window.addEventListener("cctp:open-discussion", open); return () => window.removeEventListener("cctp:open-discussion", open); }, []);
  const [cctpSection, setCctpSection] = useState("documents"); // CCTP : « Documents » | « Bibliothèque agence »
  const [settingsSection, setSettingsSection] = useState({ id: "account", nonce: 0 });
  const [tasksScope, setTasksScope] = useState("mine");
  const [tasksFocus, setTasksFocus] = useState(null); // tâche à mettre en évidence sur la page Tâches
  const [shareToasts, setShareToasts] = useState([]);
  const notifications = useNotifications(user, realtime);
  // notifications système : si l'autorisation est déjà donnée, l'appareil est (ré)enregistré à chaque connexion ; un clic sur une notification ouvre le bon CCTP
  useEffect(() => {
    if (!user) return undefined;
    syncPush();
    return listenNotificationClicks();
  }, [user?.email]);
  const [focusCommentId, setFocusCommentId] = useState(null);
  const changedTimer = useRef(null), activeProjectRef = useRef(null), collaborativeRef = useRef(false), loadProjectRef = useRef(null);
  // Un CCTP partagé avec moi doit apparaître sans recharger : événement en direct, retour sur l'onglet, et rafraîchissement régulier.
  useEffect(() => {
    const unsubscribe = realtime.subscribe?.((event) => {
      if (event?.type === "cctp_shared") {
        const id = `${event.cctpId}-${Date.now()}`;
        setShareToasts((items) => [...items.filter((item) => item.cctpId !== event.cctpId), { ...event, id }]);
        setTimeout(() => setShareToasts((items) => items.filter((item) => item.id !== id)), 15000);
      }
      if (event?.type === "cctp_shared" || event?.type === "_open") refreshQuiet();
      // Quelqu'un a modifié ce CCTP (nom, chapitres, partage, texte) : on le relit une seule fois, groupé si plusieurs événements se suivent.
      if (event?.type === "cctp_changed") {
        clearTimeout(changedTimer.current);
        changedTimer.current = setTimeout(() => {
          if (event.cctpId && event.cctpId === activeProjectRef.current && collaborativeRef.current) loadProjectRef.current?.(event.cctpId).catch(() => {});
          else refreshQuiet();
        }, 350);
      }
    });
    const onFocus = () => { if (document.visibilityState !== "hidden") refreshQuiet(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") refreshQuiet(); }, 30000);
    return () => { unsubscribe?.(); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); clearInterval(timer); };
  }, [realtime.subscribe, refreshQuiet]);
  const [view, setView] = useState("projects");
  const [workspaceTab, setWorkspaceTab] = useState("projects");
  const [projectScope, setProjectScope] = useState(false); // vrai tant que l'on navigue DANS un projet (onglets du projet) ; faux dans les vues globales
  const [consultProjectId, setConsultProjectId] = useState("");
  const [consultTarget, setConsultTarget] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [selectionProjectId, setSelectionProjectId] = useState(null);
  const [activeChapterId, setActiveChapterId] = useState(null);
  const [unavailableChapter, setUnavailableChapter] = useState(null);
  const project = projects.find((p) => p.id === activeProjectId);
  const collaborativeView = ["draft", "assistant", "preview"].includes(view);
  // Fil d'Ariane sous « Projets / <projet> » selon la page : CCTP, CCTP / lot, Estimation, Consultation, Documents
  const presenceLocation = view === "assistant" ? `Lot ${activeChapterId || ""}` : view === "preview" ? "Aperçu" : "Brouillon";
  const presence = useCctpPresence(collaborativeView ? activeProjectId : null, presenceLocation, view === "assistant" || view === "preview");
  useEffect(() => {
    if (!collaborativeView || !activeProjectId || !project?.shared) return;
    // Filet de sécurité seulement (le serveur prévient dès qu'il y a un changement) : une relecture toutes les 45 s au lieu de toutes les 4 s.
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") loadProject(activeProjectId).catch(() => {}); }, 45000);
    return () => clearInterval(timer);
  }, [collaborativeView, activeProjectId, project?.shared, loadProject]);
  activeProjectRef.current = activeProjectId; collaborativeRef.current = collaborativeView; loadProjectRef.current = loadProject;
  // La liste ne renvoie que des résumés (sans chapitres ni page de garde) : tant que le CCTP complet n'est pas
  // arrivé, aucun éditeur ne doit s'ouvrir, sous peine d'afficher une page vide puis de l'enregistrer.
  const projectReady = Boolean(project) && !project.summaryOnly;
  // Sur la page du brouillon, on prépare déjà l'aperçu (code + données) : le clic suivant s'affiche presque instantanément.
  useEffect(() => {
    if (view !== "draft" || !projectReady) return undefined;
    const timer = setTimeout(() => prefetchPreview(project), 700);
    return () => clearTimeout(timer);
  }, [view, projectReady, project?.id, project?.shared]); // eslint-disable-line react-hooks/exhaustive-deps
  const projectLoading = Boolean(project) && project.summaryOnly && ["draft", "assistant", "preview"].includes(view);
  const selectionProject = projects.find((p) => p.id === selectionProjectId);
  const [loadError, setLoadError] = useState("");
  const openProject = (id) => {
    setLoadError("");
    setActiveProjectId(id);
    setProjectScope(true);
    setWorkspaceTab("projects");
    setView("project-overview");
    loadProject(id).catch((reason) => setLoadError(reason?.message || "Impossible de charger ce CCTP."));
  };
  const importAndOpen = async (file, name) => {
    const created = await importProject(file, name);
    openProject(created.id);
  };
  const submitSelection = async (
    name,
    selected,
    cover,
    editedSections = null,
  ) => {
    const projectBeingEdited = selectionProject || project;
    if (selectionProjectId && projectBeingEdited) {
      const base = editedSections || projectBeingEdited.sections;
      await updateProject(projectBeingEdited.id, {
        name: name.trim(),
        selected,
        sections: {
          ...base,
          __document: { ...(base.__document || {}), ...cover },
        },
      });
      setActiveProjectId(projectBeingEdited.id);
      setSelectionProjectId(null);
      setView("draft");
    } else {
      const created = await createProject(name, selected, cover);
      setActiveProjectId(created.id);
      setSelectionProjectId(null);
      setView("draft");
    }
  };
  const goHome = () => {
    setWorkspaceTab("projects");
    setActiveProjectId(null);
    setSelectionProjectId(null);
    setView("projects");
  };
  const changeWorkspaceTab = (tab) => {
    setProjectScope(false);
    setWorkspaceTab(tab);
    setActiveProjectId(null);
    setSelectionProjectId(null);
    setView(tab === "projects" || tab === "cctp" ? "projects" : tab);
  };
  const [libraryReturn, setLibraryReturn] = useState(null); // chapitre d'où la bibliothèque a été ouverte : « Utiliser dans le CCTP courant » y retourne
  const [pendingClause, setPendingClause] = useState(null);
  const openAgencyLibrary = (context = null) => { setLibraryReturn(context && context.projectId && context.chapterId ? context : null); setProjectScope(false); setActiveProjectId(null); setSelectionProjectId(null); setWorkspaceTab("cctp"); setCctpSection("library"); setView("projects"); };
  const useClauseInCctp = async (clause) => {
    const context = libraryReturn;
    if (!context) return;
    setPendingClause({ id: clause.id, nonce: Date.now() });
    setLibraryReturn(null); setProjectScope(true); setWorkspaceTab("cctp"); setActiveProjectId(context.projectId);
    await loadProject(context.projectId).catch(() => {});
    setActiveChapterId(context.chapterId); setView("assistant");
  };
  const navigateProject = (section) => {
    if (!project) return;
    setProjectScope(true);
    if (section === "overview") { setWorkspaceTab("projects"); setView("project-overview"); return; }
    if (section === "cctp") { setWorkspaceTab("cctp"); setView("draft"); return; }
    if (section === "estimate") { setQuotesOpen({ cctpId: project.id, nonce: Date.now() }); setWorkspaceTab("quotes"); setView("quotes"); return; }
    if (section === "consultation") { setConsultProjectId(project.id); setWorkspaceTab("consult"); setView("consult"); return; }
    if (section === "documents") { setWorkspaceTab("projects"); setView("project-documents"); }
    if (section === "feasibility") { setWorkspaceTab("projects"); setView("project-feasibility"); }
  };
  const openSettings = (sectionId = "account") => {
    setSettingsSection({ id: sectionId === "agency" ? "agency" : "account", nonce: Date.now() });
    changeWorkspaceTab("profile");
  };
  const openTasksPage = (scope = "mine", focusId = null) => {
    setTasksOpen(false);
    setTasksScope(scope);
    setTasksFocus(focusId ? { id: focusId, nonce: Date.now() } : null);
    changeWorkspaceTab("tasks");
  };
  // Clic sur une mention (ou une notification de discussion) : le panneau Discussion s'ouvre sur la conversation concernée, sans quitter la page en cours.
  openChatRef.current = (conversationId) => {
    setDiscussionOpen(true);
    setTeamIntent({ conversationId, nonce: Date.now() });
  };
  // Depuis une discussion : ouvre MON CCTP directement sur sa page d'aperçu.
  const openPreview = (id) => {
    setLoadError("");
    setWorkspaceTab("cctp");
    setSelectionProjectId(null);
    setActiveProjectId(id);
    setView("preview");
    loadProject(id).catch((reason) => setLoadError(reason?.message || "Impossible de charger ce CCTP."));
  };
  // Bandeau d'appel vocal : un clic rouvre l'aperçu du CCTP de l'appel.
  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;
  useEffect(() => {
    const onOpen = (event) => event.detail?.id && openPreviewRef.current(event.detail.id);
    window.addEventListener("cctp:open-preview", onOpen);
    return () => window.removeEventListener("cctp:open-preview", onOpen);
  }, []);
  // lien d'une notification push de consultation : ouvre directement la consultation et l'onglet concernés
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const consultationId = params.get("consultation-open");
    if (!consultationId) return;
    const wantedTab = params.get("tab") || "tracking"; // lu AVANT le nettoyage de l'adresse : la réponse du serveur arrive après
    apiFetch(`/consultations/${consultationId}`).then((detail) => {
      setConsultProjectId(detail.cctpId);
      setConsultTarget({ consultationId, tab: wantedTab, nonce: Date.now() });
      setWorkspaceTab("consult");
      setActiveProjectId(null);
      setView("consult");
    }).catch(() => {});
    params.delete("consultation-open"); params.delete("tab");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);
  // lien d'un devis partagé (e-mail, push) : ouvre directement le devis
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devisId = params.get("devis-open");
    if (!devisId) return;
    openDevis(devisId);
    params.delete("devis-open");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (invitationOpenedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const sharedCctpId = params.get("cctp");
    if (!sharedCctpId) return;
    invitationOpenedRef.current = true;
    const linkedComment = params.get("comment");
    if (linkedComment) setFocusCommentId(linkedComment);
    openPreview(sharedCctpId);
    params.delete("cctp"); params.delete("view"); params.delete("comment");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);
  // Un clic sur une notification ouvre le CCTP et la discussion concernée
  const [quotesOpen, setQuotesOpen] = useState(null);
  const openDevis = (cctpId) => {
    setQuotesOpen({ cctpId, nonce: Date.now() });
    setWorkspaceTab("quotes");
    setActiveProjectId(null);
    setView("quotes");
  };
  const openNotification = (item) => {
    if (!item.read) notifications.markRead([item.id]);
    if (item.kind === "devis_access") { openPreview(item.cctpId); return; }
    if (item.kind === "task_assigned") { setTasksOpen(true); return; }
    if (item.kind === "validation") { setCctpSection("library"); changeWorkspaceTab("cctp"); return; }
    if (item.kind === "permission_changed") { if (item.target?.devis) openDevis(item.cctpId); else openPreview(item.cctpId); return; }
    if (String(item.kind).startsWith("devis_")) { openDevis(item.cctpId); return; }
    if (item.kind === "consult") {
      setConsultProjectId(item.cctpId);
      // anciennes notifications sans onglet mémorisé : une question ou une réponse d'entreprise mène aux Échanges
      const legacyTab = /^Question de|a répondu à votre demande de précision/.test(item.excerpt || "") ? "exchanges" : /attribué/.test(item.excerpt || "") ? "award" : "tracking";
      setConsultTarget(item.target?.consultationId ? { consultationId: item.target.consultationId, tab: item.target.tab || legacyTab, nonce: Date.now() } : null);
      setWorkspaceTab("consult");
      setActiveProjectId(null);
      setView("consult");
      return;
    }
    setFocusCommentId(item.commentId ? `${item.commentId}:${Date.now()}` : null);
    openPreview(item.cctpId);
  };
  const [answerFocus, setAnswerFocus] = useState(null);
  const editChapter = (id, focus = null) => {
    setAnswerFocus(focus);
    setActiveChapterId(id);
    setView("assistant");
  };
  const reorderChapters = async (fromIndex, toIndex) => {
    if (!project || toIndex < 0 || toIndex >= project.selected.length) return;
    const selected = [...project.selected];
    const [moved] = selected.splice(fromIndex, 1);
    selected.splice(toIndex, 0, moved);
    const sections = { ...project.sections };
    selected.forEach((id, index) => {
      if (sections[id]) sections[id] = renumberSection(sections[id], index + 1);
    });
    await updateProject(project.id, { selected, sections });
  };
  const removeChapter = async (id) => {
    if (!project || !project.selected.includes(id)) return;
    const selected = project.selected.filter((item) => item !== id);
    const sections = { ...project.sections };
    delete sections[id];
    selected.forEach((chapterId, index) => {
      if (sections[chapterId]) sections[chapterId] = renumberSection(sections[chapterId], index + 1);
    });
    await updateProject(project.id, { selected, sections });
  };
  if (loading)
    return <div className="api-state">Chargement de vos CCTP…</div>;
  return (
    <WorkspaceProvider user={user} realtime={realtime}>
    <MyTasksProvider user={user} realtime={realtime}>
    <div className="app">
      <Topbar
        projectName={project?.name}
        lotCount={project?.selected?.length || 0}
        activeTab={workspaceTab}
        onTabChange={changeWorkspaceTab}
        onHome={goHome}
        user={user}
        onLogout={onLogout}
        chatUnread={realtime.chatUnread || 0}
        tasksOpen={tasksOpen}
        discussionOpen={discussionOpen}
        onOpenTasks={() => { setDiscussionOpen(false); setTasksOpen((open) => !open); }}
        onOpenDiscussion={() => { setTasksOpen(false); setDiscussionOpen((open) => !open); }}
        onOpenSettings={openSettings}
        projectScope={projectScope}
        onOpenLibrary={() => openAgencyLibrary()}
        notifications={{ items: notifications.items, unread: notifications.unread, onOpen: openNotification, onMarkAllRead: () => notifications.markRead(null) }}
      />
      {projectReady && (["project-overview", "project-feasibility", "project-documents", "draft", "assistant", "preview"].includes(view) || (projectScope && ["quotes", "consult"].includes(view))) && <ProjectNav project={project} onOpenLibrary={() => openAgencyLibrary({ projectId: project.id, chapterId: view === "assistant" ? activeChapterId : null })} active={view === "project-overview" ? "overview" : view === "project-feasibility" ? "feasibility" : view === "project-documents" ? "documents" : view === "quotes" ? "estimate" : view === "consult" ? "consultation" : "cctp"} onNavigate={navigateProject} onBack={() => changeWorkspaceTab("projects")}/>} 
      <TasksPanel
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        onSeeAll={() => openTasksPage("mine")}
        onOpenTask={(task) => openTasksPage("mine", task.id)}
      />
      <DiscussionPanel
        open={discussionOpen}
        onClose={() => setDiscussionOpen(false)}
        user={user}
        realtime={realtime}
        projects={projects}
        onImported={addProject}
        onOpenProject={openPreview}
        onOpenProjectChat={(id) => { window.__pendingProjectChat = id; setDiscussionOpen(false); openPreview(id); }}
        intent={teamIntent}
      />
      {(error || catalogError) && (
        <div className="api-state api-error">{error || catalogError}</div>
      )}
      <NotificationToasts toasts={notifications.toasts} onDismiss={notifications.dismissToast} onOpen={(toast) => { notifications.dismissToast(toast.id); openNotification(toast); }} />
      <ShareToasts toasts={shareToasts} onDismiss={(id) => setShareToasts((items) => items.filter((item) => item.id !== id))} onOpen={(toast) => { setShareToasts((items) => items.filter((item) => item.id !== toast.id)); openProject(toast.cctpId); }} />
      <MentionToasts toasts={realtime.toasts} onOpen={(toast) => { realtime.dismissToast(toast.id); openChatRef.current?.(toast.conversationId); }} onDismiss={realtime.dismissToast} />
      <PageErrorBoundary key={`${view}:${activeProjectId}:${activeChapterId}`} onHome={goHome}>
      <Suspense fallback={<RouteLoader label="Ouverture de la page…" />}>
      {view === "projects" && (<div className="cctp-home layout-portfolio" data-cctp-home>
        <div className="cctp-home-bar" data-cctp-subnav>
          {workspaceTab === "cctp" && cctpSection !== "library" && <HelpOnboarding topic="cctp" />}
          {cctpSection === "library"
            ? <button type="button" className="cctp-library-link" data-cctp-section="documents" onClick={() => setCctpSection("documents")}><ArrowLeft size={15} /> CCTP</button>
            : workspaceTab === "cctp" && <button type="button" className="cctp-library-link" data-cctp-section="library" onClick={() => setCctpSection("library")}><BookOpenCheck size={15} /> Bibliothèque agence{realtime.libraryPending > 0 && <em className="tab-badge" data-library-tab-count>{realtime.libraryPending}</em>}</button>}
        </div>
        {cctpSection === "library" ? <AgencyLibraryPage user={user} onOpenSettings={openSettings} insertContext={libraryReturn} onUseInCctp={useClauseInCctp} /> : <><PersonalDocumentsPanel onImported={refresh} /><ProjectsPage
          projects={projects}
          getProgress={getProgress}
          portfolio={workspaceTab === "projects"}
          onNew={() => {
            setActiveProjectId(null);
            setSelectionProjectId(null);
            setView("select");
          }}
          onOpen={openProject}
          onDelete={deleteProject}
          onArchive={archiveProject}
          folders={folders}
          onCreateFolder={addFolder}
          onRenameFolder={editFolder}
          onDeleteFolder={removeFolder}
          onPatch={patchProject}
          onImport={importAndOpen}
          onRefresh={refreshQuiet}
        /></>}
      </div>)}
      {view === "project-overview" && projectReady && <ProjectOverviewPage project={project} progress={getProgress(project)} onNavigate={navigateProject}/>} 
      {view === "project-documents" && projectReady && <ProjectDocumentsPage project={project}/>}
      {view === "project-feasibility" && projectReady && <FeasibilityPage project={project} onNavigate={navigateProject}/>} 
      {view === "consult" && <ConsultationsPage key={`${consultProjectId}-${consultTarget?.nonce || 0}`} initialProjectId={consultProjectId} target={consultTarget} projects={projects.filter((item) => !item.archived)} />}
      {view === "quotes" && (
        <QuotesPage
          projectScope={projectScope}
          user={user}
          onOpenSettings={openSettings}
          onRefresh={refreshQuiet}
          openRequest={quotesOpen}
          folders={folders}
          onCreateFolder={addFolder}
          onRenameFolder={editFolder}
          onDeleteFolder={removeFolder}
          projects={projects.filter((item) => !item.archived)}
          onOpenCctp={(id) => {
            setWorkspaceTab("cctp");
            openProject(id);
          }}
          onOpenWork={(id, chapterId, target) => {
            setLoadError("");
            setWorkspaceTab("cctp");
            setActiveProjectId(id);
            setView("draft");
            loadProject(id).then(() => editChapter(chapterId, target)).catch((reason) => setLoadError(reason?.message || "Impossible de charger ce CCTP."));
          }}
        />
      )}
      {projectLoading && (
        loadError ? (
          <div className="api-state api-error" role="alert" data-project-load-error>
            {loadError} <button onClick={goHome}>Retour à mes CCTP</button>
          </div>
        ) : (
          <RouteLoader label="Chargement du CCTP…" />
        )
      )}
      {view === "profile" && <ProfilePage user={user} initialSection={settingsSection.id} sectionNonce={settingsSection.nonce} />}
      {view === "tasks" && <TasksPage key={tasksFocus?.nonce || 0} user={user} projects={projects} initialScope={tasksScope} focusTaskId={tasksFocus?.id || null} />}
      {view === "select" && (
        <SelectionPage
          initial={selectionProject}
          lotsOnly={Boolean(selectionProject)}
          onCancel={selectionProject ? () => { setSelectionProjectId(null); setView("draft"); } : goHome}
          onSubmit={submitSelection}
        />
      )}
      {view === "draft" && projectReady && (
        <DraftPage
          project={project}
          projects={projects}
          progress={getProgress(project)}
          getProgress={getProgress}
          onEdit={(id) => editChapter(id)}
          onOpenDocuments={() => navigateProject("documents")}
          onArchive={(id, archived) => { archiveProject(id, archived).then(() => changeWorkspaceTab("projects")); }}
          onConsult={() => {
            setConsultProjectId(project.id);
            setWorkspaceTab("consult");
            setActiveProjectId(null);
            setView("consult");
          }}
          onModify={() => {
            setSelectionProjectId(project.id);
            setView("select");
          }}
          onNew={() => {
            setActiveProjectId(null);
            setSelectionProjectId(null);
            setView("select");
          }}
          onOpen={openProject}
          onPreview={() => setView("preview")}
          onReorder={reorderChapters}
          onRemoveLot={removeChapter}
          onInlineSave={(changes) => updateProject(project.id, changes)}
        />
      )}
      {view === "preview" && projectReady && (
        <DocumentEditorPage
          project={project}
          focusCommentId={focusCommentId}
          onEditAnswer={(chapterId, target) => editChapter(chapterId, target)}
          readOnly={project.accessRole === "read"}
          onBack={() => setView("draft")}
          onUnavailable={setUnavailableChapter}
          onSave={(name, sections) =>
            updateProject(project.id, { name, sections })
          }
        />
      )}
      {view === "assistant" && projectReady && (
        <AssistantPage
          userEmail={user?.email}
          pendingClause={pendingClause}
          onClauseConsumed={() => setPendingClause(null)}
          onOpenLibrary={() => openAgencyLibrary({ projectId: project.id, chapterId: activeChapterId })}
          initialFocus={answerFocus}
          projectId={project.id}
          projectName={project.name}
          chapter={chapters.find((c) => c.id === activeChapterId)}
          chapterNumber={project.selected.indexOf(activeChapterId) + 1}
          existing={project.sections[activeChapterId]}
          onBack={() => setView("draft")}
          onSave={async (section, { stay = false } = {}) => {
            await saveSection(project.id, activeChapterId, section);
            if (!stay) setView("draft");
          }}
          onGenerated={async (section) => {
            await saveSection(project.id, activeChapterId, section);
            setView("preview");
          }}
        />
      )}
      </Suspense>
      </PageErrorBoundary>
      {collaborativeView && project && <CctpAccessPanel project={project} presence={presence} currentEmail={user.email} currentLocation={presenceLocation} editingNow={view === "assistant" || view === "preview"}/>}
      {unavailableChapter && (
        <AiUnavailableModal
          chapter={unavailableChapter}
          onClose={() => setUnavailableChapter(null)}
        />
      )}
    </div>
    </MyTasksProvider>
    </WorkspaceProvider>
  );
}
