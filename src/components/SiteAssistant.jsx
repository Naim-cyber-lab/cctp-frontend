import { Bot, Check, ChevronDown, ExternalLink, MapPin, Maximize2, Minus, PanelLeft, PanelRight, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, downloadCctp, downloadDpgf, downloadPlanning } from "../api/client";
import "../site-assistant.css";

const STARTERS = [
  "Que puis-je faire sur cette page ?",
  "Résume l’état de ce projet",
  "Aide-moi à créer un CCTP",
  "Propose le prochain travail utile",
];

// suggestions selon la page où se trouve l'utilisateur : l'assistant sait où il est, ses propositions aussi
const STARTERS_BY_VIEW = {
  draft: ["Quels lots puis-je ajouter ici ?", "Ajoute-moi un lot ici", "Où suis-je ?", "Résume l’état de ce projet"],
  assistant: ["Où suis-je ?", "Que puis-je faire sur cette page ?", "Résume l’état de ce projet", "Quels lots puis-je ajouter ici ?"],
  "project-overview": ["Résume l’état de ce projet", "Ajoute-moi un lot ici", "Que puis-je faire sur cette page ?", "Propose le prochain travail utile"],
};

// où se trouve l'utilisateur, dit en clair : affiché en permanence dans le panneau pour qu'on VOIE que l'assistant tient compte de la page
const PAGE_NAMES = {
  projects: "Liste des projets", "project-overview": "Vue d’ensemble du projet", draft: "Liste des lots du CCTP", assistant: "Rédaction d’un lot du CCTP", preview: "Aperçu du CCTP",
  quotes: "Devis / DPGF", "project-feasibility": "Faisabilité", feasibility: "Faisabilité", "project-planning": "Planning", planning: "Planning",
  "project-documents": "Documents du projet", documents: "Documents du projet", consult: "Consultation", consultation: "Consultation", tasks: "Tâches de l’agence", profile: "Profil et équipe", library: "Bibliothèque de l’agence",
};
const sceneOf = (view, project, chapterId) => ({ page: PAGE_NAMES[view] || "Calepin", project: project?.name || null, lots: project ? (project.selected || []).length : null, lot: chapterId || null });
const sceneKey = (scene) => `${scene.page}|${scene.project || ""}`;

const PLACEMENT_KEY = "calepin.assistant.placement";
const PLACEMENTS = ["right", "left", "floating", "expanded"];
const WIDTH_KEY = "calepin.assistant.width";
const clampWidth = (value) => Math.round(Math.min(Math.max(value, 320), Math.min(600, window.innerWidth * 0.5)));
function readWidth() { try { const v = Number(window.localStorage.getItem(WIDTH_KEY)); return v ? clampWidth(v) : 390; } catch { return 390; } }
function readPlacement() { try { const v = window.localStorage.getItem(PLACEMENT_KEY); return PLACEMENTS.includes(v) ? v : "right"; } catch { return "right"; } }
function writePlacement(value) { try { window.localStorage.setItem(PLACEMENT_KEY, value); } catch { /* stockage indisponible : préférence non mémorisée */ } }

/** AI-PANEL-UX-01 (évitement de collision) : à utiliser pour « Voir la modification » / « Voir la source » : l'élément est centré à l'écran, et la fenêtre détachée de l'Assistant se déplace s'il le recouvre. */
export function revealAssistantTarget(element) {
  if (!element) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  window.dispatchEvent(new CustomEvent("calepin:reveal", { detail: element }));
}

export function SiteAssistant({ project, view, chapterId = null, onNavigate, onRefresh, onRemoveLot, onOpenLot, onOpenConsultation }) {
  const [open, setOpen] = useState(false);
  // AI-PANEL-UX-01 : placement de l'Assistant — ancré à droite (par défaut), ancré à gauche, détaché (flottant), réduit. La conversation et le contexte ne sont jamais réinitialisés.
  const [placement, setPlacement] = useState(() => readPlacement());
  useEffect(() => { writePlacement(placement); }, [placement]);
  const [width, setWidth] = useState(() => readWidth());
  const [floatPos, setFloatPos] = useState(null);   // position de la fenêtre détachée (glissée par l'utilisateur)
  useEffect(() => { if (!open) setFloatPos(null); }, [open]);   // à la fermeture, le bouton revient toujours à sa place d'origine : aucune position n'est mémorisée
  useEffect(() => { document.documentElement.style.setProperty("--assistant-dock-w", `${width}px`); try { window.localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* préférence non mémorisée */ } }, [width]);
  // Glisser : la fenêtre détachée se déplace par son en-tête ; elle reste dans l'écran.
  const dragRef = useRef(null);
  const startDrag = (event) => {
    if (placement !== "floating" || event.target.closest("button")) return;
    const box = event.currentTarget.parentElement.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    const left = Math.min(Math.max(0, event.clientX - dragRef.current.dx), window.innerWidth - 120);
    const top = Math.min(Math.max(0, event.clientY - dragRef.current.dy), window.innerHeight - 60);
    setFloatPos({ left, top });
  };
  const endDrag = () => { dragRef.current = null; };
  // Un élément mis en évidence (revealAssistantTarget) ne reste jamais caché par la fenêtre détachée : elle se place de l'autre côté.
  useEffect(() => {
    const onReveal = (event) => {
      const target = event.detail;
      const box = document.querySelector("[data-site-assistant]");
      if (!target || !box || placement !== "floating" || !open) return;
      setTimeout(() => {
        const t = target.getBoundingClientRect();
        const f = box.getBoundingClientRect();
        const overlaps = t.left < f.right && t.right > f.left && t.top < f.bottom && t.bottom > f.top;
        if (!overlaps) return;
        const targetOnRight = t.left + t.width / 2 > window.innerWidth / 2;
        const left = targetOnRight ? 16 : Math.max(16, window.innerWidth - f.width - 16);
        setFloatPos({ left, top: Math.min(Math.max(16, f.top), window.innerHeight - f.height - 16) });
      }, 350);
    };
    window.addEventListener("calepin:reveal", onReveal);
    return () => window.removeEventListener("calepin:reveal", onReveal);
  }, [placement, open]);
  // Redimensionner : une poignée sur le bord intérieur du panneau ancré (à gauche ou à droite).
  const resizeRef = useRef(null);
  const startResize = (event) => { resizeRef.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture?.(event.pointerId); };
  const moveResize = (event) => {
    if (!resizeRef.current) return;
    const delta = event.clientX - resizeRef.current.x;
    setWidth(clampWidth(resizeRef.current.width + (placement === "left" ? delta : -delta)));
  };
  const endResize = () => { resizeRef.current = null; };
  useEffect(() => {
    const docked = open && (placement === "right" || placement === "left") && window.innerWidth >= 900;
    document.body.classList.toggle("assistant-docked-right", docked && placement === "right");
    document.body.classList.toggle("assistant-docked-left", docked && placement === "left");
    return () => document.body.classList.remove("assistant-docked-right", "assistant-docked-left");
  }, [open, placement]);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastLot, setLastLot] = useState(null); // dernier lot ajouté ou ouvert : « ok rentre dans ce lot » sait de quel lot on parle
  const [slow, setSlow] = useState(false);
  const [skill, setSkill] = useState(null); // profil de la page (actions instantanées, suggestions) : fourni par le serveur à chaque changement de page
  const historyKey = project?.id || "global";
  const loadedHistory = useRef("");
  const scene = useMemo(() => sceneOf(view, project, chapterId), [view, project?.id, project?.name, project?.selected, chapterId]);
  const sceneRef = useRef(scene);
  const keyRef = useRef("");
  sceneRef.current = scene;
  keyRef.current = `${view}|${project?.id || ""}|${chapterId || ""}`;
  const context = useMemo(() => ({ page: view, project_id: project?.id || null, project_name: project?.name || null, selected_lots: project?.selected || [], lot_id: chapterId || null, focus_lot_id: lastLot || chapterId || null }), [view, project?.id, project?.name, project?.selected, chapterId, lastLot]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setSkill(null);
    apiFetch(`/assistant/site/skill?page=${encodeURIComponent(view || "projects")}`).then((data) => { if (!cancelled) setSkill(data); }).catch(() => { /* profil indisponible : suggestions de secours */ });
    return () => { cancelled = true; };
  }, [open, view]);

  useEffect(() => {
    if (!open || loadedHistory.current === historyKey) return undefined;
    let cancelled = false;
    loadedHistory.current = historyKey;
    const query = project?.id ? `?project_id=${encodeURIComponent(project.id)}` : "";
    apiFetch(`/assistant/site/history${query}`).then((data) => {
      if (cancelled) return;
      setMessages((data.messages || []).map((item) => ({
        role: item.role, content: item.content, persisted: true,
        scene: item.scene ? { page: PAGE_NAMES[item.scene.page] || item.scene.page || "Calepin", project: item.scene.project_name || null, lot: item.scene.lot_id || null } : null,
      })));
    }).catch(() => { /* la conversation reste utilisable même si l'historique est indisponible */ });
    return () => { cancelled = true; };
  }, [open, historyKey, project?.id]);

  // après une navigation exécutée directement : on attend que la page ait changé, puis l'assistant le confirme et redonne la main (« Page ouverte comme souhaité… »)
  const announceArrival = (forceMoved = false, needsProject = false) => {
    const startKey = keyRef.current;
    let waited = 0;
    const timer = setInterval(() => {
      waited += 150;
      const moved = forceMoved ? waited >= 600 : keyRef.current !== startKey;
      if (moved && needsProject && !sceneRef.current.project && waited < 6000) return; // la page a changé mais le projet n'est pas encore chargé : on attend son nom pour confirmer exactement
      if (!moved && waited < 3000) return;
      clearInterval(timer);
      const here = sceneRef.current;
      const where = `${here.page}${here.project ? ` · ${here.project}` : ""}${here.lot ? ` · lot ${String(here.lot).replace("LOT-", "")}` : ""}`;
      const content = moved || forceMoved ? `Page ouverte comme souhaité : ${where}. Que puis-je faire pour vous ?` : `Vous êtes déjà sur cette page : ${where}. Que puis-je faire pour vous ?`;
      setMessages((items) => [...items, { role: "assistant", content, scene: here, arrival: true }]);
    }, 150);
  };

  const send = async (text = draft) => {
    const message = String(text || "").trim();
    if (!message || busy) return;
    const userMessage = { role: "user", content: message, scene };
    setMessages((items) => [...items, userMessage]); setDraft(""); setBusy(true); setError("");
    const slowTimer = setTimeout(() => setSlow(true), 6000);
    try {
      const data = await apiFetch("/assistant/site/chat", { method: "POST", body: JSON.stringify({ message, history: messages.slice(-20).map(({ role, content }) => ({ role, content })), context }) });
      setMessages((items) => [...items, { role: "assistant", content: data.answer, scene, confirmations: data.confirmations || [], actions: data.actions || [], results: data.results || [], suggestions: data.suggestions || [] }]);
      const autoActions = (data.actions || []).filter((action) => action.auto); // navigation explicite (« ouvre le planning », « rentre dans ce lot ») : exécutée aussitôt, sans second clic
      if (autoActions.length) { autoActions.forEach(runAction); announceArrival(autoActions.some((action) => action.name === "open_consultation"), autoActions.some((action) => action.arguments?.project_id && action.arguments?.destination !== "projects")); }
    } catch (reason) { setError(reason?.message || "L’assistant est indisponible."); }
    finally { clearTimeout(slowTimer); setSlow(false); setBusy(false); }
  };

  const confirm = async (messageIndex, actionIndex, token, action) => {
    setBusy(true); setError("");
    try {
      if (action?.client) {
        // action faite par l'interface elle-même (mêmes règles que le menu « Supprimer le lot » : texte du lot supprimé, lots suivants renumérotés), jamais par un code parallèle du serveur
        if (action.name !== "remove_lot" || !onRemoveLot || project?.id !== action.arguments?.project_id) throw new Error("Cette action n’est plus possible depuis cet écran : rouvrez le projet et redemandez-la.");
        await onRemoveLot(action.arguments.lot_id);
        setMessages((items) => items.map((item, index) => index === messageIndex ? { ...item, confirmations: item.confirmations.map((entry, i) => i === actionIndex ? { ...entry, done: true } : entry) } : item));
        setMessages((items) => [...items, { role: "assistant", content: "C’est fait. Le lot a été supprimé du CCTP et les lots suivants ont été renumérotés." }]);
        return;
      }
      const data = await apiFetch("/assistant/site/execute", { method: "POST", body: JSON.stringify({ token }) });
      setMessages((items) => items.map((item, index) => index === messageIndex ? { ...item, confirmations: item.confirmations.map((entry, i) => i === actionIndex ? { ...entry, done: true } : entry) } : item));
      const addedLot = action?.name === "add_lot" ? String(action.arguments?.lot_id || "") : "";
      const lotTitle = (action?.label || "").match(/« (.+?) »/)?.[1];
      if (addedLot) setLastLot(addedLot);
      setMessages((items) => [...items, addedLot
        ? { role: "assistant", content: `C’est fait. Le lot « ${lotTitle || addedLot} » a été ajouté au CCTP (vide, à rédiger). Dites « ouvre ce lot » pour y entrer.`, actions: [{ name: "open_lot", arguments: { project_id: action.arguments.project_id, lot_id: addedLot } }] }
        : { role: "assistant", content: `C’est fait. ${data?.result?.name ? `« ${data.result.name} » est à jour.` : "L’action a été appliquée."}`, undoToken: data?.undoToken || null }]);
      await onRefresh?.();
    } catch (reason) { setError(reason?.message || "Cette action n’a pas pu être appliquée."); }
    finally { setBusy(false); }
  };

  const undo = async (messageIndex, token) => {
    if (!token || busy) return;
    setBusy(true); setError("");
    try {
      await apiFetch("/assistant/site/undo", { method: "POST", body: JSON.stringify({ token }) });
      setMessages((items) => items.map((item, index) => index === messageIndex ? { ...item, undoToken: null, content: `${item.content} La modification a ensuite été annulée.` } : item));
      await onRefresh?.();
    } catch (reason) { setError(reason?.message || "La modification n’a pas pu être annulée."); }
    finally { setBusy(false); }
  };

  const clearHistory = async () => {
    const query = project?.id ? `?project_id=${encodeURIComponent(project.id)}` : "";
    setBusy(true); setError("");
    try { await apiFetch(`/assistant/site/history${query}`, { method: "DELETE" }); setMessages([]); }
    catch (reason) { setError(reason?.message || "L’historique n’a pas pu être effacé."); }
    finally { setBusy(false); }
  };

  // navigation directe : un module du projet, un autre projet, ou un lot du projet ouvert
  const runAction = (action) => {
    if (action?.name === "download_project_export") {
      const { project_id: id, project_name: name = "Projet", format } = action.arguments || {};
      const operation = format === "cctp_pdf" ? downloadCctp(id, "pdf", name)
        : format === "cctp_docx" ? downloadCctp(id, "docx", name)
        : format === "dpgf_xlsx" ? downloadDpgf(id, `DPGF-${name}`)
        : format === "planning_xlsx" ? downloadPlanning(id, "xlsx", `Planning-${name}`)
        : Promise.reject(new Error("Format d’export inconnu."));
      operation.catch((reason) => setError(reason?.message || "L’export n’a pas pu être généré."));
      return;
    }
    if (action?.name === "open_consultation") { onOpenConsultation?.(action.arguments?.project_id, action.arguments?.consultation_id); return; }
    if (action?.name === "open_lot") {
      if (project?.id === action.arguments?.project_id && onOpenLot) { setLastLot(String(action.arguments.lot_id)); onOpenLot(String(action.arguments.lot_id)); }
      return;
    }
    const destination = action?.arguments?.destination;
    if (destination) onNavigate?.(destination, action.arguments.project_id || project?.id || null);
  };
  const navigate = runAction;

  return <div className={`site-assistant ${open ? "open" : ""} placement-${open ? placement : "right"}`} data-site-assistant data-assistant-placement={placement} style={open && placement === "floating" && floatPos ? { left: floatPos.left, top: floatPos.top, right: "auto", bottom: "auto" } : undefined}>
    {!open && <button type="button" className="site-assistant-launch" onClick={() => setOpen(true)} aria-label="Ouvrir l’assistant Calepin"><Sparkles size={19}/><span>Assistant Calepin</span></button>}
    {open && <section className="site-assistant-panel" aria-label="Assistant Calepin">
      {(placement === "right" || placement === "left") && <div className="site-assistant-resize" role="separator" aria-orientation="vertical" aria-label="Largeur de l’Assistant" aria-valuenow={width} tabIndex={0} data-assistant-resize onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onKeyDown={(e) => { if (e.key === "ArrowLeft") setWidth(clampWidth(width + (placement === "left" ? 16 : -16))); if (e.key === "ArrowRight") setWidth(clampWidth(width + (placement === "left" ? -16 : 16))); }} />}
      <header onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><span className="site-assistant-brand"><Bot size={19}/><span><b>Assistant Calepin</b><small>Guide et actions dans toute l’application</small></span></span><span className="site-assistant-header-actions"><button type="button" onClick={clearHistory} disabled={busy || !messages.length} aria-label="Effacer cette conversation" title="Effacer cette conversation"><Trash2 size={16}/></button><button type="button" onClick={() => setPlacement("left")} disabled={placement === "left"} aria-label="Ancrer à gauche" title="Ancrer à gauche" data-assistant-place="left"><PanelLeft size={16}/></button><button type="button" onClick={() => setPlacement("right")} disabled={placement === "right"} aria-label="Ancrer à droite" title="Ancrer à droite" data-assistant-place="right"><PanelRight size={16}/></button><button type="button" onClick={() => setPlacement("floating")} disabled={placement === "floating"} aria-label="Détacher la fenêtre" title="Détacher" data-assistant-place="floating"><PanelRight size={15} style={{ transform: "rotate(90deg)" }}/></button><button type="button" onClick={() => setPlacement(placement === "expanded" ? "floating" : "expanded")} aria-label={placement === "expanded" ? "Réduire la taille" : "Agrandir"} title={placement === "expanded" ? "Taille normale" : "Agrandir"} data-assistant-expand><Maximize2 size={15}/></button><button type="button" className="site-assistant-mobile-back" onClick={() => setOpen(false)} aria-label="Retour au projet" data-assistant-back>Retour au projet</button><button type="button" onClick={() => setOpen(false)} aria-label="Réduire" title="Réduire (la conversation est conservée)" data-assistant-collapse><Minus size={16}/></button><button type="button" onClick={() => setOpen(false)} aria-label="Fermer"><X size={18}/></button></span></header>
      <div className="site-assistant-context" data-site-assistant-context key={sceneKey(scene)} role="status" aria-live="polite">
        <MapPin size={14}/><span className="site-assistant-context-title">Contexte pris en compte</span>
        <span className="site-assistant-context-chips">
          <b data-ctx-page>{scene.page}</b>
          {scene.project && <span data-ctx-project>Projet « {scene.project} »</span>}
          {scene.lots !== null && <span data-ctx-lots>{scene.lots} lot{scene.lots > 1 ? "s" : ""}</span>}
          {scene.lot && <span data-ctx-lot>Lot {String(scene.lot).replace("LOT-", "")} ouvert</span>}
        </span>
      </div>
      <div className="site-assistant-thread">
        {!messages.length && <div className="site-assistant-empty"><span><Sparkles size={21}/></span><h3>Que souhaitez-vous accomplir ?</h3><p>Je peux expliquer une page, retrouver un projet, préparer un CCTP et proposer des actions. Rien n’est modifié sans votre confirmation.</p><div>{(skill?.starters || STARTERS_BY_VIEW[view] || STARTERS).map((item) => <button type="button" key={item} onClick={() => send(item)}>{item}</button>)}</div>{skill?.capabilities?.length ? <ul className="site-assistant-capabilities" data-site-assistant-capabilities aria-label="Ce que je sais faire sur cette page">{skill.capabilities.filter((item) => item.id !== "where" && item.id !== "help").map((item) => <li key={item.id}><button type="button" onClick={() => send(item.example)} title={`Exemple : ${item.example}`}>{item.label}</button></li>)}</ul> : null}</div>}
        {messages.map((item, messageIndex) => {
          const before = messages.slice(0, messageIndex).reverse().find((entry) => entry.scene)?.scene;
          const changed = item.role === "user" && item.scene && before && sceneKey(before) !== sceneKey(item.scene);
          return <div key={`${messageIndex}-${item.role}`} className="site-assistant-entry">
          {changed && <div className="site-assistant-divider" data-site-assistant-divider><span>Vous êtes passé sur : {item.scene.page}{item.scene.project ? ` · ${item.scene.project}` : ""}</span></div>}
        <article className={item.role}>
          <div>{item.content}</div>
          {item.results?.map((result, index) => result.result?.proposal ? <details key={index} className="site-assistant-proposal"><summary>Voir la proposition de CCTP <ChevronDown size={14}/></summary><pre>{result.result.proposal}</pre></details> : null)}
          {item.confirmations?.map((action, actionIndex) => <div key={`${action.name}-${actionIndex}`} className={`site-assistant-confirm ${action.done ? "done" : ""}`}><span><b>{action.label}</b><small>{action.warning || Object.entries(action.arguments || {}).filter(([key]) => !["content", "expected_hash"].includes(key)).map(([key, value]) => `${key} : ${Array.isArray(value) ? value.join(", ") : value}`).join(" · ")}</small>{action.preview?.changed && <details className="site-assistant-diff"><summary>Voir les modifications · +{action.preview.added} / −{action.preview.removed}</summary><div><section><b>Avant</b><pre>{action.preview.before || "(vide)"}</pre></section><section><b>Après</b><pre>{action.preview.after || "(vide)"}</pre></section></div></details>}</span><button type="button" disabled={busy || action.done} onClick={() => confirm(messageIndex, actionIndex, action.token, action)}>{action.done ? <><Check size={14}/> Appliqué</> : "Confirmer"}</button></div>)}
          {item.undoToken && <button type="button" className="site-assistant-undo" disabled={busy} onClick={() => undo(messageIndex, item.undoToken)}><RotateCcw size={14}/> Annuler la modification</button>}
          {item.actions?.filter((action) => !action.auto).map((action, index) => <button type="button" className="site-assistant-open" key={index} onClick={() => navigate(action)}><ExternalLink size={14}/> {action.name === "open_lot" ? "Ouvrir le lot" : action.name === "open_consultation" ? "Ouvrir la consultation" : "Ouvrir la page"}</button>)}
          {item.suggestions?.length ? <div className="site-assistant-arrival-starters" data-site-assistant-suggestions>{item.suggestions.slice(0, 3).map((suggestion) => <button type="button" key={suggestion.suggestion_id} onClick={() => suggestion.target?.destination ? runAction({ name: "navigate", arguments: { destination: suggestion.target.destination, project_id: project?.id } }) : suggestion.action_type === "ASK" ? send(suggestion.prompt || suggestion.label) : setDraft(suggestion.prompt || suggestion.label)}>{suggestion.label}</button>)}</div> : null}
          {item.arrival && messageIndex === messages.length - 1 && skill?.starters?.length ? <div className="site-assistant-arrival-starters" data-site-assistant-arrival-starters>{skill.starters.slice(0, 3).map((starter) => <button type="button" key={starter} onClick={() => send(starter)}>{starter}</button>)}</div> : null}
          {item.role === "assistant" && item.scene && <small className="site-assistant-scene" data-site-assistant-scene><MapPin size={11}/> Contexte utilisé : {item.scene.page}{item.scene.project ? ` · ${item.scene.project}` : ""}</small>}
        </article></div>;
        })}
        {busy && <div className="site-assistant-thinking"><i/><i/><i/> {slow ? "Analyse approfondie en cours…" : "Calepin prépare la réponse…"}</div>}
      </div>
      {error && <div className="site-assistant-error" role="alert">{error}</div>}
      <form onSubmit={(event) => { event.preventDefault(); send(); }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder="Demandez une aide ou une action…"/><button type="submit" disabled={!draft.trim() || busy} aria-label="Envoyer"><Send size={17}/></button></form>
      <footer>Les modifications demandent toujours votre confirmation.</footer>
    </section>}
  </div>;
}
