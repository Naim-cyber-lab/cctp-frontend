import { useCallback, useEffect, useRef, useState } from "react";
import { GenerationReport, MissingDataPrompt, reportMessage } from "../components/MissingDataPrompt";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Bot,
  Check,
  ChevronDown,
  PanelRightClose,
  ClipboardCheck,
  MessageSquareText,
  PenLine,
  File,
  FileSearch,
  FileUp,
  Files,
  FileText,
  Italic,
  List,
  MoreHorizontal,
  ListChecks,
  ListOrdered,
  Paperclip,
  Redo2,
  Send,
  Sparkles,
  SpellCheck2,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { useCatalog } from "../catalog/CatalogContext";
import {
  createChapterMessage,
  deleteAttachment,
  getPlatrerieQuestionnaire,
  getRuleOverrides,
  listAttachments,
  listChapterMessages,
  getAssistantFeedback,
  openAttachmentProof,
  setRuleOverride,
  streamGenerateChapter,
  streamPrefillPlatrerieQuestionnaire,
  uploadAttachment,
  updateAttachment,
} from "../api/client";
import { PlatrerieQuestionnaire, questionnaireStats } from "../components/PlatrerieQuestionnaire";
import { DocumentPrefill } from "../components/DocumentPrefill";
import { AnswerTrace, fillTemplate } from "../components/AnswerTrace";
import { useChapterTrace } from "../utils/answerTraceState";
import { keepListOnEnter } from "../utils/listEnter";
import { changedLines, clearMarks, markChanges } from "../utils/aiChange";
import { diffRows } from "../utils/lineDiff";
import { AnswerFeedback, isAnswerMessage } from "../components/AnswerFeedback";
import "../ai-change.css";
import "../assistant-toolbar.css";
import "../assistant-ux-v2.css";
import { ChatMessage, EmptyState, InlineStatus, Suggestions, friendly } from "../components/AssistantThread";
import { ChapterReusePanel } from "../components/ChapterReusePanel";
import { ClauseDrawer, ClauseProvenance, insertClauseAtCursor, sectionAtCursor } from "../components/ClauseTools";
import { InlinePersonalizationDrawer, InlinePersonalizationTrigger } from "../components/InlinePersonalization";
import { answersIndex } from "../utils/clauses";
import { ClauseEditor } from "../components/AgencyClauses";
import { formatChapter, getOrganization, getTeamClause, interpretStyle, contextualizeRequest, observeIntent } from "../api/client";
import { parseStyleCommand, applyStyleCommands, describeStyles, isCompoundStyle, isEvidentStyle, MODEL_DOWN, STYLE_HELP, STYLE_LEXICON, UNSUPPORTED_LAYOUT, isUnsupportedLayout, blockKind, docMinDepth } from "../utils/styleCommand";
import { ActionNav } from "../components/ActionNav";
import { FrenchSpellcheckTooltip } from "../components/FrenchSpellcheckTooltip";
import { ToSpecifyPopover } from "../components/ToSpecifyPopover";
import { decorateToSpecify } from "../utils/toSpecify";
import { generatedPrescriptions } from "../utils/questionnaireGeneration";
import { chapterSuggestionLabels } from "../utils/assistantSuggestions";
import {
  renumberChapterHtml,
  renumberChapterText,
} from "../utils/chapterNumbering";

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Phrases à trous des « petites modifications » : les passages entre crochets sont à remplacer avant l'envoi
const PRESET_TEMPLATES = {
  ajouter: "Ajoute « [règle à ajouter] » à l’endroit suivant : « [endroit du CCTP à copier-coller ici] ».",
  reformuler: "Reformule le passage suivant : « [passage à reformuler, à copier-coller ici] », en gardant son sens et toutes ses informations.",
  preciser: "Précise « [exigence à préciser] » à l’endroit suivant : « [endroit du CCTP à copier-coller ici] ».",
  contractualiser: "Rends contractuelle la rédaction du passage suivant : « [passage à contractualiser, à copier-coller ici] ».",
};
const PLACEHOLDER_PATTERN = /\[(?:règle à ajouter|endroit du CCTP à copier-coller ici|passage à reformuler, à copier-coller ici|exigence à préciser|passage à contractualiser, à copier-coller ici)\]/;
const hasPresetPlaceholder = (text) => PLACEHOLDER_PATTERN.test(text || "");
// demande de mise en forme pure (« formatage de meilleure qualité », « mets en forme », « mise en page ») : traitée par la mise en forme automatique, pas par la rédaction
const FORMAT_REQUEST = /\b((re)?formatt?(age|ages|er|e|es|ez|ons)|mise?\s+en\s+(forme|page)|mets?\s+(le\s+|ce\s+|cette\s+)?\w*\s*en\s+(forme|page)|met(tre)?\s+en\s+(forme|page)|typographi\w*)\b/i;
const isProjectQuestion = (id) => /^Q-(?:P|R)\d+$/.test(id);
const textToHtml = (value) =>
  value
    ? value
        .split("\n")
        .map((line) =>
          line ? `<div>${escapeHtml(line)}</div>` : "<div><br></div>",
        )
        .join("")
    : "";
const cleanInternalReferences = (value) =>
  value
    .replace(/\s*\([^()]*(?:réponse|question)\s+Q-[A-Z0-9-]+[^()]*\)/gi, "")
    .replace(
      /\s+(?:comme\s+)?(?:spécifié(?:e)?|indiqué(?:e)?|décrit(?:e)?|défini(?:e)?)\s+par\s+(?:la\s+)?réponse\s+Q-[A-Z0-9-]+/gi,
      "",
    )
    .replace(
      /\b(?:la\s+)?réponse\s+Q-[A-Z0-9-]+\b/gi,
      "les informations validées",
    )
    .replace(/\bQ-[A-Z0-9-]+\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1");

// La réponse de l'IA s'affiche directement : on retire l'en-tête d'emplacement (« CCTP — LOT… », « 1.1 GÉNÉRALITÉS », « 1.1.1 Objet… »)
// qui précède le texte, pour ne garder que ce qu'elle apporte.
const answerBody = (content) => {
  const lines = String(content || "").split("\n");
  const isLocation = (line) => {
    const text = line.trim();
    if (!text) return true;
    if (/^CCTP\s*[—–-]/i.test(text)) return true;
    return text.length <= 90 && /^\d+(?:\.\d+)*\.?\s+\S/.test(text) && !/[.;:!?]$/.test(text);
  };
  let start = 0;
  while (start < lines.length && isLocation(lines[start])) start += 1;
  const rest = lines.slice(start).join("\n").trim();
  return rest || String(content || "").trim();
};

export function AssistantPage({
  projectId,
  projectName = "",
  chapter,
  chapterNumber = 1,
  existing,
  onSave,
  onGenerated,
  onBack,
  initialFocus = null,
  userEmail = "",
  pendingClause = null,
  onClauseConsumed,
  onOpenLibrary,
}) {
  const { promptGuides, aiEditPresets } = useCatalog();
  const prompts = {
    [chapter.id]: chapter.assistantPrompt,
    default: chapter.assistantPrompt,
  };
  const initialContent = renumberChapterText(
    existing?.content || "",
    chapterNumber,
  );
  const initialHtml = renumberChapterHtml(
    existing?.html || textToHtml(initialContent),
    chapterNumber,
  );
  const [message, setMessage] = useState(existing?.request || "");
  const [files, setFiles] = useState([]);
  const [generated, setGenerated] = useState(initialContent);
  const [editedHtml, setEditedHtml] = useState(initialHtml);
  const [documentDirty, setDocumentDirty] = useState(false);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true);
  const [listsOpen, setListsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const listsMenuRef = useRef(null);
  const moreMenuRef = useRef(null);
  useEffect(() => {
    if (!listsOpen && !moreOpen) return undefined;
    const close = (event) => {
      if (!listsMenuRef.current?.contains(event.target)) setListsOpen(false);
      if (!moreMenuRef.current?.contains(event.target)) setMoreOpen(false);
    };
    const escape = (event) => { if (event.key === "Escape") { setListsOpen(false); setMoreOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [listsOpen, moreOpen]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  // Demande hors du périmètre de l'assistant : un avis neutre (pas une erreur), la saisie n'est pas reprise.
  const [notice, setNotice] = useState("");
  const chatHistoryRef = useRef(null);
  const mergePersistTimer = useRef(null);
  const [expandedChat, setExpandedChat] = useState({});
  const [gap, setGap] = useState(null); // question « information manquante » en attente de réponse
  const [citations, setCitations] = useState([]); // sources de la base métier (corpus fabricants) retrouvées pour cette rédaction
  const [report, setReport] = useState(null); // compte rendu : données fournies / à préciser
  // « Voir mes réponses » : lignes du chapitre rattachées aux questions qui les ont produites (une liste par version : CCTP / notice)
  const [traces, setTraces] = useState(existing?.questionnaire?.traces || {});
  const [traceListOpen, setTraceListOpen] = useState(false);
  const [ruleOverrides, setRuleOverrides] = useState({});
  const [focusQuestion, setFocusQuestion] = useState(() => (initialFocus ? { ...initialFocus, at: Date.now() } : null));
  useEffect(() => { getRuleOverrides().then(setRuleOverrides).catch(() => {}); }, []);
  // libellés des questions pour la fenêtre « d'où vient ce passage ? » (le manifeste est sinon chargé à l'ouverture du questionnaire)
  useEffect(() => {
    if (Object.values(traces).some((list) => list?.length)) getPlatrerieQuestionnaire(projectId).then((loaded) => setManifest((current) => current || loaded)).catch(() => {});
  }, []);
  const [manifest, setManifest] = useState(null);
  // Un ouvrage n'est jamais deviné à partir des réponses (deux cloisons distinctes seraient
  // sinon fusionnées) : le questionnaire garde un état {project, works} où chaque ouvrage a
  // ses propres réponses. Les anciens brouillons enregistrés avant cette évolution stockaient
  // un unique objet plat ; ils sont migrés ici en un ouvrage unique au premier chargement.
  const [qState, setQState] = useState(() => {
    const legacy = existing?.questionnaire || {};
    if (legacy.state?.works) return legacy.state;
    const flat = legacy.answers || {};
    const project = {};
    const workAnswers = {};
    Object.entries(flat).forEach(([id, value]) => {
      if (isProjectQuestion(id)) project[id] = value;
      else workAnswers[id] = value;
    });
    const works = Object.keys(workAnswers).length
      ? [{ id: "legacy-1", family: "cloison", label: workAnswers["Q-W01"] || "Ouvrage", answers: workAnswers }]
      : [];
    return { project, works };
  });
  const [candidates, setCandidates] = useState(
    existing?.questionnaire?.candidates || [],
  );
  const [docMode, setDocMode] = useState(existing?.questionnaire?.docMode || "cctp");
  // Un même lot peut exister en deux versions (notice descriptive et CCTP détaillé) issues des
  // mêmes réponses : générer l'une ne supprime jamais l'autre. La version affichée est celle de
  // `docMode` ; l'autre est conservée telle quelle dans `variants`.
  // `contentMode` = version réellement affichée ; `docMode` = version visée par le questionnaire.
  const [contentMode, setContentMode] = useState(existing?.contentMode || existing?.questionnaire?.docMode || "cctp");
  const [variants, setVariants] = useState(() => {
    const stored = existing?.variants || {};
    const active = existing?.contentMode || existing?.questionnaire?.docMode || "cctp";
    // Le texte affiché fait foi : il a pu être retouché depuis l'aperçu depuis l'enregistrement.
    if (initialContent?.trim()) return { ...stored, [active]: { content: initialContent, html: initialHtml } };
    return stored;
  });
  const [modeCompareOpen, setModeCompareOpen] = useState(false);
  const [inlinePassage, setInlinePassage] = useState(null);
  const [insertMenu, setInsertMenu] = useState(false), [clauseDrawer, setClauseDrawer] = useState(false), [clauseNode, setClauseNode] = useState(null), [specifyNode, setSpecifyNode] = useState(null), [nextPrompt, setNextPrompt] = useState(""), [proposal, setProposal] = useState(null), [applied, setApplied] = useState(null), [selectionText, setSelectionText] = useState(""), [clausePrompt, setClausePrompt] = useState(""), [selectionParagraphs, setSelectionParagraphs] = useState(0), [questionMode, setQuestionMode] = useState(false), [clauseSection, setClauseSection] = useState("");
  const [plusMenu, setPlusMenu] = useState(false), [changesOpen, setChangesOpen] = useState(false), [newReply, setNewReply] = useState(false);
  const threadRef = useRef(null), stickRef = useRef(true), scrollSaved = useRef(0), areaRef = useRef(null), workbenchRef = useRef(null);
  const [assistantWidth, setAssistantWidth] = useState(() => { try { return Number(localStorage.getItem("calepin.assistant.width")) || 0; } catch { return 0; } });
  // largeur ajustable (minimum / maximum) : poignée à gauche du panneau
  const startResize = (event) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = event.currentTarget.parentElement.offsetWidth;
    const move = (e) => setAssistantWidth(Math.max(380, Math.min(760, Math.round(startWidth + (startX - e.clientX)))));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); setAssistantWidth((width) => { try { localStorage.setItem("calepin.assistant.width", String(width)); } catch { /* préférence facultative */ } return width; }); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };
  const insertMenuRef = useRef(null);
  const [saveClause, setSaveClause] = useState(null), [canPublishClause, setCanPublishClause] = useState(false), [clauseNotice, setClauseNotice] = useState("");
  const openSaveClause = () => {
    const text = (lastRange.current && previewRef.current?.contains(lastRange.current.startContainer) ? lastRange.current.toString() : "").trim();
    getOrganization().then((team) => setCanPublishClause(Boolean(team?.canManageLibrary))).catch(() => {});
    setSaveClause({ text, label: text.slice(0, 60), lotId: chapter.id, sectionType: sectionAtCursor(previewRef.current, lastRange.current) });
  };
  useEffect(() => {
    if (!insertMenu) return undefined;
    const close = (event) => { if (!insertMenuRef.current?.contains(event.target)) setInsertMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [insertMenu]);
  const [editorMenu, setEditorMenu] = useState(false);
  const editorMenuRef = useRef(null);
  useEffect(() => {
    if (!editorMenu) return undefined;
    const close = (event) => { if (!editorMenuRef.current?.contains(event.target)) setEditorMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [editorMenu]);
  const [reviewing, setReviewing] = useState(false);
  const [docPrefillOpen, setDocPrefillOpen] = useState(false);
  // Ref lue à l'enregistrement : le state ne serait à jour qu'au rendu suivant, et un enregistrement juste après une réponse
  // (retour, génération) écrirait un avancement en retard — d'où un pourcentage faux dans la liste des lots.
  const questionnaireProgressRef = useRef(existing?.questionnaire?.progress || null);
  const changeQuestionnaireProgress = useCallback((value) => {
    questionnaireProgressRef.current = value;
  }, []);
  // Rédaction manuelle : la page est éditable dès le départ, sans passer par l'IA.
  const [manualWriting, setManualWriting] = useState(false);
  const [freeTextChosen, setFreeTextChosen] = useState(false);
  const [erased, setErased] = useState(false);
  const [questionnaireChoice, setQuestionnaireChoice] = useState(false);
  const [activity, setActivity] = useState([]);
  const [, setHistoryTick] = useState(0);
  const picker = useRef();
  const lastSubmittedInstruction = useRef(existing?.request || "");
  const previewRef = useRef();
  const lastRange = useRef(null);
  const autosaveRevision = useRef(0);
  const editHistory = useRef({ past: [], future: [], current: initialHtml });
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [startMoreOpen, setStartMoreOpen] = useState(false); // « Autres méthodes » : repartir d'un lot écrit / écrire directement
  const [assistantHidden, setAssistantHidden] = useState(() => { try { return localStorage.getItem("calepin.assistant.hidden") === "1"; } catch { return false; } }); // préférence : le document passe avant l'assistant
  const changeAssistantHidden = (hidden) => { setAssistantHidden(hidden); try { localStorage.setItem("calepin.assistant.hidden", hidden ? "1" : "0"); } catch { /* préférence non enregistrée */ } };
  const [retouchInstruction, setRetouchInstruction] = useState("");
  // Modification d'un lot déjà rédigé : le lot reste visible pendant le travail de l'IA, puis les passages modifiés sont mis en évidence
  const [modifying, setModifying] = useState(false);
  const [pendingMarks, setPendingMarks] = useState(null);
  const [changeInfo, setChangeInfo] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [feedback, setFeedback] = useState({});   // retours 👍 / 👎 déjà donnés, par réponse
  const [projectFiles, setProjectFiles] = useState([]);
  const refreshDocuments = () => {
    // documents du projet (tous lots) : réutilisables par l'écran « Préremplir à partir de vos documents »
    listAttachments(projectId).then(setProjectFiles).catch(() => setProjectFiles([]));
    return listAttachments(projectId, chapter.id)
      .then(setFiles)
      .catch(() => setFiles([]));
  };
  useEffect(() => {
    refreshDocuments();
  }, [projectId, chapter.id]);
  useEffect(() => {
    listChapterMessages(projectId, chapter.id)
      .then(setChatMessages)
      .catch(() => setChatMessages([]));
    getAssistantFeedback(projectId, chapter.id).then((value) => setFeedback(value.items || {})).catch(() => setFeedback({}));
  }, [projectId, chapter.id]);
  useEffect(() => {
    if (reviewing && !manifest)
      getPlatrerieQuestionnaire(projectId)
        .then(setManifest)
        .catch((reason) => setError(reason.message));
  }, [reviewing, manifest, projectId]);
  useEffect(() => {
    if (!pendingMarks) return undefined;
    const frame = requestAnimationFrame(() => {
      const count = markChanges(previewRef.current, pendingMarks);
      setChangeInfo(count ? { count } : null);
      setPendingMarks(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingMarks]);
  useEffect(() => clearMarks, []);
  // texte sélectionné dans le chapitre : seule cible d'une modification demandée à l'assistant (jamais d'élargissement automatique)
  useEffect(() => {
    const onSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !previewRef.current) return;
      if (!previewRef.current.contains(selection.anchorNode) || !previewRef.current.contains(selection.focusNode)) return;
      const raw = selection.toString();
      const text = raw.replace(/\s+/g, " ").trim();
      if (text.length >= 1 && text.length <= 4000) { setSelectionText(text); setSelectionParagraphs(Math.max(1, raw.split(/\n+/).filter((line) => line.trim()).length)); }
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, []);
  const addActivity = (payload) =>
    setActivity((items) => [
      ...items.filter((item) => item.step !== payload.step),
      payload,
    ]);
  // Réponse à une demande hors périmètre : elle s'inscrit dans la conversation du chapitre, sans rien générer.
  const declineOffTopic = async (text) => {
    setNotice(text);
    try {
      const saved = await createChapterMessage(projectId, chapter.id, "assistant", text);
      setChatMessages((items) => [...items, saved]);
    } catch {
      /* l'avis reste affiché même si la conversation n'a pas pu être enregistrée */
    }
  };
  // Le texte complet appartient au document, pas à l'historique du chat. En
  // mémorisant seulement une confirmation courte, les gros lots importés ne
  // dépassent pas la limite des messages et les relances gardent leur contexte
  // grâce au chapitre courant envoyé séparément à l'agent.
  const rememberAssistantAction = async (text) => {
    try {
      const saved = await createChapterMessage(projectId, chapter.id, "assistant", text);
      setChatMessages((items) => [...items, saved]);
    } catch {
      // Une panne d'historique ne doit jamais transformer une génération
      // réussie en erreur ni faire disparaître le résultat du document.
    }
  };
  const analyzeQuestionnaire = async (
    instruction,
    { openDirectly = false, autoApply = true, fromDocuments = false } = {},
  ) => {
    const value = instruction.trim();
    if (!value && !fromDocuments) return;
    if (value) {
      lastSubmittedInstruction.current = value;
      setMessage("");
    }
    setLoading(true);
    setError("");
    setNotice("");
    setActivity([
      {
        step: "start",
        message: fromDocuments
          ? `Lecture de ${files.length} pièce${files.length > 1 ? "s" : ""} (la première lecture d’un plan peut prendre quelques minutes)…`
          : "Préparation de l’analyse locale…",
      },
    ]);
    try {
      const questionnaire = await getPlatrerieQuestionnaire(projectId);
      setManifest(questionnaire);
      const prefill = await streamPrefillPlatrerieQuestionnaire(
        projectId,
        value,
        (event, payload) => {
          if (event === "progress") addActivity(payload);
          if (event === "notice") setNotice((payload.messages || []).join(" "));
        },
      );
      const proposed = (prefill?.candidates || []).map((candidate) => ({
        ...candidate,
        questionId: candidate.questionId || candidate.question_id,
        documentId: candidate.documentId || candidate.document_id || "",
      }));
      setCandidates(proposed);
      if (autoApply) setQState((current) => {
        const project = { ...current.project };
        proposed
          .filter((candidate) => isProjectQuestion(candidate.questionId))
          .forEach((candidate) => {
            if (project[candidate.questionId] === undefined || project[candidate.questionId] === "")
              project[candidate.questionId] = candidate.value;
          });
        // Une suggestion propre à un ouvrage ne peut être pré-remplie que s'il n'y a
        // aucune ambiguïté sur l'ouvrage concerné, c'est-à-dire s'il en existe déjà
        // exactement un ; sinon elle reste simplement affichée une fois l'ouvrage créé.
        let works = current.works;
        if (works.length === 1) {
          const [work] = works;
          const workAnswers = { ...work.answers };
          proposed
            .filter((candidate) => !isProjectQuestion(candidate.questionId))
            .forEach((candidate) => {
              if (workAnswers[candidate.questionId] === undefined || workAnswers[candidate.questionId] === "")
                workAnswers[candidate.questionId] = candidate.value;
            });
          works = [{ ...work, answers: workAnswers }];
        }
        return { project, works };
      });
      setQuestionnaireChoice(!openDirectly);
      if (openDirectly) setReviewing(true);
    } catch (reason) {
      if (reason.offTopic) setNotice(reason.message);
      else {
        if (value) setMessage((current) => current.trim() ? current : value);
        setError(reason.message);
      }
    } finally {
      setLoading(false);
    }
  };
  const openQuestionnaire = async () => {
    if(loading)return;
    // Le parcours questionnaire exploite les pièces jointes comme propositions
    // sourcées à valider. Sans pièce, il s'ouvre simplement vide.
    // projet exemple : le questionnaire est DÉJÀ prérempli depuis le dossier public (provenance par réponse) ; aucune analyse automatique des pièces
    const prefilled = Object.values(qState?.provenance || {}).some((scope) => Object.values(scope || {}).some((item) => item?.level));
    if (files.length && !prefilled) {
      await analyzeQuestionnaire("", {
        openDirectly: true,
        // Les informations extraites d'un plan restent des propositions
        // sourcées : l'utilisateur doit les valider avant qu'elles modifient
        // le questionnaire.
        autoApply: false,
        fromDocuments: true,
      });
      return;
    }
    setLoading(true);setError('');
    try {
      if(!manifest)setManifest(await getPlatrerieQuestionnaire(projectId));
      setQuestionnaireChoice(false);setReviewing(true);
    } catch(reason) {setError(reason.message)}
    finally {setLoading(false)}
  };
  // Arrivée depuis « Modifier ma réponse » dans l'aperçu du document : le questionnaire s'ouvre directement sur la question
  useEffect(() => { if (initialFocus) openQuestionnaire(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const generateDirectly = async () => {
    const userMessage = message.trim();
    if (!userMessage || loading) return;
    lastSubmittedInstruction.current = userMessage;
    setMessage("");
    setGap(null);
    setReport(null);
    await runDirect(userMessage, directInstruction(userMessage), { answers: {}, skipped: [], stopAsking: false }, true);
  };
  const directInstruction = (userMessage) =>
    `Réponds à la demande de l'utilisateur en rédigeant le chapitre Plâtrerie – Isolation du CCTP à partir de ses réponses, des documents joints et des extraits fabricants : prescriptions structurées (objet, matériaux et systèmes, performances, mise en œuvre, coordination, contrôles). Ne te limite à une liste de points à préciser que si l'utilisateur la demande explicitement. N'invente aucune composition, épaisseur, performance acoustique ou thermique, classement feu, norme, matériau, cote ou coordination absent des documents ; si une information n'est pas fournie, n'écris pas la phrase et n'écris jamais « [À PRÉCISER] » : la partie correspondante est simplement omise.\n\nDEMANDE :\n${userMessage}`;
  // Rédaction d'un nouveau texte : si une donnée utile manque, le graphe s'arrête et la demande à l'utilisateur (une question à la fois)
  // au lieu de l'inventer ; chaque réponse (ou « passer ») relance la boucle avec ce qui est déjà connu.
  const runDirect = async (userMessage, instruction, ask, first) => {
    setLoading(true);
    setError("");
    setNotice("");
    setGenerated("");
    setEditedHtml("");
    setActivity([{ step: "start", message: first ? "Lecture de votre demande et des documents joints…" : "Prise en compte de votre réponse…" }]);
    let pending = null;
    let reportData = null;
    setCitations([]);
    try {
      if (first) {
        const savedUser = await createChapterMessage(projectId, chapter.id, "user", userMessage);
        commitUser(savedUser);
      }
      const result = await streamGenerateChapter(
        projectId,
        chapter.id,
        instruction,
        "",
        (event, payload) => {
          if (event === "progress") addActivity(payload);
          if (event === "notice") setNotice((payload.messages || []).join(" "));
          if (event === "question") pending = payload.question;
          if (event === "report") {
            reportData = payload;
            setReport(payload);
          }
          if (event === "sources") setCitations(payload.corpus || []);
          if (event === "token")
            setGenerated((text) => cleanInternalReferences(text + payload.text));
        },
        { interactive: true, answers: ask.answers, skipped: ask.skipped, stopAsking: ask.stopAsking },
      );
      if (pending) {
        setGap({ question: pending, ask, userMessage, instruction });
        return;
      }
      applyToQuestionnaire(reportData?.provided || []);
      if (result?.citationsUsed) setCitations((items) => items.map((item) => ({ ...item, cited: result.citationsUsed.includes(item.ref) })));
      const finalContent = renumberChapterText(
        cleanInternalReferences(result?.content || ""),
        chapterNumber,
      );
      if (!finalContent) throw new Error("L’IA n’a retourné aucun contenu.");
      setGenerated(finalContent);
      setEditedHtml(textToHtml(finalContent));
      setDocumentDirty(true);
      await rememberAssistantAction("La proposition a été rédigée et placée dans le chapitre.");
      addActivity({ step: "ready", message: "Proposition prête dans le chapitre." });
      const note = reportMessage(reportData);
      if (note) {
        try {
          const savedNote = await createChapterMessage(projectId, chapter.id, "assistant", note);
          setChatMessages((items) => [...items, savedNote]);
        } catch {
          /* le compte rendu reste affiché même s'il n'a pas pu être enregistré dans la conversation */
        }
      }
    } catch (reason) {
      setGenerated("");
      setEditedHtml("");
      if (reason.offTopic) await declineOffTopic(reason.message);
      else {
        setMessage((current) => current.trim() ? current : userMessage);
        setError(reason.message);
      }
    } finally {
      setLoading(false);
    }
  };
  // Ce que l'utilisateur a dit (message, documents, réponses aux questions) est rattaché à ses questions du questionnaire :
  // les réponses vides sont remplies, jamais écrasées ; les réponses propres à un ouvrage ne sont posées que s'il y a un seul ouvrage
  // (ou aucun : un ouvrage est alors créé), comme pour le préremplissage depuis les documents.
  const applyToQuestionnaire = (provided) => {
    const items = (provided || []).filter((item) => item.id && String(item.value || "").trim());
    if (!items.length) return;
    setQState((current) => {
      const project = { ...current.project };
      let works = current.works;
      items.filter((item) => isProjectQuestion(item.id)).forEach((item) => {
        if (project[item.id] === undefined || project[item.id] === "") project[item.id] = item.value;
      });
      const workItems = items.filter((item) => !isProjectQuestion(item.id));
      if (workItems.length && works.length <= 1) {
        const base = works[0] || { id: crypto.randomUUID(), family: "cloison", label: "Ouvrage demandé", answers: { "Q-W01": "Ouvrage demandé" } };
        const answers = { ...base.answers };
        workItems.forEach((item) => {
          if (answers[item.id] === undefined || answers[item.id] === "") answers[item.id] = item.value;
        });
        works = [{ ...base, answers }];
      }
      return { project, works };
    });
    setDocumentDirty(true);
  };
  // Petites modifications : une phrase à trous, à compléter sur place (le premier trou est sélectionné, on tape par-dessus)
  const fillPreset = (preset) => {
    const template = PRESET_TEMPLATES[preset.id] || preset.instruction;
    setRetouchInstruction(template);
    requestAnimationFrame(() => {
      const area = document.querySelector(".retouch-composer textarea");
      if (!area) return;
      area.focus();
      const start = template.search(PLACEHOLDER_PATTERN);
      if (start >= 0) area.setSelectionRange(start, start + template.slice(start).match(PLACEHOLDER_PATTERN)[0].length);
    });
  };
  const answerGap = (patch) => {
    const current = gap;
    if (!current) return;
    setGap(null);
    runDirect(current.userMessage, current.instruction, patch(current.ask, current.question), false);
  };
  const analyze = generateDirectly;
  // Une modification n'est jamais appliquée directement : elle est d'abord proposée (avant / après), le chapitre reste inchangé jusqu'à « Appliquer ».
  const applyContent = (finalContent, html) => {
    setGenerated(finalContent);
    setEditedHtml(html ?? textToHtml(finalContent));
    setDocumentDirty(true);
  };
  const applyProposal = async () => {
    if (!proposal) return;
    const squash = (value) => String(value || "").replace(/\s+/g, " ").trim();
    if (squash(previewRef.current?.innerText || generated) !== squash(proposal.before)) {
      // le texte a été modifié à la main depuis la génération : on n'écrase rien, on propose de régénérer à partir du texte actuel
      setProposal({ ...proposal, stale: true });
      return;
    }
    const { after, before, beforeHtml, id } = proposal;
    applyContent(after);
    setPendingMarks(changedLines(before, after));
    setApplied({ id, before, beforeHtml, after });
    setProposal(null);
    setSelectionText("");
    await rememberAssistantAction(`La modification demandée a été appliquée au chapitre (réf. ${id}).`);
    addActivity({ step: "ready", message: "Modification appliquée dans le document." });
  };
  const SELECTION_ACTIONS = {
    reformuler: "Reformule la sélection en gardant son sens et toutes ses informations.",
    preciser: "Précise la sélection en la rendant plus explicite, sans ajouter d’information technique.",
    contractualiser: "Contractualise la sélection sans changer aucune performance ni aucune valeur.",
  };
  // ce que l'utilisateur voit dans le fil : une phrase naturelle, jamais le vocabulaire interne de sélection
  const SHOWN_ACTIONS = { reformuler: "Reformule ce passage.", preciser: "Précise ce passage.", contractualiser: "Rends ce passage plus contractuel." };
  const presetAction = (preset) => {
    setQuestionMode(false);
    if (selectionText && SELECTION_ACTIONS[preset.id]) retouch(SELECTION_ACTIONS[preset.id], SHOWN_ACTIONS[preset.id]);
    else fillPreset(preset);
  };
  const askTechnicalQuestion = () => {
    setQuestionMode(true);
    setRetouchInstruction("");
    requestAnimationFrame(() => document.querySelector(".retouch-composer textarea")?.focus());
  };
  const cancelProposal = () => { setProposal(null); addActivity({ step: "ready", message: "Proposition annulée : le chapitre n’a pas été modifié." }); };
  const retryProposal = () => { const text = proposal?.userMessage || ""; setProposal(null); if (text) retouch(text); };
  const undoApplied = async () => {
    if (!applied) return;
    clearMarks();
    applyContent(applied.before, applied.beforeHtml);
    if (previewRef.current && applied.beforeHtml) previewRef.current.innerHTML = applied.beforeHtml;
    await rememberAssistantAction(`La modification (réf. ${applied.id}) a été annulée : le texte précédent est rétabli.`);
    setApplied(null);
  };
  const styleTargetRef = useRef(null);
  // ── requête figée (AI-CHAT-UX-03) : dès l'envoi, la demande devient un message du fil (non éditable) et le champ est vidé ──
  const pendingUserRef = useRef(null);
  const [workLabel, setWorkLabel] = useState("");
  const commitUser = (saved) => setChatMessages((items) => {
    const id = pendingUserRef.current;
    pendingUserRef.current = null;
    return id && items.some((item) => item.id === id) ? items.map((item) => (item.id === id ? saved : item)) : [...items, saved];
  });
  const dropPendingUser = () => {
    const id = pendingUserRef.current;
    pendingUserRef.current = null;
    if (id) setChatMessages((items) => items.filter((item) => item.id !== id));
  };
  // ── actions de l'assistant et leurs cibles (AI-ACTION-NAV-01) : un résultat par réponse, identifiants de bloc stables (data-block-id) ──
  const actionsKey = `ai-actions:${projectId}:${chapter.id}`;
  const [actionResults, setActionResults] = useState(() => { try { return JSON.parse(sessionStorage.getItem(actionsKey) || "{}"); } catch { return {}; } });
  const storeActionResults = (updater) => setActionResults((current) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    try { sessionStorage.setItem(actionsKey, JSON.stringify(next)); } catch { /* stockage indisponible : la navigation reste valable pendant la session */ }
    return next;
  });
  const sectionOf = (root, block, minDepth) => {
    for (let node = block.previousElementSibling; node; node = node.previousElementSibling) {
      const text = (node.innerText || "").trim();
      if (text && blockKind(text, minDepth) === "title") return text.slice(0, 80);
    }
    return "Début du chapitre";
  };
  /** Construit le résultat d'une action : cibles = blocs réellement modifiés, avec un identifiant stable posé dans le document. */
  const buildActionResult = (messageId, results, root) => {
    const minDepth = docMinDepth(root);
    const seen = new Set();
    const targets = [];
    results.forEach(({ command, blocks = [] }) => blocks.forEach((block) => {
      if (!block.getAttribute("data-block-id")) block.setAttribute("data-block-id", `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
      const blockId = block.getAttribute("data-block-id");
      if (seen.has(blockId)) return;
      seen.add(blockId);
      targets.push({ target_type: "CCTP_BLOCK", target_id: blockId, section: sectionOf(root, block, minDepth), change_type: Object.keys(command.props || {}).join("+") });
    }));
    const total = results.reduce((sum, item) => sum + (item.count || 0), 0);
    const missed = results.filter((item) => !item.count).length;
    return {
      action_id: `AR-${Date.now().toString(36).slice(-6).toUpperCase()}`, message_id: messageId, chapter_id: chapter.id, action_type: "STYLE",
      status: !total ? "FAILURE" : missed ? "PARTIAL_SUCCESS" : "SUCCESS", affected_count: total, affected_targets: targets, created_at: new Date().toISOString(),
      undone: false, html_after: root.innerHTML,
    };
  };
  const flashBlock = (node) => {
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    node.classList.add("ai-flash");
    setTimeout(() => node.classList.remove("ai-flash"), 3200);
  };
  /** Navigue vers la zone modifiée : défile jusqu'au bloc (par identifiant stable) et le met en évidence ; renvoie false si la zone n'existe plus. */
  const goToTarget = (blockId) => {
    const node = previewRef.current?.querySelector(`[data-block-id="${blockId}"]`);
    if (!node) return false;
    flashBlock(node);
    return true;
  };
  const undoAction = (messageId) => {
    const result = actionResults[messageId];
    if (!result || result.undone) return;
    const history = editHistory.current;
    if (history.current !== result.html_after) return; // le document a changé depuis : on n'écrase rien
    travelHistory("undo");
    storeActionResults((current) => ({ ...current, [messageId]: { ...current[messageId], undone: true } }));
  };
  const retouch = async (override, shown) => {
    const typedOriginal = typeof override === "string" ? override : retouchInstruction;
    if (!typedOriginal.trim() || loading || hasPresetPlaceholder(typedOriginal)) return;
    setProposal(null);
    setApplied(null);
    setClausePrompt("");
    // la demande quitte immédiatement le champ de saisie et devient un message du fil, non éditable ; l'état de traitement s'affiche dessous
    const pendingId = `pending-${Date.now().toString(36)}`;
    pendingUserRef.current = pendingId;
    setChatMessages((items) => [...items, { id: pendingId, role: "user", content: (shown || typedOriginal).trim(), pending: true }]);
    setRetouchInstruction("");
    setWorkLabel("Calepin prépare la réponse…");
    // mémoire de la conversation : la demande est d'abord rendue AUTONOME (« à gauche » → « Aligne les titres à gauche »), quel que soit son objet ; tout le reste du traitement (style, mise en forme, rédaction, questions) part de la version autonome
    let typed = typedOriginal;
    const hasPreview = Boolean(previewRef.current?.innerText?.trim());
    const observe = (route) => observeIntent(projectId, chapter.id, typedOriginal, route); // observation du classifieur appris : à côté des règles, sans effet sur la réponse
    const rulesAlone = parseStyleCommand(typedOriginal);
    const evident = hasPreview && isEvidentStyle(typedOriginal, rulesAlone); // voie rapide : phrase autonome et sans ambiguïté, aucun appel au modèle
    const styleCandidate = hasPreview && (evident || STYLE_LEXICON.test(typedOriginal));
    const resolveContext = async () => {
      if (!chatMessages.length) return;
      setLoading(true);
      setActivity([{ step: "memory", message: "Compréhension de votre demande dans la conversation…" }]);
      try {
        const understood = await contextualizeRequest(projectId, chapter.id, typedOriginal.trim());
        if (understood?.rewritten && understood.text) { typed = understood.text; shown = shown || typedOriginal.trim(); }
      } catch { /* mémoire indisponible : la demande est traitée telle quelle */ }
      setLoading(false);
    };
    if (!styleCandidate) await resolveContext();
    // la consigne de style précédente (dernier message de l'utilisateur) donne la cible d'un suivi court (« en bleu »)
    let previousTarget = null;
    for (const item of [...chatMessages].reverse().filter((message) => message.role === "user")) {
      const own = parseStyleCommand(item.content);
      if (own) { previousTarget = own.target; break; }
      if (!parseStyleCommand(item.content, "titles")) break; // le message précédent n'était pas une consigne de style : pas de suivi
    }
    previousTarget = previousTarget || styleTargetRef.current;
    if (previousTarget === "passage") previousTarget = null; // un passage cité n'est pas un contexte de relance (« en bleu » ne retrouverait pas ce passage)
    const rulesStyle = parseStyleCommand(typedOriginal, previousTarget);
    if (styleCandidate) {
      // consigne d'apparence : le modèle local la TRADUIT en commande structurée (avec le contexte de la conversation) ; les règles ne servent que de secours s'il est indisponible.
      // L'éditeur applique la commande validée à l'affichage : le texte du chapitre n'est jamais envoyé au modèle ni modifié.
      const userMessage = typed.trim();
      setLoading(true);
      setError("");
      setWorkLabel("Calepin prépare la modification…");
      setActivity([{ step: "style", message: "Compréhension de votre consigne…" }]);
      let style = null;
      let notStyle = false;
      let degraded = false; // modèle indisponible : repli honnête, jamais silencieux
      try {
        if (evident) {
          style = { commands: [{ target: rulesAlone.target, props: rulesAlone.props, ...(rulesAlone.passage ? { passage: rulesAlone.passage } : {}) }], recognized: true };
        } else {
          // UN seul appel : le serveur lit lui-même la conversation (derniers échanges + échanges anciens pertinents) et produit la ou les commandes
          const answer = await interpretStyle(projectId, chapter.id, userMessage, [], previousTarget);
          if (answer?.is_style && answer.commands?.length) style = { commands: answer.commands, recognized: true };
          else notStyle = true;
        }
      } catch {
        // modèle indisponible ou trop lent : les règles ne gèrent qu'un seul ordre simple ; une consigne à plusieurs ordres est refusée plutôt qu'exécutée à moitié
        degraded = true;
        style = rulesStyle && !isCompoundStyle(typed) ? { commands: [{ target: rulesStyle.target, props: rulesStyle.props, ...(rulesStyle.passage ? { passage: rulesStyle.passage } : {}) }], recognized: rulesStyle.recognized } : null;
        notStyle = !rulesStyle && !isCompoundStyle(typed); // rien de reconnu comme apparence : circuit normal
      }
      if (!style && notStyle) {
        setLoading(false); // ce n'est pas une consigne d'apparence : circuit normal (question technique, rédaction…), avec la compréhension de la conversation
        await resolveContext();
      } else {
        observe("style");
        setRetouchInstruction("");
        try {
          const savedUser = await createChapterMessage(projectId, chapter.id, "user", shown || userMessage);
          commitUser(savedUser);
          const root = previewRef.current;
          let reply = degraded ? MODEL_DOWN : STYLE_HELP;
          let styleResults = null;
          if (style?.recognized) {
            setWorkLabel("Calepin applique la modification…");
            styleResults = applyStyleCommands(root, style.commands);
            if (styleResults.some((item) => item.count)) recordEdit(root.innerHTML, root.innerText.trim());
            styleTargetRef.current = style.commands[style.commands.length - 1].target;
            // le résultat réel d'abord ; le mode d'interprétation est un détail technique (journal), jamais une phrase du chat
            if (degraded) console.debug("[assistant] interprétation simplifiée : service d'interprétation indisponible, règles locales appliquées");
            reply = describeStyles(styleResults);
          }
          const savedReply = await createChapterMessage(projectId, chapter.id, "assistant", reply);
          setChatMessages((items) => [...items, savedReply]);
          if (styleResults) storeActionResults((current) => ({ ...current, [savedReply.id]: { ...buildActionResult(savedReply.id, styleResults, root), html_after: root.innerHTML } }));
        } catch (reason) {
          setError(reason.message);
        } finally {
          setLoading(false);
        }
        return;
      }
    }
    if (FORMAT_REQUEST.test(typed) && previewRef.current?.innerText?.trim()) {
      // demande de mise en forme (« formatage de meilleure qualité ») : règles de mise en forme automatique appliquées au texte affiché, quel que soit l'état interne du chapitre ; le fond ne change jamais
      observe("format");
      const userMessage = typed.trim();
      setRetouchInstruction("");
      setError("");
      setLoading(true);
      try {
        const savedUser = await createChapterMessage(projectId, chapter.id, "user", shown || userMessage);
        commitUser(savedUser);
        const outcome = await formatDocument(true);
        if (outcome) {
          const savedFormat = await createChapterMessage(projectId, chapter.id, "assistant", `${outcome}\n\nCette mise en forme corrige espaces, unités, ponctuation, puces, titres et doublons sans toucher au contenu. Pour reformuler le texte lui-même, dites par exemple : « Reformule la rubrique 1.1 de façon plus formelle ».`);
          setChatMessages((items) => [...items, savedFormat]);
        }
      } catch (reason) {
        setError(reason.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (isUnsupportedLayout(typed) && previewRef.current?.innerText?.trim()) {
      // mise en page que l'éditeur ne sait pas faire (interligne, marges, en-tête…) : réponse honnête, jamais de recherche dans le corpus ni de réécriture du texte
      observe("layout_unsupported");
      setRetouchInstruction("");
      setError("");
      setLoading(true);
      try {
        const savedUser = await createChapterMessage(projectId, chapter.id, "user", shown || typed.trim());
        commitUser(savedUser);
        const savedReply = await createChapterMessage(projectId, chapter.id, "assistant", UNSUPPORTED_LAYOUT);
        setChatMessages((items) => [...items, savedReply]);
      } catch (reason) {
        setError(reason.message);
      } finally {
        setLoading(false);
      }
      return;
    }
    observe("other"); // ni style, ni mise en forme, ni mise en page non gérée : circuit de rédaction / questions
    if (!generated.trim()) {
      // chapitre encore vide : il n'y a rien à retoucher, la demande est une rédaction (questions manquantes, sources, citations)
      const userMessage = typed.trim();
      lastSubmittedInstruction.current = userMessage;
      setRetouchInstruction("");
      setGap(null);
      setReport(null);
      await runDirect(userMessage, directInstruction(userMessage), { answers: {}, skipped: [], stopAsking: false }, true);
      return;
    }
    const source = previewRef.current?.innerText?.trim() || generated;
    const sourceHtml = previewRef.current?.innerHTML || editedHtml;
    const userMessage = typed.trim();
    lastSubmittedInstruction.current = userMessage;
    const selection = selectionText && source.replace(/\s+/g, " ").includes(selectionText.replace(/\s+/g, " ").trim()) ? selectionText : "";
    setRetouchInstruction("");
    setNextPrompt("");
    setCitations([]);
    const scopedInstruction = `Modifie uniquement le chapitre existant selon la demande ci-dessous. Conserve strictement tout ce qui n'est pas concerné, ainsi que la structure et les informations déjà présentes. Ne repars pas du questionnaire, n'invente aucune donnée et ne mentionne jamais de référence interne Q-*. Retourne le chapitre complet modifié, sans commentaire.\n\nMODIFICATION DEMANDÉE :\n${userMessage}`;
    setLoading(true);
    setError("");
    setNotice("");
    setActivity([
      {
        step: "start",
        message: "Lecture de la conversation et du chapitre actuel…",
      },
    ]);
    // Le lot déjà écrit reste affiché tel quel pendant le travail de l'IA (rien ne disparaît).
    clearMarks();
    setChangeInfo(null);
    setModifying(true);
    try {
      const savedUser = await createChapterMessage(
        projectId,
        chapter.id,
        "user",
        shown || userMessage,
      );
      commitUser(savedUser);
      const result = await streamGenerateChapter(
        projectId,
        chapter.id,
        scopedInstruction,
        source,
        (event, payload) => {
          if (event === "progress") addActivity(payload);
          if (event === "notice") setNotice((payload.messages || []).join(" "));
          if (event === "sources") setCitations(payload.corpus || []);
        },
        { ...(selection ? { selection } : {}) },
      );
      if (result?.advice) {
        // Question (technique, documentaire ou d'aide) : la réponse s'affiche dans la conversation, le chapitre reste exactement tel qu'il est
        const savedAdvice = await createChapterMessage(projectId, chapter.id, "assistant", result.advice);
        setChatMessages((items) => [...items, savedAdvice]);
        const isQuestion = result.kind === "TECHNICAL_QA" || result.kind === "DOCUMENT_QA";
        addActivity({ step: "ready", message: isQuestion ? "Réponse dans la conversation : le chapitre n’a pas été modifié." : "Réponse dans la conversation : le chapitre n’a pas été modifié." });
        // Une réponse informative ne devient jamais automatiquement une
        // exigence du projet. Le résolveur déterministe décidera si un CTA a
        // réellement du sens pour la demande et la sélection courantes.
        setClausePrompt("");
        setNextPrompt(result.nextPrompt || "");
        return;
      }
      const finalContent = renumberChapterText(
        cleanInternalReferences(result?.content || ""),
        chapterNumber,
      );
      if (!finalContent) throw new Error("L’IA n’a retourné aucun contenu.");
      const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
      if (norm(finalContent) === norm(source)) {
        addActivity({ step: "ready", message: "Aucune modification n’était nécessaire : le chapitre est inchangé." });
        setNextPrompt(result?.nextPrompt || "");
        return;
      }
      // proposition : avant / après, le chapitre n'est pas touché tant que l'utilisateur n'a pas cliqué sur « Appliquer »
      // la réponse est un message Assistant ordinaire (conservé dans le fil) ; Appliquer / Réessayer / Voir les modifications y sont attachés
      const added = diffRows(source, finalContent).filter((row) => row.type === "add").map((row) => row.text);
      const replyText = added.length ? added.join("\n") : "J’ai retiré ou réorganisé ce passage.";
      const savedReply = await createChapterMessage(projectId, chapter.id, "assistant", replyText);
      setChatMessages((items) => [...items, savedReply]);
      setChangesOpen(false);
      setProposal({ id: `AE-${Date.now().toString(36).slice(-5).toUpperCase()}`, before: source, beforeHtml: sourceHtml, after: finalContent, userMessage, selection, messageId: savedReply.id });
      addActivity({ step: "ready", message: "Réponse prête dans la conversation." });
      setNextPrompt(result?.nextPrompt || "");
    } catch (reason) {
      // échec : le lot n'a jamais quitté l'écran, rien à restaurer
      if (reason.offTopic) await declineOffTopic(reason.message);
      else {
        dropPendingUser();
        setRetouchInstruction((current) => current.trim() ? current : userMessage);
        setError(reason.message);
      }
    } finally {
      setModifying(false);
      setLoading(false);
    }
  };
  const generateFromQuestionnaire = async (modeArg, manifestArg, stayHere = false) => {
    const mode = typeof modeArg === "string" ? modeArg : docMode;
    const questionnaireManifest = manifestArg || manifest;
    if (!questionnaireManifest) return;
    // Photographie de la version affichée avant que la génération ne vide la page.
    const snapshotContent = previewRef.current?.innerText?.trim() || generated;
    const snapshotHtml = previewRef.current?.innerHTML || editedHtml;
    const baseVariants = snapshotContent
      ? { ...variants, [contentMode]: { content: snapshotContent, html: snapshotHtml } }
      : variants;
    setLoading(true);
    setError("");
    setNotice("");
    setGenerated("");
    setEditedHtml("");
    setDocumentDirty(false);
    setActivity([{ step: "start", message: "Préparation de la rédaction…" }]);
    setReviewing(false);
    try {
      const labels = Object.fromEntries(
        questionnaireManifest.questions.map((question) => [question.id, question.label]),
      );
      const lineFor = (id, value) =>
        `${id} — ${labels[id] || id} : ${Array.isArray(value) ? value.join(" ; ") : value}`;
      const answeredLines = (answersObject) =>
        Object.entries(answersObject)
          .filter(([, value]) => value !== "" && value != null)
          .map(([id, value]) => lineFor(id, value));
      // Chaque ouvrage est délimité par un marqueur explicite : le serveur ne doit jamais
      // deviner les ouvrages à partir des questions renseignées, sous peine de fusionner
      // deux ouvrages distincts de la même famille (ex. deux cloisons différentes).
      const source = [
        `###MODE ${mode}`,
        // règles métier personnalisées de l'utilisateur : elles remplacent la phrase produite pour la question concernée
        ...(Object.keys(ruleOverrides).length ? [`###RULES ${JSON.stringify(ruleOverrides)}`] : []),
        ...answeredLines(qState.project),
        ...generatedPrescriptions(qState.project, questionnaireManifest.questions),
        ...qState.works.map((work) =>
          [
            `###OUVRAGE id=${work.id} family=${work.family} label=${work.answers["Q-W01"] || work.label}`,
            ...answeredLines(work.answers),
            ...generatedPrescriptions(work.answers, questionnaireManifest.questions),
          ].join("\n"),
        ),
      ].join("\n");
      const result = await streamGenerateChapter(
        projectId,
        chapter.id,
        "Rédigez le chapitre Plâtrerie à partir des réponses au questionnaire validées par le maître d’œuvre. Ne complétez aucune donnée manquante.",
        source,
        (event, payload) => {
          if (event === "progress") addActivity(payload);
          if (event === "notice") setNotice((payload.messages || []).join(" "));
          if (event === "token")
            setGenerated((text) =>
              renumberChapterText(text + payload.text, chapterNumber),
            );
        },
      );
      const finalContent = renumberChapterText(
        result?.content || "",
        chapterNumber,
      );
      if (!finalContent) throw new Error("L’IA n’a retourné aucun contenu.");
      const finalHtml = textToHtml(finalContent);
      setGenerated(finalContent);
      setEditedHtml(finalHtml);
      addActivity({
        step: "save",
        message: "Insertion du chapitre dans le CCTP…",
      });
      const nextVariants = { ...baseVariants, [mode]: { content: finalContent, html: finalHtml } };
      const nextTraces = { ...traces, [mode]: Array.isArray(result?.trace) ? result.trace : [] };
      setTraces(nextTraces);
      setVariants(nextVariants);
      setDocMode(mode);
      setContentMode(mode);
      // Passer de « CCTP » à « Notice » (ou inversement) laisse sur la rédaction du lot ; seule la 1re génération ouvre l'aperçu
      if (stayHere) {
        if (previewRef.current) previewRef.current.innerHTML = finalHtml;
        editHistory.current = { past: [], future: [], current: finalHtml };
        setGenerated(finalContent);
        setEditedHtml(finalHtml);
        setDocumentDirty(false);
        await onSave(sectionPayload(finalContent, finalHtml, { docMode: mode, contentMode: mode, variants: nextVariants, traces: nextTraces }), { stay: true });
      } else await (onGenerated || onSave)(sectionPayload(finalContent, finalHtml, { docMode: mode, contentMode: mode, variants: nextVariants, traces: nextTraces }));
    } catch (reason) {
      // Rien ne doit être perdu : on restaure la version qui était affichée.
      if (snapshotContent) {
        setGenerated(snapshotContent);
        setEditedHtml(snapshotHtml);
      }
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  };
  const canConvert = qState.works.length > 0;
  const switchMode = async (target) => {
    if (target === contentMode || loading) return;
    const content = previewRef.current?.innerText?.trim() || generated;
    const html = previewRef.current?.innerHTML || editedHtml;
    const saved = content ? { ...variants, [contentMode]: { content, html } } : variants;
    const next = saved[target];
    if (!next) {
      if (!canConvert) return;
      setError("");
    setNotice("");
      try {
        const questionnaire = manifest || (await getPlatrerieQuestionnaire(projectId));
        setManifest(questionnaire);
        await generateFromQuestionnaire(target, questionnaire, true);
      } catch (reason) {
        setError(reason.message);
      }
      return;
    }
    const nextHtml = next.html || textToHtml(next.content);
    setVariants(saved);
    setDocMode(target);
    setContentMode(target);
    if (previewRef.current) previewRef.current.innerHTML = nextHtml;
    editHistory.current = { past: [], future: [], current: nextHtml };
    setGenerated(next.content);
    setEditedHtml(nextHtml);
    setDocumentDirty(false);
    try {
      await onSave(sectionPayload(next.content, nextHtml, { docMode: target, contentMode: target, variants: saved }), { stay: true });
    } catch (reason) {
      setError(`Enregistrement impossible : ${reason.message}`);
    }
  };
  const uploadFiles = async (selectedFiles) => {
    if (!selectedFiles.length) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      for (const file of selectedFiles)
        await uploadAttachment(projectId, chapter.id, file, "", "", "ATTACHMENT_TEMPORARY"); // joint de la conversation : lisible par l'assistant, absent des documents du projet tant qu'on ne l'y ajoute pas
      await refreshDocuments();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setUploading(false);
      setDragging(false);
    }
  };
  const addFiles = async (event) => {
    await uploadFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };
  const dropFiles = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    uploadFiles(Array.from(event.dataTransfer.files || []));
  };
  const attachmentDropProps = {
    onDragEnter: (event) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragOver: (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget))
        setDragging(false);
    },
    onDrop: dropFiles,
  };

  // --- Mode « Préremplir à partir de documents » -------------------------------------------------------------------------------------
  // Les réponses proposées vont dans le MÊME état que le questionnaire manuel ; la provenance et les conflits sont conservés à côté.
  const buildDocumentState = (current, { analysis, works, assign }) => {
    const next = { ...current, project: { ...current.project }, works: current.works.map((work) => ({ ...work, answers: { ...work.answers } })), provenance: JSON.parse(JSON.stringify(current.provenance || {})), conflicts: [...(current.conflicts || [])] };
    const idMap = {};
    works.forEach((detected) => {
      const existing = next.works.find((work) => work.id === detected.id) || next.works.find((work) => work.family === detected.family && (work.answers["Q-W01"] || work.label) === detected.label);
      if (existing) { idMap[detected.id] = existing.id; return; }
      const id = next.works.some((work) => work.id === detected.id) ? crypto.randomUUID() : detected.id;
      next.works.push({ id, family: detected.family, label: detected.label, answers: { "Q-W01": detected.label } });
      idMap[detected.id] = id;
    });
    const asText = (value) => (Array.isArray(value) ? value.join(" ; ") : String(value ?? ""));
    const source = (item) => ({ status: item.status, validation: "UNREVIEWED", sourceType: item.sourceType, documentId: item.documentId, documentName: item.documentName, page: item.page, excerpt: item.excerpt, original: item.value });
    let unattachedIndex = -1;
    (analysis.answers || []).forEach((answer) => {
      let target = answer.workId === "project" ? "project" : idMap[answer.workId];
      if (answer.workId === "") { unattachedIndex += 1; const chosen = assign[`${answer.questionId}|${unattachedIndex}`]; target = chosen ? idMap[chosen] : null; }
      if (!target) return;
      const holder = target === "project" ? next.project : next.works.find((work) => work.id === target)?.answers;
      if (!holder) return;
      const existing = holder[answer.questionId];
      if (existing !== undefined && existing !== "" && asText(existing) !== asText(answer.value)) {
        // une réponse déjà saisie ou validée n'est jamais écrasée : le MOE arbitre
        next.conflicts.push({ id: crypto.randomUUID(), questionId: answer.questionId, workId: target, kind: "update", resolved: false,
          candidates: [{ value: existing, documentName: "Votre réponse actuelle" }, { value: answer.value, documentId: answer.documentId, documentName: answer.documentName, page: answer.page, excerpt: answer.excerpt }] });
        return;
      }
      if (existing !== undefined && existing !== "") return;
      holder[answer.questionId] = answer.value;
      next.provenance[target] = { ...(next.provenance[target] || {}), [answer.questionId]: source(answer) };
    });
    (analysis.conflicts || []).forEach((conflict) => {
      const target = conflict.workId === "project" ? "project" : idMap[conflict.workId];
      if (!target) return;
      next.conflicts.push({ id: crypto.randomUUID(), questionId: conflict.questionId, workId: target, kind: "documents", resolved: false, candidates: conflict.candidates });
    });
    return next;
  };
  const documentStatsFor = (works, analysis, assign) => {
    if (!manifest) return null;
    const projected = buildDocumentState(qState, { analysis, works, assign });
    const stats = questionnaireStats(manifest, projected);
    return { found: stats.found, toConfirm: stats.toVerify + stats.verified, missing: stats.missing };
  };
  const applyDocumentPrefill = async (result) => {
    const loaded = manifest || (await getPlatrerieQuestionnaire(projectId));
    setManifest(loaded);
    setQState((current) => buildDocumentState(current, result));
    setDocPrefillOpen(false);
    setQuestionnaireChoice(false);
    setReviewing(true);
  };
  const openDocumentPrefill = async () => {
    if (!manifest) { try { setManifest(await getPlatrerieQuestionnaire(projectId)); } catch { /* l'aperçu des manques sera simplement absent */ } }
    setDocPrefillOpen(true);
  };
  const changeProvenance = (scope, questionId, patch) =>
    setQState((current) => ({ ...current, provenance: { ...(current.provenance || {}), [scope]: { ...((current.provenance || {})[scope] || {}), [questionId]: { ...(((current.provenance || {})[scope] || {})[questionId] || {}), ...patch } } } }));
  const resolveConflict = (conflictId, candidate) =>
    setQState((current) => {
      const conflict = (current.conflicts || []).find((item) => item.id === conflictId);
      if (!conflict) return current;
      const next = { ...current, conflicts: current.conflicts.map((item) => (item.id === conflictId ? { ...item, resolved: true } : item)) };
      const entry = { status: "DOCUMENT_CONFIRMED", validation: "CONFIRMED_BY_USER", documentId: candidate.documentId || "", documentName: candidate.documentName || "Votre réponse", page: candidate.page ?? null, excerpt: candidate.excerpt || "", original: candidate.value };
      if (conflict.workId === "project") next.project = { ...current.project, [conflict.questionId]: candidate.value };
      else next.works = current.works.map((work) => (work.id === conflict.workId ? { ...work, answers: { ...work.answers, [conflict.questionId]: candidate.value } } : work));
      next.provenance = { ...(current.provenance || {}), [conflict.workId]: { ...((current.provenance || {})[conflict.workId] || {}), [conflict.questionId]: entry } };
      return next;
    });
  // une valeur extraite puis modifiée par l'utilisateur garde la valeur d'origine ; saisir une valeur règle aussi un conflit en attente
  const afterAnswerEdit = (current, scope, questionId, value) => {
    const asText = (item) => (Array.isArray(item) ? item.join(" ; ") : String(item ?? ""));
    const entry = (current.provenance || {})[scope]?.[questionId];
    let next = current;
    if (entry && entry.validation !== "EDITED_BY_USER" && asText(value) !== asText(entry.original))
      next = { ...next, provenance: { ...next.provenance, [scope]: { ...next.provenance[scope], [questionId]: { ...entry, validation: "EDITED_BY_USER" } } } };
    if ((next.conflicts || []).some((item) => !item.resolved && item.questionId === questionId && item.workId === scope) && asText(value) !== "")
      next = { ...next, conflicts: next.conflicts.map((item) => (!item.resolved && item.questionId === questionId && item.workId === scope ? { ...item, resolved: true } : item)) };
    return next;
  };
  const removeFile = async (file) => {
    await deleteAttachment(projectId, file.id);
    await refreshDocuments();
  };
  const sectionPayload = (content, html = editedHtml, overrides = {}) => {
    const mode = overrides.contentMode || contentMode;
    const target = overrides.docMode || docMode;
    const base = overrides.variants || variants;
    return {
    request: message || lastSubmittedInstruction.current,
    files: files.map((file) => ({
      name: file.filename,
      size: Math.max(1, Math.round(file.size / 1024)) + " Ko",
    })),
    content,
    html,
    questionnaire: { state: qState, candidates, docMode: target, progress: questionnaireProgressRef.current, traces: overrides.traces || traces },
    contentMode: mode,
    variants: content ? { ...base, [mode]: { content, html } } : base,
    summary: (message || lastSubmittedInstruction.current).slice(0, 92)
      + ((message || lastSubmittedInstruction.current).length > 92 ? "…" : ""),
  };
  };
  const hadContent = useRef(Boolean(initialContent && initialContent.trim()));
  const persistSilently = async (content, html) => {
    const revision = ++autosaveRevision.current;
    try {
      await onSave(sectionPayload(content, html), { stay: true });
      if (revision === autosaveRevision.current) setDocumentDirty(false);
    } catch (reason) {
      if (revision === autosaveRevision.current) {
        setDocumentDirty(true);
        setError(`Enregistrement automatique impossible : ${reason.message}`);
      }
    }
  };
  // Mise en forme automatique (règles, aucun modèle) : espaces, unités, ponctuation, puces, titres, doublons. Le fond ne change jamais ; les blocs à contenu riche (clause insérée, gras…) restent intacts.
  const formatDocument = async (fromChat = false) => {
    const root = previewRef.current;
    setMoreOpen(false);
    if (!root || (loading && !fromChat)) return;
    const blocks = [...root.children];
    const lines = blocks.map((block) => (block.innerText || "").replace(/\n$/, ""));
    const plain = blocks.map((block, index) => ![...block.children].some((child) => child.tagName !== "BR") && !lines[index].includes("\n"));
    try {
      const before = root.innerText.trim();
      const result = await formatChapter(projectId, chapter.id, lines, plain);
      result.entries.forEach((entry, index) => {
        const block = blocks[index];
        if (!block || !plain[index]) return;
        if (entry.text === null) { block.remove(); return; }
        if (entry.text !== lines[index]) block.textContent = entry.text;
      });
      const skipped = plain.filter((value) => !value).length;
      const total = Object.values(result.counts || {}).reduce((sum, value) => sum + value, 0);
      recordEdit(root.innerHTML, root.innerText.trim());
      setPendingMarks(changedLines(before, root.innerText.trim()));
      const message = total ? `Mise en forme : ${total} correction${total > 1 ? "s" : ""}, aucun mot ni chiffre modifié.${skipped ? ` ${skipped} bloc${skipped > 1 ? "s" : ""} à mise en forme riche laissé${skipped > 1 ? "s" : ""} intact${skipped > 1 ? "s" : ""}.` : ""} Annulable (Ctrl+Z).` : "Rien à corriger : le chapitre est déjà bien mis en forme.";
      setNotice(message);
      return message;
    } catch (reason) {
      setError(reason.message);
    }
  };
  // quitter l'éditeur pour la bibliothèque : on enregistre d'abord ce qui est en cours (rien ne se perd)
  const openLibraryFlushed = async (section) => {
    if (previewRef.current) await persistSilently(previewRef.current.innerText?.trim() || generated, previewRef.current.innerHTML || editedHtml);
    onOpenLibrary?.(section);
  };
  useEffect(() => {
    if (!documentDirty || loading || comparisonOpen) return;
    const timer = setTimeout(() => {
      const content = previewRef.current?.innerText?.trim() || generated;
      const html = previewRef.current?.innerHTML || editedHtml;
      // Un chapitre entièrement effacé doit lui aussi être enregistré, mais seulement s'il
      // avait déjà du contenu : on ne crée pas de section vide pour un simple passage.
      if (content) hadContent.current = true;
      const hasQuestionnaireData = qState.works.length > 0 || Object.keys(qState.project).length > 0;
      if (content || hadContent.current || hasQuestionnaireData) persistSilently(content, html);
    }, 800);
    return () => clearTimeout(timer);
  }, [documentDirty, generated, editedHtml, loading, comparisonOpen, qState]);
  const save = () => {
    const content = previewRef.current?.innerText?.trim() || generated;
    const html = previewRef.current?.innerHTML || editedHtml;
    return onSave(sectionPayload(content, html));
  };
  const mergeComparedSection = (merge) => {
    const body = previewRef.current;
    if (!body) return;
    const children = [...body.children];
    const anchor = children.find(
      (node) => merge.anchor && node.innerText.trim() === merge.anchor.trim(),
    );
    let marker = null;
    if (merge.mode === "replace" && anchor) {
      let cursor = anchor;
      while (cursor) {
        const next = cursor.nextElementSibling;
        if (
          cursor !== anchor &&
          /^\d+(?:\.\d+)*(?:[\s.\-–—:]+|$)/.test(cursor.innerText.trim())
        ) {
          marker = cursor;
          break;
        }
        cursor.remove();
        cursor = next;
      }
    } else if (merge.mode === "insertAfter" && anchor)
      marker = anchor.nextElementSibling;
    else if (anchor) {
      let cursor = anchor.nextElementSibling;
      while (cursor) {
        if (/^\d+(?:\.\d+)*(?:[\s.\-–—:]+|$)/.test(cursor.innerText.trim())) {
          marker = cursor;
          break;
        }
        cursor = cursor.nextElementSibling;
      }
    }
    const fragment = document.createDocumentFragment();
    if (merge.heading) {
      const heading = document.createElement("p");
      const strong = document.createElement("strong");
      strong.innerText = merge.heading;
      heading.appendChild(strong);
      fragment.appendChild(heading);
    }
    merge.paragraphs.forEach((text) => {
      const paragraph = document.createElement("p");
      paragraph.innerText = text;
      fragment.appendChild(paragraph);
    });
    if (marker) body.insertBefore(fragment, marker);
    else body.appendChild(fragment);
    const html = body.innerHTML,
      content = body.innerText.trim();
    recordEdit(html, content);
    // Pendant la comparaison, on regroupe les enregistrements (copier-coller en rafale) au lieu d'envoyer tout le chapitre à chaque geste.
    clearTimeout(mergePersistTimer.current);
    mergePersistTimer.current = setTimeout(() => {
      const node = previewRef.current;
      if (node) persistSilently(node.innerText.trim(), node.innerHTML);
    }, 1200);
  };
  const mergeComparedContent = (merge) => {
    if (previewRef.current) return mergeComparedSection(merge);
    const parts = [];
    if (merge.heading)
      parts.push(`<p><strong>${escapeHtml(merge.heading)}</strong></p>`);
    (merge.paragraphs || []).forEach((text) =>
      parts.push(`<p>${escapeHtml(text)}</p>`),
    );
    // Chapitre pas encore affiché : les parties ajoutées s'accumulent (la précédente n'est plus écrasée)
    // et l'aperçu garde la mise en forme (titre en gras) dès la première partie.
    const html = (editHistory.current.current || editedHtml || "") + parts.join("");
    const content = [
      generated,
      merge.heading,
      ...(merge.paragraphs || []),
    ]
      .filter(Boolean)
      .join("\n\n");
    setEditedHtml(html);
    recordEdit(html, content);
    persistSilently(content, html);
  };
  const recordEdit = (html, content) => {
    const history = editHistory.current;
    if (html === history.current) return;
    history.past.push(history.current);
    if (history.past.length > 120) history.past.shift();
    history.current = html;
    history.future = [];
    if (changeInfo) {
      clearMarks();
      setChangeInfo(null);
    }
    setGenerated(content);
    // Chapitre entièrement effacé : on retrouve l'écran de démarrage, comme à la première ouverture.
    setErased(!content.trim());
    setDocumentDirty(true);
    setHistoryTick((value) => value + 1);
  };
  const travelHistory = (direction) => {
    const history = editHistory.current;
    const source = direction === "undo" ? history.past : history.future;
    if (!source.length) return;
    const target = source.pop();
    (direction === "undo" ? history.future : history.past).push(
      history.current,
    );
    history.current = target;
    if (previewRef.current) previewRef.current.innerHTML = target;
    setGenerated(previewRef.current?.innerText.trim() || "");
    setErased(!previewRef.current?.innerText.trim());
    setDocumentDirty(true);
    setHistoryTick((value) => value + 1);
  };
  const editorKeyDown = (event) => {
    const page = event.currentTarget;
    if (keepListOnEnter(event, () => recordEdit(page.innerHTML, page.innerText.trim()))) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      travelHistory(event.shiftKey ? "redo" : "undo");
    } else if (key === "y") {
      event.preventDefault();
      travelHistory("redo");
    }
  };
  useEffect(() => {
    if (!pendingClause) return undefined;
    let alive = true, tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (!previewRef.current && tries < 40) return;
      clearInterval(timer);
      if (!alive || !previewRef.current) { onClauseConsumed?.(); return; }
      getTeamClause(pendingClause.id).then((clause) => { if (alive) insertClauseAtCursor(previewRef.current, null, clause, userEmail); }).catch(() => {}).finally(() => onClauseConsumed?.());
    }, 150);
    return () => { alive = false; clearInterval(timer); };
  }, [pendingClause?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount)
      lastRange.current = selection.getRangeAt(0).cloneRange();
  };
  // vrai quand le paragraphe du curseur est déjà justifié : le bouton « Justifier » l'indique au lieu de sembler ne rien faire
  const isJustified = () => {
    const node = lastRange.current?.commonAncestorContainer;
    const element = node && (node.nodeType === 1 ? node : node.parentElement);
    return Boolean(element && previewRef.current?.contains(element) && getComputedStyle(element).textAlign === "justify");
  };
  const format = (command, value = null) => {
    const selection = window.getSelection();
    if (lastRange.current) {
      selection.removeAllRanges();
      selection.addRange(lastRange.current);
    }
    document.execCommand(command, false, value);
    rememberSelection();
    if (previewRef.current)
      recordEdit(
        previewRef.current.innerHTML,
        previewRef.current.innerText.trim(),
      );
  };
  const toggleChecklist = () => {
    const selection = window.getSelection();
    if (lastRange.current) {
      selection.removeAllRanges();
      selection.addRange(lastRange.current);
    }
    document.execCommand("insertUnorderedList");
    const anchor = selection?.anchorNode;
    const element =
      anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const list = element?.closest?.("ul");
    if (list) list.classList.toggle("checklist");
    rememberSelection();
    if (previewRef.current)
      recordEdit(
        previewRef.current.innerHTML,
        previewRef.current.innerText.trim(),
      );
  };
  const insertCheck = () => {
    const selection = window.getSelection();
    if (lastRange.current) {
      selection.removeAllRanges();
      selection.addRange(lastRange.current);
    }
    const anchor = selection?.anchorNode;
    const element =
      anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const item = element?.closest?.("ul.checklist li");
    if (item) item.classList.toggle("checklist-checked");
    else {
      const editor = element?.closest?.(".editable-chapter-preview");
      let line = element;
      while (line?.parentElement && line.parentElement !== editor)
        line = line.parentElement;
      if (editor && line && line !== editor) {
        const firstText = document
          .createTreeWalker(line, NodeFilter.SHOW_TEXT)
          .nextNode();
        if (/^\s*✓\s*/.test(line.textContent || ""))
          firstText.textContent = firstText.textContent.replace(/^\s*✓\s*/, "");
        else line.insertBefore(document.createTextNode("✓ "), line.firstChild);
      }
    }
    rememberSelection();
    if (previewRef.current)
      recordEdit(
        previewRef.current.innerHTML,
        previewRef.current.innerText.trim(),
      );
  };
  const formatButton = (label, Icon, command) => (
    <button
      type="button"
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
        format(command);
      }}
    >
      <Icon size={15} />
    </button>
  );
  const lastActivity = activity[activity.length - 1];
  const retouchMode = Boolean(
    generated.trim() || !erased && String(editedHtml || existing?.html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;|&#xA0;/gi, " ").trim(),
  );
  // Chapitre encore vide : on met en avant les trois façons de démarrer plutôt qu'un
  // simple espace vide, et on retire les raccourcis équivalents de la colonne de droite.
  const hasPage = Boolean(generated) || manualWriting;
  const activeTraceRef = useRef([]);
  const activeTrace = useChapterTrace({
    projectId,
    chapterId: chapter?.id,
    questionnaire: { state: qState, traces },
    mode: contentMode,
    hasContent: Boolean(generated) && !loading,
    enabled: !loading,
  });
  activeTraceRef.current = activeTrace;
  const emptyStart = !generated && !loading && !retouchMode && !manualWriting;
  // Le fil reste calé sur le dernier message SEULEMENT si l'utilisateur est en bas : s'il relit un ancien message, on ne lui arrache pas le scroll (« ↓ Nouvelle réponse »)
  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    if (stickRef.current) { node.scrollTop = node.scrollHeight; setNewReply(false); }
    else if (chatMessages.length) setNewReply(true);
  }, [chatMessages.length, retouchMode, loading, proposal]);
  const onThreadScroll = () => {
    const node = threadRef.current;
    if (!node || !node.clientHeight) return; // panneau réduit (display:none) : on garde la dernière position lue
    scrollSaved.current = node.scrollTop;
    stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    if (stickRef.current) setNewReply(false);
  };
  // le panneau replié puis rouvert retrouve exactement la conversation et sa position
  useEffect(() => { if (!assistantHidden && threadRef.current) threadRef.current.scrollTop = scrollSaved.current; }, [assistantHidden]);
  useEffect(() => { setChangesOpen(false); }, [proposal?.id]);
  // hauteur du panneau = ce qui reste d'écran sous lui : le composer ne dépasse jamais de la fenêtre, quelle que soit la hauteur de l'en-tête de page
  useEffect(() => {
    const fit = () => { const node = workbenchRef.current; if (!node) return; node.style.setProperty("--assistant-top", `${Math.round(node.getBoundingClientRect().top + window.scrollY + 12)}px`); };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [retouchMode, assistantHidden]);
  // zone de saisie : 2 lignes au départ, elle grandit jusqu'à ~6 lignes puis défile
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 150)}px`;
  }, [retouchInstruction, retouchMode]);
  useEffect(() => {
    if (manualWriting && !generated) previewRef.current?.focus();
  }, [manualWriting]);
  const agentStatus = questionnaireChoice
    ? { label: "En attente de validation", tone: "waiting" }
    : loading
      ? {
          label:
            lastActivity?.step === "generation"
              ? "Rédaction en cours"
              : lastActivity?.step === "mapping"
                ? "Analyse du questionnaire"
                : lastActivity?.step === "rag"
                  ? "Recherche documentaire"
                  : "Analyse en cours",
          tone: "working",
        }
      : generated
        ? { label: "Proposition prête", tone: "ready" }
        : { label: "Prêt", tone: "idle" };
  if (docPrefillOpen)
    return (
      <DocumentPrefill
        projectId={projectId}
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        files={projectFiles}
        uploading={uploading}
        onUpload={uploadFiles}
        onRemove={removeFile}
        onBack={() => setDocPrefillOpen(false)}
        onApply={applyDocumentPrefill}
        statsFor={documentStatsFor}
      />
    );
  if (reviewing) {
    if (!manifest)
      return (
        <div className="api-state">Chargement du questionnaire Plâtrerie…</div>
      );
    return (
      <main className="assistant-page">
        <PlatrerieQuestionnaire
          focus={focusQuestion}
          manifest={manifest}
          state={qState}
          candidates={candidates}
          projectId={projectId}
          onOpenProof={(candidate) =>
            openAttachmentProof(projectId, candidate.documentId, candidate.page).catch((reason) => setError(reason.message))
          }
          docMode={docMode}
          onChangeDocMode={setDocMode}
          onProvenance={changeProvenance}
          onResolveConflict={resolveConflict}
          onAddDocuments={openDocumentPrefill}
          onChangeProject={(id, value) =>
            setQState((current) => afterAnswerEdit({ ...current, project: { ...current.project, [id]: value } }, "project", id, value))
          }
          onChangeWork={(workId, id, value) =>
            setQState((current) => afterAnswerEdit({
              ...current,
              works: current.works.map((work) =>
                work.id === workId ? { ...work, answers: { ...work.answers, [id]: value } } : work,
              ),
            }, workId, id, value))
          }
          onCreateWork={(family, label, extra = {}, id = crypto.randomUUID(), origin = null) => {
            setQState((current) => ({
              ...current,
              works: [...current.works, { id, family, label, answers: { "Q-W01": label, ...extra } }],
              ...(origin ? { templateOrigin: { ...(current.templateOrigin || {}), [id]: origin } } : {}), // modèle d'agence d'origine (identifiant + version), conservé avec l'état de l'ouvrage
            }));
            setDocumentDirty(true);
          }}
          onChangeWorkFamily={(workId, family) =>
            setQState((current) => ({
              ...current,
              works: current.works.map((work) => {
                if (work.id !== workId) return work;
                const generic = ["Q-W01", "Q-W02", "Q-W03", "Q-W04"];
                return { ...work, family, answers: Object.fromEntries(Object.entries(work.answers).filter(([key]) => generic.includes(key))) };
              }),
            }))
          }
          onDuplicateWork={(workId) =>
            setQState((current) => {
              const source = current.works.find((work) => work.id === workId);
              if (!source) return current;
              return {
                ...current,
                works: [
                  ...current.works,
                  {
                    ...source,
                    id: crypto.randomUUID(),
                    label: `${source.answers["Q-W01"] || source.label} (copie)`,
                    answers: { ...source.answers, "Q-W01": `${source.answers["Q-W01"] || source.label} (copie)` },
                  },
                ],
              };
            })
          }
          onDeleteWork={(workId) =>
            setQState((current) => ({ ...current, works: current.works.filter((work) => work.id !== workId) }))
          }
          onProgressChange={changeQuestionnaireProgress}
          onBack={async () => {
            try {
              await onSave(sectionPayload(generated, editedHtml), { stay: true });
            } catch (reason) {
              setError(`Enregistrement du questionnaire impossible : ${reason.message}`);
              return;
            }
            setReviewing(false);
          }}
          onGenerate={generateFromQuestionnaire}
          generating={loading}
        />
        {error && <div className="api-state api-error">{error}</div>}
        {notice && !error && <div className="api-state assistant-notice" role="status" data-offtopic-notice>{notice}</div>}
      </main>
    );
  }
  return (
    <main className="assistant-page">
      <section style={assistantWidth && !emptyStart ? { "--assistant-width": `${assistantWidth}px` } : undefined} className={`assistant-layout assistant-workspace layout-work ${emptyStart && !freeTextChosen ? "start-choosing" : ""} ${assistantHidden && !emptyStart ? "assistant-collapsed" : ""}`}>
        {assistantHidden && !emptyStart && <button type="button" className="assistant-reopen" data-assistant-open onClick={() => changeAssistantHidden(false)}><Bot size={15} /> Assistant</button>}
        <section ref={workbenchRef} className={`ai-workbench ${retouchMode && !emptyStart ? "is-retouch" : ""}`}>
          {retouchMode && !emptyStart && <div className="ai-resizer" role="separator" aria-orientation="vertical" aria-label="Ajuster la largeur de l’assistant" data-ai-resizer onPointerDown={startResize} />}
          <div className="ai-workbench-head">
            <span>
              <Bot size={18} />
            </span>
            <div>
              {!retouchMode && <small>ASSISTANT DE RÉDACTION</small>}
              <div className="assistant-identity">
                <b>IA spécialisée</b>{retouchMode && <span className="assistant-chapter" data-assistant-chapter>{chapter.title}</span>}{!retouchMode && <b> · {chapter.title}</b>}
                {/* « Prêt » et « Proposition prête » n'apprennent rien à l'utilisateur : seuls les états de travail ou d'attente sont affichés */}
                {agentStatus.tone !== "idle" && agentStatus.tone !== "ready" && (
                  <span className={`agent-status ${agentStatus.tone}`}>
                    <i />
                    {agentStatus.label}
                  </span>
                )}
              </div>
            </div>
            {!emptyStart && <button type="button" className="assistant-collapse" data-assistant-collapse title="Réduire l’assistant : le document occupe toute la largeur" aria-label="Réduire l’assistant" onClick={() => changeAssistantHidden(true)}><PanelRightClose size={17} /></button>}
          </div>
          {retouchMode ? <small className="assistant-subtitle" data-assistant-subtitle>Technique &amp; rédaction</small> : (
            <p className="ai-workbench-intro">
              Décrivez votre besoin, ajoutez vos pièces techniques et laissez
              l’IA préparer une proposition spécialisée en{" "}
              <strong>{chapter.specialty}</strong>.
            </p>
          )}
          {saveClause && (saveClause.text ? <ClauseEditor mode="create" initial={saveClause} canPublish={canPublishClause} onClose={() => setSaveClause(null)} onSaved={(mode, draft) => { setSaveClause(null); setClauseNotice(canPublishClause ? "Clause ajoutée à la bibliothèque agence." : "Clause proposée : un administrateur de la bibliothèque la validera."); setTimeout(() => setClauseNotice(""), 6000); }} />
            : <div className="confirm-backdrop" role="presentation" onMouseDown={() => setSaveClause(null)}><section className="estimate-documents" role="dialog" aria-modal="true" data-save-clause-empty><p>Sélectionnez d’abord un passage du chapitre, puis choisissez « Enregistrer la sélection comme clause agence ».</p><p className="price-modal-actions"><button type="button" className="primary" onClick={() => setSaveClause(null)}>Compris</button></p></section></div>)}
          {clauseNotice && <div className="price-message clause-notice" role="status" data-clause-notice>{clauseNotice}</div>}
          {clauseDrawer && <ClauseDrawer lotId={chapter.id} sectionType={clauseSection} answers={answersIndex(qState)} insertedIds={[...(previewRef.current?.querySelectorAll("[data-agency-clause]") || [])].map((node) => node.getAttribute("data-agency-clause"))} onClose={() => setClauseDrawer(false)} onOpenLibrary={() => { setClauseDrawer(false); openLibraryFlushed("clauses"); }} onInsert={(clause) => { insertClauseAtCursor(previewRef.current, lastRange.current, clause, userEmail); setClauseDrawer(false); }} />}
          {specifyNode && <ToSpecifyPopover node={specifyNode} onClose={() => setSpecifyNode(null)}
            onReplace={(node, text) => { node.replaceWith(document.createTextNode(text)); setSpecifyNode(null); recordEdit(previewRef.current.innerHTML, previewRef.current.innerText.trim()); }}
            onOpenQuestion={(questionId) => { setFocusQuestion({ questionId, at: Date.now() }); openQuestionnaire(); }}
            onAsk={(text) => { setRetouchInstruction(text); requestAnimationFrame(() => document.querySelector(".retouch-composer textarea")?.focus()); }}
            onAttach={() => picker.current?.click()} />}
          {inlinePassage !== null && <InlinePersonalizationDrawer target={{ entityType: "cctp_passage", entityId: inlinePassage.length < 25 ? "Placez le curseur dans un paragraphe du CCTP avant de cliquer sur le crayon." : inlinePassage.slice(0, 3000), projectId }} onClose={() => setInlinePassage(null)} />}
          {clauseNode && <ClauseProvenance node={clauseNode} root={previewRef.current} onOpenLibrary={() => openLibraryFlushed("clauses")} onClose={() => setClauseNode(null)} />}
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt"
            onChange={addFiles}
          />
          {retouchMode ? (
            <div className="ai-thread-wrap">
              <div className="ai-thread" ref={threadRef} onScroll={onThreadScroll} data-ai-thread>
                {chatMessages.length === 0 && !loading && !proposal && !applied && !gap && !report && (
                  <EmptyState topic={chapter.title} onExample={(text) => { setRetouchInstruction(text); requestAnimationFrame(() => areaRef.current?.focus()); }} />
                )}
                {gap && !loading && (
                  <MissingDataPrompt
                    gap={gap}
                    onAnswer={(value) => answerGap((ask, question) => ({ ...ask, answers: { ...ask.answers, [question.id]: value } }))}
                    onSkip={() => answerGap((ask, question) => ({ ...ask, skipped: [...ask.skipped, question.id] }))}
                    onStop={() => answerGap((ask) => ({ ...ask, stopAsking: true }))}
                    onCancel={() => { setMessage((current) => current.trim() ? current : gap.userMessage); setGap(null); }}
                  />
                )}
                {(report || citations.length > 0) && !gap && <GenerationReport report={report} citations={citations} pending={loading} onClose={() => { setReport(null); setCitations([]); }} />}
                {chatMessages.length > 0 && (
                  <div className="chapter-chat-history" ref={chatHistoryRef}>
                    {chatMessages.slice(-30).map((item) => (
                      <ChatMessage key={item.id} item={item} body={item.role === "assistant" ? answerBody(item.content) : item.content} technical={item.role === "assistant" && isAnswerMessage(item.content)}>
                        {proposal && proposal.messageId === item.id && (
                          <div className="ai-message-actions" data-ai-proposal data-message-actions>
                            {proposal.stale && <p className="ai-proposal-stale" data-proposal-stale role="alert">Le passage a été modifié depuis cette réponse. Rien n’a été écrasé : régénérez la réponse à partir du texte actuel.</p>}
                            <button type="button" className="link-button strong" data-proposal-apply disabled={proposal.stale} onClick={applyProposal}>Appliquer</button>
                            <span aria-hidden="true">·</span>
                            <button type="button" className="link-button" data-proposal-retry disabled={loading} onClick={retryProposal}>{proposal.stale ? "Regénérer" : "Réessayer"}</button>
                            <span aria-hidden="true">·</span>
                            <button type="button" className="link-button" data-proposal-changes aria-expanded={changesOpen} onClick={() => setChangesOpen(!changesOpen)}>{changesOpen ? "Masquer les modifications" : "Voir les modifications"}</button>
                            {changesOpen && (
                              <div className="ai-diff" data-ai-diff>
                                {diffRows(proposal.before, proposal.after).map((row, index) => (
                                  <p key={index} className={`ai-diff-${row.type}`} data-diff-row={row.type}>{row.type === "add" ? "+ " : row.type === "del" ? "− " : "  "}{row.text}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {item.role === "assistant" && actionResults[item.id] && (
                          <ActionNav result={actionResults[item.id]} onGo={goToTarget} onUndo={() => undoAction(item.id)} canUndo={editHistory.current.current === actionResults[item.id].html_after} />
                        )}
                        {item.role === "assistant" && isAnswerMessage(item.content) && (
                          <AnswerFeedback cctpId={projectId} chapterId={chapter.id} message={item} saved={feedback[item.id]} onSaved={(messageId, value) => setFeedback((current) => ({ ...current, [messageId]: value }))} />
                        )}
                      </ChatMessage>
                    ))}
                  </div>
                )}
                {applied && !proposal && (
                  <div className="ai-applied" data-ai-applied role="status">
                    <span>✓ Modification appliquée (réf. {applied.id}).</span>
                    <button type="button" className="link-button" data-applied-undo onClick={undoApplied}>Annuler la modification</button>
                  </div>
                )}
                {notice && !error && (
                  <div className="ai-system-line" role="status" data-offtopic-notice>{friendly(notice)}{/Aucune modification utile/.test(notice) && <button type="button" className="link-button" data-ai-retry disabled={loading} onClick={() => retouch(lastSubmittedInstruction.current)}>Réessayer</button>}</div>
                )}
                {!loading && !proposal && (
                  <Suggestions
                    items={chapterSuggestionLabels(lastSubmittedInstruction.current, nextPrompt, { hasSelection: Boolean(selectionText) })}
                    onPick={(text) => { setRetouchInstruction(text); requestAnimationFrame(() => areaRef.current?.focus()); }}
                  />
                )}
                {loading && <InlineStatus activity={activity} label={workLabel || (modifying ? "Calepin prépare la réponse…" : "Calepin prépare la rédaction…")} />}
              </div>
              {newReply && <button type="button" className="ai-new-reply" data-ai-new-reply onClick={() => { stickRef.current = true; setNewReply(false); const node = threadRef.current; if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" }); }}>↓ Nouvelle réponse</button>}
            </div>
          ) : (
            <div className="ai-conversation">
              {questionnaireChoice && (
                <div className="questionnaire-choice-inline">
                  <div className="choice-inline-head">
                    <span><Sparkles size={17} /></span>
                    <div>
                      <small>ANALYSE TERMINÉE</small>
                      <b>Souhaitez-vous préciser certains points ?</b>
                    </div>
                  </div>
                  <p>L’IA a retrouvé <strong>{candidates.length} information{candidates.length > 1 ? "s" : ""}</strong>. Vous pouvez générer maintenant ou compléter quelques questions facultatives.</p>
                  <div>
                    <button className="choice-skip" onClick={() => { setQuestionnaireChoice(false); generateFromQuestionnaire(); }}>Générer maintenant</button>
                    <button className="choice-open" onClick={() => { setQuestionnaireChoice(false); setReviewing(true); }}>Compléter le questionnaire <Send size={14} /></button>
                  </div>
                </div>
              )}
              {loading && <InlineStatus activity={activity} label="Calepin prépare la rédaction…" />}
              {gap && !loading && (
                <MissingDataPrompt
                  gap={gap}
                  onAnswer={(value) => answerGap((ask, question) => ({ ...ask, answers: { ...ask.answers, [question.id]: value } }))}
                  onSkip={() => answerGap((ask, question) => ({ ...ask, skipped: [...ask.skipped, question.id] }))}
                  onStop={() => answerGap((ask) => ({ ...ask, stopAsking: true }))}
                  onCancel={() => { setMessage((current) => current.trim() ? current : gap.userMessage); setGap(null); }}
                />
              )}
              {(report || citations.length > 0) && !gap && <GenerationReport report={report} citations={citations} pending={loading} onClose={() => { setReport(null); setCitations([]); }} />}
            </div>
          )}
          {files.length > 0 && (
            <div className="file-list compact-file-list">
              {files.map((file) => (
                <div key={file.id}>
                  <File size={15} />
                  <span>
                    <b>{file.filename}</b>
                    <small>{Math.max(1, Math.round(file.size / 1024))} Ko</small>
                    {file.scope === "ATTACHMENT_TEMPORARY" && (
                      <small className="file-scope" data-file-scope="temporary">
                        Joint de la conversation — pas encore dans les documents du projet{" "}
                        <button type="button" className="link-button" data-file-promote onClick={async () => { try { await updateAttachment(projectId, file.id, { scope: "PROJECT_DOCUMENT" }); await refreshDocuments(); } catch (reason) { setError(reason.message); } }}>Ajouter aux documents du projet</button>
                      </small>
                    )}
                    {file.analysis && file.analysis.status !== "ok" && (
                      <small className={`file-analysis ${file.analysis.status}`} data-file-analysis={file.analysis.status} title={(file.analysis.warnings || []).join(" ")}>
                        {file.analysis.status === "pending" ? "Lue au moment de la rédaction" : file.analysis.status === "failed" ? "Lecture impossible : à vérifier" : "Lecture partielle : relisez les valeurs"}
                      </small>
                    )}
                  </span>
                  <button type="button" aria-label={`Retirer ${file.filename}`} onClick={() => removeFile(file)}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          {retouchMode ? (
            <div className={`composer ai-workbench-composer retouch-composer ${dragging ? "is-dragging" : ""}`} {...attachmentDropProps}>
              {error && <div className="login-error">{error}</div>}
              <div className="ai-mode-chips">
                {aiEditPresets.filter((preset) => preset.id !== "ajouter").map((preset) => (
                  <button type="button" key={preset.id} data-assistant-action={preset.id} onClick={() => presetAction(preset)}>{preset.label}</button>
                ))}
                <span className="ai-plus">
                  <button type="button" data-assistant-plus aria-haspopup="menu" aria-expanded={plusMenu} aria-label="Plus d’actions" onClick={() => setPlusMenu(!plusMenu)}>＋</button>
                  {plusMenu && (
                    <div className="sel-bar-menu ai-plus-menu" role="menu" data-assistant-plus-menu>
                      {aiEditPresets.filter((preset) => preset.id === "ajouter").map((preset) => <button type="button" role="menuitem" key={preset.id} data-assistant-action="ajouter" onClick={() => { setPlusMenu(false); presetAction(preset); }}>Ajouter du contenu</button>)}
                      <button type="button" role="menuitem" data-assistant-attach disabled={uploading} onClick={() => { setPlusMenu(false); picker.current.click(); }}>{uploading ? "Ajout…" : "Joindre un document"}</button>
                    </div>
                  )}
                </span>
              </div>
              <div className="ai-input-row">
                <textarea
                  ref={areaRef}
                  aria-label="Votre question ou demande de modification"
                  rows={2}
                  value={retouchInstruction}
                  onInput={(event) => setRetouchInstruction(event.currentTarget.value)}
                  onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) retouch(); }}
                  placeholder="Posez une question ou demandez une modification…"
                />
                <button type="button" className="send send-icon" data-retouch-send aria-label="Envoyer" onClick={retouch}
                  disabled={!retouchInstruction.trim() || loading || hasPresetPlaceholder(retouchInstruction)}
                  title={hasPresetPlaceholder(retouchInstruction) ? "Remplacez les passages entre crochets avant d’envoyer" : undefined}>
                  {loading ? "…" : <Send size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <div className={`composer ai-workbench-composer ${dragging ? "is-dragging" : ""}`} {...attachmentDropProps}>
              {error && <div className="login-error">{error}</div>}
              {notice && !error && <div className="assistant-notice" role="status" data-offtopic-notice>{friendly(notice)}</div>}
              <textarea
                aria-label="Décrivez ce que vous souhaitez intégrer dans ce chapitre"
                rows={7}
                value={message}
                onInput={(e) => setMessage(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze(); }}
                placeholder="Décrivez le projet, les ouvrages attendus et les contraintes…"
              />
              <div>
                <button type="button" onClick={() => picker.current.click()} className="attach-labelled" disabled={uploading}
                  title="Joignez un plan, une notice, un tableau de surfaces ou un CCTP d’une opération similaire (PDF, Word, Excel, image ou texte). L’IA s’en sert pour comprendre le projet et rédiger.">
                  <Paperclip size={16} /> {uploading ? "Ajout…" : "Joindre un document"}
                </button>
                <small>Ctrl + Entrée pour rédiger</small>
                <button type="button" className="send" onClick={analyze} disabled={!message.trim() || loading || questionnaireChoice}>
                  {loading ? "Rédaction…" : "Rédiger avec l’IA"} {!loading && <Send size={15} />}
                </button>
              </div>
            </div>
          )}
        </section>
        <section className={`chapter-preview-panel ${modifying ? "is-modifying" : ""}`}>
          <header>
            <div>
              <small>CHAPITRE EN COURS</small>
              <h2>{chapter.title}</h2>
            </div>
            <div className="chapter-preview-status">
              <span className={`agent-status ${modifying ? "working" : agentStatus.tone}`}>
                <i />
                {modifying
                  ? "Modification en cours"
                  : documentDirty
                    ? "Modifié"
                    : generated
                      ? "Mis à jour"
                      : "En attente"}
              </span>
              {changeInfo && (
                <span className="ai-change-banner" data-ai-change-banner>
                  {changeInfo.count} passage{changeInfo.count > 1 ? "s" : ""} modifié{changeInfo.count > 1 ? "s" : ""} par l’IA, en surbrillance
                  <button type="button" onClick={() => { clearMarks(); setChangeInfo(null); }}>Masquer</button>
                </span>
              )}
              {hasPage && (qState.works.length > 0 || Object.keys(variants).length > 0) && (
                <div className="mode-switch" role="group" aria-label="Version du lot" data-mode-switch>
                  {[
                    ["notice", "Notice"],
                    ["cctp", "CCTP détaillé"],
                  ].map(([id, label]) => {
                    const stored = variants[id];
                    const active = contentMode === id;
                    const size = active ? (previewRef.current?.innerText?.trim().length ?? generated.length) : stored?.content?.length;
                    const missing = !active && !stored;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-mode={id}
                        className={active ? "on" : ""}
                        aria-pressed={active}
                        disabled={loading || (missing && !canConvert)}
                        title={missing ? (canConvert ? `Générer ${label} à partir des mêmes réponses, sans toucher à l’autre version` : "Renseignez d’abord le questionnaire pour pouvoir convertir") : undefined}
                        onClick={() => switchMode(id)}
                      >
                        <b>{label}</b>
                        <small>{missing ? "Convertir →" : `${size.toLocaleString("fr-FR")} car.`}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              {!emptyStart && (
                <div className="editor-actions" data-editor-actions>
                  <button type="button" className="secondary" data-editor-questionnaire data-analyze-documents={files.length ? "" : undefined} onClick={openQuestionnaire} disabled={loading} title={files.length ? "Analyser les pièces et ouvrir le questionnaire" : "Ouvrir le questionnaire métier du chapitre"}>Questionnaire</button>
                  <button type="button" className="preview-compare-button" data-editor-compare onClick={() => setComparisonOpen(true)} title={generated ? "Récupérer une partie d’un lot similaire, importé ou déjà créé" : "Commencer ce chapitre à partir d’un lot déjà importé ou rédigé"}>
                    <Files size={14} /> Comparer
                  </button>
                  <span data-cctp-personalize-wrap title="Personnaliser pour mon agence le paragraphe où se trouve le curseur">
                    <InlinePersonalizationTrigger label="Personnaliser pour mon agence le paragraphe où se trouve le curseur" onOpen={() => {
                      const live = window.getSelection(); if (live?.rangeCount && previewRef.current?.contains(live.getRangeAt(0).startContainer)) lastRange.current = live.getRangeAt(0).cloneRange();
                      const node = lastRange.current?.startContainer, root = previewRef.current;
                      const element = node && root?.contains(node) ? (node.nodeType === 3 ? node.parentElement : node).closest("p, li, h1, h2, h3, h4, h5, div") : null;
                      const text = (element && element !== root ? element.innerText : "").trim();
                      setInlinePassage(text || " ");
                    }} /></span>
                  <div className="row-more" ref={insertMenuRef}>
                    <button type="button" className="secondary" data-editor-insert aria-haspopup="menu" aria-expanded={insertMenu} disabled={loading || !hasPage} title={hasPage ? "Insérer dans le chapitre" : "Rédigez ou générez d’abord le chapitre"} onClick={() => setInsertMenu((value) => !value)}>Insérer ▾</button>
                    {insertMenu && <div className="sel-bar-menu row-more-menu editor-more-menu" role="menu" data-insert-menu>
                      <button type="button" role="menuitem" data-insert-clause onClick={() => { setInsertMenu(false); setClauseSection(sectionAtCursor(previewRef.current, lastRange.current)); setClauseDrawer(true); }}>Insérer une clause agence</button>
                    </div>}
                  </div>
                </div>
              )}
            </div>
          </header>
          {hasPage && (
            <div className="chapter-format-toolbar" role="toolbar" data-chapter-toolbar>
              <button
                type="button"
                title="Annuler (Ctrl+Z)"
                disabled={!editHistory.current.past.length}
                onMouseDown={(event) => {
                  event.preventDefault();
                  travelHistory("undo");
                }}
              >
                <Undo2 size={15} />
              </button>
              <button
                type="button"
                title="Rétablir (Ctrl+Y)"
                disabled={!editHistory.current.future.length}
                onMouseDown={(event) => {
                  event.preventDefault();
                  travelHistory("redo");
                }}
              >
                <Redo2 size={15} />
              </button>
              <i />
              <select
                defaultValue="3"
                onChange={(event) => format("fontSize", event.target.value)}
              >
                <option value="1">10 px</option>
                <option value="2">12 px</option>
                <option value="3">14 px</option>
                <option value="4">18 px</option>
                <option value="5">24 px</option>
                <option value="6">32 px</option>
              </select>
              {formatButton("Gras", Bold, "bold")}
              {formatButton("Italique", Italic, "italic")}
              {formatButton("Souligné", Underline, "underline")}
              <i />
              {formatButton("Aligner à gauche", AlignLeft, "justifyLeft")}
              {formatButton("Centrer", AlignCenter, "justifyCenter")}
              {formatButton("Aligner à droite", AlignRight, "justifyRight")}
              <i />
              <div className="toolbar-lists" ref={listsMenuRef}>
                <button
                  type="button"
                  className="toolbar-list-action toolbar-lists-trigger"
                  data-toolbar-lists
                  title="Listes : puces, numéros, cases à cocher, check"
                  aria-haspopup="menu"
                  aria-expanded={listsOpen}
                  onMouseDown={(event) => { event.preventDefault(); setListsOpen((value) => !value); setMoreOpen(false); }}
                >
                  <List size={15} />
                  <ChevronDown size={11} />
                </button>
                {listsOpen && (
                  <div className="toolbar-lists-menu" role="menu" data-toolbar-lists-menu>
                    {[
                      ["Puces", "Liste à puces", List, () => format("insertUnorderedList")],
                      ["Numéros", "Liste numérotée", ListOrdered, () => format("insertOrderedList")],
                      ["Cases", "Liste à cocher", ListChecks, () => toggleChecklist()],
                      ["Check", "Insérer un check ou cocher la case sélectionnée", Check, () => insertCheck()],
                    ].map(([label, hint, Icon, run]) => (
                      <button key={label} type="button" role="menuitem" title={hint} data-toolbar-list={label} onMouseDown={(event) => { event.preventDefault(); run(); setListsOpen(false); }}>
                        <Icon size={15} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {activeTrace.length > 0 && (
                <button
                  type="button"
                  className={`toolbar-writing-help answer-trace-toggle ${traceListOpen ? "active" : ""}`}
                  data-trace-toggle
                  aria-pressed={traceListOpen}
                  title="Liste des endroits du chapitre issus de vos réponses : un clic renvoie à la question correspondante (les passages restent surlignés)"
                  onClick={() => setTraceListOpen((value) => !value)}
                >
                  <FileSearch size={15} />
                  <small>Mes réponses</small>
                  <b data-trace-count>{activeTrace.length}</b>
                </button>
              )}
              <div className="toolbar-more" ref={moreMenuRef}>
                <button
                  type="button"
                  className={`toolbar-more-trigger ${moreOpen ? "active" : ""}`}
                  data-toolbar-more
                  title="Autres outils : orthographe, justifié"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onMouseDown={(event) => { event.preventDefault(); setMoreOpen((value) => !value); setListsOpen(false); }}
                >
                  <MoreHorizontal size={17} />
                  <small>Plus</small>
                </button>
                {moreOpen && (
                  <div className="toolbar-more-menu" role="menu" data-toolbar-more-menu>
                    <button
                      type="button"
                      className={`toolbar-writing-help toolbar-spellcheck ${spellcheckEnabled ? "active" : ""}`}
                      aria-pressed={spellcheckEnabled}
                      title="Activer ou désactiver le soulignement automatique des fautes"
                      onMouseDown={(event) => { event.preventDefault(); setSpellcheckEnabled((value) => !value); }}
                    >
                      <SpellCheck2 size={15} />
                      <small>Orthographe {spellcheckEnabled ? "activée" : "désactivée"}</small>
                    </button>
                    <button type="button" role="menuitem" className="toolbar-writing-help" data-format-document title="Corrige espaces, unités, ponctuation, puces, titres et doublons — sans changer le contenu" onMouseDown={(event) => { event.preventDefault(); formatDocument(); }}><AlignLeft size={15} /><small>Mettre en forme</small></button>
                    <button type="button" role="menuitem" className="toolbar-writing-help" data-save-clause title="Enregistrer le passage sélectionné comme clause de la bibliothèque agence" onMouseDown={(event) => { event.preventDefault(); setMoreOpen(false); openSaveClause(); }}><small>Enregistrer la sélection comme clause agence</small></button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`toolbar-writing-help toolbar-justify ${isJustified() ? "active" : ""}`}
                      data-toolbar-justify
                      aria-pressed={isJustified()}
                      title={isJustified() ? "Justifié (actif)" : "Justifier"}
                      onMouseDown={(event) => { event.preventDefault(); format("justifyFull"); setMoreOpen(false); }}
                    >
                      <AlignJustify size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <AnswerTrace
            rootRef={previewRef}
            enabled={hasPage}
            listOpen={traceListOpen && hasPage}
            onListClose={() => setTraceListOpen(false)}
            trace={activeTrace}
            manifest={manifest}
            qState={qState}
            overrides={ruleOverrides}
            onEditAnswer={(target) => { setFocusQuestion({ ...target, at: Date.now() }); openQuestionnaire(); }}
            onApplied={() => recordEdit(previewRef.current.innerHTML, previewRef.current.innerText.trim())}
            onSaveAnswer={async ({ workId, questionId, value }) => {
              const isProject = /^Q-(?:P|R)\d+$/.test(questionId);
              const target = qState.works.find((work) => work.id === workId) || qState.works.find((work) => work.answers?.[questionId] != null) || qState.works[0];
              const next = isProject
                ? { ...qState, project: { ...qState.project, [questionId]: value } }
                : { ...qState, works: qState.works.map((work) => (work.id === target?.id ? { ...work, answers: { ...work.answers, [questionId]: value } } : work)) };
              setQState(next);
              // enregistré tout de suite, avec le texte tel qu'il est maintenant à l'écran
              const html = previewRef.current?.innerHTML || editedHtml;
              const content = previewRef.current?.innerText?.trim() || generated;
              const payload = sectionPayload(content, html);
              await onSave({ ...payload, questionnaire: { ...payload.questionnaire, state: next } }, { stay: true });
            }}
            cctpId={projectId}
            mode={contentMode}
            onTraceTextChange={(previous, next) => setTraces((current) => ({ ...current, [contentMode]: (current[contentMode]?.length ? current[contentMode] : activeTraceRef.current).map((item) => (item === previous ? next : item)) }))}
            onSaveRule={async (questionId, template, block, bullet, value, originTemplate) => {
              setRuleOverrides(await setRuleOverride(questionId, template));
              // effet immédiat dans le chapitre : la phrase de cette ligne prend la règle, ou retrouve la phrase d'origine du moteur
              const effective = template || originTemplate;
              if (effective) {
                block.textContent = bullet + fillTemplate(effective, value);
                recordEdit(previewRef.current.innerHTML, previewRef.current.innerText.trim());
              }
            }}
          />
          <div className="chapter-preview-paper">
            {hasPage ? (
              <div
                ref={previewRef}
                data-placeholder="Écrivez directement ici, comme dans Word…"
                className="generated-message streaming-text editable-chapter-preview"
                contentEditable={!loading}
                spellCheck={spellcheckEnabled}
                lang="fr"
                autoCorrect="on"
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{
                  // En rédaction manuelle, le contenu vit dans la page elle-même : si ce HTML changeait à
                  // chaque frappe, React réécrirait la page et renverrait le curseur au début
                  // (le texte s'écrirait alors à l'envers).
                  __html: decorateToSpecify(editedHtml || (manualWriting && !loading ? "" : textToHtml(generated))),
                }}
                onClick={(event) => { const node = event.target.closest?.("[data-agency-clause]"); if (node && previewRef.current?.contains(node)) setClauseNode(node); const marker = event.target.closest?.("[data-to-specify]"); if (marker && previewRef.current?.contains(marker)) setSpecifyNode(marker); }}
                onFocus={rememberSelection}
                onMouseUp={rememberSelection}
                onKeyUp={rememberSelection}
                onKeyDown={editorKeyDown}
                onInput={(event) =>
                  recordEdit(
                    event.currentTarget.innerHTML,
                    event.currentTarget.innerText.trim(),
                  )
                }
              />
            ) : emptyStart ? (
              <div className="chapter-start">
                <b>Comment souhaitez-vous démarrer ce chapitre ?</b>
                <p>Choisissez le point de départ qui vous convient. Vous pourrez toujours modifier le résultat ensuite.</p>
                <div className="chapter-start-options">
                  <button type="button" className="chapter-start-card primary" data-analyze-documents={files.length ? "" : undefined} onClick={openQuestionnaire}>
                    <em>Recommandé</em>
                    <span><ClipboardCheck size={22} /></span>
                    <strong>Remplir le questionnaire guidé</strong>
                    <small>Créez vos ouvrages et répondez aux questions : le chapitre est rédigé pour vous, ouvrage par ouvrage. Idéal pour un premier lot.</small>
                    <i>Ouvrir le questionnaire →</i>
                  </button>
                  <button type="button" className="chapter-start-card" data-start-documents onClick={openDocumentPrefill}>
                    <span><FileUp size={22} /></span>
                    <strong>Préremplir à partir de vos documents</strong>
                    <small>Importez vos plans, notices, études ou autres pièces du projet. Le logiciel identifie les ouvrages et préremplit le questionnaire. Vous vérifiez ensuite les informations avant la rédaction du CCTP.</small>
                    <i>Importer mes documents →</i>
                  </button>
                </div>
                <button type="button" className="chapter-start-more-toggle" data-start-more aria-expanded={startMoreOpen} onClick={() => setStartMoreOpen((value) => !value)}>Autres méthodes <ChevronDown size={15} style={{ transform: startMoreOpen ? "rotate(180deg)" : "none" }} /></button>
                <div className={`chapter-start-options chapter-start-secondary ${startMoreOpen ? "open" : ""}`} data-start-secondary>
                  <button type="button" className="chapter-start-card" onClick={() => setComparisonOpen(true)}>
                    <span><Files size={22} /></span>
                    <strong>Repartir d’un lot déjà écrit</strong>
                    <small>Reprenez tout ou partie d’un lot d’un autre CCTP, importé ou créé, puis adaptez-le.</small>
                    <i>Choisir un lot existant →</i>
                  </button>
                  <button type="button" className="chapter-start-card" onClick={() => setManualWriting(true)}>
                    <span><PenLine size={22} /></span>
                    <strong>Écrire directement dans le chapitre</strong>
                    <small>Ouvrez une page vierge et rédigez vous-même, comme dans Word. L’IA reste disponible pour reformuler ou compléter.</small>
                    <i>Écrire dans la page →</i>
                  </button>
                </div>
              </div>
            ) : (
              <div className="chapter-preview-empty">
                <FileText size={28} />
                <b>Votre chapitre apparaîtra ici</b>
                <p>
                  La proposition se construira à gauche au fur et à mesure de la
                  génération.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
      {modeCompareOpen && (
        <div className="mode-compare-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModeCompareOpen(false)}>
          <section className="mode-compare-dialog" role="dialog" aria-label="Notice et CCTP côte à côte" data-mode-compare-dialog>
            <header>
              <b>Notice et CCTP détaillé côte à côte</b>
              <button type="button" onClick={() => setModeCompareOpen(false)} aria-label="Fermer"><X size={16} /></button>
            </header>
            <div>
              {["notice", "cctp"].map((id) => {
                const current = contentMode === id ? { content: previewRef.current?.innerText?.trim() || generated, html: previewRef.current?.innerHTML || editedHtml } : variants[id];
                return (
                  <article key={id}>
                    <h3>{id === "notice" ? "Notice descriptive" : "CCTP détaillé"} <small>{(current?.content || "").length.toLocaleString("fr-FR")} caractères</small></h3>
                    <div className="mode-compare-text" dangerouslySetInnerHTML={{ __html: current?.html || textToHtml(current?.content || "") }} />
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
      <FrenchSpellcheckTooltip
        enabled={spellcheckEnabled}
        rootRef={previewRef}
        dictionaryTerms={[projectName, chapter.title]}
      />
      {comparisonOpen && (
        <ChapterReusePanel
          cctpId={projectId}
          chapterId={chapter.id}
          chapterTitle={chapter.title}
          currentText={previewRef.current?.innerText || generated}
          onClose={() => setComparisonOpen(false)}
          onMerge={mergeComparedContent}
        />
      )}
    </main>
  );
}
