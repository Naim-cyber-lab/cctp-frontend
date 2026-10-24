import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  Baseline,
  Highlighter,
  MoreHorizontal,
  IndentDecrease,
  IndentIncrease,
  Strikethrough,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Palette,
  Redo2,
  Save,
  SlidersHorizontal,
  Sparkles,
  SpellCheck2,
  Stamp,
  Trash2,
  Underline,
  Undo2,
  X,
  BookOpenCheck,
  FileSearch,
} from "lucide-react";
import { useCatalog } from "../catalog/CatalogContext";
import { downloadCctp, getFormattingPreferences, getCoverSuggestions, getOrganization, getPlatrerieQuestionnaire, getRuleOverrides, proposeTeamClause, setRuleOverride } from "../api/client";
import { AnswerTrace, fillTemplate } from "../components/AnswerTrace";
import { SimilarPassages } from "../components/SimilarPassages";
import { useChapterTrace } from "../utils/answerTraceState";
import { renumberChapterHtml } from "../utils/chapterNumbering";
import { DEFAULT_HEADING_STYLES, headingAlign } from "../utils/autoFormat";
import { AiProposalPanel } from "../components/AiProposalPanel";
import { CoverReconstructionEditor } from "../components/CoverReconstructionEditor";
import { ImageInsertDialog } from "../components/ImageInsertDialog";
import { ConfirmDiscardDialog } from "../components/ConfirmDiscardDialog";
import { ExportDialog } from "../components/ExportDialog";
import { keepListOnEnter } from "../utils/listEnter";
import { FrenchSpellcheckTooltip } from "../components/FrenchSpellcheckTooltip";
import {
  createBlankCoverElements,
  normalizeCoverElements,
} from "../utils/coverElements";
import { useLiveDocumentCollaboration } from "../hooks/useLiveDocumentCollaboration";
import { DocumentComments } from "../components/DocumentComments";
import { SuggestionMode } from "../components/SuggestionMode";
import { officialText } from "../utils/suggestions";
import { CctpChat } from "../components/CctpChat";
import { FindReplace } from "../components/FindReplace";
import { EditorContextMenu } from "../components/EditorContextMenu";
import { ColorPicker, HIGHLIGHTS, TEXT_COLORS } from "../components/FormatPickers";
import { STYLE_DEPTH, STYLE_LABELS, indentBlock, moveInTable, styleOf, topBlock } from "../utils/wordLike";
import { useAuth } from "../auth/AuthContext";
import "../toolbar-compact.css";

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textToHtml = (value) =>
  value
    ? value
        .split("\n")
        .map((line) =>
          line ? `<div>${escapeHtml(line)}</div>` : "<div><br></div>",
        )
        .join("")
    : "";
const editableProps = (html, onChange, onSelection) => ({
  contentEditable: true,
  spellCheck: true,
  lang: "fr",
  autoCorrect: "on",
  suppressContentEditableWarning: true,
  dangerouslySetInnerHTML: { __html: html },
  onInput: onChange,
  onMouseUp: onSelection,
  onKeyUp: onSelection,
  onKeyDown: (event) => keepListOnEnter(event, onChange),
  onFocus: onSelection,
});
const applyHeadingStyle = (node, depth, headingStyles) => {
  const style =
    (headingStyles || DEFAULT_HEADING_STYLES)[depth] ||
    DEFAULT_HEADING_STYLES[depth];
  if (!style) return;
  node.style.setProperty("font-size", `${style.sizePt}pt`, "important");
  node.style.setProperty(
    "font-weight",
    style.bold ? "700" : "400",
    "important",
  );
  node.style.setProperty(
    "text-align",
    headingAlign(style) === "left" ? "" : headingAlign(style),
    "important",
  );
};
// Après une mise à jour reçue du texte partagé (collaboration), les titres numérotés reprennent la mise en forme du CCTP
// sans réécrire le texte : on ne touche qu'aux classes et aux styles d'affichage.
const HEADING_LINE = /^(\d+[a-zA-Z]?(?:\.\d+[a-zA-Z]?)+)[\s.\-–—:]+(.{2,})$/;
const styleHeadingsInPlace = (body, headingStyles) => {
  [...body.children].forEach((node) => {
    if (node.matches("figure,.user-document-image")) return;
    const text = node.innerText.trim();
    const match = text.length <= 180 && !/[✓✔☐☑□]/.test(text) ? text.match(HEADING_LINE) : null;
    let depth = null;
    if (match && /[a-zA-ZÀ-ÖØ-öø-ÿ]{2}/.test(match[2])) depth = Math.min(3, match[1].split(".").length - 1);
    else {
      const explicit = /^h([1-3])$/.exec(node.getAttribute("data-doc-style") || "");
      if (explicit && text) depth = Number(explicit[1]);
    }
    if (depth === null) return;
    node.classList.add("document-subheading", `document-subheading-${depth}`);
    applyHeadingStyle(node, depth, headingStyles);
  });
};
const enrichToc = (html, chapterId, headingStyles) => {
  if (typeof document === "undefined") return { html, entries: [] };
  const root = document.createElement("div");
  root.innerHTML = html || "";
  const entries = [];
  let index = 0;
  [
    ...root.querySelectorAll(
      ".document-subheading,.document-check-item,.document-bullet-item,.document-source-footer",
    ),
  ].forEach((node) => {
    node.classList.remove(
      "document-subheading",
      "document-subheading-1",
      "document-subheading-2",
      "document-subheading-3",
      "document-check-item",
      "document-bullet-item",
      "document-source-footer",
    );
    node.removeAttribute("style");
    if (node.id?.startsWith(`chapter-${chapterId}-part-`))
      node.removeAttribute("id");
  });
  [...root.children].forEach((node) => {
    if (
      node.matches("figure,.user-document-image") ||
      !node.querySelector("br")
    )
      return;
    const parts = node.innerHTML.split(/<br\s*\/?\s*>/i);
    if (
      parts.filter((part) =>
        part
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/gi, " ")
          .trim(),
      ).length < 2
    )
      return;
    parts.forEach((part) => {
      const block = document.createElement("div");
      block.innerHTML = part || "<br>";
      node.before(block);
    });
    node.remove();
  });
  const direct = [...root.children];
  direct.forEach((node) => {
    const text = node.innerText.trim();
    const match =
      text.length <= 180 && !/[✓✔☐☑□]/.test(text)
        ? text.match(/^(\d+[a-zA-Z]?(?:\.\d+[a-zA-Z]?)+)[\s.\-–—:]+(.{2,})$/)
        : null;
    if (match) {
      // Les PDF en colonnes produisent parfois « 9.1 10 », « 9.2 1.1 », etc. :
      // ce sont des numéros de cellules sans intitulé, pas des titres de sommaire.
      const rawTitle = match[2].trim();
      if (!/[a-zA-ZÀ-ÖØ-öø-ÿ]{2}/.test(rawTitle)) return;
      // Autre artefact fréquent de l'extraction PDF : « 9.3 1Blocs-portes ».
      // Le chiffre appartient à la numérotation découpée, pas au libellé visible.
      const title = rawTitle.replace(/^\d+(?=[a-zA-ZÀ-ÖØ-öø-ÿ])/, "").trim();
      const depth = Math.min(3, match[1].split(".").length - 1);
      const id = `chapter-${chapterId}-part-${++index}`;
      node.id = id;
      node.classList.add("document-subheading", `document-subheading-${depth}`);
      applyHeadingStyle(node, depth, headingStyles);
      entries.push({ id, number: match[1], title, depth });
      return;
    }
    const explicit = /^h([1-3])$/.exec(node.getAttribute("data-doc-style") || "");
    if (explicit && text) {
      const depth = Number(explicit[1]);
      const id = `chapter-${chapterId}-part-${++index}`;
      node.id = id;
      node.classList.add("document-subheading", `document-subheading-${depth}`);
      applyHeadingStyle(node, depth, headingStyles);
      entries.push({ id, number: "", title: text, depth });
      return;
    }
    if (/^[✓✔☐☑□]\s*/.test(text)) node.classList.add("document-check-item");
    if (/^[o•●▪◦]\s+/i.test(text)) node.classList.add("document-bullet-item");
    if (/(?:notice descriptive|\bpage\s+\d+\s*\/|^caen\s+page)/i.test(text))
      node.classList.add("document-source-footer");
  });
  direct
    .filter((node) => node.classList.contains("document-check-item"))
    .forEach((node) => {
      let next = node.nextElementSibling;
      while (
        next &&
        !next.classList.contains("document-check-item") &&
        !next.classList.contains("document-bullet-item") &&
        !next.classList.contains("document-subheading") &&
        !next.classList.contains("document-source-footer") &&
        !/^[✓✔☐☑□]\s*/.test(next.innerText.trim()) &&
        !/^[o•●▪◦]\s+/i.test(next.innerText.trim())
      ) {
        const following = next.nextElementSibling;
        node.append(` ${next.innerText.trim()}`);
        next.remove();
        next = following;
      }
    });
  return { html: root.innerHTML, entries };
};

// Clic dans le sommaire : on mène au titre (par son identifiant, sinon par son texte), sans changer l'adresse de la page.
const goToTocTarget = (event, id, number = "", title = "") => {
  event.preventDefault();
  let target = document.getElementById(id);
  if (!target && (number || title)) {
    const wanted = `${number} ${title}`.replace(/\s+/g, " ").trim().toLowerCase();
    target = [...document.querySelectorAll(".rich-chapter-body > *")].find((node) => node.textContent.replace(/\s+/g, " ").trim().toLowerCase().startsWith(wanted));
  }
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("toc-target-flash");
  setTimeout(() => target.classList.remove("toc-target-flash"), 1600);
};

export function DocumentEditorPage({ project, onBack, onSave, onUnavailable, onEditAnswer, focusCommentId = null, readOnly = false }) {
  const { chapters } = useCatalog();
  const { user } = useAuth();
  const spellRootRef = useRef(null);
  const liveCollaboration = useLiveDocumentCollaboration(project.id, spellRootRef, readOnly);
  const documentImagePicker = useRef(null);
  const savedPageTemplateRef = useRef(null);
  const selected = project.selected
    .map((id) => chapters.find((chapter) => chapter.id === id))
    .filter(Boolean);
  const documentData = project.sections.__document || {};
  const refs = useRef({});
  // « D'où vient ce passage ? » : surbrillance grise des passages du lot Plâtrerie issus des réponses au questionnaire
  const [editMode, setEditMode] = useState("edit"); // « edit » : on modifie directement ; « suggest » : on propose
  const [traceListOpen, setTraceListOpen] = useState(false);
  const [traceManifest, setTraceManifest] = useState(null);
  const [ruleOverrides, setRuleOverrides] = useState({});
  const plasterSection = project.sections?.["06"];
  const plasterMode = plasterSection?.contentMode || plasterSection?.questionnaire?.docMode || "cctp";
  const plasterTrace = useChapterTrace({
    projectId: project.id,
    chapterId: "06",
    questionnaire: plasterSection?.questionnaire,
    mode: plasterMode,
    hasContent: Boolean(project.selected.includes("06") && (plasterSection?.content || plasterSection?.html)),
  });
  // un passage dont la règle ou la réponse vient d'être modifiée reste suivi (donc surligné) : sa nouvelle phrase remplace l'ancienne dans la trace
  const [tracePatch, setTracePatch] = useState(null);
  const tracePatchRef = useRef(null);
  const effectivePlasterTrace = tracePatch && tracePatch.base === plasterTrace ? tracePatch.list : plasterTrace;
  tracePatchRef.current = tracePatch && tracePatch.base === plasterTrace ? tracePatch.list : null;
  const traceSources = useMemo(() => [{ getRoot: () => refs.current["body-06"], trace: effectivePlasterTrace }], [effectivePlasterTrace]);
  // réponse modifiée depuis « D'où vient ce passage ? » : l'état du questionnaire est conservé ici jusqu'à l'enregistrement du CCTP
  const [answerOverride, setAnswerOverride] = useState(null);
  const answerOverrideRef = useRef(null);
  useEffect(() => {
    if (!plasterTrace.length) return;
    getPlatrerieQuestionnaire(project.id).then(setTraceManifest).catch(() => {});
    getRuleOverrides().then(setRuleOverrides).catch(() => {});
  }, [plasterTrace.length, project.id]);
  const lastRange = useRef(null);
  const logoPicker = useRef(null);
  const draggingLogo = useRef(null);
  const resizingLogo = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true);
  const [title, setTitle] = useState(project.name);
  const [aiTarget, setAiTarget] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [tocTitles, setTocTitles] = useState(() =>
    Object.fromEntries(
      selected.map((chapter) => [
        chapter.id,
        project.sections[chapter.id]?.customTitle || chapter.title,
      ]),
    ),
  );
  // Le texte d'un chapitre (jusqu'à plusieurs centaines de Ko pour un CCTP importé) est
  // analysé pour numéroter et styler ses titres. Ce travail ne dépend que du contenu du
  // chapitre : on le garde en mémoire plutôt que de le refaire à chaque rendu, sinon chaque
  // frappe ou chaque déplacement d'un bloc de la page de garde relançait l'analyse complète.
  const chapterRenderCache = useRef(new Map());
  const renderChapter = (chapter, section, index) => {
    const styles = pageTemplate.headingStyles;
    const cached = chapterRenderCache.current.get(chapter.id);
    if (cached && cached.section === section && cached.index === index && cached.styles === styles)
      return cached.result;
    const content = section || {};
    const result = enrichToc(
      renumberChapterHtml(content.html || textToHtml(content.content || ""), index + 1),
      chapter.id,
      styles,
    );
    chapterRenderCache.current.set(chapter.id, { section, index, styles, result });
    return result;
  };
  const [coverTextOffsets, setCoverTextOffsets] = useState(
    documentData.coverTextOffsets || {},
  );
  const coverTextDrag = useRef(null);
  // Les textes de la page de garde s'écrivent directement (un clic suffit, comme dans Word).
  // Pour les déplacer, on saisit la poignée ✥ qui apparaît à leur gauche : c'est la zone
  // située hors du texte, sinon glisser pour sélectionner du texte déplacerait le bloc.
  const dragCoverText = (key) => ({
    contentEditable: !readOnly,
    suppressContentEditableWarning: true,
    "data-cover-text": "",
    title: "Cliquez pour écrire · saisissez la poignée à gauche pour déplacer",
    style: {
      transform: `translate(${coverTextOffsets[key]?.x || 0}%, ${coverTextOffsets[key]?.y || 0}%)`,
      cursor: "text",
    },
    onPointerDown: (event) => {
      if (readOnly) return;
      if (event.button !== 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX >= rect.left) return;
      event.preventDefault();
      event.stopPropagation();
      const page = refs.current.coverCanvas.getBoundingClientRect();
      coverTextDrag.current = {
        key,
        startX: event.clientX,
        startY: event.clientY,
        rect,
        page,
        x: coverTextOffsets[key]?.x || 0,
        y: coverTextOffsets[key]?.y || 0,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.cursor = "grabbing";
    },
    onPointerMove: (event) => {
      const drag = coverTextDrag.current;
      if (!drag || drag.key !== key) return;
      const dx = Math.max(
        drag.page.left - drag.rect.left,
        Math.min(
          drag.page.right - drag.rect.right,
          event.clientX - drag.startX,
        ),
      );
      const dy = Math.max(
        drag.page.top - drag.rect.top,
        Math.min(
          drag.page.bottom - drag.rect.bottom,
          event.clientY - drag.startY,
        ),
      );
      drag.next = {
        x: drag.x + (dx / drag.rect.width) * 100,
        y: drag.y + (dy / drag.rect.height) * 100,
      };
      event.currentTarget.style.transform = `translate(${drag.next.x}%, ${drag.next.y}%)`;
    },
    onPointerUp: (event) => {
      const drag = coverTextDrag.current;
      if (!drag || drag.key !== key) return;
      coverTextDrag.current = null;
      event.currentTarget.style.cursor = "text";
      if (drag.next) {
        setCoverTextOffsets((current) => ({ ...current, [key]: drag.next }));
        dirty();
      }
    },
    onPointerCancel: (event) => {
      coverTextDrag.current = null;
      event.currentTarget.style.cursor = "text";
      event.currentTarget.style.transform = `translate(${coverTextOffsets[key]?.x || 0}%, ${coverTextOffsets[key]?.y || 0}%)`;
    },
  });
  const [coverLogos, setCoverLogos] = useState(documentData.coverLogos || []);
  const [coverElements, setCoverElements] = useState(
    normalizeCoverElements(
      documentData.coverElements?.length
        ? documentData.coverElements
        : createBlankCoverElements({
            title: project.name,
            subtitle: documentData.coverSubtitle,
            contacts: documentData.coverContacts,
            label: documentData.coverLabelText,
            logos: documentData.coverLogos,
          }),
    ),
  );
  const [coverAspect] = useState(documentData.coverAspect || 1.4142);
  const [coverSidebarColor, setCoverSidebarColor] = useState(
    documentData.coverSidebarColor || "#eef0ec",
  );
  const [coverPageColor, setCoverPageColor] = useState(
    documentData.coverPageColor || "#ffffff",
  );
  const [selectedLogoId, setSelectedLogoId] = useState(null);
  const [recentLogos, setRecentLogos] = useState([]);
  const [logoLibraryOpen, setLogoLibraryOpen] = useState(false);
  const [watermarkOpen, setWatermarkOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Équipe : proposer un passage du CCTP à la bibliothèque de clauses de l'entreprise.
  const [team, setTeam] = useState(null);
  const [proposal, setProposal] = useState(null);
  useEffect(() => {
    getOrganization()
      .then((data) => setTeam(data?.organization ? data : null))
      .catch(() => {});
  }, []);
  const canProposeToTeam = team && ["admin", "member", "validator", "writer"].includes(team.role);
  const openProposal = () => {
    const selection = window.getSelection();
    const inChapter = selection?.anchorNode?.parentElement?.closest?.(".rich-chapter-body");
    const text = inChapter ? selection.toString().trim() : "";
    setProposal({ text, label: text.slice(0, 60), busy: false, done: "", error: "" });
  };
  const sendProposal = async () => {
    setProposal((current) => ({ ...current, busy: true, error: "" }));
    try {
      const clause = await proposeTeamClause({ label: proposal.label, text: proposal.text });
      setProposal((current) => ({ ...current, busy: false, done: clause.status === "validated" ? "Clause publiée dans la bibliothèque de l’équipe." : "Clause envoyée aux valideurs de l’équipe." }));
    } catch (reason) {
      setProposal((current) => ({ ...current, busy: false, error: reason.message }));
    }
  };
  const [exporting, setExporting] = useState(false);
  const [watermark, setWatermark] = useState(() => ({
    enabled: false,
    text: "CONFIDENTIEL",
    opacity: 12,
    size: 42,
    angle: -35,
    ...(documentData.watermark || {}),
  }));
  const [formatRulesOpen, setFormatRulesOpen] = useState(false);
  const [pageTemplate, setPageTemplate] = useState(() => ({
    format: "A4",
    marginTopMm: 24,
    marginRightMm: 22,
    marginBottomMm: 20,
    marginLeftMm: 22,
    fontFamily: "Georgia, serif",
    fontSizePt: 10.5,
    lineHeightPt: 16,
    textColor: "#353b38",
    headingColor: "#1b2f29",
    accentColor: documentData.coverAccent || "#315f51",
    titleAlign: "left",
    subtitleAlign: "left",
    firstLineIndentMm: 0,
    showPageNumbers: true,
    headingStyles: DEFAULT_HEADING_STYLES,
    ...(documentData.pageTemplate || {}),
  }));
  const pageTemplateRef = useRef(pageTemplate);
  pageTemplateRef.current = pageTemplate;
  useEffect(() => {
    // le texte partagé vient d'être réécrit dans un chapitre : ses titres reprennent la mise en forme du profil
    const onRemoteEdit = (event) => {
      const body = event.target;
      if (body?.matches?.(".rich-chapter-body")) styleHeadingsInPlace(body, pageTemplateRef.current.headingStyles);
    };
    document.addEventListener("collab:remote-edit", onRemoteEdit);
    return () => document.removeEventListener("collab:remote-edit", onRemoteEdit);
  }, []);
  const [pendingImage, setPendingImage] = useState(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef(null);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => { if (!moreMenuRef.current?.contains(event.target)) setMoreOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [moreOpen]);
  useEffect(() => {
    if (saved) {
      savedPageTemplateRef.current = { ...pageTemplate };
    }
  }, [saved]);
  useEffect(() => {
    document
      .querySelectorAll('.document-editor [contenteditable="true"]')
      .forEach((node) => {
        // La page de garde (noms, adresses, e-mails) n'est jamais soulignée : ces soulignements débordaient sur les mots voisins.
        node.spellcheck = spellcheckEnabled && !node.closest(".cover-reconstruction-editor");
        node.lang = "fr";
      });
  }, [spellcheckEnabled]);
  // Page de garde modifiée à plusieurs, en direct : chaque élément (texte, image, forme) est synchronisé séparément (le plus récent gagne).
  const bodyHtmlProp = useRef({});
  const [listsOpen, setListsOpen] = useState(false);
  const listsMenuRef = useRef(null);
  useEffect(() => {
    if (!listsOpen) return undefined;
    const close = (event) => { if (!listsMenuRef.current?.contains(event.target)) setListsOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [listsOpen]);
  // Lecture seule : rien ne doit pouvoir être tapé, supprimé, collé ni déposé (l'événement React onBeforeInput ne voit pas les suppressions : on bloque l'événement natif).
  useEffect(() => {
    if (!readOnly) return undefined;
    const root = spellRootRef.current;
    if (!root) return undefined;
    const block = (event) => { if (event.target?.closest?.("textarea, input, [data-cctp-chat], [data-comment-panel], .comments-panel")) return; /* champs de discussion et de commentaire : ils ne modifient pas le document */ if (event.cancelable) event.preventDefault(); };
    root.addEventListener("beforeinput", block, true);
    root.addEventListener("drop", block, true);
    root.addEventListener("paste", block, true);
    root.addEventListener("cut", block, true);
    return () => { ["beforeinput", "drop", "paste", "cut"].forEach((type) => root.removeEventListener(type, block, true)); };
  }, [readOnly]);
  useEffect(() => {
    if (!readOnly) return;
    document.querySelectorAll('.document-editor [contenteditable="true"]').forEach((node) => node.setAttribute("contenteditable", "false"));
  });
  // L'ordre des modifications de la page de garde est celui du SERVEUR (pas l'heure des ordinateurs, qui diffère). Chaque envoi porte un identifiant :
  // le serveur le renvoie à tout le monde, auteur compris, avec son horodatage ; tant que j'ai des modifications plus récentes en route sur un
  // élément, je n'écrase pas mon texte par l'écho de l'envoi précédent.
  const saveRef = useRef(null), toolbarActionsRef = useRef({});
  useEffect(() => {
    if (readOnly) return undefined;
    const onKey = (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault(); // pas la fenêtre « Enregistrer la page » du navigateur : on enregistre le CCTP
        saveRef.current?.();
        return;
      }
      if (event.key !== "Tab" || mod || event.altKey) return;
      const target = event.target;
      if (!target?.closest?.(".rich-chapter-body")) return;
      event.preventDefault(); // Tab ne fait plus sortir du texte
      if (editMode === "suggest") return;
      const cell = target.closest?.("td, th") || (window.getSelection()?.anchorNode && (window.getSelection().anchorNode.nodeType === 1 ? window.getSelection().anchorNode : window.getSelection().anchorNode.parentElement)?.closest?.("td, th"));
      if (cell) {
        const moved = moveInTable(cell, event.shiftKey);
        if (moved.added) { notifyInput(cell); dirty(); }
        return;
      }
      toolbarActionsRef.current.indent?.(event.shiftKey ? -1 : 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [readOnly, editMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const coverSync = useRef({ last: null, buffer: new Map(), timer: null, batches: new Set(), inflight: new Map() });
  const flushCover = () => {
    const sync = coverSync.current;
    const batch = [...sync.buffer.values()];
    if (!batch.length) return;
    const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    if (liveCollaboration.sendCover(batch, id)) {
      sync.buffer.clear();
      sync.batches.add(id);
      batch.forEach((change) => sync.inflight.set(change.id, (sync.inflight.get(change.id) || 0) + 1));
    }
  };
  useEffect(() => {
    const sync = coverSync.current;
    const strip = (element) => { const { _t, ...rest } = element; return rest; };
    if (!sync.last) { sync.last = new Map(coverElements.map((element) => [element.id, element])); return; }
    const now = new Map(coverElements.map((element) => [element.id, element]));
    const stamp = Date.now(), changes = [];
    for (const [id, element] of now) {
      const previous = sync.last.get(id);
      if (!previous) { changes.push({ id, element: strip(element), _t: stamp }); continue; }
      const patch = {};
      for (const key of new Set([...Object.keys(strip(element)), ...Object.keys(strip(previous))])) {
        if (JSON.stringify(element[key]) !== JSON.stringify(previous[key])) patch[key] = element[key] === undefined ? null : element[key];
      }
      if (Object.keys(patch).length) changes.push({ id, patch, _t: stamp });
    }
    for (const id of sync.last.keys()) if (!now.has(id)) changes.push({ id, removed: true, _t: stamp });
    sync.last = now;
    if (!changes.length) return;
    for (const change of changes) {
      const waiting = sync.buffer.get(change.id);
      if (!waiting || change.removed || change.element) sync.buffer.set(change.id, change);
      else if (waiting.element) sync.buffer.set(change.id, { ...waiting, element: { ...waiting.element, ...change.patch }, _t: change._t });
      else if (waiting.patch) sync.buffer.set(change.id, { ...change, patch: { ...waiting.patch, ...change.patch } });
      else sync.buffer.set(change.id, change);
    }
    clearTimeout(sync.timer);
    sync.timer = setTimeout(flushCover, 120);
  }, [coverElements]);
  useEffect(() => {
    liveCollaboration.setCoverHandler((incoming, data) => {
      let changes = incoming;
      const sync = coverSync.current;
      const own = !!data?.batch && sync.batches.has(data.batch);
      if (own) {
        sync.batches.delete(data.batch);
        for (const change of changes) {
          const left = (sync.inflight.get(change.id) || 1) - 1;
          if (left <= 0) sync.inflight.delete(change.id); else sync.inflight.set(change.id, left);
        }
        // Un ACK confirme seulement que le serveur a reçu ce qui est déjà affiché localement.
        // Ne pas appeler setState ici : même un rendu React sans différence visible efface la pile
        // d'annulation native du contentEditable de la page de garde.
        return;
      }
      // Ce que j'ai tapé et que le serveur n'a pas encore ordonné (en attente ou en vol) l'emportera ou non selon l'ordre d'arrivée au serveur :
      // tant que c'est en cours, un texte reçu d'un autre sur le même bloc ne l'écrase pas à l'écran (sinon chacun finit avec le texte de l'autre).
      changes = changes.map((change) => {
        if (!change.patch || !("text" in change.patch) || !(sync.inflight.has(change.id) || sync.buffer.has(change.id))) return change;
        const { text: _skipped, ...rest } = change.patch;
        return Object.keys(rest).length ? { ...change, patch: rest } : null;
      }).filter(Boolean);
      if (!changes.length) return;
      setCoverElements((current) => {
        const next = [...current];
        for (const change of changes) {
          const index = next.findIndex((element) => element.id === change.id);
          const existing = index >= 0 ? next[index] : null;
          if (change.removed) { if (index >= 0) next.splice(index, 1); }
          else if (change.element) { const item = { ...change.element, id: change.id, _t: change._t }; if (index >= 0) next[index] = item; else next.push(item); }
          else if (change.patch && existing) { const merged = { ...existing, ...change.patch, _t: change._t }; for (const key of Object.keys(change.patch)) if (change.patch[key] === null) delete merged[key]; next[index] = merged; }
        }
        coverSync.current.last = new Map(next.map((element) => [element.id, element])); // ce qui vient des autres n'est jamais renvoyé
        return next;
      });
    });
    // texte tapé dans la page de garde : transmis à chaque frappe (l'état n'est mis à jour qu'à la perte de focus)
    const onCoverInput = (event) => {
      const node = event.target.closest?.(".reconstructed-text-content[data-text-id]");
      if (!node) return;
      const sync = coverSync.current;
      sync.buffer.set(node.dataset.textId, { id: node.dataset.textId, patch: { text: node.innerText }, _t: Date.now() });
      clearTimeout(sync.timer);
      sync.timer = setTimeout(flushCover, 120);
    };
    document.addEventListener("input", onCoverInput, true);
    return () => { liveCollaboration.setCoverHandler(null); document.removeEventListener("input", onCoverInput, true); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    getCoverSuggestions()
      .then((data) => setRecentLogos(data.logos || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (
      JSON.stringify(coverElements) !==
      JSON.stringify(documentData.coverElements || [])
    )
      setSaved(false);
  }, [project.id]);
  useEffect(() => {
    if (readOnly) return;
    const cleanups = [];
    selected.forEach((chapter) => {
      const body = refs.current[`body-${chapter.id}`];
      if (!body) return;
      const dragStart = (event) => {
        const handle = event.target.closest(".reused-block-handle");
        const block = handle?.closest(".reused-clause-block");
        if (!block) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "text/x-reused-block",
          block.dataset.reusedBlockId,
        );
        block.classList.add("dragging");
      };
      const dragEnd = (event) =>
        event.target
          .closest(".reused-clause-block")
          ?.classList.remove("dragging");
      const dragOver = (event) => {
        if (event.dataTransfer.types.includes("text/x-reused-block")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      };
      const drop = (event) => {
        const id = event.dataTransfer.getData("text/x-reused-block");
        if (!id) return;
        event.preventDefault();
        const block = body.querySelector(
          `[data-reused-block-id="${CSS.escape(id)}"]`,
        );
        if (!block) return;
        const target = event.target.closest(".reused-clause-block,p,li,div");
        if (!target || target === block || block.contains(target))
          body.appendChild(block);
        else {
          const direct = [...body.children].find(
            (child) => child === target || child.contains(target),
          );
          if (direct && direct !== block) body.insertBefore(block, direct);
        }
        block.classList.remove("dragging");
        dirty();
      };
      body.addEventListener("dragstart", dragStart);
      body.addEventListener("dragend", dragEnd);
      body.addEventListener("dragover", dragOver);
      body.addEventListener("drop", drop);
      cleanups.push(() => {
        body.removeEventListener("dragstart", dragStart);
        body.removeEventListener("dragend", dragEnd);
        body.removeEventListener("dragover", dragOver);
        body.removeEventListener("drop", drop);
      });
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [project.id, readOnly]);
  useEffect(() => {
    if (readOnly) return;
    const root = document.querySelector(".document-editor");
    if (!root) return;
    const dragStart = (event) => {
      const figure = event.target.closest?.(".user-document-image");
      if (!figure) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/x-calepin-document-image",
        figure.dataset.documentImageId,
      );
      figure.classList.add("dragging");
    };
    const dragEnd = (event) =>
      event.target
        .closest?.(".user-document-image")
        ?.classList.remove("dragging");
    const dragOver = (event) => {
      if (
        event.dataTransfer.types.includes(
          "application/x-calepin-document-image",
        ) &&
        event.target.closest?.(".rich-chapter-body")
      )
        event.preventDefault();
    };
    const drop = (event) => {
      const id = event.dataTransfer.getData(
        "application/x-calepin-document-image",
      );
      if (!id) return;
      const body = event.target.closest?.(".rich-chapter-body");
      const figure = root.querySelector(
        `[data-document-image-id="${CSS.escape(id)}"]`,
      );
      if (!body || !figure) return;
      event.preventDefault();
      const direct = [...body.children].find(
        (child) => child === event.target || child.contains(event.target),
      );
      if (direct && direct !== figure) body.insertBefore(figure, direct);
      else body.appendChild(figure);
      figure.classList.remove("dragging");
      dirty();
    };
    root.addEventListener("dragstart", dragStart);
    root.addEventListener("dragend", dragEnd);
    root.addEventListener("dragover", dragOver);
    root.addEventListener("drop", drop);
    return () => {
      root.removeEventListener("dragstart", dragStart);
      root.removeEventListener("dragend", dragEnd);
      root.removeEventListener("dragover", dragOver);
      root.removeEventListener("drop", drop);
    };
  }, [project.id, readOnly]);
  const completed = useMemo(
    () =>
      selected.filter((chapter) =>
        (project.sections[chapter.id]?.content || "").trim(),
      ).length,
    [project, selected],
  );
  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="390" viewBox="0 0 560 390"><text x="280" y="195" text-anchor="middle" dominant-baseline="middle" transform="rotate(${watermark.angle} 280 195)" fill="#526b60" fill-opacity="${watermark.opacity / 100}" font-family="Arial,sans-serif" font-size="${watermark.size}" font-weight="700" letter-spacing="5">${escapeHtml(String(watermark.text || ""))}</text></svg>`;
  const themedPaperStyle = {
    "--document-font": pageTemplate.fontFamily || "Georgia, serif",
    "--document-font-size": `${pageTemplate.fontSizePt || 10.5}pt`,
    "--document-line-height": `${pageTemplate.lineHeightPt || 16}pt`,
    "--document-text-color": pageTemplate.textColor || "#353b38",
    "--document-heading-color": pageTemplate.headingColor || "#1b2f29",
    "--document-lot-title-size": `${pageTemplate.headingStyles?.[0]?.sizePt || 16}pt`,
    "--document-lot-title-align": (() => { const align = headingAlign(pageTemplate.headingStyles?.[0]); return align === "center" || align === "right" ? align : "var(--document-title-align, left)"; })(),
    "--document-lot-title-weight":
      pageTemplate.headingStyles?.[0]?.bold === false ? 400 : 700,
    "--document-accent-color":
      pageTemplate.accentColor || documentData.coverAccent || "#315f51",
    "--document-margin-top": `${pageTemplate.marginTopMm || 24}mm`,
    "--document-margin-right": `${pageTemplate.marginRightMm || 22}mm`,
    "--document-margin-bottom": `${pageTemplate.marginBottomMm || 20}mm`,
    "--document-margin-left": `${pageTemplate.marginLeftMm || 22}mm`,
    "--document-title-align": pageTemplate.titleAlign || "left",
    "--document-subtitle-align": pageTemplate.subtitleAlign || "left",
    "--document-first-line-indent": `${Number(pageTemplate.firstLineIndentMm) || 0}mm`,
    "--watermark-image":
      watermark.enabled && watermark.text.trim()
        ? `url("data:image/svg+xml,${encodeURIComponent(watermarkSvg)}")`
        : "none",
  };
  const dirty = () => setSaved(false);
  const updatePageTemplate = (changes) => {
    setPageTemplate((current) => {
      const next = { ...current, ...changes };
      documentData.pageTemplate = next;
      return next;
    });
    dirty();
  };
  const autoFormatDocument = async () => {
    // Les réglages du profil font foi : le bouton les relit (le CCTP peut avoir été créé avant leur dernière modification)
    let headingStyles = pageTemplate.headingStyles;
    try {
      const preferences = await getFormattingPreferences();
      if (Array.isArray(preferences?.headingStyles) && preferences.headingStyles.length === 4) {
        headingStyles = preferences.headingStyles;
        updatePageTemplate({ headingStyles });
      }
    } catch {
      /* hors ligne ou session expirée : on garde la mise en forme du CCTP */
    }
    selected.forEach((chapter, index) => {
      const body = refs.current[`body-${chapter.id}`];
      if (!body) return;
      const normalized = enrichToc(
        renumberChapterHtml(body.innerHTML, index + 1),
        chapter.id,
        headingStyles,
      );
      const root = document.createElement("div");
      root.innerHTML = normalized.html;
      [...root.querySelectorAll("*")].forEach((node) => {
        if (node.matches("img,figure,.user-document-image,figcaption")) return;
        node.removeAttribute("style");
        node.removeAttribute("face");
        node.removeAttribute("size");
        node.removeAttribute("color");
      });
      [...root.querySelectorAll("[class*='document-subheading-']")].forEach(
        (node) => {
          const depth = [...node.classList]
            .map((name) => name.match(/^document-subheading-(\d)$/)?.[1])
            .find(Boolean);
          if (depth)
            applyHeadingStyle(node, Number(depth), headingStyles);
        },
      );
      [...root.querySelectorAll("b,strong")].forEach((mark) => {
        const parent = mark.parentElement;
        mark.replaceWith(...mark.childNodes);
        parent?.normalize();
      });
      [...root.children].forEach((node) => {
        if (node.classList.contains("document-subheading")) return;
        const text = node.innerText.trim();
        if (/^[o•●▪◦]\s+/i.test(text))
          node.classList.add("document-bullet-item");
      });
      const blocks = [...root.children];
      blocks.forEach((node, nodeIndex) => {
        if (nodeIndex === 0) return;
        const previous = blocks[nodeIndex - 1];
        if (!node.isConnected || !previous?.isConnected) return;
        if (
          node.classList.contains("document-subheading") ||
          node.classList.contains("document-check-item") ||
          node.classList.contains("document-bullet-item") ||
          node.classList.contains("document-source-footer")
        )
          return;
        if (
          previous.classList.contains("document-subheading") ||
          previous.classList.contains("document-check-item") ||
          previous.classList.contains("document-bullet-item") ||
          previous.classList.contains("document-source-footer")
        )
          return;
        const prior = previous.innerText.trim(),
          current = node.innerText.trim();
        if (prior && !/[.!?;:]$/.test(prior) && /^[a-zà-ÿ(]/.test(current)) {
          previous.append(` ${current}`);
          node.remove();
        }
      });
      body.innerHTML = root.innerHTML;
    });
    setAiTarget(null);
    dirty();
  };
  const rememberSelection = (event) => {
    const selection = window.getSelection();
    if (selection?.rangeCount)
      lastRange.current = selection.getRangeAt(0).cloneRange();
    if (event?.currentTarget) {
      document
        .querySelectorAll(".ai-active-paragraph")
        .forEach((node) => node.classList.remove("ai-active-paragraph"));
      const candidate =
        event.target.closest("p,li,.rich-chapter-body>div") ||
        event.currentTarget;
      const chapterId = event.currentTarget.dataset.aiChapterId;
      if (chapterId) candidate.dataset.aiChapterId = chapterId;
      candidate.classList.add("ai-active-paragraph");
      setAiTarget(candidate);
    }
  };
  const format = (command, value = null) => {
    restoreSelection();
    document.execCommand(command, false, value);
    rememberSelection();
    dirty();
  };
  // Un changement fait directement dans le DOM (classe, caractère) n'émet pas d'événement « input » : on l'émet pour qu'il soit synchronisé en direct et ne soit pas écrasé.
  const notifyInput = (node) => node?.closest?.("[data-collab-key]")?.dispatchEvent(new Event("input", { bubbles: true }));
  const suggesting = editMode === "suggest"; // en mode suggestion, la mise en forme n'est pas proposable : ces commandes sont désactivées
  // Même mécanisme que le gras / italique, mais le résultat est écrit en CSS (couleur, surlignage, police) pour que l'export Word / PDF le retrouve.
  const formatCss = (command, value) => {
    document.execCommand("styleWithCSS", false, true);
    format(command, value);
    document.execCommand("styleWithCSS", false, false);
  };
  const applyColor = (color) => formatCss("foreColor", color || "#000000");
  const applyHighlight = (color) => formatCss("hiliteColor", color || "transparent");
  const applyFont = (name) => { if (name) formatCss("fontName", name); };
  // Style du paragraphe : Normal, Titre 1, 2 ou 3 (alimentent aussi le sommaire)
  const [blockStyle, setBlockStyle] = useState("p");
  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      const block = selection?.anchorNode ? topBlock(selection.anchorNode) : null;
      setBlockStyle(block ? styleOf(block) : "p");
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);
  // La sélection actuelle fait foi quand elle est dans le texte (touche Tab, menu déroulant) ; sinon on reprend la dernière position connue (clic sur un bouton).
  const restoreSelection = () => {
    const selection = window.getSelection();
    const inside = selection?.rangeCount && selection.anchorNode && (selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement)?.closest?.(".rich-chapter-body");
    if (!inside && lastRange.current) { selection.removeAllRanges(); selection.addRange(lastRange.current); }
    return selection;
  };
  const currentBlock = () => {
    const selection = restoreSelection();
    return selection?.anchorNode ? topBlock(selection.anchorNode) : null;
  };
  const applyDocStyle = (style) => {
    const block = currentBlock();
    if (!block) return;
    const align = block.style.textAlign;
    block.classList.remove("document-subheading", "document-subheading-1", "document-subheading-2", "document-subheading-3");
    block.removeAttribute("style");
    if (align) block.style.textAlign = align;
    if (STYLE_DEPTH[style]) {
      block.setAttribute("data-doc-style", style);
      block.classList.add("document-subheading", `document-subheading-${STYLE_DEPTH[style]}`);
      applyHeadingStyle(block, STYLE_DEPTH[style], pageTemplate.headingStyles);
    } else block.removeAttribute("data-doc-style");
    setBlockStyle(style);
    notifyInput(block);
    rememberSelection();
    dirty();
  };
  // Retrait : dans une liste on emboîte / on remonte l'élément, dans un tableau on ne touche à rien, sinon on décale le paragraphe
  const changeIndent = (direction) => {
    const selection = restoreSelection();
    const anchor = selection?.anchorNode?.nodeType === 1 ? selection.anchorNode : selection?.anchorNode?.parentElement;
    if (anchor?.closest?.("li")) { document.execCommand(direction > 0 ? "indent" : "outdent"); rememberSelection(); dirty(); return; }
    const block = anchor ? topBlock(anchor) : null;
    if (!block || block.querySelector?.("table") || block.tagName === "TABLE") return;
    indentBlock(block, direction);
    notifyInput(block);
    rememberSelection();
    dirty();
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
    notifyInput(list || element);
    rememberSelection();
    dirty();
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
      const editor = element?.closest?.(".rich-chapter-body");
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
    notifyInput(element);
    rememberSelection();
    dirty();
  };
  const refFor = (key, node) => {
    if (node) refs.current[key] = node;
  };
  const html = (key, fallback = "") => documentData[key] || fallback;
  // Le texte tapé dans une zone de la page de garde n'est transmis à l'état qu'à la perte de focus :
  // on le relit donc dans la page au moment d'enregistrer, pour ne jamais enregistrer une zone vide
  // (enregistrement sans clic préalable ailleurs, raccourci, enregistrement automatique).
  const liveCoverElements = () => {
    const live = new Map(
      [...document.querySelectorAll(".reconstructed-text-content[data-text-id]")].map((node) => [node.dataset.textId, node.innerText]),
    );
    return coverElements
      .map((element) => (live.has(element.id) && live.get(element.id) !== element.text ? { ...element, text: live.get(element.id) } : element))
      .filter((element) => !(element.userCreated && element.type === "text" && !String(element.text || "").trim()));
  };
  const save = async () => {
    setSaving(true);
    const sections = { ...project.sections };
    const savedCoverElements = liveCoverElements();
    const reconstructed = savedCoverElements.length > 0;
    const meta = {
      ...documentData,
      coverElements: savedCoverElements,
      coverAspect,
      coverTextOffsets,
      coverLogos,
      coverSidebarColor,
      coverPageColor,
      watermark,
      introTitle: refs.current.introTitle.innerHTML,
      introText: refs.current.introText.innerHTML,
      footer: refs.current.footer.innerHTML,
      ...(!reconstructed
        ? {
            coverLabel: refs.current.coverLabel.innerHTML,
            coverTitle: refs.current.coverTitle.innerHTML,
            subtitle: refs.current.subtitle.innerHTML,
            coverSubtitle: refs.current.subtitle.innerText,
            coverContacts: refs.current.coverContacts?.innerText || "",
          }
        : {}),
    };
    sections.__document = meta;
    selected.forEach((chapter, index) => {
      const body = refs.current[`body-${chapter.id}`];
      sections[chapter.id] = {
        ...(sections[chapter.id] || {}),
        html: body.innerHTML,
        content: officialText(body).trim(),
        customNumber:
          refs.current[`number-${chapter.id}`].innerText.trim() ||
          String(index + 1).padStart(2, "0"),
        customCode: refs.current[`code-${chapter.id}`].innerText.trim(),
        customTitle: refs.current[`title-${chapter.id}`].innerText.trim(),
        ...(chapter.id === "06" && (answerOverrideRef.current || tracePatchRef.current)
          ? { questionnaire: {
            ...((sections[chapter.id] || {}).questionnaire || {}),
            ...(answerOverrideRef.current ? { state: answerOverrideRef.current } : {}),
            ...(tracePatchRef.current ? { traces: { ...(((sections[chapter.id] || {}).questionnaire || {}).traces || {}), [plasterMode]: tracePatchRef.current } } : {}),
          } }
          : {}),
        summary: officialText(body).trim().slice(0, 92) || "Chapitre à compléter",
      };
    });
    const nextTitle = reconstructed
      ? title
      : refs.current.coverTitle.innerText.trim() || title;
    setTitle(nextTitle);
    try {
      await onSave(nextTitle, sections);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };
  const addCoverLogos = (event) => {
    Array.from(event.target.files || [])
      .slice(0, 8 - coverLogos.length)
      .forEach((file) => {
        if (file.size > 2 * 1024 * 1024) return;
        const reader = new FileReader();
        reader.onload = () => {
          const id = crypto.randomUUID();
          setCoverLogos((current) => [
            ...current,
            {
              id,
              name: file.name,
              src: reader.result,
              x: 12 + (current.length % 2) * 58,
              y: 12 + Math.floor(current.length / 2) * 18,
              width: 28,
              caption: "",
              layout: "below",
            },
          ]);
          setSelectedLogoId(id);
          dirty();
        };
        reader.readAsDataURL(file);
      });
    event.target.value = "";
  };
  const updateLogo = (id, changes) => {
    setCoverLogos((items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
    dirty();
  };
  const addDocumentImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)
      return;
    const reader = new FileReader();
    reader.onload = () => {
      const probe = new window.Image();
      probe.onload = () =>
        setPendingImage({
          name: file.name,
          src: reader.result,
          size: 55,
          ratio: probe.naturalWidth / Math.max(1, probe.naturalHeight),
        });
      probe.onerror = () =>
        setPendingImage({
          name: file.name,
          src: reader.result,
          size: 55,
          ratio: 1.5,
        });
      probe.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  const placeDocumentImage = (data) => {
    const viewportCenter = window.innerHeight / 2;
    const coverCanvas = document.querySelector(
      ".document-editor .reconstructed-cover",
    );
    const coverRect = coverCanvas?.getBoundingClientRect();
    if (
      coverRect &&
      coverRect.top < viewportCenter &&
      coverRect.bottom > viewportCenter
    ) {
      const width = Math.max(10, Math.min(90, data.size));
      const height = Math.min(75, width / Math.max(0.3, data.ratio) / 1.4142);
      const y = Math.max(
        4,
        Math.min(
          96 - height,
          ((viewportCenter - coverRect.top) / coverRect.height) * 100 -
            height / 2,
        ),
      );
      setCoverElements((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          type: "image",
          name: data.name,
          src: data.src,
          x: (100 - width) / 2,
          y,
          width,
          height,
        },
      ]);
      dirty();
      setPendingImage(null);
      return;
    }
    const figure = document.createElement("figure");
    figure.className = "user-document-image";
    figure.draggable = true;
    figure.contentEditable = "false";
    figure.dataset.documentImageId = crypto.randomUUID();
    figure.style.width = `${data.size}%`;
    const image = document.createElement("img");
    image.src = data.src;
    image.alt = data.name;
    image.draggable = false;
    const caption = document.createElement("figcaption");
    caption.contentEditable = "true";
    caption.dataset.placeholder = "Ajouter une légende…";
    figure.append(image, caption);
    const bodies = selected
      .map((chapter) => refs.current[`body-${chapter.id}`])
      .filter(Boolean);
    const visibleTarget = bodies.sort((a, b) => {
      const ar = a.getBoundingClientRect(),
        br = b.getBoundingClientRect();
      const distance = (rect) =>
        rect.top <= viewportCenter && rect.bottom >= viewportCenter
          ? 0
          : Math.min(
              Math.abs(rect.top - viewportCenter),
              Math.abs(rect.bottom - viewportCenter),
            );
      return distance(ar) - distance(br);
    })[0];
    const selectedTarget = aiTarget?.closest?.(".rich-chapter-body");
    const selectedRect = selectedTarget?.getBoundingClientRect();
    const target =
      selectedRect &&
      selectedRect.bottom > 0 &&
      selectedRect.top < window.innerHeight
        ? selectedTarget
        : visibleTarget || refs.current[`body-${selected[0]?.id}`];
    if (!target) return;
    const selectedDirect =
      aiTarget && target.contains(aiTarget)
        ? [...target.children].find(
            (child) => child === aiTarget || child.contains(aiTarget),
          )
        : null;
    const visibleDirect = [...target.children]
      .filter((child) => child.getBoundingClientRect().top < window.innerHeight)
      .sort(
        (a, b) =>
          Math.abs(a.getBoundingClientRect().bottom - viewportCenter) -
          Math.abs(b.getBoundingClientRect().bottom - viewportCenter),
      )[0];
    const anchor = selectedDirect || visibleDirect;
    if (anchor) anchor.insertAdjacentElement("afterend", figure);
    else target.appendChild(figure);
    dirty();
    setPendingImage(null);
    figure.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const reuseLogo = (logo) => {
    const id = crypto.randomUUID();
    setCoverLogos((current) => [
      ...current,
      {
        ...logo,
        id,
        x: 14 + (current.length % 2) * 56,
        y: 14 + Math.floor(current.length / 2) * 18,
        caption: logo.caption || "",
        layout: "below",
        width: logo.width || 28,
      },
    ]);
    setSelectedLogoId(id);
    setLogoLibraryOpen(false);
    dirty();
  };
  const moveLogo = (event, id) => {
    if (draggingLogo.current !== id) return;
    const rect = refs.current.coverCanvas.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
    );
    const y = Math.max(
      0,
      Math.min(100, ((event.clientY - rect.top) / rect.height) * 100),
    );
    setCoverLogos((items) =>
      items.map((item) => (item.id === id ? { ...item, x, y } : item)),
    );
    dirty();
  };
  const resizeLogo = (event, id) => {
    const resizing = resizingLogo.current;
    if (!resizing || resizing.id !== id) return;
    const delta =
      ((event.clientX - resizing.startX) / resizing.canvasWidth) * 100;
    updateLogo(id, {
      width: Math.max(12, Math.min(65, resizing.startWidth + delta)),
    });
  };
  const exportFile = async (formatName, options) => {
    setExporting(true);
    try {
      if (!saved) await save();
      await downloadCctp(
        project.id,
        formatName,
        title.replace(/[^a-zA-Z0-9À-ÿ_-]+/g, "-"),
        options,
      );
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  };
  const applyAi = (proposal, mode) => {
    if (!aiTarget) return;
    if (mode === "replace") {
      if (aiTarget.dataset.aiChapter) aiTarget.innerHTML = textToHtml(proposal);
      else aiTarget.innerText = proposal;
    } else {
      const paragraph = document.createElement("div");
      paragraph.innerText = proposal;
      aiTarget.insertAdjacentElement("afterend", paragraph);
      setAiTarget(paragraph);
    }
    dirty();
    setAiOpen(false);
  };
  const openChapterAi = (chapter) => {
    if (chapter.id !== "06") {
      onUnavailable(chapter);
      return;
    }
    const target = refs.current[`body-${chapter.id}`];
    target.dataset.aiChapter = chapter.title;
    target.dataset.aiChapterId = chapter.id;
    document
      .querySelectorAll(".ai-active-paragraph")
      .forEach((node) => node.classList.remove("ai-active-paragraph"));
    target.classList.add("ai-active-paragraph");
    setAiTarget(target);
    setAiOpen(true);
  };
  const openContextAi = () => {
    const chapter = chapters.find(
      (item) => item.id === aiTarget?.dataset?.aiChapterId,
    );
    if (!chapter || chapter.id !== "06") {
      onUnavailable(chapter);
      return;
    }
    setAiOpen(true);
  };
  const button = (label, Icon, command) => (
    <button
      title={label}
      onMouseDown={(event) => {
        event.preventDefault();
        format(command);
      }}
    >
      <Icon size={16} />
    </button>
  );
  saveRef.current = save; toolbarActionsRef.current.indent = changeIndent;
  const discardChanges = () => {
    const scrollY = window.scrollY;
    setTitle(project.name);
    setCoverLogos(documentData.coverLogos || []);
    setCoverTextOffsets(documentData.coverTextOffsets || {});
    setCoverElements(
      normalizeCoverElements(
        documentData.coverElements?.length
          ? documentData.coverElements
          : createBlankCoverElements({
              title: project.name,
              subtitle: documentData.coverSubtitle,
              contacts: documentData.coverContacts,
              label: documentData.coverLabelText,
              logos: documentData.coverLogos,
            }),
      ),
    );
    setCoverSidebarColor(documentData.coverSidebarColor || "#eef0ec");
    setCoverPageColor(documentData.coverPageColor || "#ffffff");
    setWatermark({
      enabled: false,
      text: "CONFIDENTIEL",
      opacity: 12,
      size: 42,
      angle: -35,
      ...(documentData.watermark || {}),
    });
    const restoredTemplate =
      savedPageTemplateRef.current || documentData.pageTemplate || {};
    documentData.pageTemplate = { ...restoredTemplate };
    setPageTemplate({ ...restoredTemplate });
    if (refs.current.introTitle)
      refs.current.introTitle.innerHTML = html(
        "introTitle",
        "Objet du document",
      );
    if (refs.current.introText)
      refs.current.introText.innerHTML = html(
        "introText",
        "Le présent Cahier des Clauses Techniques Particulières définit les prescriptions applicables aux travaux de l’opération. Les descriptions ci-après précisent les exigences attendues pour chaque lot.",
      );
    if (refs.current.footer)
      refs.current.footer.innerHTML = html(
        "footer",
        `Document de travail — ${escapeHtml(project.name)}`,
      );
    if (refs.current.coverLabel)
      refs.current.coverLabel.innerHTML = html(
        "coverLabel",
        "CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES",
      );
    if (refs.current.coverTitle)
      refs.current.coverTitle.innerHTML = html(
        "coverTitle",
        escapeHtml(project.name),
      );
    if (refs.current.subtitle)
      refs.current.subtitle.innerHTML = html(
        "subtitle",
        escapeHtml(
          documentData.coverSubtitle ||
            `Document de travail · ${selected.length} lots`,
        ),
      );
    if (refs.current.coverContacts)
      refs.current.coverContacts.innerHTML = textToHtml(
        documentData.coverContacts ||
          "Cliquez ici pour ajouter les coordonnées et intervenants du projet.",
      );
    selected.forEach((chapter, index) => {
      const section = project.sections[chapter.id] || {};
      const body = refs.current[`body-${chapter.id}`];
      if (body)
        body.innerHTML = enrichToc(
          renumberChapterHtml(
            section.html || textToHtml(section.content || ""),
            index + 1,
          ),
          chapter.id,
          restoredTemplate.headingStyles,
        ).html;
      if (refs.current[`number-${chapter.id}`])
        refs.current[`number-${chapter.id}`].innerText =
          section.customNumber || String(index + 1).padStart(2, "0");
      if (refs.current[`code-${chapter.id}`])
        refs.current[`code-${chapter.id}`].innerText =
          section.customCode || chapter.code;
      if (refs.current[`title-${chapter.id}`])
        refs.current[`title-${chapter.id}`].innerText =
          section.customTitle || chapter.title;
    });
    setAiTarget(null);
    setSelectedLogoId(null);
    setDiscardDialogOpen(false);
    setSaved(true);
    requestAnimationFrame(() =>
      window.scrollTo({ top: scrollY, behavior: "instant" }),
    );
  };
  return (
    <main
      ref={spellRootRef}
      className={`document-editor ${aiOpen ? "ai-focus-mode" : ""} ${readOnly ? "read-only" : ""}`}
      data-collaboration={liveCollaboration.connected ? "connected" : "reconnecting"}
      onBeforeInput={(event) => { if (readOnly && !event.target.closest?.("textarea, input, [data-cctp-chat], .comments-panel")) event.preventDefault(); }}
    >
      <FindReplace rootRef={spellRootRef} readOnly={readOnly} onChanged={dirty} />
      <EditorContextMenu rootRef={spellRootRef} readOnly={readOnly} />
      <SuggestionMode rootRef={spellRootRef} readOnly={project.accessRole === "read"} currentEmail={user?.email || ""} mode={editMode} onModeChange={setEditMode} />
      {(project.shared || project.agency) && <CctpChat projectId={project.id} currentEmail={user?.email || ""} currentUserId={user?.id || ""} isOwner={project.accessRole === "owner"} canPin={project.accessRole !== "read"} subscribe={liveCollaboration.subscribeChat} />}
      <DocumentComments project={project} rootRef={spellRootRef} readOnly={project.accessRole === "read"} event={liveCollaboration.commentEvent} currentEmail={user?.email || ""} focusCommentId={focusCommentId} />
      {liveCollaboration.conflict && <div className="collaboration-conflict" role="alert"><b>Modification simultanée détectée</b><span>Votre texte est conservé. Choisissez la version à garder.</span><button onClick={() => liveCollaboration.resolveConflict("remote")}>Voir la version reçue</button><button onClick={() => liveCollaboration.resolveConflict("local")}>Garder ma version</button></div>}
      {proposal && (
        <div className="export-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setProposal(null)}>
          <section className="export-dialog" role="dialog" aria-label="Proposer à l’équipe" data-team-propose-dialog>
            <header>
              <h2>Proposer à la bibliothèque de l’équipe</h2>
              <button className="export-close" onClick={() => setProposal(null)} aria-label="Fermer"><X size={17} /></button>
            </header>
            {!proposal.text && !proposal.done ? (
              <p data-team-propose-empty>Sélectionnez d’abord un passage dans un chapitre du CCTP, puis cliquez de nouveau sur « Proposer à l’équipe ».</p>
            ) : proposal.done ? (
              <p data-team-propose-done>{proposal.done}</p>
            ) : (
              <>
                <label>Titre
                  <input value={proposal.label} onChange={(event) => setProposal({ ...proposal, label: event.target.value })} maxLength={160} />
                </label>
                <label>Texte de la clause
                  <textarea rows={7} value={proposal.text} onChange={(event) => setProposal({ ...proposal, text: event.target.value })} />
                </label>
                {proposal.error && <div className="login-error" role="alert">{proposal.error}</div>}
                <footer>
                  <small>Un valideur la relira avant publication{team?.role === "admin" || team?.role === "validator" ? " (vous pouvez la publier directement)" : ""}.</small>
                  <button className="export-submit" data-team-propose-send disabled={proposal.busy || proposal.text.trim().length < 3} onClick={sendProposal}>
                    {proposal.busy ? "Envoi…" : "Envoyer à l’équipe"}
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
      {exportOpen && (
        <ExportDialog
          title={title}
          template={pageTemplate}
          busy={exporting}
          hasVersions={Object.entries(project.sections || {}).some(
            ([key, section]) =>
              !key.startsWith("__") &&
              section?.variants?.notice?.content?.trim() &&
              section?.variants?.cctp?.content?.trim(),
          )}
          onExport={exportFile}
          onClose={() => setExportOpen(false)}
        />
      )}
      {watermarkOpen && (
        <aside className="watermark-panel">
          <header>
            <div>
              <Stamp size={18} />
              <span>
                <b>Filigrane du CCTP</b>
                <small>
                  Visible dans l’aperçu, le PDF et le document Word.
                </small>
              </span>
            </div>
            <button onClick={() => setWatermarkOpen(false)}>
              <X size={17} />
            </button>
          </header>
          <label className="watermark-toggle">
            <input
              type="checkbox"
              checked={watermark.enabled}
              onChange={(event) => {
                setWatermark((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }));
                dirty();
              }}
            />
            <span>Afficher le filigrane</span>
          </label>
          <label>
            Texte
            <input
              value={watermark.text}
              maxLength={60}
              onChange={(event) => {
                setWatermark((current) => ({
                  ...current,
                  text: event.target.value,
                }));
                dirty();
              }}
              placeholder="Ex. CONFIDENTIEL"
            />
          </label>
          <div>
            <label>
              Opacité
              <input
                type="range"
                min="5"
                max="35"
                value={watermark.opacity}
                onChange={(event) => {
                  setWatermark((current) => ({
                    ...current,
                    opacity: Number(event.target.value),
                  }));
                  dirty();
                }}
              />
            </label>
            <label>
              Taille
              <input
                type="range"
                min="24"
                max="80"
                value={watermark.size}
                onChange={(event) => {
                  setWatermark((current) => ({
                    ...current,
                    size: Number(event.target.value),
                  }));
                  dirty();
                }}
              />
            </label>
          </div>
        </aside>
      )}
      <div className="editor-bar" data-editor-bar>
        <button className="back-link" data-back-to-draft onClick={onBack} title="Retour au brouillon" aria-label="Retour au brouillon">
          <ArrowLeft size={17} />
        </button>
      <div
        className={`rich-toolbar ${readOnly ? "read-only" : ""}`}
        inert={readOnly ? "" : undefined}
        role="toolbar"
        aria-label="Mise en forme du texte"
      >
        <button title="Annuler (Ctrl+Z) : seulement vos propres modifications" data-undo onMouseDown={(event) => { event.preventDefault(); liveCollaboration.undo(); }}><Undo2 size={16} /></button>
        <button title="Rétablir (Ctrl+Y)" data-redo onMouseDown={(event) => { event.preventDefault(); liveCollaboration.redo(); }}><Redo2 size={16} /></button>
        <i />
        <select className="toolbar-style" data-style-select title="Style du paragraphe (les titres alimentent le sommaire)" value={blockStyle} disabled={suggesting}
          onChange={(event) => applyDocStyle(event.target.value)}>
          {Object.entries(STYLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="toolbar-font" data-font-select title="Police du texte sélectionné" value="" disabled={suggesting} onChange={(event) => applyFont(event.target.value)}>
          <option value="">Police</option>
          {["Arial", "Calibri", "Cambria", "Georgia", "Times New Roman", "Verdana", "Courier New"].map((name) => <option key={name} value={name} style={{ fontFamily: name }}>{name}</option>)}
        </select>
        <select
          defaultValue="3"
          title="Taille du texte sélectionné"
          onChange={(event) => format("fontSize", event.target.value)}
        >
          <option value="1">10 px</option>
          <option value="2">12 px</option>
          <option value="3">14 px</option>
          <option value="4">18 px</option>
          <option value="5">24 px</option>
          <option value="6">32 px</option>
          <option value="7">48 px</option>
        </select>
        <i />
        {button("Gras", Bold, "bold")}
        {button("Italique", Italic, "italic")}
        {button("Souligné", Underline, "underline")}
        <ColorPicker icon={Baseline} title="Couleur du texte" dataKey="text" colors={TEXT_COLORS} current="#c0392b" noneLabel="Automatique (noir)" onPick={applyColor} disabled={suggesting} />
        <ColorPicker icon={Highlighter} title="Surlignage" dataKey="highlight" colors={HIGHLIGHTS} current="#fff176" noneLabel="Aucun surlignage" onPick={applyHighlight} disabled={suggesting} />
        <i />
        {button("Aligner à gauche", AlignLeft, "justifyLeft")}
        {button("Centrer", AlignCenter, "justifyCenter")}
        {button("Aligner à droite", AlignRight, "justifyRight")}
        <i />
        <div className="toolbar-lists" ref={listsMenuRef}>
          <button
            type="button"
            className="toolbar-list-action toolbar-lists-trigger"
            data-toolbar-lists
            title="Listes : puces, numéros, cases à cocher, check"
            aria-haspopup="menu"
            aria-expanded={listsOpen}
            onMouseDown={(event) => {
              event.preventDefault();
              setListsOpen((value) => !value);
            }}
          >
            <List size={15} />
            <small>Listes</small>
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
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  title={hint}
                  data-toolbar-list={label}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    run();
                    setListsOpen(false);
                  }}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={documentImagePicker}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={addDocumentImage}
        />
        <button
          className="toolbar-list-action toolbar-image-action"
          title="Ajouter une image à cet endroit"
          onClick={() => documentImagePicker.current?.click()}
        >
          <ImagePlus size={15} />
          <small>Image</small>
        </button>
        {plasterTrace.length > 0 && (
          <button
            className={`toolbar-spellcheck answer-trace-toggle ${traceListOpen ? "active" : ""}`}
            data-trace-toggle
            aria-pressed={traceListOpen}
            title="Liste des endroits issus de vos réponses : un clic renvoie à la question correspondante (les passages restent surlignés)"
            onClick={() => setTraceListOpen((value) => !value)}
          >
            <FileSearch size={15} />
            <small>Mes réponses</small>
          </button>
        )}
        <i />
        <div className="toolbar-more" ref={moreMenuRef}>
          <button
            type="button"
            className={`toolbar-more-trigger ${moreOpen ? "active" : ""}`}
            data-toolbar-more
            title="Autres outils : aide à l’écriture, orthographe, mise en forme du document, barré, justifié, retraits"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onMouseDown={(event) => { event.preventDefault(); setMoreOpen((value) => !value); }}
          >
            <MoreHorizontal size={17} />
            <small>Plus</small>
          </button>
          {moreOpen && (
            <div className="toolbar-more-menu" role="menu" data-toolbar-more-menu>
        <button
          className={`ai-context-button ${aiTarget?.dataset?.aiChapterId && aiTarget.dataset.aiChapterId !== "06" ? "ai-disabled" : ""}`}
          disabled={!aiTarget}
          onClick={openContextAi}
        >
          <Sparkles size={15} /> Aide à l’écriture
        </button>
        {aiTarget && (
          <span className="ai-target-label">
            {aiTarget.innerText?.slice(0, 28) || "Paragraphe vide"}
          </span>
        )}
        <button
          className={`toolbar-spellcheck ${spellcheckEnabled ? "active" : ""}`}
          aria-pressed={spellcheckEnabled}
          title="Activer ou désactiver le soulignement automatique"
          onClick={() => setSpellcheckEnabled((value) => !value)}
        >
          <SpellCheck2 size={15} />
          <small>Orthographe</small>
        </button>
        <button
          className={`format-rules-button ${formatRulesOpen ? "active" : ""}`}
          onClick={() => setFormatRulesOpen((value) => !value)}
        >
          <SlidersHorizontal size={15} /> Mise en forme
        </button>
        <button
          className="auto-format-button"
          title="Réorganiser tout le CCTP selon les règles de mise en forme"
          onClick={autoFormatDocument}
        >
          <Sparkles size={15} /> Mise en forme auto
        </button>
        {button("Barré", Strikethrough, "strikeThrough")}
        {button("Justifier", AlignJustify, "justifyFull")}
        <button type="button" title="Diminuer le retrait (Maj + Tab)" data-indent-less disabled={suggesting} onMouseDown={(event) => { event.preventDefault(); changeIndent(-1); }}><IndentDecrease size={16} /></button>
        <button type="button" title="Augmenter le retrait (Tab)" data-indent-more disabled={suggesting} onMouseDown={(event) => { event.preventDefault(); changeIndent(1); }}><IndentIncrease size={16} /></button>
            </div>
          )}
        </div>
      </div>
        <div className="editor-bar-end">
          {project.shared && <small className={`live-collaboration-state ${liveCollaboration.syncState}`} data-live-save-state={liveCollaboration.syncState}>
            {readOnly ? "● Collaboration en direct · lecture seule" : liveCollaboration.syncState === "saving" ? "● Enregistrement…" : liveCollaboration.syncState === "offline" ? "○ Hors connexion · modifications conservées" : liveCollaboration.syncState === "saved" ? "● Enregistré" : "○ Connexion…"}
          </small>}
          <div className="editor-actions">
          <button
            className={`secondary ${watermark.enabled ? "active" : ""}`}
            onClick={() => setWatermarkOpen((value) => !value)}
          >
            <Stamp size={16} /> Filigrane
          </button>
          <button
            className="secondary"
            data-export-open
            onClick={() => setExportOpen(true)}
          >
            <FileDown size={16} /> Exporter
          </button>
          {/* Le bouton n'apparaît que lorsqu'il y a quelque chose à enregistrer (plus de bouton « Enregistré » inutile) */}
          {(!saved || saving) && <button
            className="save-button"
            onClick={save}
            disabled={saving || saved}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}{" "}
            {saving ? "Enregistrement…" : saved ? "Enregistré" : "Enregistrer"}
          </button>}
          </div>
        </div>
      </div>
      {formatRulesOpen && (
        <aside className="format-rules-panel">
          <header>
            <div>
              <SlidersHorizontal size={18} />
              <span>
                <b>Règles de mise en forme</b>
                <small>
                  Ces réglages s’appliquent à l’aperçu, au PDF et au document
                  Word.
                </small>
              </span>
            </div>
            <button onClick={() => setFormatRulesOpen(false)}>
              <X size={17} />
            </button>
          </header>
          <div className="format-rules-grid">
            <label>
              Police
              <select
                value={pageTemplate.fontFamily}
                onChange={(event) =>
                  updatePageTemplate({ fontFamily: event.target.value })
                }
              >
                <option value="Arial, sans-serif">Arial</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="Times New Roman, serif">Times New Roman</option>
                <option value="Calibri, sans-serif">Calibri</option>
              </select>
            </label>
            <label>
              Taille du corps
              <input
                type="number"
                min="7"
                max="18"
                step="0.5"
                value={pageTemplate.fontSizePt}
                onChange={(event) =>
                  updatePageTemplate({ fontSizePt: Number(event.target.value) })
                }
              />
              <small>pt</small>
            </label>
            <label>
              Interligne
              <input
                type="number"
                min="9"
                max="30"
                step="0.5"
                value={pageTemplate.lineHeightPt}
                onChange={(event) =>
                  updatePageTemplate({
                    lineHeightPt: Number(event.target.value),
                  })
                }
              />
              <small>pt</small>
            </label>
            <label>
              Couleur du texte
              <input
                type="color"
                value={pageTemplate.textColor}
                onChange={(event) =>
                  updatePageTemplate({ textColor: event.target.value })
                }
              />
            </label>
            <label>
              Couleur des titres
              <input
                type="color"
                value={pageTemplate.headingColor}
                onChange={(event) =>
                  updatePageTemplate({ headingColor: event.target.value })
                }
              />
            </label>
            <label>
              Couleur d’accent
              <input
                type="color"
                value={pageTemplate.accentColor}
                onChange={(event) =>
                  updatePageTemplate({ accentColor: event.target.value })
                }
              />
            </label>
          </div>
          <fieldset>
            <legend>Alignement et paragraphes</legend>
            <div className="format-rules-grid">
              <label>
                Alignement des titres
                <select
                  value={pageTemplate.titleAlign}
                  onChange={(event) =>
                    updatePageTemplate({ titleAlign: event.target.value })
                  }
                >
                  <option value="left">À gauche</option>
                  <option value="center">Centré</option>
                  <option value="right">À droite</option>
                </select>
              </label>
              <label>
                Alignement des sous-titres
                <select
                  value={pageTemplate.subtitleAlign}
                  onChange={(event) =>
                    updatePageTemplate({ subtitleAlign: event.target.value })
                  }
                >
                  <option value="left">À gauche</option>
                  <option value="center">Centré</option>
                  <option value="right">À droite</option>
                </select>
              </label>
              <label>
                Alinéa des paragraphes
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={pageTemplate.firstLineIndentMm}
                  onChange={(event) =>
                    updatePageTemplate({
                      firstLineIndentMm: Number(event.target.value),
                    })
                  }
                />
                <small>mm</small>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Marges de la page</legend>
            <div className="format-rules-grid margins">
              <label>
                Haut
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={pageTemplate.marginTopMm}
                  onChange={(event) =>
                    updatePageTemplate({
                      marginTopMm: Number(event.target.value),
                    })
                  }
                />
                <small>mm</small>
              </label>
              <label>
                Droite
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={pageTemplate.marginRightMm}
                  onChange={(event) =>
                    updatePageTemplate({
                      marginRightMm: Number(event.target.value),
                    })
                  }
                />
                <small>mm</small>
              </label>
              <label>
                Bas
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={pageTemplate.marginBottomMm}
                  onChange={(event) =>
                    updatePageTemplate({
                      marginBottomMm: Number(event.target.value),
                    })
                  }
                />
                <small>mm</small>
              </label>
              <label>
                Gauche
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={pageTemplate.marginLeftMm}
                  onChange={(event) =>
                    updatePageTemplate({
                      marginLeftMm: Number(event.target.value),
                    })
                  }
                />
                <small>mm</small>
              </label>
            </div>
          </fieldset>
          <button
            className="format-reset"
            onClick={() =>
              updatePageTemplate({
                marginTopMm: 24,
                marginRightMm: 22,
                marginBottomMm: 20,
                marginLeftMm: 22,
                fontFamily: "Georgia, serif",
                fontSizePt: 10.5,
                lineHeightPt: 16,
                textColor: "#353b38",
                headingColor: "#1b2f29",
                accentColor: "#315f51",
                titleAlign: "left",
                subtitleAlign: "left",
                firstLineIndentMm: 0,
              })
            }
          >
            Rétablir les réglages standards
          </button>
        </aside>
      )}
      <div className="editor-shell">
        <aside className="outline">
          <div className="outline-head">
            <FileText size={17} />
            <span>
              <b>Sommaire</b>
              <small>
                {completed}/{selected.length} chapitres rédigés
              </small>
            </span>
          </div>
          <nav>
            {selected.map((chapter, index) => (
              <div className="outline-lot" key={chapter.id}>
                <a href={`#chapter-${chapter.id}`} data-toc-link onClick={(event) => goToTocTarget(event, `chapter-${chapter.id}`)}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <span>
                    {project.sections[chapter.id]?.customTitle || chapter.title}
                  </span>
                </a>
              </div>
            ))}
          </nav>
          <div className="editor-help">
            <p>
              <b>Tout est modifiable</b>Cliquez sur n’importe quel texte du
              document. Sélectionnez-le pour le mettre en forme.
            </p>
          </div>
        </aside>
        <section className="paper-wrap">
          <article
            className={`cctp-paper ${documentData.pageTemplate ? "reference-themed-paper" : ""}`}
            style={themedPaperStyle}
            onMouseDown={(event) => {
              // Comme dans Word : cliquer dans une zone vide de la page place le curseur à la fin
              // du texte le plus proche au-dessus, au lieu de ne rien faire.
              if (
                event.button !== 0 ||
                event.target.closest(
                  "[contenteditable],button,input,select,textarea,a,figure,img,.reconstructed-cover,.cover-canvas,.paper-toc,.chapter-ai-actions",
                )
              )
                return;
              const bodies = [
                ...event.currentTarget.querySelectorAll(".rich-chapter-body"),
              ];
              if (!bodies.length) return;
              // Un clic à côté de la page de garde (marges grises à gauche / à droite) ne doit pas renvoyer ailleurs dans le document.
              const cover = event.currentTarget.querySelector(".reconstructed-cover, .cover-canvas");
              if (cover) {
                const box = cover.getBoundingClientRect();
                if (event.clientY >= box.top && event.clientY <= box.bottom) return;
              }
              const target =
                [...bodies]
                  .reverse()
                  .find(
                    (body) => body.getBoundingClientRect().top <= event.clientY,
                  ) || bodies[0];
              event.preventDefault();
              // Placer le curseur ne doit jamais faire défiler la page (sinon le texte « remonte » sous la souris à chaque clic).
              const scrollX = window.scrollX, scrollY = window.scrollY;
              target.focus({ preventScroll: true });
              const range = document.createRange();
              range.selectNodeContents(target);
              range.collapse(false);
              const selection = window.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
              if (window.scrollY !== scrollY || window.scrollX !== scrollX) window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
            }}
          >
            {coverElements.length ? (
              <CoverReconstructionEditor
                allowCompare={false}
                elements={coverElements}
                setElements={setCoverElements}
                aspect={coverAspect}
                onChange={dirty}
                mode={documentData.coverSourceReference ? "imported" : "blank"}
                defaultTextStyle={{
                  fontFamily: pageTemplate.fontFamily,
                  fontSizePt: pageTemplate.fontSizePt,
                  color: pageTemplate.textColor,
                }}
                readOnly={readOnly}
              />
            ) : (
              <header
                ref={(node) => refFor("coverCanvas", node)}
                className="paper-cover cover-canvas"
                style={{
                  "--cover-page-color": coverPageColor,
                  "--cover-sidebar-color": coverSidebarColor,
                }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget)
                    setSelectedLogoId(null);
                }}
              >
                <div className="cover-canvas-actions">
                  <input
                    ref={logoPicker}
                    hidden
                    multiple
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={addCoverLogos}
                  />
                  <button
                    onClick={() =>
                      recentLogos.length
                        ? setLogoLibraryOpen((value) => !value)
                        : logoPicker.current?.click()
                    }
                  >
                    <ImagePlus size={14} /> Ajouter un logo
                  </button>
                  <div className="cover-color-controls">
                    <Palette size={14} />
                    <label title="Couleur de la colonne latérale">
                      Colonne{" "}
                      <input
                        type="color"
                        value={coverSidebarColor}
                        onChange={(event) => {
                          setCoverSidebarColor(event.target.value);
                          dirty();
                        }}
                      />
                    </label>
                    <label title="Couleur du fond principal">
                      Page{" "}
                      <input
                        type="color"
                        value={coverPageColor}
                        onChange={(event) => {
                          setCoverPageColor(event.target.value);
                          dirty();
                        }}
                      />
                    </label>
                    <button
                      title="Rétablir les couleurs par défaut"
                      onClick={() => {
                        setCoverSidebarColor("#eef0ec");
                        setCoverPageColor("#ffffff");
                        dirty();
                      }}
                    >
                      Réinitialiser
                    </button>
                  </div>
                  <small>
                    {recentLogos.length
                      ? "Vos anciens blocs sont mémorisés"
                      : "Cliquez sur un logo pour le régler"}
                  </small>
                </div>
                {logoLibraryOpen && (
                  <div className="cover-logo-library">
                    <header>
                      <b>Logos et coordonnées déjà utilisés</b>
                      <small>
                        Sélectionnez un bloc pour reprendre automatiquement son
                        descriptif.
                      </small>
                    </header>
                    <div>
                      {recentLogos.map((logo, index) => (
                        <button
                          key={`${logo.id}-${index}`}
                          onClick={() => reuseLogo(logo)}
                        >
                          <img src={logo.src} alt="" />
                          <span>
                            <b>{logo.name || "Logo enregistré"}</b>
                            <small>
                              {logo.caption || "Aucun descriptif enregistré"}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="cover-logo-new"
                      onClick={() => logoPicker.current?.click()}
                    >
                      <ImagePlus size={13} /> Importer un nouveau logo
                    </button>
                  </div>
                )}
                {selectedLogoId &&
                  coverLogos.some((item) => item.id === selectedLogoId) && (
                    <div className="cover-logo-inspector">
                      <b>Logo et coordonnées</b>
                      <label className="logo-size-control">
                        Taille{" "}
                        <button
                          onClick={() =>
                            updateLogo(selectedLogoId, {
                              width: Math.max(
                                12,
                                (coverLogos.find(
                                  (item) => item.id === selectedLogoId,
                                )?.width || 28) - 3,
                              ),
                            })
                          }
                        >
                          −
                        </button>
                        <input
                          type="range"
                          min="12"
                          max="65"
                          value={
                            coverLogos.find(
                              (item) => item.id === selectedLogoId,
                            )?.width || 28
                          }
                          onChange={(event) =>
                            updateLogo(selectedLogoId, {
                              width: Number(event.target.value),
                            })
                          }
                        />
                        <button
                          onClick={() =>
                            updateLogo(selectedLogoId, {
                              width: Math.min(
                                65,
                                (coverLogos.find(
                                  (item) => item.id === selectedLogoId,
                                )?.width || 28) + 3,
                              ),
                            })
                          }
                        >
                          +
                        </button>
                        <strong>
                          {Math.round(
                            coverLogos.find(
                              (item) => item.id === selectedLogoId,
                            )?.width || 28,
                          )}
                          %
                        </strong>
                      </label>
                      <label>
                        Disposition{" "}
                        <select
                          value={
                            coverLogos.find(
                              (item) => item.id === selectedLogoId,
                            )?.layout || "below"
                          }
                          onChange={(event) =>
                            updateLogo(selectedLogoId, {
                              layout: event.target.value,
                            })
                          }
                        >
                          <option value="below">
                            Verticale — texte en dessous
                          </option>
                          <option value="right">
                            Horizontale — texte à droite
                          </option>
                          <option value="left">
                            Horizontale — texte à gauche
                          </option>
                          <option value="none">Image seule</option>
                        </select>
                      </label>
                    </div>
                  )}
                {coverLogos.map((logo) => (
                  <div
                    key={logo.id}
                    className={`draggable-cover-logo ${selectedLogoId === logo.id ? "selected" : ""} layout-${logo.layout || "below"}`}
                    style={{
                      left: `${logo.x}%`,
                      top: `${logo.y}%`,
                      width: `${logo.width || 28}%`,
                    }}
                    onClick={() => setSelectedLogoId(logo.id)}
                    onPointerDown={(event) => {
                      setSelectedLogoId(logo.id);
                      if (
                        event.target.closest(
                          "button,input,select,.logo-caption,.logo-resize-handle",
                        )
                      )
                        return;
                      draggingLogo.current = logo.id;
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      moveLogo(event, logo.id);
                      resizeLogo(event, logo.id);
                    }}
                    onPointerUp={() => {
                      draggingLogo.current = null;
                      resizingLogo.current = null;
                    }}
                  >
                    <div className="logo-visual">
                      <img src={logo.src} alt={logo.name} draggable="false" />
                    </div>
                    {(logo.layout || "below") !== "none" && (
                      <div
                        className="logo-caption"
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="Cliquez pour ajouter le nom, l’adresse et les coordonnées…"
                        onBlur={(event) =>
                          updateLogo(logo.id, {
                            caption: event.currentTarget.innerText.trim(),
                          })
                        }
                      >
                        {logo.caption || ""}
                      </div>
                    )}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setCoverLogos((items) =>
                          items.filter((item) => item.id !== logo.id),
                        );
                        setSelectedLogoId(null);
                        dirty();
                      }}
                      title="Supprimer le bloc"
                    >
                      <Trash2 size={12} />
                    </button>
                    {selectedLogoId === logo.id && (
                      <span
                        className="logo-resize-handle"
                        title="Tirer pour redimensionner"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          resizingLogo.current = {
                            id: logo.id,
                            startX: event.clientX,
                            startWidth: logo.width || 28,
                            canvasWidth:
                              refs.current.coverCanvas.getBoundingClientRect()
                                .width,
                          };
                          event.currentTarget.parentElement.setPointerCapture(
                            event.pointerId,
                          );
                        }}
                      />
                    )}
                  </div>
                ))}
                <div className="cover-main-content">
                  <div
                    ref={(node) => refFor("coverLabel", node)}
                    data-collab-key="coverLabel"
                    className="editable cover-label"
                    {...editableProps(
                      html(
                        "coverLabel",
                        "CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES",
                      ),
                      dirty,
                      rememberSelection,
                    )}
                    {...dragCoverText("coverLabel")}
                  />
                  <div
                    ref={(node) => refFor("coverTitle", node)}
                    data-collab-key="coverTitle"
                    className="editable cover-title"
                    {...editableProps(
                      html("coverTitle", escapeHtml(project.name)),
                      dirty,
                      rememberSelection,
                    )}
                    {...dragCoverText("coverTitle")}
                  />
                  <div
                    ref={(node) => refFor("subtitle", node)}
                    data-collab-key="subtitle"
                    className="editable cover-subtitle"
                    {...editableProps(
                      html(
                        "subtitle",
                        escapeHtml(
                          documentData.coverSubtitle ||
                            `Document de travail · ${selected.length} lots`,
                        ),
                      ),
                      dirty,
                      rememberSelection,
                    )}
                    {...dragCoverText("subtitle")}
                  />
                  <div
                    ref={(node) => refFor("coverContacts", node)}
                    data-collab-key="coverContacts"
                    className="editable cover-contacts"
                    {...editableProps(
                      textToHtml(
                        documentData.coverContacts ||
                          "Cliquez ici pour ajouter les coordonnées et intervenants du projet.",
                      ),
                      dirty,
                      rememberSelection,
                    )}
                    {...dragCoverText("coverContacts")}
                  />
                </div>
              </header>
            )}
            <div className="paper-intro">
              <div
                ref={(node) => refFor("introTitle", node)}
                data-collab-key="introTitle"
                className="editable intro-title"
                {...editableProps(
                  html("introTitle", "Objet du document"),
                  dirty,
                  rememberSelection,
                )}
              />
              <div
                ref={(node) => refFor("introText", node)}
                data-collab-key="introText"
                className="editable intro-text"
                {...editableProps(
                  html(
                    "introText",
                    "Le présent Cahier des Clauses Techniques Particulières définit les prescriptions applicables aux travaux de l’opération. Les descriptions ci-après précisent les exigences attendues pour chaque lot.",
                  ),
                  dirty,
                  rememberSelection,
                )}
              />
            </div>
            <nav className="paper-toc" aria-label="Sommaire du CCTP">
              <header>
                <small>SOMMAIRE</small>
                <h2>Chapitres du CCTP</h2>
              </header>
              {selected.map((chapter, index) => {
                const subparts = renderChapter(chapter, project.sections[chapter.id], index).entries;
                return (
                  <div className="toc-chapter" key={chapter.id}>
                    <a href={`#chapter-${chapter.id}`}>
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <span>{tocTitles[chapter.id] || chapter.title}</span>
                      <i />
                    </a>
                    {subparts.map((part) => (
                      <a
                        className={`toc-sublevel-${part.depth}`}
                        key={part.id}
                        href={`#${part.id}`}
                        data-toc-link
                        onClick={(event) => goToTocTarget(event, part.id, part.number, part.title)}
                      >
                        <b>{part.number}</b>
                        <span>{part.title}</span>
                        <i />
                      </a>
                    ))}
                  </div>
                );
              })}
            </nav>
            {selected.map((chapter, index) => {
              const section = project.sections[chapter.id] || {};
              // Pendant que j'écris dans ce chapitre, un enregistrement qui revient ne doit pas réécrire le texte (caractères perdus, curseur renvoyé au début).
              const freshHtml = renderChapter(chapter, project.sections[chapter.id], index).html;
              const bodyNode = refs.current[`body-${chapter.id}`];
              const numberedHtml = bodyNode && document.activeElement === bodyNode && bodyHtmlProp.current[chapter.id] !== undefined ? bodyHtmlProp.current[chapter.id] : freshHtml;
              bodyHtmlProp.current[chapter.id] = numberedHtml;
              return (
                <section
                  className="paper-chapter"
                  id={`chapter-${chapter.id}`}
                  key={chapter.id}
                >
                  <div className="paper-chapter-title">
                    <div
                      ref={(node) => refFor(`number-${chapter.id}`, node)}
                      data-collab-key={`number-${chapter.id}`}
                      className="editable chapter-number"
                      {...editableProps(
                        escapeHtml(
                          section.customNumber ||
                            String(index + 1).padStart(2, "0"),
                        ),
                        dirty,
                        rememberSelection,
                      )}
                    />
                    <div>
                      <div
                        ref={(node) => refFor(`code-${chapter.id}`, node)}
                        data-collab-key={`code-${chapter.id}`}
                        className="editable chapter-code-edit"
                        {...editableProps(
                          escapeHtml(section.customCode || chapter.code),
                          dirty,
                          rememberSelection,
                        )}
                      />
                      <div
                        ref={(node) => refFor(`title-${chapter.id}`, node)}
                        data-collab-key={`title-${chapter.id}`}
                        className="editable chapter-title-edit"
                        {...editableProps(
                          escapeHtml(section.customTitle || chapter.title),
                          dirty,
                          rememberSelection,
                        )}
                      />
                    </div>
                    <div className="chapter-ai-actions">
                      <button
                        className={`chapter-ai-button ${chapter.id !== "06" ? "ai-disabled" : ""}`}
                        onClick={() => openChapterAi(chapter)}
                        title={
                          chapter.id === "06"
                            ? `Ouvrir l’IA spécialisée en ${chapter.specialty}`
                            : "Agent IA bientôt disponible"
                        }
                      >
                        <Sparkles size={14} /> IA spécialisée · {chapter.title}
                      </button>
                    </div>
                  </div>
                  <div
                    ref={(node) => refFor(`body-${chapter.id}`, node)}
                    data-collab-key={`body-${chapter.id}`}
                    className="editable rich-chapter-body"
                    data-ai-chapter-id={chapter.id}
                    data-placeholder="Cliquez ici pour rédiger ce chapitre…"
                    {...editableProps(numberedHtml, dirty, rememberSelection)}
                  />
                </section>
              );
            })}
            <div
              ref={(node) => refFor("footer", node)}
              data-collab-key="footer"
              className="editable paper-footer"
              {...editableProps(
                html(
                  "footer",
                  `Document de travail — ${escapeHtml(project.name)}`,
                ),
                dirty,
                rememberSelection,
              )}
            />
          </article>
        </section>
      </div>
      <SimilarPassages cctpId={project.id} rootSelector=".rich-chapter-body" readOnly={readOnly} />
      <AnswerTrace
        sources={traceSources}
        enabled={plasterTrace.length > 0}
        listOpen={traceListOpen && plasterTrace.length > 0}
        onListClose={() => setTraceListOpen(false)}
        manifest={traceManifest}
        qState={answerOverride || plasterSection?.questionnaire?.state}
        overrides={ruleOverrides}
        readOnly={readOnly}
        onEditAnswer={(target) => onEditAnswer?.("06", target)}
        onApplied={() => dirty()}
        onSaveAnswer={async ({ workId, questionId, value }) => {
          const base = answerOverrideRef.current || plasterSection?.questionnaire?.state || { project: {}, works: [] };
          const isProject = /^Q-(?:P|R)\d+$/.test(questionId);
          const works = base.works || [];
          const target = works.find((work) => work.id === workId) || works.find((work) => work.answers?.[questionId] != null) || works[0];
          const next = isProject
            ? { ...base, project: { ...(base.project || {}), [questionId]: value } }
            : { ...base, works: works.map((work) => (work.id === target?.id ? { ...work, answers: { ...(work.answers || {}), [questionId]: value } } : work)) };
          answerOverrideRef.current = next;
          setAnswerOverride(next);
          await save(); // enregistre le texte modifié ET la nouvelle réponse (comme Ctrl+S)
        }}
        cctpId={project.id}
        mode={plasterMode}
        onTraceTextChange={(previous, next) => setTracePatch((current) => ({ base: plasterTrace, list: (current && current.base === plasterTrace ? current.list : plasterTrace).map((item) => (item === previous ? next : item)) }))}
        onSaveRule={async (questionId, template, block, bullet, value, originTemplate) => {
          setRuleOverrides(await setRuleOverride(questionId, template));
          const effective = template || originTemplate;
          if (effective) {
            block.textContent = bullet + fillTemplate(effective, value);
            dirty();
          }
        }}
      />
      <FrenchSpellcheckTooltip
        enabled={spellcheckEnabled}
        rootRef={spellRootRef}
        dictionaryTerms={[
          project.name,
          ...selected.map(
            (chapter) =>
              project.sections[chapter.id]?.customTitle || chapter.title,
          ),
        ]}
      />
      {aiOpen && aiTarget && (
        <AiProposalPanel
          target={aiTarget}
          cctpId={project.id}
          chapterId={aiTarget.dataset.aiChapterId || null}
          onClose={() => setAiOpen(false)}
          onApply={applyAi}
        />
      )}{" "}
      {pendingImage && (
        <ImageInsertDialog
          image={{
            ...pendingImage,
            setSize: (size) =>
              setPendingImage((current) => ({ ...current, size })),
          }}
          onCancel={() => setPendingImage(null)}
          onConfirm={placeDocumentImage}
        />
      )}{" "}
      {discardDialogOpen && (
        <ConfirmDiscardDialog
          onCancel={() => setDiscardDialogOpen(false)}
          onConfirm={discardChanges}
        />
      )}{" "}
      {!saved && (
        <div className="unsaved-bar">
          <span>Vous avez des modifications non enregistrées.</span>
          <div className="unsaved-actions">
            <button onClick={save} disabled={saving}>
              <Save size={15} />{" "}
              {saving ? "Enregistrement…" : "Enregistrer les modifications"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
