import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UseDocuments } from "../components/UseDocuments";
import { ConsistencyPanel } from "../components/ConsistencyPanel";
import { PlanningUnmatchedLines } from "../components/PlanningUnmatchedLines";
import { InlinePersonalizationDrawer, InlinePersonalizationTrigger } from "../components/InlinePersonalization";
import { CalendarRange, Download, Plus, RefreshCw, Undo2 } from "lucide-react";
import { commitPlanning, createPlanningHistoryEntry, deletePlanningDurationReference, deletePlanningHistoryEntry, setPlanningDurationReference, downloadPlanning, generatePlanning, syncPlanning, savePlanningTaskAsTemplate, getPlanningTemplateUpdates, decidePlanningTemplateUpdate, getMicrosoftProjectPreflight, getPlanning, getPlanningHistory, listPlanningEvents, patchPlanningHoldpoint,
  postPlanningActual, postPlanningEvent, qualifyPlanningHistoryEntry, revertPlanningEvent, selectPlanningScenario, setPlanningScheduleConstraint,
  searchPlanningTaskTemplates, getPlanningTaskProposals, createPlanningTask, getPlanningProjection } from "../api/client";
import "../planning.css";

const COLS_KEY = "calepin.planning.columns", VIS_KEY = "calepin.planning.visibleColumns";
const readStored = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const writeStored = (key, value) => { try { window.localStorage.setItem(key, String(value)); } catch { /* stockage indisponible */ } };
/** Colonnes de la grille : [clé, libellé, largeur par défaut, largeur minimale]. La colonne Tâche absorbe le séparateur Grille ↔ Gantt ; le Gantt prend tout l'espace restant. */
const COLS = [["num", "N°", 40, 32], ["task", "Tâche", 280, 140], ["source", "Source", 75, 60], ["duration", "Durée", 75, 60], ["start", "Début", 105, 90], ["finish", "Fin", 105, 90], ["pred", "Prédécesseurs", 95, 75],
  ["team", "Équipe", 70, 60], ["qty", "Quantité", 90, 60], ["progress", "% réalisé", 80, 60], ["astart", "Début réel", 105, 90], ["afinish", "Fin réelle", 105, 90]];
const DEFAULT_ON = new Set(["num", "task", "source", "duration", "start", "finish", "pred"]); // les colonnes secondaires s'activent dans « Colonnes ▾ »
const ALWAYS_ON = new Set(["num", "task"]);
const COL_GAP = 4, GRID_PAD = 16;
const ZOOM = { day: 26, week: 12, month: 5 };
const SOURCE_BADGE = { DPGF: "DPGF", CCTP: "CCTP", MANUAL: "Manuel", AGENCY: "Agence", LIBRARY: "Bibliothèque" };

/** Durée saisie : « 3 », « 3j », « 3 j », « 12h » (8 h = 1 jour), « 0,5j » → jours ouvrés entiers (arrondi au jour supérieur : le moteur planifie au jour). null = saisie invalide. */
export function parseDuration(text) {
  const match = String(text ?? "").trim().toLowerCase().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*(j|jr|jours?|d|h|heures?)?$/);
  if (!match) return null;
  const value = Number(match[1]) / (match[2] && match[2].startsWith("h") ? 8 : 1);
  return value > 0 ? Math.max(1, Math.ceil(value - 1e-9)) : null;
}

/** Prédécesseurs saisis : « 2 », « 2FS », « 2SS », « 2FF+1j », « 2FS-1j », « 2FS;5SS » (numéros = colonne N°). La chaîne affichée n'est pas la vérité : elle est convertie en dépendances. */
export function parsePredecessors(text) {
  const out = [];
  for (const part of String(text ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+)\s*j?)?$/i);
    if (!match) return null;
    out.push({ number: Number(match[1]), type: (match[2] || "FS").toUpperCase(), lag: match[3] ? (match[3] === "-" ? -1 : 1) * Number(match[4]) : 0 });
  }
  return out;
}
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const STATUS = {
  SCHEDULED: ["Planifiée", "ok"], PROVISIONAL_EXTERNAL_HOLDPOINTS: ["Dates provisoires", "warn"], BLOCKED_EXTERNAL_PREREQUISITE: ["Bloquée : prérequis externe", "bad"],
  DRAFT_PARTIAL_DURATION: ["Durée partielle", "warn"], UNRESOLVED_DURATION: ["Durée à renseigner", "bad"], UNSCHEDULED: ["Non planifiée", "bad"], UNSCHEDULED_PREDECESSOR_UNRESOLVED: ["En attente d’une durée amont", "bad"],
  CONFLICT_PINNED_START: ["Date épinglée impossible", "bad"], BASELINE_PROPOSED: ["Durée proposée par l’historique", "info"],
};
const SOURCE = { GENERIC_PRODUCTIVITY_V1: "Rendement générique", USER_PLAN_EDIT: "Modifiée par vous", HISTORY_BASELINE_ACCEPTED: "Baseline de votre historique retenue", USER_PROFILE: "Votre historique", PROJECT_EXPLICIT: "Imposée au projet", GATE_ZERO_DURATION: "Jalon", UNRESOLVED: "Non résolue" };
const CONFIDENCE = { HIGH: "Haute", MEDIUM: "Moyenne", LOW_MEDIUM: "Basse à moyenne", LOW: "Basse", UNRESOLVED: "—", STRUCTURAL: "Structurelle" };
const EVENT_LABEL = { TASK_RESIZE: "Durée modifiée", TASK_MOVE: "Tâche déplacée", PIN_START: "Début épinglé", UNPIN_START: "Début libéré", DEPENDENCY_ADD: "Lien ajouté", DEPENDENCY_REMOVE: "Lien retiré",
  RESOURCE_SCENARIO_CHANGE: "Scénario changé", TEAM_COUNT_CHANGE: "Équipes modifiées", HOLDPOINT_STATUS_CHANGE: "Hold-point mis à jour", REVERT_EVENT: "Annulation", ACCEPT_BASELINE: "Durée historique retenue", DURATION_MODE_CHANGE: "Mode de durée modifié", SCHEDULE_CONSTRAINT_CHANGE: "Date cible modifiée", ACTUAL_UPDATE: "Réalisé saisi", ANCHOR_CHANGE: "Date d’ancrage" };
const fmt = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—");
const errorText = (error) => error?.detail?.message || error?.message || "Une erreur est survenue";

function useCalendar(calendar) {
  return useMemo(() => {
    const days = new Set(calendar?.working_weekdays || ["MON", "TUE", "WED", "THU", "FRI"]);
    const holidays = new Set(calendar?.holidays || []);
    const blackouts = (calendar?.blackouts || []).map(([a, b]) => [a, b]);
    const isWork = (date) => {
      const iso = date.toISOString().slice(0, 10);
      return days.has(WEEKDAYS[(date.getUTCDay() + 6) % 7]) && !holidays.has(iso) && !blackouts.some(([a, b]) => iso >= a && iso <= b);
    };
    const utc = (iso) => new Date(`${iso}T00:00:00Z`);
    const index = (origin, iso) => Math.round((utc(iso) - utc(origin)) / 86400000); // jours CALENDAIRES depuis l'origine : week-ends et fériés restent visibles sur l'axe
    const dateAt = (origin, offset) => { const d = utc(origin); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const workdays = (startIso, finishIso) => { let count = 0; for (let d = utc(startIso); d <= utc(finishIso); d.setUTCDate(d.getUTCDate() + 1)) if (isWork(d)) count += 1; return count; };
    return { index, dateAt, isWork, utc, workdays };
  }, [calendar]);
}

function Badge({ tone = "ok", children, ...rest }) { return <span className={`pln-badge ${tone}`} {...rest}>{children}</span>; }

export function PlanningPage({ project, onNavigate }) {
  const [inlineTask, setInlineTask] = useState(null);
  useEffect(() => { const handler = (event) => setInlineTask(event.detail?.entityId || null); window.addEventListener("calepin:inline-personalize", handler); return () => window.removeEventListener("calepin:inline-personalize", handler); }, []);
  const [plan, setPlan] = useState(null); // null = chargement
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [templateUpdates, setTemplateUpdates] = useState([]); // nouvelles versions de tâches types d'agence disponibles pour ce projet
  const [templateDraft, setTemplateDraft] = useState(null); // tâche en cours d'enregistrement comme modèle agence
  const [sync, setSync] = useState(""); // "", "updating", "ok", "error" : réalignement automatique sur le projet
  const [selected, setSelected] = useState(null);
  const [osDate, setOsDate] = useState("");
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showPending, setShowPending] = useState(false);
  // Menus du Planning (Ajouter, Historique, Colonnes, Exporter, ⋯, menu d'une ligne) : comportement standard partagé, sans code par menu —
  // clic extérieur et Échap ferment, un seul menu ouvert à la fois, le focus entre dans le menu à l'ouverture et revient au bouton à la fermeture par Échap.
  useEffect(() => {
    const SELECTOR = "details.pln-menu, details.pln-row-menu";
    const opened = () => [...document.querySelectorAll(SELECTOR)].filter((menu) => menu.open);
    const onPointerDown = (event) => opened().forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; });
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      const menus = opened();
      if (!menus.length) return;
      menus.forEach((menu) => { menu.open = false; });
      menus[0].querySelector("summary")?.focus();
    };
    const onToggle = (event) => {
      const menu = event.target;
      if (!menu?.matches?.(SELECTOR) || !menu.open) return;
      opened().forEach((other) => { if (other !== menu) other.open = false; });
      menu.querySelector("[role=menuitem], input, button")?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("toggle", onToggle, true);
    return () => { document.removeEventListener("pointerdown", onPointerDown, true); document.removeEventListener("keydown", onKeyDown); document.removeEventListener("toggle", onToggle, true); };
  }, []);
  const [msp, setMsp] = useState(null); // récapitulatif avant export Microsoft Project
  const [zoom, setZoom] = useState("day");
  const [showJournal, setShowJournal] = useState(false);
  const [unmatchedOpen, setUnmatchedOpen] = useState(false);
  const [filter, setFilter] = useState("all"), [todoOpen, setTodoOpen] = useState(false), [flash, setFlash] = useState(null), [projection, setProjection] = useState(null);
  const debug = (() => { try { return readStored("calepin.debug") === "1" || /[?&]debug\b/.test(window.location.search); } catch { return false; } })(); // JSON : mode debug / admin seulement
  const [detailsOpen, setDetailsOpen] = useState(false); // panneau de détails fractionné (fermé par défaut)
  const [box, setBox] = useState(0), [colW, setColW] = useState(() => { try { return JSON.parse(readStored(COLS_KEY) || "{}") || {}; } catch { return {}; } }), [vis, setVis] = useState(() => { try { return JSON.parse(readStored(VIS_KEY) || "{}") || {}; } catch { return {}; } });
  const observer = useRef(null);
  const boxRef = useCallback((node) => { observer.current?.disconnect(); if (!node) return; setBox(node.clientWidth); if (typeof ResizeObserver !== "undefined") { observer.current = new ResizeObserver(() => setBox(node.clientWidth)); observer.current.observe(node); } }, []);
  const compact = box > 0 && box < 1000; // petit écran : les colonnes secondaires se masquent, Tâche + Durée + Gantt restent
  const isOn = (key) => ALWAYS_ON.has(key) || (key in vis ? vis[key] : DEFAULT_ON.has(key));
  const visibleCols = COLS.filter(([key]) => isOn(key) && !(compact && (key === "source" || key === "pred")));
  const rawWidth = (key) => { const col = COLS.find(([k]) => k === key); return Math.max(col[3], Number(colW[key]) || col[2]); };
  const rawGrid = visibleCols.reduce((sum, [key]) => sum + rawWidth(key), 0) + COL_GAP * (visibleCols.length - 1) + GRID_PAD;
  const shrink = box ? Math.max(0, rawGrid - Math.max(360, box - 240)) : 0; // jamais plus de la place disponible : la colonne Tâche cède en premier (sans passer sous son minimum)
  const widthOf = (key) => (key === "task" ? Math.max(COLS[1][3], rawWidth("task") - shrink) : rawWidth(key));
  const GRID_W = visibleCols.reduce((sum, [key]) => sum + widthOf(key), 0) + COL_GAP * (visibleCols.length - 1) + GRID_PAD;
  const gridTemplate = visibleCols.map(([key]) => `${widthOf(key)}px`).join(" ");
  const showCols = new Set(visibleCols.map(([key]) => key));
  const saveCols = (next) => { setColW(next); writeStored(COLS_KEY, JSON.stringify(next)); };
  const resizeCol = (key, width) => { const col = COLS.find(([k]) => k === key); saveCols({ ...colW, [key]: Math.max(col[3], Math.min(900, Math.round(width))) }); };
  const toggleCol = (key) => { const next = { ...vis, [key]: !isOn(key) }; setVis(next); writeStored(VIS_KEY, JSON.stringify(next)); };
  const resetColumns = () => { saveCols({}); setVis({}); writeStored(VIS_KEY, "{}"); }; // colonnes visibles, largeurs et séparateur Grille/Gantt
  const BASE_DAY = ZOOM[zoom];
  const [taskPanel, setTaskPanel] = useState(null);
  const [taskItems, setTaskItems] = useState([]);
  const [taskDraft, setTaskDraft] = useState({ label: "", duration_working_days: "" });
  const cal = useCalendar(plan?.calendar);

  const apply = useCallback((data) => { if (data?.exists === false) { setEmpty(true); setPlan(null); } else { setEmpty(false); setPlan(data); } }, []);
  // PLAN-017-AUTORECALC-01 : si le CCTP, les quantités ou le DPGF ont changé depuis la dernière génération, le planning se réaligne seul (jamais de bouton « Recalculer »).
  const syncNow = useCallback(async () => {
    setSync("updating");
    try { const result = await syncPlanning(project.id); if (result?.rows) apply(result); setSync("ok"); window.setTimeout(() => setSync((value) => (value === "ok" ? "" : value)), 2500); }
    catch { setSync("error"); }
  }, [project.id, apply]);
  const load = useCallback(async () => {
    setError("");
    try { const data = await getPlanning(project.id); apply(data); if (data?.stale) syncNow(); getPlanningProjection(project.id).then((r) => setProjection(r)).catch(() => setProjection(null)); getPlanningTemplateUpdates(project.id).then((r) => setTemplateUpdates(r.updates || [])).catch(() => setTemplateUpdates([])); setEvents((await listPlanningEvents(project.id)).events || []); } catch (e) { setError(errorText(e)); setPlan(null); setEmpty(false); }
  }, [project.id, apply, syncNow]);
  useEffect(() => { setPlan(null); setSync(""); load(); }, [load]);

  const run = async (action, { success } = {}) => {
    setBusy(true); setError(""); setNotice("");
    try { const result = await action(); const planning = result?.planning || result; if (planning?.rows || planning?.exists === false) apply(planning); setEvents((await listPlanningEvents(project.id)).events || []); if (success) setNotice(success); return result; }
    catch (e) { setError(errorText(e)); return null; } finally { setBusy(false); }
  };
  const decideTemplate = (update, action) => run(async () => { const result = await decidePlanningTemplateUpdate(project.id, update.task_id, { action, expected_revision: plan.revision }); getPlanningTemplateUpdates(project.id).then((r) => setTemplateUpdates(r.updates || [])).catch(() => {}); return result; },
    { success: action === "apply" ? `« ${update.new_label} » appliqué à ce projet.` : "Version actuelle conservée pour ce projet." });
  const saveTemplate = (draft) => run(() => savePlanningTaskAsTemplate(project.id, draft.task_id, { mode: draft.mode, override_id: draft.mode === "update" ? draft.override_id : null, label: draft.label }).then((r) => { setTemplateDraft(null); return r; }),
    { success: draft.mode === "update" ? "Nouvelle version du modèle agence enregistrée. Ce projet garde sa version." : "Tâche enregistrée comme modèle agence." });
  const openTemplateDraft = async (row) => {
    let existing = [];
    try { existing = ((await searchPlanningTaskTemplates({ origin: "agency" })).templates || []).filter((item) => item.override_id); } catch { /* bibliothèque indisponible : création seule */ }
    setTemplateDraft({ task_id: row.task_id, label: row.label, mode: "create", override_id: existing[0]?.override_id || "", existing });
  };
  const generate = () => run(() => generatePlanning(project.id, { os_date: osDate || null }), { success: "Planning généré à partir du questionnaire, du DPGF et des quantités." });
  const sendEvent = (body, success) => run(() => postPlanningEvent(project.id, { ...body, expected_revision: plan.revision }), { success });
  const sendEvents = (bodies, success) => run(async () => { let revision = plan.revision, last = null; for (const body of bodies) { last = await postPlanningEvent(project.id, { ...body, expected_revision: revision }); revision = last.planning.revision; } return last; }, { success });
  const openTaskPanel = async (kind) => {
    setTaskPanel(kind); setTaskItems([]); setTaskDraft({ label: "", duration_working_days: "" }); setError("");
    try {
      if (kind === "library") setTaskItems((await searchPlanningTaskTemplates({ lot: "Plâtrerie" })).templates || []);
      if (kind === "dpgf") setTaskItems((await getPlanningTaskProposals(project.id)).proposals || []);
    } catch (e) { setError(errorText(e)); }
  };
  const addTask = (payload) => run(() => createPlanningTask(project.id, { ...payload, expected_revision: plan.revision }), { success: `Tâche « ${payload.label} » ajoutée au planning.` }).then((result) => { if (result) setTaskPanel(null); });
  const commit = async () => {
    const result = await run(() => commitPlanning(project.id));
    if (result) { setNotice(result.events ? `✓ ${result.events} modification${result.events > 1 ? "s" : ""} enregistrée${result.events > 1 ? "s" : ""}${result.trained ? ` — ${result.trained} ajoutée${result.trained > 1 ? "s" : ""} à votre historique des durées` : ""}.` : "Aucune modification à enregistrer."); setShowPending(false); await load(); }
  };

  const rows = plan?.rows || [];
  const tasks = rows.filter((r) => r.row_type === "TASK");
  const dated = plan?.calendar_mode === "DATED";
  const origin = useMemo(() => {
    if (!dated) return null;
    const starts = tasks.map((t) => t.start).filter(Boolean).sort();
    return starts[0] || null;
  }, [tasks, dated]);
  const startOffset = (task) => (dated ? (task.start && origin ? cal.index(origin, task.start) : null) : task.start_offset ?? null);
  const finishOffset = (task) => (dated ? (task.finish && origin ? cal.index(origin, task.finish) : null) : task.finish_offset ?? null);
  const horizon = Math.max(10, ...tasks.map((t) => (finishOffset(t) ?? 0) + 1)) + 2;
  // réordonner ≠ replanifier : seul l'ordre change (événement TASK_REORDER) ; durées, dates, dépendances et liens DPGF/CCTP restent identiques
  const taskOrder = rows.filter((r) => r.row_type === "TASK").map((r) => r.task_id);
  const [drag, setDrag] = useState(null), dragRef = useRef(null);
  const reorder = (taskId, beforeId) => { if (taskId === beforeId) return; sendEvent({ event_type: "TASK_REORDER", target_id: taskId, payload: { before: beforeId || null } }, "Ordre enregistré."); };
  const moveTask = (taskId, where) => {
    const i = taskOrder.indexOf(taskId);
    if (where === "up" && i > 0) reorder(taskId, taskOrder[i - 1]);
    if (where === "down" && i < taskOrder.length - 1) reorder(taskId, taskOrder[i + 2] || null);
    if (where === "first" && i > 0) reorder(taskId, taskOrder[0]);
    if (where === "last" && i < taskOrder.length - 1) reorder(taskId, null);
  };
  const startDrag = (row, e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { id: row.task_id, overId: null, pos: "before" }; setDrag(dragRef.current);
    const mv = (ev) => {
      if (ev.clientY < 90) window.scrollBy(0, -18); else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 18); // défilement automatique près des bords
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-planning-row]");
      if (!el || el.dataset.planningRow === row.task_id) return;
      const box = el.getBoundingClientRect();
      dragRef.current = { id: row.task_id, overId: el.dataset.planningRow, pos: ev.clientY < box.top + box.height / 2 ? "before" : "after" }; setDrag(dragRef.current);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      const d = dragRef.current; dragRef.current = null; setDrag(null);
      if (!d || !d.overId) return;
      const target = taskOrder.indexOf(d.overId);
      reorder(d.id, d.pos === "before" ? d.overId : taskOrder[target + 1] || null);
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const DAY_WIDTH = box ? Math.max(BASE_DAY, Math.floor((box - GRID_W - 4) / horizon)) : BASE_DAY; // la timeline occupe toute la largeur restante
  const axis = useMemo(() => Array.from({ length: horizon }, (_, i) => (dated && origin ? cal.dateAt(origin, i) : null)), [horizon, dated, origin, cal]);
  const offDays = useMemo(() => axis.map((d, i) => (d && !cal.isWork(cal.utc(d)) ? i : -1)).filter((i) => i >= 0), [axis, cal]);

  const numberOf = useMemo(() => Object.fromEntries(tasks.map((t, i) => [t.task_id, i + 1])), [tasks]);
  const taskByNumber = useMemo(() => Object.fromEntries(tasks.map((t, i) => [i + 1, t])), [tasks]);
  const editableLinks = (taskId) => (plan?.dependencies || []).filter((l) => l.successor_task_id === taskId && l.strength !== "RESOURCE_CAPACITY_ONLY");
  const predecessorText = (taskId) => editableLinks(taskId).map((l) => `${numberOf[l.predecessor_task_id] ?? "?"}${l.relation_type && l.relation_type !== "FS" ? l.relation_type : l.lag_workdays ? "FS" : ""}${l.lag_workdays ? `${l.lag_workdays > 0 ? "+" : ""}${l.lag_workdays}j` : ""}`).join(";");
  const commitPredecessors = (task, text) => {
    const wanted = parsePredecessors(text);
    if (wanted === null) { setError("Prédécesseurs : écrivez par exemple 2, 2FS, 2SS, 2FF+1j ou 2FS;5SS (numéros de la colonne N°)."); return; }
    const events = [];
    const current = editableLinks(task.task_id);
    const key = (pred, type, lag) => `${pred}|${type}|${lag}`;
    const wantedKeys = new Set();
    for (const w of wanted) {
      const pred = taskByNumber[w.number];
      if (!pred || pred.task_id === task.task_id) { setError(`Prédécesseur ${w.number} : tâche inexistante.`); return; }
      wantedKeys.add(key(pred.task_id, w.type, w.lag));
      if (!current.some((l) => key(l.predecessor_task_id, l.relation_type || "FS", l.lag_workdays || 0) === key(pred.task_id, w.type, w.lag))) events.push({ event_type: "DEPENDENCY_ADD", payload: { predecessor: pred.task_id, successor: task.task_id, relation_type: w.type, lag_workdays: w.lag } });
    }
    for (const l of current) if (!wantedKeys.has(key(l.predecessor_task_id, l.relation_type || "FS", l.lag_workdays || 0)) && l.removable) events.unshift({ event_type: "DEPENDENCY_REMOVE", target_id: l.link_id, payload: {} });
    if (events.length) sendEvents(events, "Prédécesseurs mis à jour.");
  };
  const selectedTask = tasks.find((t) => t.task_id === selected);
  // « Tâches à compléter » : durée manquante, ou date à confirmer ; chaque élément mène à la ligne et met la cellule en évidence
  const todo = tasks.flatMap((t) => (t.duration_team_days === null || t.duration_team_days === undefined ? [{ id: t.task_id, label: t.label, reason: "durée manquante", cell: "duration" }] : dated && !t.start ? [{ id: t.task_id, label: t.label, reason: "date à confirmer", cell: "start" }] : []));
  const todoIds = new Set(todo.map((item) => item.id));
  const dpgfRows = tasks.filter((t) => t.source_type === "DPGF").length;
  const focusTask = (item) => {
    setFilter("all"); setSelected(item.id); setFlash({ id: item.id, cell: item.cell });
    setTimeout(() => document.querySelector(`[data-planning-row="${item.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    setTimeout(() => setFlash(null), 2500);
  };
  const shownRows = filter === "todo" ? rows.filter((r) => r.row_type !== "TASK" || todoIds.has(r.task_id)) : rows;
  // modifications réellement en attente : ni enregistrées, ni annulées, et sans les annulations elles-mêmes (le compteur serveur les inclut). Avant le chargement du journal : compteur serveur.
  const pendingList = events.filter((e) => !e.commit_id && !e.revert_of && !events.some((x) => x.revert_of === e.event_id));
  const journalInSync = events.length > 0 && events.filter((e) => !e.commit_id).length === (plan?.draft_event_count || 0);   // le journal se rafraîchit un instant après le plan : en retard, on garde le compteur serveur
  const draftCount = journalInSync ? pendingList.length : (plan?.draft_event_count || 0);
  // clic sur un événement (historique ou modifications en attente) : la tâche est sélectionnée, centrée dans le tableau et brièvement mise en évidence
  const selectFromHistory = (taskId) => { setSelected(taskId); setFilter("all"); setTimeout(() => { const row = document.querySelector(`[data-planning-row="${taskId}"]`); row?.scrollIntoView({ behavior: "smooth", block: "center" }); row?.classList.add("pln-row-pulse"); setTimeout(() => row?.classList.remove("pln-row-pulse"), 1800); }, 60); };
  const lastDraft = [...events].reverse().find((e) => !e.commit_id && !e.revert_of && !events.some((x) => x.revert_of === e.event_id));

  if (error && !plan && !empty) return <PlanningShell project={project} onNavigate={onNavigate}><div className="pln-state err" role="alert" data-planning-error>{error} <button type="button" className="secondary" data-planning-retry onClick={load}>Réessayer</button></div></PlanningShell>;
  if (plan === null && !empty) return <PlanningShell project={project} onNavigate={onNavigate}><div className="route-loader" data-planning-loading><span className="route-loader-spinner" /> Chargement du planning…</div></PlanningShell>;
  if (empty) return <PlanningShell project={project} onNavigate={onNavigate}>
    <section className="pln-empty" data-planning-empty>
      <CalendarRange size={28} />
      <h2>Aucun planning pour ce projet</h2>
      <p>Le planning est calculé à partir de votre questionnaire plâtrerie, des quantités du DPGF et du référentiel. Aucune durée n’est inventée : ce qui ne peut pas être calculé est signalé.</p>
      <label className="pln-field">Date d’ordre de service (facultative)<input type="date" data-planning-os value={osDate} onChange={(e) => setOsDate(e.target.value)} /></label>
      <small>Sans date, le planning est relatif (jours ouvrés depuis le démarrage).</small>
      {error && <div className="err" role="alert" data-planning-error>{error}</div>}
      <button type="button" className="primary" data-planning-generate disabled={busy} onClick={generate}>{busy ? "Calcul…" : "Générer le planning"}</button>
    </section>
  </PlanningShell>;

  return <PlanningShell project={project} onNavigate={onNavigate} drawerOpen={showJournal || showHistory || (showPending && draftCount > 0)}>
    <header className="pln-head pln-head-compact" data-planning-header>
      <div className="pln-actions pln-actions-left">
        <button type="button" className="secondary" data-planning-free-task onClick={() => openTaskPanel("manual")}><Plus size={14} /> Tâche</button>
        <button type="button" className="secondary" data-planning-library onClick={() => openTaskPanel("library")}><Plus size={14} /> Bibliothèque</button>
        <details className="row-menu pln-menu" data-planning-menu="add"><summary className="secondary" role="button">Ajouter ▾</summary><div className="row-menu-list pln-menu-wide" role="menu"><UseDocuments projectId={project.id} module="PLANNING" label="Utiliser des documents" /></div></details>
      </div>
      <div className="pln-actions">
        <details className="row-menu pln-menu" data-planning-menu="history"><summary className="secondary" role="button">Historique ▾</summary><div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" data-planning-history-open aria-expanded={showJournal} onClick={(e) => { e.currentTarget.closest("details").open = false; setShowHistory(false); setShowPending(false); setShowJournal(!showJournal); }}>Historique du planning</button>
          <button type="button" role="menuitem" data-planning-profile-toggle onClick={async (e) => { e.currentTarget.closest("details").open = false; const next = !showHistory; setShowJournal(false); setShowPending(false); setShowHistory(next); if (next) setHistory(await getPlanningHistory().catch(() => null)); }}>Références de durée</button></div></details>
        <details className="row-menu pln-menu" data-planning-menu="columns"><summary className="secondary" role="button">Colonnes ▾</summary><div className="row-menu-list" role="menu">
          {COLS.filter(([key]) => key !== "num").map(([key, label]) => <label key={key} className="pln-col-toggle"><input type="checkbox" data-planning-col-toggle={key} checked={isOn(key)} disabled={ALWAYS_ON.has(key)} onChange={() => toggleCol(key)} /> {label}</label>)}
          <hr /><button type="button" role="menuitem" data-planning-grid-reset onClick={resetColumns}>Réinitialiser la disposition</button></div></details>
        <details className="row-menu pln-menu" data-planning-menu="export"><summary className="secondary" role="button">Exporter ▾</summary><div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" data-planning-export="msproject" onClick={async (e) => { e.currentTarget.closest("details").open = false; setError(""); try { setMsp(await getMicrosoftProjectPreflight(project.id)); } catch (err) { setError(errorText(err)); } }}>Microsoft Project (.xml)</button>
          <button type="button" role="menuitem" data-planning-export="xlsx" onClick={(e) => { e.currentTarget.closest("details").open = false; downloadPlanning(project.id, "xlsx", `Planning-${project.name}`).catch((err) => setError(errorText(err))); }}>Excel (.xlsx)</button>
          {debug && <button type="button" role="menuitem" data-planning-export="json" onClick={(e) => { e.currentTarget.closest("details").open = false; downloadPlanning(project.id, "json", `Planning-${project.name}`).catch((err) => setError(errorText(err))); }}>JSON (debug)</button>}</div></details>
        {/* PLAN-017-AUTORECALC-01 : le planning se recalcule seul après chaque modification (durée, date, dépendance, ajout, DPGF) ; le recalcul manuel n'existe plus que pour le debug */}
        {debug && <details className="row-menu pln-menu" data-planning-menu="more"><summary className="secondary" role="button" aria-label="Plus d’actions">⋯</summary><div className="row-menu-list" role="menu">
          <button type="button" role="menuitem" data-planning-recalculate disabled={busy} onClick={(e) => { e.currentTarget.closest("details").open = false; run(() => generatePlanning(project.id, { expected_revision: plan.revision }), { success: "Planning recalculé avec les données actuelles." }); }}>Recalculer le planning</button></div></details>}
      </div>
    </header>
    {msp && <section className="pln-card" role="dialog" aria-label="Export Microsoft Project" data-planning-msp>
      <b>Exporter vers Microsoft Project</b>
      <ul data-planning-msp-summary><li>{msp.tasks} tâche{msp.tasks > 1 ? "s" : ""} exportée{msp.tasks > 1 ? "s" : ""}</li><li>{msp.milestones} jalon{msp.milestones > 1 ? "s" : ""}</li><li>{msp.dependencies} dépendance{msp.dependencies > 1 ? "s" : ""}</li><li>Calendrier : {msp.calendar}</li><li>{msp.excluded} élément{msp.excluded > 1 ? "s" : ""} exclu{msp.excluded > 1 ? "s" : ""}</li></ul>
      {msp.warnings.some((w) => w.code === "TASK_NOT_PLANNED") && <p className="pln-warn" data-planning-msp-unplanned>{msp.warnings.filter((w) => w.code === "TASK_NOT_PLANNED").length} tâche{msp.warnings.filter((w) => w.code === "TASK_NOT_PLANNED").length > 1 ? "s" : ""} non planifiée{msp.warnings.filter((w) => w.code === "TASK_NOT_PLANNED").length > 1 ? "s" : ""} ne seront pas incluses dans Microsoft Project.</p>}
      {msp.warnings.filter((w) => w.code !== "TASK_NOT_PLANNED").map((w, i) => <p key={i} className="pln-warn">{w.message}</p>)}
      {msp.blocking.map((b, i) => <p key={i} className="err" role="alert" data-planning-msp-blocking={b.code}>{b.message}</p>)}
      <p className="pln-muted">{msp.help}</p>
      <div className="pln-actions"><button type="button" className="primary" data-planning-msp-download disabled={msp.blocking.length > 0} onClick={() => downloadPlanning(project.id, "xml", `${project.name}_planning_calepin`).then(() => setMsp(null)).catch((e) => setError(errorText(e)))}>Télécharger le fichier .xml</button>
        <button type="button" className="link-button" data-planning-msp-close onClick={() => setMsp(null)}>Fermer</button></div>
    </section>}
    {taskPanel && <section className="pln-card" data-planning-task-panel={taskPanel}>
      <div className="pln-head"><div><b>{taskPanel === "library" ? "Bibliothèque de tâches" : "Créer une tâche libre"}</b><p className="pln-muted">La durée peut rester vide : Calepin affiche « Durée à renseigner » au lieu d’inventer une valeur.</p></div><button type="button" className="secondary" onClick={() => setTaskPanel(null)}>Fermer</button></div>
      {taskPanel === "manual" && <div className="pln-inline"><input aria-label="Libellé de la tâche" placeholder="Ex. Réception des supports" value={taskDraft.label} onChange={(e) => setTaskDraft({ ...taskDraft, label: e.target.value })} /><input aria-label="Durée en jours ouvrés" type="number" min="1" placeholder="Durée (facultative)" value={taskDraft.duration_working_days} onChange={(e) => setTaskDraft({ ...taskDraft, duration_working_days: e.target.value })} /><button type="button" className="primary" disabled={!taskDraft.label.trim() || busy} onClick={() => addTask({ label: taskDraft.label.trim(), duration_working_days: taskDraft.duration_working_days ? Number(taskDraft.duration_working_days) : null, source: "MANUAL" })}>Ajouter</button></div>}
      {taskPanel === "library" && <div className="pln-task-choices">{taskItems.map((item) => <button type="button" className="secondary" key={item.template_id} onClick={() => addTask({ label: item.label, template_id: item.template_id, unit: item.default_unit, duration_working_days: item.default_duration_working_days, source: "TASK_LIBRARY" })}><b>{item.label}</b><small>{item.family} · {item.default_unit || "sans unité"} · Durée à renseigner</small></button>)}</div>}
      {taskPanel === "dpgf" && <div className="pln-task-choices">{!taskItems.length && <p>Aucune ligne DPGF à proposer.</p>}{taskItems.map((item) => <button type="button" className="secondary" key={item.proposal_id} onClick={() => addTask({ label: item.template?.label || item.designation || "Tâche DPGF", template_id: item.template?.template_id, quantity: item.quantity, unit: item.unit, linked_dpgf_line_ids: [item.dpgf_line_id], source: "DPGF_PROPOSAL" })}><b>{item.template?.label || item.designation}</b><small>{item.quantity ?? "—"} {item.unit || ""} · {item.mapping_status === "EXACT" ? "correspondance exacte" : "à rapprocher"} · Durée à renseigner</small></button>)}</div>}
    </section>}
    {error && <div className="err" role="alert" data-planning-error>{error}</div>}
    {notice && <div className="pln-notice" role="status" data-planning-notice>{notice}</div>}
    {templateUpdates.length > 0 && <section className="pln-card" data-planning-template-updates aria-label="Nouvelles versions de tâches types">
      {templateUpdates.map((update) => <div key={update.task_id} data-planning-template-update={update.task_id}>
        <b>Une nouvelle version de cette tâche est disponible : « {update.task_label} »</b> <small className="pln-muted">v{update.from_version} → v{update.to_version}</small>
        <details><summary data-planning-template-changes>Voir les changements</summary>
          <ul>{update.changes.length ? update.changes.map((change) => <li key={change.field}>{change.field} : {change.before} → <b>{change.after}</b></li>) : <li>Aucun détail disponible pour cette version.</li>}</ul></details>
        <button type="button" className="secondary" data-planning-template-apply disabled={busy} onClick={() => decideTemplate(update, "apply")}>Appliquer à ce projet</button>{" "}
        <button type="button" className="link-button" data-planning-template-keep disabled={busy} onClick={() => decideTemplate(update, "keep")}>Conserver la version actuelle</button></div>)}</section>}
    {templateDraft && <section className="pln-card" role="dialog" aria-label="Enregistrer comme modèle agence" data-planning-template-draft>
      <b>Enregistrer comme modèle agence</b>
      <label className="pln-inline">Nom du modèle <input data-planning-template-label value={templateDraft.label} maxLength={200} onChange={(e) => setTemplateDraft({ ...templateDraft, label: e.target.value })} /></label>
      <label className="inline-check"><input type="radio" name="tpl-mode" data-planning-template-mode="create" checked={templateDraft.mode === "create"} onChange={() => setTemplateDraft({ ...templateDraft, mode: "create" })} /> Créer une nouvelle tâche agence</label>
      {templateDraft.existing.length > 0 && <label className="inline-check"><input type="radio" name="tpl-mode" data-planning-template-mode="update" checked={templateDraft.mode === "update"} onChange={() => setTemplateDraft({ ...templateDraft, mode: "update" })} /> Mettre à jour le modèle existant{" "}
        <select value={templateDraft.override_id} disabled={templateDraft.mode !== "update"} onChange={(e) => setTemplateDraft({ ...templateDraft, override_id: e.target.value })}>{templateDraft.existing.map((item) => <option key={item.override_id} value={item.override_id}>{item.label} (v{item.version})</option>)}</select></label>}
      <p className="pln-muted">Le standard Calepin et ce projet ne changent pas. Les autres projets de l’agence ne seront prévenus qu’avec une proposition, jamais en silence.</p>
      <button type="button" className="primary" data-planning-template-save disabled={busy || templateDraft.label.trim().length < 2} onClick={() => saveTemplate(templateDraft)}>Enregistrer</button>{" "}
      <button type="button" className="link-button" data-planning-template-cancel onClick={() => setTemplateDraft(null)}>Annuler</button></section>}
    {sync === "updating" && <small className="pln-muted" role="status" data-planning-sync="updating">Mise à jour…</small>}
    {sync === "ok" && <small className="pln-muted" role="status" data-planning-sync="ok">À jour</small>}
    {sync === "error" && <div className="err" role="alert" data-planning-sync="error">Le planning n’a pas pu être mis à jour. <button type="button" className="link-button" data-planning-sync-retry onClick={syncNow}>Réessayer</button></div>}
    {!dated && <div className="pln-notice" data-planning-relative>Aucune date d’ordre de service : le planning est exprimé en jours ouvrés (J0, J+1…). <label className="pln-inline">Date d’OS <input type="date" data-planning-os value={osDate} onChange={(e) => setOsDate(e.target.value)} /></label>
      <button type="button" className="secondary" data-planning-apply-os disabled={!osDate || busy} onClick={generate}>Appliquer</button></div>}

    {plan.scenarios.length > 1 && new Set(plan.scenarios.map((x) => x.site_makespan_workdays)).size > 1 && <section className="pln-scenarios" aria-label="Scénarios de ressources" data-planning-scenarios>
      {plan.scenarios.map((s) => <button key={s.scenario_id} type="button" className={`pln-scenario ${plan.selected_resource_scenario === s.scenario_id ? "active" : ""}`} data-planning-scenario={s.scenario_id} aria-pressed={plan.selected_resource_scenario === s.scenario_id} disabled={busy}
        onClick={() => run(() => selectPlanningScenario(project.id, { scenario_id: s.scenario_id, expected_revision: plan.revision }))}>
        <b>{s.plaster_team_count} équipe{s.plaster_team_count > 1 ? "s" : ""}</b>
        <span>{s.site_makespan_workdays} j ouvrés</span>
        <small>{s.total_site_team_days} journées-équipe{s.balanced ? " · équilibré" : ""}</small>
      </button>)}
    </section>}

    <ConsistencyPanel projectId={project.id} version={plan.revision} />
    {inlineTask && <InlinePersonalizationDrawer target={{ entityType: "planning_task", entityId: inlineTask, projectId: project.id }} onClose={() => setInlineTask(null)} />}
    <div className="pln-toolbar" data-planning-toolbar>
      <div className="pln-pending-text">
        <b data-planning-draft-count>{draftCount ? `${draftCount} modification${draftCount > 1 ? "s" : ""} en attente d’enregistrement` : "Aucune modification en attente"}</b>
        {draftCount > 0 && <small data-planning-pending-help>Elles sont visibles dans le planning mais ne seront ajoutées à l’historique qu’après enregistrement.</small>}
      </div>
      {draftCount > 0 && <button type="button" className="link-button" data-planning-pending-open aria-expanded={showPending} onClick={() => { setShowJournal(false); setShowHistory(false); setShowPending(!showPending); }}>Voir {draftCount > 1 ? `les ${draftCount} modifications` : "la modification"}</button>}
      <button type="button" className="secondary" data-planning-undo disabled={!lastDraft || busy} onClick={() => run(() => revertPlanningEvent(project.id, lastDraft.event_id, plan.revision))}><Undo2 size={14} /> Annuler la dernière modification</button>
      <button type="button" className="primary" data-planning-commit disabled={!draftCount || busy} onClick={commit}>Enregistrer les modifications</button>
    </div>

    <details className="pln-dates" data-planning-dates><summary>Dates et échéance du planning</summary>
    <ScheduleConstraint constraint={plan.schedule_constraint} dated={dated} busy={busy} onSave={(body) => run(() => setPlanningScheduleConstraint(project.id, { ...body, expected_revision: plan.revision }), { success: body.targetFinishDate ? "Date cible enregistrée : Calepin l’évalue, il ne comprime aucune durée." : "Date cible retirée." })} />
    </details>

    <section className="pln-strip" data-planning-strip>
      <div className="pln-segmented" role="tablist" aria-label="Filtre des tâches" data-planning-filters>
        <button type="button" role="tab" className={filter === "all" ? "on" : ""} data-planning-filter="all" aria-selected={filter === "all"} onClick={() => setFilter("all")}>Toutes les tâches</button>
        <button type="button" role="tab" className={filter === "todo" ? "on" : ""} data-planning-filter="todo" aria-selected={filter === "todo"} aria-label={`À compléter, ${todo.length} tâche${todo.length > 1 ? "s" : ""}`} onClick={() => setFilter("todo")}>À compléter <span className={`pln-count ${todo.length === 0 ? "zero" : ""}`} data-planning-todo-count>{todo.length}</span></button></div>
      {(projection?.issues || []).length > 0 ? <span className="pln-sync warn pln-un-banner" data-planning-dpgf-issues><span>⚠ <b>{projection.issues.length} ligne{projection.issues.length > 1 ? "s" : ""} du DPGF</b> n’{projection.issues.length > 1 ? "ont" : "a"} pas de tâche dans le planning</span> <button type="button" className="primary" data-planning-dpgf-issues-open aria-expanded={unmatchedOpen} onClick={() => setUnmatchedOpen(true)}>Traiter ces lignes</button></span>
        : dpgfRows > 0 ? <span className="pln-sync" data-planning-dpgf-sync>{dpgfRows} tâche{dpgfRows > 1 ? "s" : ""} issue{dpgfRows > 1 ? "s" : ""} du DPGF · synchronisé</span> : null}
    </section>

    {unmatchedOpen && <PlanningUnmatchedLines projectId={project.id} revision={plan.revision} onClose={() => setUnmatchedOpen(false)} onChanged={() => load()} onOpenDpgf={() => onNavigate?.("estimate")} />}

    <div className="pln-main">
      <section className="pln-gantt" ref={boxRef} style={{ "--dw": `${DAY_WIDTH}px` }} data-planning-gantt data-planning-grid-width={GRID_W} data-planning-task-width={widthOf("task")} aria-label="Diagramme de Gantt">
        <div className="pln-zoom" data-planning-zoom role="group" aria-label="Échelle">
          {[["day", "Jour"], ["week", "Semaine"], ["month", "Mois"]].map(([key, label]) => <button key={key} type="button" className={zoom === key ? "active" : "secondary"} data-planning-zoom-level={key} aria-pressed={zoom === key} onClick={() => setZoom(key)}>{label}</button>)}
          {dated && <button type="button" className="secondary" data-planning-today onClick={() => document.querySelector("[data-planning-today-line]")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })}>Aujourd’hui</button>}
        </div>
        {filter === "todo" && todo.length === 0 && <p className="pln-todo-empty" role="status" data-planning-todo-empty>Aucune tâche à compléter. <button type="button" className="link-button" data-planning-todo-all onClick={() => setFilter("all")}>Voir toutes les tâches</button></p>}
        <div className="pln-gantt-scroll">
          <div className="pln-axis" style={{ width: GRID_W + horizon * DAY_WIDTH, gridTemplateColumns: `${GRID_W}px 1fr` }}>
            <div className="pln-axis-label pln-grid-head" data-planning-grid-head style={{ gridTemplateColumns: gridTemplate }}>{visibleCols.map(([key, label]) => <span key={key} className="pln-head-cell" data-planning-col={key}>{label}
              <i className="pln-colresize" data-planning-col-resize={key} role="separator" aria-orientation="vertical" aria-label={`Redimensionner la colonne ${label}`} tabIndex={0}
                title="Glisser pour redimensionner · double-clic : ajuster au contenu"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => { e.stopPropagation(); resizeCol(key, key === "task" ? fitTask(rows) : COLS.find(([k]) => k === key)[2]); }}
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); const x0 = e.clientX, w0 = widthOf(key); const mv = (ev) => setColW((current) => ({ ...current, [key]: Math.max(COLS.find(([k]) => k === key)[3], Math.min(900, Math.round(w0 + ev.clientX - x0))) })); const up = (ev) => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); resizeCol(key, w0 + ev.clientX - x0); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); }}
                onKeyDown={(e) => { if (e.key === "ArrowLeft") resizeCol(key, widthOf(key) - 20); if (e.key === "ArrowRight") resizeCol(key, widthOf(key) + 20); }} /></span>)}
              <i className="pln-splitter" data-planning-splitter role="separator" aria-orientation="vertical" aria-label="Séparateur grille et Gantt (ajuste la colonne Tâche)" tabIndex={0}
                onPointerDown={(e) => { e.preventDefault(); const x0 = e.clientX, w0 = widthOf("task"); const mv = (ev) => setColW((current) => ({ ...current, task: Math.max(COLS[1][3], Math.min(900, Math.round(w0 + ev.clientX - x0))) })); const up = (ev) => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); resizeCol("task", w0 + ev.clientX - x0); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); }}
                onKeyDown={(e) => { if (e.key === "ArrowLeft") resizeCol("task", widthOf("task") - 20); if (e.key === "ArrowRight") resizeCol("task", widthOf("task") + 20); }} /></div>
            {dated && origin && (() => { const today = cal.index(origin, new Date().toISOString().slice(0, 10)); return today >= 0 && today < horizon ? <i className="pln-today" data-planning-today-line style={{ left: GRID_W + today * DAY_WIDTH }} /> : null; })()}
            <div className="pln-axis-days">{axis.map((d, i) => <span key={i} style={{ width: DAY_WIDTH }} className={`${d && cal.utc(d).getUTCDay() === 1 ? "week" : ""} ${d && !cal.isWork(cal.utc(d)) ? "off" : ""}`} title={d && !cal.isWork(cal.utc(d)) ? "Jour non ouvré" : undefined}>{d ? (i === 0 || cal.utc(d).getUTCDay() === 1 ? fmt(d) : "") : (i % 5 === 0 ? `J+${i}` : "")}</span>)}</div>
          </div>
          {shownRows.map((row) => row.row_type === "GROUP"
            ? <div key={row.row_id} className="pln-row group" data-planning-group={row.row_id} style={{ width: GRID_W + horizon * DAY_WIDTH, gridTemplateColumns: `${GRID_W}px 1fr` }}><div className="pln-label"><b>{row.label}</b></div>
              <div className="pln-track">{groupSpan(row, rows, startOffset, finishOffset) && <div className="pln-summary-bar" data-planning-summary={row.row_id} style={{ left: groupSpan(row, rows, startOffset, finishOffset)[0] * DAY_WIDTH, width: (groupSpan(row, rows, startOffset, finishOffset)[1] - groupSpan(row, rows, startOffset, finishOffset)[0] + 1) * DAY_WIDTH }} />}</div></div>
            : <GanttRow key={row.row_id} row={row} number={numberOf[row.task_id]} gridWidth={GRID_W} template={gridTemplate} showCols={showCols} dayWidth={DAY_WIDTH} dated={dated} cal={cal} predecessors={predecessorText(row.task_id)} onPredecessors={(text) => commitPredecessors(row, text)}
                onDuration={(days) => sendEvent({ event_type: "TASK_RESIZE", target_id: row.task_id, payload: { days } }, `Durée de « ${row.label} » modifiée (prévu, pas réalisé).`)}
                onStart={(date) => (date ? sendEvent({ event_type: "PIN_START", target_id: row.task_id, payload: { date } }, "Début épinglé : contrainte du projet.") : sendEvent({ event_type: "UNPIN_START", target_id: row.task_id, payload: {} }))}
                onOpenDetails={() => { setSelected(row.task_id); setDetailsOpen(true); window.setTimeout(() => document.querySelector("[data-planning-detail]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}
                flash={flash && flash.id === row.task_id ? flash.cell : null} dropMark={drag && drag.overId === row.task_id ? drag.pos : null} onDragStart={(e) => startDrag(row, e)} onReorder={(where) => moveTask(row.task_id, where)} onSaveTemplate={() => openTemplateDraft(row)}
                start={startOffset(row)} finish={finishOffset(row)} horizon={horizon} offDays={offDays} workdaysTo={dated && origin ? (finishIdx) => cal.workdays(row.start, cal.dateAt(origin, finishIdx)) : null} selected={selected === row.task_id} onSelect={() => setSelected(row.task_id)} busy={busy}
                onResize={(days) => sendEvent({ event_type: "TASK_RESIZE", target_id: row.task_id, payload: { days } }, `Durée de « ${row.label} » modifiée (prévu, pas réalisé).`)}
                onMove={(offset) => dated && origin && sendEvent({ event_type: "TASK_MOVE", target_id: row.task_id, payload: { date: cal.dateAt(origin, offset) } })} />)}
        </div>
        <p className="pln-legend">Barre pleine : planifiée · hachurée : dates provisoires (hold-points non levés) · pointillée : durée partielle. Colonnes grisées : week-ends et jours non ouvrés. Glissez la poignée de droite pour changer la durée prévue, la barre pour déplacer.</p>
      </section>

      {showPending && draftCount > 0 && <PendingPanel events={events} count={draftCount} busy={busy} onClose={() => setShowPending(false)} onUndo={(event) => run(() => revertPlanningEvent(project.id, event.event_id, plan.revision))} onSelectTask={selectFromHistory} />}
      {showJournal && <JournalPanel events={events} onClose={() => setShowJournal(false)} onSelectTask={selectFromHistory} />}
      <div className="pln-below">
        <HoldpointPanel plan={plan} busy={busy} onToggle={(h) => run(() => patchPlanningHoldpoint(project.id, h.holdpoint_id, { status: h.status === "RESOLVED" ? "UNRESOLVED" : "RESOLVED", expected_revision: plan.revision }))} />
        {selectedTask && detailsOpen ? <TaskDetail onClose={() => setDetailsOpen(false)} history={events.filter((e) => e.history?.task_id === selectedTask.task_id)} task={selectedTask} todoReason={todo.find((item) => item.id === selectedTask.task_id)?.reason} plan={plan} busy={busy} dated={dated}
          onResize={(days) => sendEvent({ event_type: "TASK_RESIZE", target_id: selectedTask.task_id, payload: { days } }, "Durée prévue modifiée.")}
          onPin={(date) => sendEvent({ event_type: "PIN_START", target_id: selectedTask.task_id, payload: { date } }, "Début épinglé : contrainte du projet.")}
          onUnpin={() => sendEvent({ event_type: "UNPIN_START", target_id: selectedTask.task_id, payload: {} })}
          onRemoveLink={(link) => sendEvent({ event_type: "DEPENDENCY_REMOVE", target_id: link.link_id, payload: {} })}
          onAddLink={(predecessor, successor) => sendEvent({ event_type: "DEPENDENCY_ADD", payload: { predecessor, successor } }, "Relation ajoutée pour ce projet.")}
          onActual={(body) => run(() => postPlanningActual(project.id, { task_id: selectedTask.task_id, ...body }), { success: "Réalisé enregistré — séparé du prévu." })}
          onMoveTask={(where) => moveTask(selectedTask.task_id, where)} onSaveTemplate={() => openTemplateDraft(selectedTask)}
          onAcceptBaseline={() => sendEvent({ event_type: "ACCEPT_BASELINE", target_id: selectedTask.task_id, payload: {} }, "Durée de l’historique retenue.")}
          onMode={(mode, reason) => sendEvent({ event_type: "DURATION_MODE_CHANGE", target_id: selectedTask.task_id, payload: { mode, reason } }, mode === "DEADLINE_CONSTRAINED" ? "Durée marquée comme contrainte par une échéance." : "Mode de durée mis à jour.")} />
          : null}
        {showHistory && <aside className="pln-card pln-drawer" data-planning-profile data-planning-drawer aria-label="Références de durée">
          <div className="pln-detail-head"><b>Références de durée</b><button type="button" className="link-button" data-planning-profile-close onClick={() => setShowHistory(false)}>Fermer</button></div>
          {history && <HistoryPanel history={history} activities={tasks.filter((t) => t.canonical_id)} onChanged={async () => setHistory(await getPlanningHistory())} />}
        </aside>}
      </div>
    </div>

  </PlanningShell>;
}

function PlanningShell({ project, drawerOpen = false, children }) {
  return <main className={`pln-page${drawerOpen ? " pln-has-drawer" : ""}`} data-planning-page><div className="pln-title"><CalendarRange size={20} /><div><small>Projet</small><h1>{project.name}</h1></div></div>{children}</main>;
}

function groupSpan(row, rows, startOffset, finishOffset) {
  const children = rows.filter((r) => r.row_type === "TASK" && r.parent_row_id === row.row_id);
  const starts = children.map(startOffset).filter((x) => x !== null && x !== undefined), finishes = children.map(finishOffset).filter((x) => x !== null && x !== undefined);
  return starts.length && finishes.length ? [Math.min(...starts), Math.max(...finishes)] : null;
}

/** Cellule éditable : valide à Entrée ou à la sortie du champ, Échap annule. Pas de bouton « Appliquer ». */
function Cell({ value, onCommit, type = "text", disabled, label, placeholder, width, ...rest }) {
  const [draft, setDraft] = useState(value ?? "");
  const original = useRef(value ?? "");
  useEffect(() => { setDraft(value ?? ""); original.current = value ?? ""; }, [value]);
  const cancelled = useRef(false);
  const commit = () => { if (cancelled.current) { cancelled.current = false; return; } if (String(draft) !== String(original.current)) onCommit(draft); };
  return <input className="pln-cell" type={type} value={draft} disabled={disabled} aria-label={label} placeholder={placeholder} style={{ width }} onClick={(e) => e.stopPropagation()}
    onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); } if (e.key === "Escape") { cancelled.current = true; setDraft(original.current); e.currentTarget.blur(); } }} {...rest} />;
}

function GanttRow({ onSaveTemplate, row, number, gridWidth, template, showCols, flash, dropMark, onDragStart, onReorder, dayWidth, dated, cal, predecessors, onPredecessors, onDuration, onStart, onOpenDetails, start, finish, horizon, offDays, workdaysTo, selected, onSelect, onResize, onMove, busy }) {
  const DAY_WIDTH = dayWidth;
  const [drag, setDrag] = useState(null);
  const ref = useRef(null);
  const [status, tone] = STATUS[row.schedule_status] || [row.schedule_status, "info"];
  const duration = row.duration_team_days;
  const hasBar = start !== null && finish !== null;
  const width = hasBar ? (finish - start + 1) * DAY_WIDTH : 0;
  const begin = (mode) => (event) => {
    if (busy || !hasBar) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ mode, x0: event.clientX, delta: 0 });
  };
  const move = (event) => { if (drag) setDrag({ ...drag, delta: Math.round((event.clientX - drag.x0) / DAY_WIDTH) }); };
  const end = () => {
    if (!drag) return;
    const { mode, delta } = drag; setDrag(null);
    if (!delta) return;
    if (mode === "resize") { const days = resized(delta); if (days !== duration) onResize(days); } else onMove(Math.max(0, start + delta));
  };
  // en mode daté, le glissement se mesure en jours calendaires : la durée prévue est le nombre de jours OUVRÉS entre le début et la nouvelle fin
  const resized = (delta) => Math.max(1, workdaysTo ? workdaysTo(finish + delta) : (duration || 1) + delta);
  const shiftDays = drag?.mode === "move" ? drag.delta : 0;
  const extra = drag?.mode === "resize" ? drag.delta : 0;
  const sourceKey = row.source_type === "MANUAL" && row.source_layer === "TASK_LIBRARY" ? "LIBRARY" : row.source_type || "CCTP";
  const commitDuration = (text) => { const days = parseDuration(text); if (days === null) return; if (days !== duration) onDuration(days); };
  const commitFinish = (iso) => { if (!iso || !row.start || iso < row.start) return; const days = cal.workdays(row.start, iso); if (days >= 1 && days !== duration) onDuration(days); };
  return <div className={`pln-row ${selected ? "selected" : ""} ${dropMark ? `drop-${dropMark}` : ""}`} data-planning-row={row.task_id} data-status={row.schedule_status} onClick={onSelect} onDoubleClick={onOpenDetails} style={{ width: gridWidth + horizon * DAY_WIDTH, gridTemplateColumns: `${gridWidth}px 1fr` }}>
    <div className="pln-label pln-grid-cells" style={{ width: gridWidth, gridTemplateColumns: template }}>
      <span className="pln-c-num" data-planning-number>{number}</span>
      <span className="pln-c-name"><span className="pln-name-line"><span className="pln-drag" data-planning-drag-handle role="button" tabIndex={0} aria-label={`Déplacer ${row.label}`} title="Glisser pour réordonner (Alt + ↑ / ↓ au clavier)" onClick={(e) => e.stopPropagation()} onPointerDown={onDragStart}
          onKeyDown={(e) => { if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); onReorder("up"); } if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); onReorder("down"); } }}>⋮⋮</span><b title={row.label}>{row.label}</b>
          <button type="button" className="link-button pln-details-btn" data-planning-details-open aria-label={`Détails de ${row.label}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}>Détails</button><InlinePersonalizationTrigger onOpen={() => window.dispatchEvent(new CustomEvent("calepin:inline-personalize", { detail: { entityType: "planning_task", entityId: row.task_id } }))} /></span>
        {row.to_reconsider && <small data-planning-reconsider>à reconsidérer (ligne source retirée)</small>}
        {row.source_quantity !== null && row.source_quantity !== undefined && row.source_type === "DPGF" && <small data-planning-source-line={row.source_type}>{row.source_quantity} {row.source_unit || ""}</small>}</span>
      {showCols.has("source") && <span className="pln-c-source"><Badge tone="info" data-planning-source-badge={row.source_type || "CCTP"}>{SOURCE_BADGE[sourceKey] || sourceKey}</Badge></span>}
      <span className={`pln-c-dur ${flash === "duration" ? "pln-flash" : ""}`}>{duration === null || duration === undefined
        ? <><Cell value="" onCommit={commitDuration} label={`Durée de ${row.label}`} placeholder="—" width="100%" disabled={busy} data-planning-cell="duration" /><small data-planning-to-fill>À renseigner</small></>
        : <Cell value={`${duration} j`} onCommit={commitDuration} label={`Durée de ${row.label}`} width="100%" disabled={busy} data-planning-cell="duration" />}</span>
      <span className={`pln-c-start ${flash === "start" ? "pln-flash" : ""}`}>{dated ? <Cell type="date" value={row.start || ""} onCommit={(v) => onStart(v)} label={`Début de ${row.label}`} width="100%" disabled={busy} data-planning-cell="start" /> : <small title="Renseignez une date d’ordre de service pour saisir des dates">{row.start_offset != null ? `J+${row.start_offset}` : "—"}</small>}</span>
      <span className="pln-c-finish">{dated ? <Cell type="date" value={row.finish || ""} onCommit={commitFinish} label={`Fin de ${row.label}`} width="100%" disabled={busy || !row.start} data-planning-cell="finish" /> : <small>{row.finish_offset != null ? `J+${row.finish_offset}` : "—"}</small>}</span>
      {showCols.has("pred") && <span className="pln-c-pred"><Cell value={predecessors} onCommit={onPredecessors} label={`Prédécesseurs de ${row.label}`} width="100%" disabled={busy} placeholder="—" data-planning-cell="predecessors" /></span>}
      {showCols.has("team") && <span className="pln-c-team"><small>{row.team_id || "—"}</small></span>}
      {showCols.has("qty") && <span className="pln-c-qty"><small>{row.source_quantity !== null && row.source_quantity !== undefined ? `${row.source_quantity} ${row.source_unit || ""}`.trim() : "—"}</small></span>}
      {showCols.has("progress") && <span className="pln-c-progress"><small>{row.actual?.progress_pct != null ? `${row.actual.progress_pct} %` : "—"}</small></span>}
      {showCols.has("astart") && <span className="pln-c-astart"><small>{row.actual?.actual_start || "—"}</small></span>}
      {showCols.has("afinish") && <span className="pln-c-afinish"><small>{row.actual?.actual_finish || "—"}</small></span>}
    </div>
    <div className="pln-track" onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
      {offDays.map((i) => <i key={i} className="pln-offday" style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }} />)}
      {hasBar && <div ref={ref} className={`pln-bar ${row.schedule_status === "PROVISIONAL_EXTERNAL_HOLDPOINTS" ? "provisional" : ""} ${row.schedule_status === "DRAFT_PARTIAL_DURATION" ? "partial" : ""} ${row.conflict ? "conflict" : ""} ${row.row_type === "MILESTONE" ? "milestone" : ""}`}
        data-planning-bar={row.task_id} data-start={row.start || row.start_offset} data-finish={row.finish || row.finish_offset} style={{ left: (start + shiftDays) * DAY_WIDTH, width: Math.max(DAY_WIDTH, width + extra * DAY_WIDTH) }} onPointerDown={begin("move")}>
        <span>{drag ? (drag.mode === "resize" ? `${resized(drag.delta)} j` : `${drag.delta > 0 ? "+" : ""}${drag.delta} j`) : ""}</span>
        <i className="pln-handle" data-planning-handle={row.task_id} role="slider" aria-label={`Durée de ${row.label}`} aria-valuenow={duration} onPointerDown={begin("resize")} />
      </div>}
      {row.conflict && <span className="pln-nobar" data-planning-conflict-hint>{hasBar ? "" : "Conflit"}</span>}
    </div>
  </div>;
}

function HoldpointPanel({ plan, busy, onToggle }) {
  const items = plan.holdpoints || [];
  if (!items.length) return null; // aucune interface externe : aucun panneau (carte 693)
  return <div className="pln-card" data-planning-holdpoints>
    <b>Hold-points externes ({items.filter((h) => h.status !== "RESOLVED").length} ouverts)</b>
    <ul>{items.map((h) => <li key={h.holdpoint_id} data-planning-holdpoint={h.holdpoint_id} data-status={h.status}>
      <label><input type="checkbox" checked={h.status === "RESOLVED"} disabled={busy} onChange={() => onToggle(h)} /> <span><b>{h.holdpoint_id}</b> — {h.label}</span></label>
      <small>{h.status === "RESOLVED" ? "Levé" : h.blocking_mode === "BLOCKING_RELEASE" ? "Bloquant : tâche non datable tant que non levé" : "Dates provisoires tant que non levé"}</small></li>)}</ul>
    <p className="pln-muted">Calepin ne date jamais le lot d’un tiers : il signale le prérequis.</p>
  </div>;
}

function TaskDetail({ todoReason, onClose, history = [], task, plan, busy, dated, onResize, onPin, onUnpin, onRemoveLink, onAddLink, onActual, onAcceptBaseline, onMode, onMoveTask, onSaveTemplate }) {
  const [days, setDays] = useState(task.duration_team_days ?? "");
  const [pinDate, setPinDate] = useState(task.pinned_start || task.start || "");
  const [actual, setActual] = useState({ actual_start: task.actual?.actual_start || "", actual_finish: task.actual?.actual_finish || "", progress_pct: task.actual?.progress_pct ?? "" });
  const [predecessor, setPredecessor] = useState("");
  const sent = useRef({ days: null, pin: null }); // évite l'envoi en double (sortie du champ puis clic sur « Appliquer »)
  const commitDays = (value) => { if (sent.current.days === value) return; sent.current.days = value; onResize(value); };
  const commitPin = (value) => { if (sent.current.pin === value) return; sent.current.pin = value; onPin(value); };
  useEffect(() => { sent.current = { days: null, pin: null }; setDays(task.duration_team_days ?? ""); setPinDate(task.pinned_start || task.start || ""); setActual({ actual_start: task.actual?.actual_start || "", actual_finish: task.actual?.actual_finish || "", progress_pct: task.actual?.progress_pct ?? "" }); setPredecessor(""); }, [task.task_id, task.duration_team_days, task.start, task.pinned_start, task.actual]);
  const links = (plan.dependencies || []).filter((l) => l.predecessor_task_id === task.task_id || l.successor_task_id === task.task_id);
  const others = (plan.rows || []).filter((r) => r.row_type === "TASK" && r.task_id !== task.task_id);
  const [, tone] = STATUS[task.schedule_status] || ["", "info"];
  return <div className="pln-card pln-detail" data-planning-detail={task.task_id}>
    <div className="pln-detail-head"><b>{task.label}</b>{onClose && <button type="button" className="link-button" data-planning-details-close aria-label="Fermer les détails" onClick={onClose}>Fermer</button>}</div>
    {(onMoveTask || onSaveTemplate) && <div className="pln-detail-actions" data-planning-detail-actions>
      {onMoveTask && <button type="button" className="secondary" data-planning-move="first" onClick={() => onMoveTask("first")}>Déplacer en première position</button>}
      {onMoveTask && <button type="button" className="secondary" data-planning-move="last" onClick={() => onMoveTask("last")}>Déplacer en dernière position</button>}
      {onSaveTemplate && <button type="button" className="secondary" data-planning-save-template onClick={onSaveTemplate}>Enregistrer comme modèle agence</button>}</div>}
    {todoReason && <p className="pln-warn" data-planning-detail-todo>À compléter : {todoReason === "durée manquante" ? "durée prévue" : "date à confirmer"}.</p>}
    {history.length > 0 && <details className="pln-task-history" data-planning-task-history><summary>Historique de cette tâche ({history.length})</summary><ul className="pln-history-list">{[...history].reverse().map((event) => <HistoryItem key={event.event_id} event={event} />)}</ul></details>}
    <p className="pln-explain" data-planning-explain>{task.explanation}</p>
    <p className="pln-muted" data-planning-why>Pourquoi cette tâche existe : {task.source_type === "DPGF" ? `elle vient de la ligne du DPGF « ${task.source_designation || task.label} »${task.source_quantity != null ? ` (${task.source_quantity} ${task.source_unit || ""})` : ""}` : task.source_type === "MANUAL" ? "vous l’avez ajoutée au planning" : "elle est déduite de votre questionnaire CCTP"}. La quantité n’influence pas la durée.</p>
    <div className="pln-chips">
      <Badge tone={tone}>{(STATUS[task.schedule_status] || [task.schedule_status])[0]}</Badge>
      <Badge tone="info" data-planning-source>{SOURCE[task.duration_source] || task.duration_source}</Badge>
      <Badge tone="info" data-planning-confidence>Confiance : {CONFIDENCE[task.confidence] || task.confidence}</Badge>
    </div>
    {task.missing_components?.length > 0 && <div className="pln-warn" data-planning-missing><b>Durée partielle</b> — non chiffrable : {task.missing_components.map((m) => m.label || m.component).join(", ")}. {task.missing_components[0].note}</div>}
    {task.conflict && <div className="pln-warn" role="alert" data-planning-conflict>{task.conflict.message} (au plus tôt : {fmt(task.conflict.earliest)}, cause : {task.conflict.cause === "RESOURCE_CAPACITY" ? "capacité des équipes" : "dépendances"})</div>}
    {task.warnings?.map((w, i) => <p key={i} className="pln-muted">{w}</p>)}
    {task.technical_waits?.length > 0 && <p className="pln-muted">Attente technique (hors travail productif) : {task.technical_waits.map((w) => `${w.label} (${w.min_hours}–${w.max_hours} h)`).join(" ; ")}</p>}
    <DurationBlock task={task} busy={busy} onAcceptBaseline={onAcceptBaseline} onMode={onMode} />
    {task.duration_edit && <p className="pln-muted" data-planning-edit>Valeur calculée : {task.duration_edit.engine_value ?? "—"} j · votre valeur : {task.duration_edit.user_value} j (durée prévue, pas un réalisé).</p>}
    {task.row_type === "TASK" && <>
      <label className="pln-field">Durée prévue (jours-équipe)<span className="pln-inline"><input type="number" min="1" max="2000" data-planning-days value={days} onChange={(e) => setDays(e.target.value)}
          onBlur={() => { if (days && !busy && Number(days) !== task.duration_team_days) commitDays(Number(days)); }} onKeyDown={(e) => { if (e.key === "Enter" && days && !busy && Number(days) !== task.duration_team_days) commitDays(Number(days)); }} />
        <button type="button" className="secondary" data-planning-apply-days disabled={busy || !days || Number(days) === task.duration_team_days} onClick={() => commitDays(Number(days))}>Appliquer</button></span></label>
      {dated && <label className="pln-field">Épingler le début<span className="pln-inline"><input type="date" data-planning-pin value={pinDate} onChange={(e) => setPinDate(e.target.value)}
          onBlur={() => { if (pinDate && !busy && pinDate !== (task.pinned_start || "")) commitPin(pinDate); }} />
        <button type="button" className="secondary" data-planning-apply-pin disabled={busy || !pinDate} onClick={() => commitPin(pinDate)}>Épingler</button>
        {task.pinned_start && <button type="button" className="link-button" data-planning-unpin onClick={onUnpin}>Libérer</button>}</span></label>}
      <div className="pln-field" data-planning-actual><b>Réalisé</b> <small>(séparé du prévu ; début et fin réels alimentent votre historique)</small>
        <span className="pln-inline"><input type="date" aria-label="Début réel" data-planning-actual-start value={actual.actual_start} onChange={(e) => setActual({ ...actual, actual_start: e.target.value })} />
          <input type="date" aria-label="Fin réelle" data-planning-actual-finish value={actual.actual_finish} onChange={(e) => setActual({ ...actual, actual_finish: e.target.value })} /></span>
        <button type="button" className="secondary" data-planning-apply-actual disabled={busy || (!actual.actual_start && !actual.actual_finish)} onClick={() => onActual({ actual_start: actual.actual_start || null, actual_finish: actual.actual_finish || null })}>Enregistrer le réalisé</button></div>
    </>}
    <div data-planning-links><b>Liens ({links.length})</b>
      <ul>{links.map((l) => <li key={l.link_id} data-planning-link={l.link_id} data-strength={l.strength}>
        <span>{l.predecessor_task_id} → {l.successor_task_id} <small>{l.relation_type}{l.lag_workdays ? ` ${l.lag_workdays > 0 ? "+" : ""}${l.lag_workdays} j` : ""}</small></span>
        <Badge tone={l.strength === "HARD" ? "bad" : l.strength === "RESOURCE_CAPACITY_ONLY" ? "info" : "ok"}>{l.strength === "HARD" ? "Obligatoire" : l.strength === "RESOURCE_CAPACITY_ONLY" ? "Capacité équipe" : l.strength === "OBSERVED_ONLY" ? "Observé" : "Métier"}</Badge>
        <button type="button" className="link-button" data-planning-remove-link={l.link_id} disabled={busy || !l.removable} title={l.removable ? "Retirer cette relation pour ce projet" : l.strength === "RESOURCE_CAPACITY_ONLY" ? "Séquence due à la capacité des équipes : changez de scénario" : "Dépendance technique ou de sécurité : non supprimable"} onClick={() => onRemoveLink(l)}>Retirer</button>
        <small className="pln-muted">{l.reason}</small></li>)}</ul>
      <span className="pln-inline"><select data-planning-add-predecessor value={predecessor} onChange={(e) => setPredecessor(e.target.value)} aria-label="Ajouter un prédécesseur"><option value="">Ajouter un prédécesseur…</option>{others.map((r) => <option key={r.task_id} value={r.task_id}>{r.label}</option>)}</select>
        <button type="button" className="secondary" data-planning-add-link disabled={busy || !predecessor} onClick={() => onAddLink(predecessor, task.task_id)}>Ajouter</button></span></div>
  </div>;
}

const MODE_LABEL = { HISTORICAL_BASELINE: "Durée de l’historique retenue", DEADLINE_CONSTRAINED: "Durée contrainte par une échéance", MANUAL_OVERRIDE: "Durée modifiée à la main", UNKNOWN: "" };
const KNOWLEDGE = { KNOWN_NORMAL: ["Durée normale validée", "ok"], KNOWN_CONSTRAINED: ["Durée sous contrainte", "warn"], UNKNOWN: ["Contexte non qualifié", "info"] };

/** Durée observée (historique) / baseline / retenue : la proposition n'est jamais appliquée seule ; le libellé dépend du niveau de preuve ; aucun effectif n'est calculé. */
function DurationBlock({ task, busy, onAcceptBaseline, onMode }) {
  const [showRefs, setShowRefs] = useState(false);
  const [reason, setReason] = useState(task.duration_decision_reason || "");
  useEffect(() => { setReason(task.duration_decision_reason || ""); setShowRefs(false); }, [task.task_id, task.duration_decision_reason]);
  const proposal = task.baseline_proposal;
  if (!proposal && task.duration_team_days === null) return null;
  const retained = task.retained_duration_days;
  const constrained = task.duration_constraint_mode === "DEADLINE_CONSTRAINED";
  return <div className="pln-duration" data-planning-duration-block>
    <b>Durée</b>
    {proposal?.kind === "PROPOSAL" && <div data-planning-baseline data-label-mode={proposal.label_mode}>
      <p className="pln-baseline-label"><strong data-planning-baseline-label>{proposal.label}</strong></p>
      <p className="pln-muted" data-planning-composition>{proposal.composition}</p>
    </div>}
    {proposal && proposal.kind !== "PROPOSAL" && <div data-planning-baseline data-label-mode="NO_HISTORY">
      <p className="pln-baseline-label"><strong data-planning-baseline-label>{proposal.label}</strong></p>
      {proposal.composition && <p className="pln-muted" data-planning-composition>{proposal.composition} Pas assez de références comparables pour proposer une durée.</p>}
    </div>}
    {proposal?.constrained_insight && <p className="pln-muted" data-planning-constrained-insight>{proposal.constrained_insight.message}</p>}
    {proposal?.kind === "PROPOSAL" && retained !== null && task.delta_days !== null && task.delta_days !== undefined && <p data-planning-gap>Durée historique observée : <b>{proposal.baseline_days}</b> j · Durée au planning : <b>{retained}</b> j · <b>{task.delta_days > 0 ? "+" : ""}{task.delta_days} jours / {task.compression_pct > 0 ? "+" : ""}{task.compression_pct} %</b></p>}
    {task.shorter_than_references && <div className="pln-warn" role="alert" data-planning-compression-warning>Durée plus courte que les références observées. L’entreprise devra adapter ses moyens et son organisation.</div>}
    {proposal?.kind === "PROPOSAL" && <div className="pln-inline">
      {Math.round(proposal.baseline_days) !== retained && <button type="button" className="secondary" data-planning-accept-baseline disabled={busy} onClick={onAcceptBaseline}>Utiliser {Math.round(proposal.baseline_days)} jours</button>}
      <button type="button" className="link-button" data-planning-modify-duration onClick={() => document.querySelector("[data-planning-days]")?.focus()}>Modifier</button>
      <button type="button" className="link-button" data-planning-show-references aria-expanded={showRefs} onClick={() => setShowRefs(!showRefs)}>{showRefs ? "Masquer les références" : "Voir les références"}</button>
    </div>}
    {showRefs && <ul data-planning-references>{(proposal.references || []).map((r) => <li key={r.id}><span>{r.project} — {r.duration_days} j</span> <Badge tone={KNOWLEDGE[r.constraint_knowledge][1]}>{r.qualification}</Badge></li>)}</ul>}
    {retained !== null && retained !== undefined && task.duration_constraint_mode && task.duration_constraint_mode !== "UNKNOWN" && <p className="pln-muted" data-planning-mode>{MODE_LABEL[task.duration_constraint_mode]}{task.duration_decision_reason ? ` — ${task.duration_decision_reason}` : ""}</p>}
    {retained !== null && retained !== undefined && task.duration_edit && <div className="pln-field" data-planning-constraint-mode>
      <label className="pln-inline"><input type="checkbox" data-planning-deadline-mode checked={constrained} disabled={busy} onChange={(e) => onMode(e.target.checked ? "DEADLINE_CONSTRAINED" : "MANUAL_OVERRIDE", reason)} /> Durée contrainte par une échéance</label>
      {constrained && <span className="pln-inline"><input type="text" data-planning-reason aria-label="Motif de la contrainte" placeholder="Motif (ex. mise à disposition le 30/06)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="button" className="secondary" data-planning-save-reason disabled={busy} onClick={() => onMode("DEADLINE_CONSTRAINED", reason)}>Enregistrer le motif</button></span>}
    </div>}
  </div>;
}

/** Échéance du projet : Calepin l'évalue et la signale ; il ne comprime aucune durée et ne propose aucun effectif. */
function ScheduleConstraint({ constraint, dated, busy, onSave }) {
  const [date, setDate] = useState(constraint?.target_finish_date || "");
  const [level, setLevel] = useState(constraint?.constraint_level || "SOFT");
  const [label, setLabel] = useState(constraint?.label || "");
  useEffect(() => { setDate(constraint?.target_finish_date || ""); setLevel(constraint?.constraint_level || "SOFT"); setLabel(constraint?.label || ""); }, [constraint?.target_finish_date, constraint?.constraint_level, constraint?.label]);
  const status = constraint?.status;
  return <section className="pln-card pln-target" data-planning-target>
    <b>Date cible de fin <small className="pln-muted">(facultative)</small></b>
    <span className="pln-inline">
      <input type="date" data-planning-target-date aria-label="Date cible de fin" value={date} onChange={(e) => setDate(e.target.value)} />
      <select data-planning-target-level aria-label="Niveau de la contrainte" value={level} onChange={(e) => setLevel(e.target.value)}><option value="SOFT">Indicative</option><option value="HARD">Impérative</option></select>
      <input type="text" data-planning-target-label aria-label="Libellé de la date cible" placeholder="Libellé (ex. mise à disposition)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <button type="button" className="secondary" data-planning-target-save disabled={busy || !date} onClick={() => onSave({ targetFinishDate: date, constraintLevel: level, label, source: "MOE" })}>Enregistrer</button>
      {constraint && <button type="button" className="link-button" data-planning-target-clear disabled={busy} onClick={() => onSave({ targetFinishDate: null })}>Retirer</button>}
    </span>
    {status === "EXCEEDED" && <div className="pln-warn" role="alert" data-planning-target-status="EXCEEDED">La fin prévue ({constraint.projected_finish}) dépasse la date cible ({constraint.target_finish_date}) de {constraint.days_over} jour(s) ouvré(s). Ajustez les durées retenues ou le scénario d’équipes : Calepin ne comprime rien automatiquement.</div>}
    {status === "MET" && <p className="pln-ok" data-planning-target-status="MET">La fin prévue ({constraint.projected_finish}) respecte la date cible ({constraint.target_finish_date}).</p>}
    {status === "NOT_EVALUABLE_NO_DATES" && <p className="pln-muted" data-planning-target-status="NOT_EVALUABLE">Renseignez une date d’ordre de service pour comparer le planning à la date cible.</p>}
  </section>;
}

/** Bibliothèque historique : durées OBSERVÉES ; l'ancien planning non qualifié reste « non qualifié » tant que vous ne le qualifiez pas. */
function HistoryPanel({ history, activities, onChanged }) {
  const unique = [...new Map(activities.map((a) => [a.canonical_id, a])).values()];
  const [form, setForm] = useState({ canonical_id: "", duration_days: "", project_name: "", constraint_knowledge: "UNKNOWN", reason: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (fn) => { setBusy(true); setError(""); try { await fn(); await onChanged(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  return <div className="pln-profile" data-planning-history>
    <p className="pln-muted" data-planning-profile-intro>Durées observées sur vos anciens projets et références utilisées par Calepin pour vous aider à planifier. Une proposition ne modifie jamais le planning : vous décidez.</p>
    <details data-planning-profile-how><summary>ⓘ Comment Calepin utilise ces durées ?</summary><ul className="pln-muted">{history.rules.map((r) => <li key={r}>{r}</li>)}</ul></details>
    {error && <div className="err" role="alert" data-planning-history-error>{error}</div>}
    {!history.entries.length && <p className="pln-muted" data-planning-profile-empty>Aucune référence pour l’instant. Elle se construit quand vous validez des durées, avec votre réalisé, ou en saisissant d’anciennes durées.</p>}
    {history.overview.map((o) => <div key={o.canonical_id} className="pln-model" data-planning-model={o.canonical_id}><b>{o.canonical_id}</b>
      {o.kind === "PROPOSAL" ? <><span data-planning-model-label>{o.label}</span><small data-planning-model-source>{o.source_text}</small></>
        : o.reference_only ? <><span data-planning-model-label data-planning-reference-only>{o.reference_only.label} : {o.reference_only.days} jours</span></>
        : <span data-planning-model-label>Durée à renseigner</span>}
      <small>{o.composition}</small>
      {o.constrained_insight && <small data-planning-constrained-insight>Durée contrainte (hors référence habituelle) : {o.constrained_insight.message}</small>}
      {o.agency_reference ? <span className="pln-inline" data-planning-agency-reference><b>{o.agency_reference.text}</b>
        <button type="button" className="link-button" data-planning-agency-reference-remove disabled={busy} onClick={() => act(() => deletePlanningDurationReference(o.canonical_id))}>Retirer la référence agence</button></span>
        : <small className="pln-muted" data-planning-no-agency-reference>Référence agence : aucune</small>}
      {o.kind === "PROPOSAL" && o.baseline_days != null && Number(o.agency_reference?.duration_days) !== Number(o.baseline_days) && <button type="button" className="link-button" data-planning-agency-reference-set disabled={busy}
        onClick={() => act(() => setPlanningDurationReference({ canonical_id: o.canonical_id, duration_days: o.baseline_days, label: o.canonical_id }))}>Définir {o.baseline_days} jours comme référence agence</button>}</div>)}
    {history.entries.map((e) => <div key={e.id} className="pln-obs" data-planning-entry={e.id} data-knowledge={e.constraint_knowledge}>
      <span>{e.project_name || "Projet"} · {e.canonical_id} · {e.duration_days} j <Badge tone={KNOWLEDGE[e.constraint_knowledge][1]}>{KNOWLEDGE[e.constraint_knowledge][0]}</Badge></span>
      <span className="pln-inline" aria-label="Cette durée était">
        <button type="button" className="link-button" data-planning-qualify="KNOWN_NORMAL" disabled={busy || e.constraint_knowledge === "KNOWN_NORMAL"} onClick={() => act(() => qualifyPlanningHistoryEntry(e.id, "KNOWN_NORMAL"))}>Durée normale</button>
        <button type="button" className="link-button" data-planning-qualify="KNOWN_CONSTRAINED" disabled={busy || e.constraint_knowledge === "KNOWN_CONSTRAINED"} onClick={() => act(() => qualifyPlanningHistoryEntry(e.id, "KNOWN_CONSTRAINED"))}>Durée contrainte</button>
        <button type="button" className="link-button" data-planning-qualify="UNKNOWN" disabled={busy || e.constraint_knowledge === "UNKNOWN"} onClick={() => act(() => qualifyPlanningHistoryEntry(e.id, "UNKNOWN"))}>Motif non précisé</button>
        <button type="button" className="link-button" data-planning-delete-entry={e.id} disabled={busy} onClick={() => act(() => deletePlanningHistoryEntry(e.id))}>Oublier</button>
      </span></div>)}
    <details data-planning-add-entry><summary>Ajouter une durée observée</summary>
      <span className="pln-inline"><select data-planning-entry-activity aria-label="Tâche" value={form.canonical_id} onChange={(e) => setForm({ ...form, canonical_id: e.target.value })}><option value="">Tâche…</option>{unique.map((a) => <option key={a.canonical_id} value={a.canonical_id}>{a.label}</option>)}</select>
        <input type="number" min="1" data-planning-entry-days aria-label="Durée observée (jours ouvrés)" placeholder="Jours ouvrés" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
        <input type="text" data-planning-entry-project aria-label="Projet source (facultatif)" placeholder="Projet — facultatif" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
        <select data-planning-entry-knowledge aria-label="Cette durée était" value={form.constraint_knowledge} onChange={(e) => setForm({ ...form, constraint_knowledge: e.target.value })}><option value="UNKNOWN">Motif non précisé</option><option value="KNOWN_NORMAL">Durée normale</option><option value="KNOWN_CONSTRAINED">Durée contrainte</option></select>
        <button type="button" className="secondary" data-planning-entry-save disabled={busy || !form.canonical_id || !form.duration_days} onClick={() => act(async () => { await createPlanningHistoryEntry({ ...form, duration_days: Number(form.duration_days), label: unique.find((a) => a.canonical_id === form.canonical_id)?.label || "" }); setForm({ ...form, duration_days: "", project_name: "" }); })}>Ajouter à l’historique</button></span>
    </details>
  </div>;
}

/** Historique métier : phrases lisibles (tâche, modification, ancienne → nouvelle valeur, qui, quand) ; jamais d'identifiant ni de type d'événement technique. */
function HistoryItem({ event, onSelectTask }) {
  const h = event.history || {};
  const taskId = h.task_id;
  return <li data-planning-event={event.event_type} className={`${h.state === "annulée" ? "reverted" : ""} ${taskId && onSelectTask ? "clickable" : ""}`} tabIndex={taskId && onSelectTask ? 0 : undefined} role={taskId && onSelectTask ? "button" : undefined} title={taskId && onSelectTask ? "Afficher la tâche dans le tableau" : undefined}
    onClick={taskId && onSelectTask ? () => onSelectTask(taskId) : undefined} onKeyDown={taskId && onSelectTask ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectTask(taskId); } } : undefined}>
    <b>{h.task}</b><span>{h.text}</span>{h.detail && <small>{h.detail}</small>}
    <small>{[h.actor, h.when].filter(Boolean).join(" · ")}{h.origin === "DPGF" ? " · depuis le DPGF" : ""} · {h.state}</small></li>;
}
// Catégories de l'historique (filtres du tiroir) : un événement appartient à une seule catégorie
const JOURNAL_FILTERS = [["all", "Tous"], ["task", "Tâches"], ["date", "Dates"], ["duration", "Durées"], ["order", "Ordre"], ["resources", "Ressources"]];
const JOURNAL_KIND = { TASK_CREATE: "task", TASK_REMOVE: "task", DEPENDENCY_ADD: "task", DEPENDENCY_REMOVE: "task", PIN_START: "date", UNPIN_START: "date", ACTUAL_UPDATE: "date",
  TASK_RESIZE: "duration", ACCEPT_BASELINE: "duration", DURATION_MODE_CHANGE: "duration", TASK_REORDER: "order", TASK_MOVE: "order", TASK_SEQUENCE: "order", RESOURCE_SCENARIO_CHANGE: "resources" };

/** Historique du planning : tiroir latéral (le Gantt reste en place, rien n'est ajouté sous lui). Langage métier, filtres, clic sur un événement = sélection de la tâche. */
function JournalPanel({ events, onClose, onSelectTask }) {
  const [filter, setFilter] = useState("all");
  const ordered = [...events].reverse();
  // « Tous » masque le bruit : changements de scénario de ressources (visibles dans « Ressources ») et répétitions consécutives identiques
  const visible = ordered.filter((event) => (filter === "all" ? JOURNAL_KIND[event.event_type] !== "resources" : (JOURNAL_KIND[event.event_type] || "task") === filter))
    .filter((event, index, list) => index === 0 || JSON.stringify([event.history?.task, event.history?.text, event.history?.detail, event.history?.actor]) !== JSON.stringify([list[index - 1].history?.task, list[index - 1].history?.text, list[index - 1].history?.detail, list[index - 1].history?.actor]));
  return <aside className="pln-card pln-history pln-drawer" data-planning-history-panel data-planning-drawer aria-label="Historique du planning">
    <div className="pln-detail-head"><b>Historique du planning</b><button type="button" className="link-button" data-planning-history-close onClick={onClose}>Fermer</button></div>
    <nav className="pln-drawer-filters" aria-label="Filtrer l'historique">{JOURNAL_FILTERS.map(([id, label]) => <button key={id} type="button" className={filter === id ? "active" : ""} data-planning-history-filter={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</nav>
    {!visible.length ? <p className="pln-muted">Aucune modification pour l’instant.</p> : <ul className="pln-history-list">{visible.map((event) => <HistoryItem key={event.event_id} event={event} onSelectTask={onSelectTask} />)}</ul>}</aside>;
}

const PENDING_SUMMARY = [["order", "déplacement", "déplacements"], ["duration", "durée modifiée", "durées modifiées"], ["date", "date modifiée", "dates modifiées"], ["task", "tâche ajoutée, retirée ou reliée", "tâches ajoutées, retirées ou reliées"], ["resources", "changement de ressources", "changements de ressources"]];

/** Modifications en attente d'enregistrement : ce qui a changé (tâche, ancienne → nouvelle valeur), résumé par type, annulation d'une modification précise. Aucun identifiant technique. */
function PendingPanel({ events, count, busy, onClose, onUndo, onSelectTask }) {
  const pending = events.filter((e) => !e.commit_id && !e.revert_of && !events.some((x) => x.revert_of === e.event_id)).reverse();
  const counts = {};
  pending.forEach((event) => { const kind = JOURNAL_KIND[event.event_type] || "task"; counts[kind] = (counts[kind] || 0) + 1; });
  return <aside className="pln-card pln-drawer" data-planning-pending-panel data-planning-drawer aria-label="Modifications en attente">
    <div className="pln-detail-head"><b>Modifications en attente</b><button type="button" className="link-button" data-planning-pending-close onClick={onClose}>Fermer</button></div>
    <p className="pln-muted" data-planning-pending-summary>{PENDING_SUMMARY.filter(([kind]) => counts[kind]).map(([kind, one, many]) => `${counts[kind]} ${counts[kind] > 1 ? many : one}`).join(" · ") || `${count} modification${count > 1 ? "s" : ""}`}</p>
    <p className="pln-muted">« Enregistrer les modifications » ajoute ces {count} modification{count > 1 ? "s" : ""} à votre historique des durées. Vous pouvez encore en annuler avant.</p>
    <ul className="pln-history-list">{pending.map((event) => <li key={event.event_id} data-planning-pending-item={event.event_type}>
      <button type="button" className="link-button pln-pending-task" disabled={!event.history?.task_id} onClick={() => event.history?.task_id && onSelectTask(event.history.task_id)}><b>{event.history?.task}</b></button>
      <span>{event.history?.text}</span>{event.history?.detail && <small>{event.history.detail}</small>}
      <button type="button" className="link-button" data-planning-pending-undo disabled={busy} onClick={() => onUndo(event)}>Annuler cette modification</button></li>)}</ul></aside>;
}

/** Largeur adaptée au contenu de la colonne Tâche : plus long libellé visible + poignée, bouton Détails et menu ; bornée pour rester raisonnable. */
function fitTask(rows) {
  const canvas = fitTask.canvas || (fitTask.canvas = document.createElement("canvas")), ctx = canvas.getContext("2d");
  ctx.font = "600 13px system-ui, sans-serif";
  const longest = Math.max(0, ...rows.filter((r) => r.row_type === "TASK").map((r) => ctx.measureText(r.label || "").width));
  return Math.min(560, Math.max(140, Math.ceil(longest) + 96));
}
