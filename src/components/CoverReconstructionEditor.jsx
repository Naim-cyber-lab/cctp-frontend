import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  GitCompareArrows,
  GripVertical,
  Image as ImageIcon,
  Move,
  Plus,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { getCoverSuggestions } from "../api/client";
import {
  coverElementsInRect,
  coverShapeAt,
  connectedCoverShapes,
  isCoverFrame,
  normalizeCoverElements,
  removeCoverElementAndReflow,
  removeCoverElementsAndReflow,
  resizeCoverTextAndReflow,
} from "../utils/coverElements";

export function CoverReconstructionEditor({
  allowCompare = true,
  elements,
  setElements,
  aspect = 1.4142,
  onChange,
  currentSourceId = "",
  mode = "imported",
  defaultTextStyle = {},
  readOnly = false,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  // Saisie en cours dans une zone de texte : la hauteur du texte au dernier calcul, pour faire remonter / descendre en direct
  // ce qui se trouve dessous pendant que l'on efface ou que l'on écrit (comme dans Word).
  const liveRef = useRef(null);
  const textHistoryRef = useRef(new Map());
  const applyingTextHistoryRef = useRef(false);
  const applyTextHistory = (node, id, direction) => {
    const history = textHistoryRef.current.get(id);
    if (!history) return false;
    const nextIndex = direction === "undo" ? history.index - 1 : history.index + 1;
    if (nextIndex < 0 || nextIndex >= history.values.length) return false;
    history.index = nextIndex;
    applyingTextHistoryRef.current = true;
    node.innerText = history.values[nextIndex];
    node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: direction === "undo" ? "historyUndo" : "historyRedo" }));
    applyingTextHistoryRef.current = false;
    const range = document.createRange(); range.selectNodeContents(node); range.collapse(false);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    return true;
  };
  const measureEditableHeight = (node) => {
    if (!node) return 1;
    const canvasHeight = canvasRef.current?.getBoundingClientRect().height || 1;
    // La zone visible est placée dans un cadre absolu dont la hauteur vient du
    // PDF. Sa propre géométrie peut donc rester figée pendant la frappe. Une
    // copie hors écran, sans hauteur minimale, donne la hauteur naturelle du
    // texte immédiatement, y compris pour les lignes vides importées.
    const mirror = node.cloneNode(true);
    const width = node.getBoundingClientRect().width;
    mirror.removeAttribute("data-text-id");
    mirror.contentEditable = "false";
    Object.assign(mirror.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: `${width}px`,
      height: "auto",
      minHeight: "0",
      maxHeight: "none",
      visibility: "hidden",
      pointerEvents: "none",
      overflow: "visible",
    });
    document.body.appendChild(mirror);
    const computed = getComputedStyle(node);
    const lineHeight = Number.parseFloat(computed.lineHeight) ||
      (Number.parseFloat(computed.fontSize) || 10) * 1.2;
    const contentHeight = Math.max(mirror.scrollHeight, mirror.getBoundingClientRect().height);
    mirror.remove();
    return (Math.max(lineHeight, contentHeight) / canvasHeight) * 100;
  };
  const editableLineCount = (node) =>
    Math.max(1, String(node?.innerText || "").replace(/\r/g, "").split("\n").length);
  const editableIsEmpty = (node) =>
    !String(node?.innerText || "").replace(/[\s\u00a0\u200b\uFEFF]/g, "");
  const editableLineHeight = (node) => {
    const canvasHeight = canvasRef.current?.getBoundingClientRect().height || 1;
    const computed = getComputedStyle(node);
    const lineHeight = Number.parseFloat(computed.lineHeight) ||
      (Number.parseFloat(computed.fontSize) || 10) * 1.2;
    return (lineHeight / canvasHeight) * 100;
  };
  const caretOffset = (node) => {
    const selection = window.getSelection();
    if (!node || !selection?.rangeCount) return String(node?.innerText || "").length;
    const range = selection.getRangeAt(0);
    if (!node.contains(range.startContainer)) return String(node.innerText || "").length;
    const before = range.cloneRange();
    before.selectNodeContents(node);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length;
  };
  const keepEditingFocus = (id, offset) => {
    requestAnimationFrame(() => {
      const node = canvasRef.current?.querySelector(`[data-text-id="${CSS.escape(String(id))}"]`);
      if (!node || document.activeElement === node) return;
      node.focus({ preventScroll: true });
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let remaining = Math.max(0, offset);
      let textNode = walker.nextNode();
      while (textNode && remaining > textNode.textContent.length) {
        remaining -= textNode.textContent.length;
        textNode = walker.nextNode();
      }
      const range = document.createRange();
      if (textNode) range.setStart(textNode, Math.min(remaining, textNode.textContent.length));
      else range.selectNodeContents(node);
      range.collapse(textNode ? true : false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };
  // Met à jour uniquement la géométrie affichée pendant la frappe. Une mise à jour
  // React à chaque Backspace recréerait le nœud contentEditable, ferait perdre le
  // curseur et obligerait l'utilisateur à recliquer entre deux suppressions.
  const paintLiveGeometry = (items) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    items.forEach((entry) => {
      const node = canvas.querySelector(`[data-cover-id="${CSS.escape(String(entry.id))}"]`);
      if (!node) return;
      node.style.left = `${entry.x}%`;
      node.style.top = `${entry.y}%`;
      node.style.width = `${entry.width}%`;
      if (entry.type === "text") {
        node.style.minHeight = `${entry.height}%`;
      } else {
        node.style.height = `${entry.height}%`;
      }
    });
  };
  // Affichage épuré : au repos rien d'autre que le document ; les poignées (déplacer, supprimer, redimensionner) n'apparaissent
  // qu'au survol d'une zone, et disparaissent pendant la saisie.
  const pointerRef = useRef({ x: 0, y: 0 });
  // Sélection au rectangle (comme glisser sur une page Word) : on entoure un tableau, un groupe de traits… puis Suppr.
  const [groupIds, setGroupIds] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const rubberRef = useRef(null);
  const suppressClickRef = useRef(false);
  const resizeRef = useRef(null);
  const historyRef = useRef([]);
  const [selectedId, setSelectedId] = useState(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [layouts, setLayouts] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [focusId, setFocusId] = useState(null);
  const focusEdgeRef = useRef("end");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const defaultFontFamily = defaultTextStyle.fontFamily || "Arial";
  const defaultFontSizePt = Number(defaultTextStyle.fontSizePt) || 11;
  const defaultTextColor = defaultTextStyle.color || "#1b2f29";
  useLayoutEffect(() => {
    if (focusId) {
      const editable = canvasRef.current?.querySelector(`[data-text-id="${focusId}"]`);
      editable?.focus();
      if (editable) {
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(focusEdgeRef.current === "start");
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setFocusId(null);
    }
  }, [focusId]);
  // Comme dans Word : un clic sur une zone vide de la page crée un texte à cet endroit, prêt à être saisi.
  const commit = (updater) => {
    if (readOnly) return;
    setElements((items) => {
      historyRef.current = [
        ...historyRef.current.slice(-39),
        items.map((item) => ({ ...item })),
      ];
      return updater(items);
    });
  };
  const addText = (position = { x: 31, y: 18 }) => {
    if (readOnly) return;
    const width = 38;
    const id = crypto.randomUUID();
    commit((items) => [
      ...items,
      {
        id,
        type: "text",
        text: "",
        x: Math.max(0, Math.min(100 - width, position.x)),
        y: Math.max(0, Math.min(96, position.y)),
        width,
        height: 3,
        fontFamily: defaultFontFamily,
        fontSizePt: defaultFontSizePt,
        color: defaultTextColor,
        bold: false,
        italic: false,
        align: "left",
        userCreated: true,
        manualLayout: true,
      },
    ]);
    setSelectedId(id);
    setFocusId(id);
    onChange?.();
  };
  const addTextAt = (event) => {
    if (
      event.target.closest(
        ".reconstructed-text,.reconstructed-image,button,input,select",
      ) ||
      comparisonOpen
    )
      return;
    const rect = canvasRef.current.getBoundingClientRect();
    addText({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100 - 1.5,
    });
  };
  const canvasClick = (event) => {
    if (readOnly) return;
    if (suppressClickRef.current) return;
    if (!event.target.closest(".reconstructed-text,.reconstructed-image,button,input,select,.reconstructed-group-bar") && !comparisonOpen && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      const shape = coverShapeAt(elements, x, y, (6 / rect.width) * 100, (6 / rect.height) * 100);
      if (shape) {
        const connected = connectedCoverShapes(elements, shape.id);
        if (connected.length > 1) {
          setSelectedId(null);
          setGroupIds(connected);
        } else {
          setSelectedId(shape.id);
          setGroupIds([]);
        }
        return;
      }
    }
  };
  const removeGroup = () => {
    if (readOnly) return;
    const ids = groupIds;
    if (!ids.length) return;
    commit((items) => removeCoverElementsAndReflow(items, ids));
    setGroupIds([]);
    setSelectedId(null);
    onChange?.();
  };
  const selected = elements.find((item) => item.id === selectedId);
  useEffect(() => {
    setInspectorOpen(false);
  }, [selectedId]);
  const source = useMemo(
    () => layouts.find((item) => String(item.id) === String(sourceId)),
    [layouts, sourceId],
  );
  const sourceElements = useMemo(
    () =>
      normalizeCoverElements(source?.elements || []).filter(
        (item) => item.type === "text" || item.type === "image",
      ),
    [source],
  );
  useEffect(() => {
    getCoverSuggestions()
      .then((data) => {
        const available = (data.referenceLayouts || []).filter(
          (layout) =>
            String(layout.id) !== String(currentSourceId) &&
            Array.isArray(layout.elements) &&
            layout.elements.some(
              (item) => item.type === "text" || item.type === "image",
            ),
        );
        setLayouts(available);
        setSourceId((current) =>
          available.some((item) => String(item.id) === String(current))
            ? current
            : String(available[0]?.id || ""),
        );
      })
      .catch(() => {});
  }, [currentSourceId]);
  const update = (id, changes) => {
    if (readOnly) return;
    commit((items) =>
      items.map((item) =>
        item.id === id ? { ...item, ...changes, manualLayout: true } : item,
      ),
    );
    onChange?.();
  };
  const beginDrag = (event, item) => {
    if (readOnly) return;
    if (
      event.target.closest("[contenteditable=true],input,button") &&
      !event.target.closest(".reconstructed-move")
    )
      return;
    event.preventDefault();
    setSelectedId(item.id);
    const rect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      itemWidth: Number(item.width) || 0,
      itemHeight: Number(item.height) || 0,
      width: rect.width,
      height: rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    update(drag.id, {
      x: Math.max(
        0,
        Math.min(
          Math.max(0, 100 - drag.itemWidth),
          drag.x + ((event.clientX - drag.startX) / drag.width) * 100,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          Math.max(0, 100 - drag.itemHeight),
          drag.y + ((event.clientY - drag.startY) / drag.height) * 100,
        ),
      ),
    });
  };
  const beginResize = (event, item) => {
    if (readOnly) return;
    event.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    resizeRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      width: item.width,
      height: item.height,
      rectWidth: rect.width,
      rectHeight: rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resize = (event) => {
    const drag = resizeRef.current;
    if (!drag) return;
    event.stopPropagation();
    update(drag.id, {
      width: Math.min(
        95,
        Math.max(
          3,
          drag.width + ((event.clientX - drag.startX) / drag.rectWidth) * 100,
        ),
      ),
      height: Math.min(
        90,
        Math.max(
          1,
          drag.height + ((event.clientY - drag.startY) / drag.rectHeight) * 100,
        ),
      ),
    });
  };
  const remove = (id) => {
    if (readOnly) return;
    commit((items) => removeCoverElementAndReflow(items, id));
    setSelectedId((current) => (current === id ? null : current));
    onChange?.();
  };
  // Un clic dans le blanc prépare une zone de saisie vide. Si l'utilisateur
  // clique ailleurs sans rien écrire, cette zone provisoire doit simplement
  // disparaître : elle n'a jamais occupé de place dans le document et ne doit
  // donc surtout pas déclencher le reflow réservé à la suppression d'un vrai bloc.
  const discardEmptyDraft = (id) => {
    setElements((items) => items.filter((entry) => entry.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  };
  const removeAndKeepEditing = (item, sourceItems = elements) => {
    const textItems = sourceItems.filter((entry) => entry.type === "text" && entry.id !== item.id);
    const overlap = (entry) => Math.max(0, Math.min(Number(item.x) + Number(item.width), Number(entry.x) + Number(entry.width)) - Math.max(Number(item.x), Number(entry.x)));
    const sameColumn = textItems.filter((entry) => overlap(entry) / Math.max(1, Math.min(Number(item.width) || 1, Number(entry.width) || 1)) >= 0.2);
    const below = sameColumn.filter((entry) => Number(entry.y) >= Number(item.y)).sort((a, b) => Number(a.y) - Number(b.y));
    const emptyBelow = below.find((entry) => !String(entry.text || "").replace(/[\s\u00a0\u200b\uFEFF]/g, ""));
    const above = sameColumn.filter((entry) => Number(entry.y) < Number(item.y)).sort((a, b) => Number(b.y) - Number(a.y));
    const next = emptyBelow || above[0] || below[0] || textItems.sort((a, b) => Math.abs(Number(a.y) - Number(item.y)) - Math.abs(Number(b.y) - Number(item.y)))[0];
    focusEdgeRef.current = next && Number(next.y) >= Number(item.y) ? "start" : "end";
    flushSync(() => {
      remove(item.id);
      if (next) setFocusId(next.id);
    });
  };
  const shrinkEmptyBlock = (item, target, sourceItems = elements) => {
    const live = liveRef.current?.id === item.id
      ? liveRef.current
      : {
          id: item.id,
          last: measureEditableHeight(target),
          lines: 1,
          touched: false,
          items: sourceItems.map((entry) => ({ ...entry })),
        };
    liveRef.current = live;
    const current = live.items.find((entry) => entry.id === item.id);
    if (!current) return false;
    const step = Math.max(1, editableLineHeight(target));
    const height = Math.max(1, Number(current.height) || 1);
    // Une grande zone PDF vide représente plusieurs retours à la ligne. On en
    // retire exactement un par pression, sans détruire le nœud qui a le focus.
    if (height > step + 0.35) {
      if (!live.touched) {
        live.touched = true;
        historyRef.current = [
          ...historyRef.current.slice(-39),
          live.items.map((entry) => ({ ...entry })),
        ];
      }
      live.items = resizeCoverTextAndReflow(
        live.items,
        item.id,
        Math.max(1, height - step),
        "",
      );
      live.last = Math.max(1, live.last - step);
      paintLiveGeometry(live.items);
      keepEditingFocus(item.id, 0);
      return true;
    }
    return false;
  };
  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    setElements(previous);
    setSelectedId(null);
    onChange?.();
  };
  useEffect(() => {
  const keyboard = (event) => {
      if (readOnly) return;
      const editable = event.target.closest?.(
        "[contenteditable=true],input,textarea,select",
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        // Comme dans Word : Ctrl+Z annule la dernière modification de la page de garde même si plus rien n'est sélectionné
        // (après une suppression, justement). Dans un champ extérieur à la page de garde, on laisse l'annulation native.
        if (editable && !event.target.closest(".reconstructed-cover")) return;
        if (!selectedId && !historyRef.current.length) return;
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === "Escape" && !editable && (groupIds.length || selectedId)) {
        setGroupIds([]);
        setSelectedId(null);
        return;
      }
      if (!editable && groupIds.length && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        removeGroup();
        return;
      }
      if (!selectedId) return;
      if (!editable && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        remove(selectedId);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [selectedId, groupIds]);
  const insert = (item, position) => {
    if (readOnly) return;
    const width = Math.min(90, Math.max(3, Number(item.width) || 20));
    const height = Math.min(80, Math.max(1, Number(item.height) || 5));
    const clone = {
      ...item,
      id: crypto.randomUUID(),
      x: position
        ? Math.max(0, Math.min(100 - width, position.x - width / 2))
        : Math.max(0, Math.min(100 - width, Number(item.x) || 10)),
      y: position
        ? Math.max(0, Math.min(100 - height, position.y - height / 2))
        : Math.max(0, Math.min(100 - height, Number(item.y) || 10)),
      importedFromCover: source?.filename,
    };
    commit((current) => [...current, clone]);
    setSelectedId(clone.id);
    onChange?.();
  };
  const drop = (event) => {
    if (readOnly) return;
    event.preventDefault();
    setDragOver(false);
    const id = event.dataTransfer.getData(
      "application/x-calepin-cover-element",
    );
    const item = sourceElements.find((value) => String(value.id) === id);
    if (!item || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    insert(item, {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };
  const startElementDrag = (event, item) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      "application/x-calepin-cover-element",
      String(item.id),
    );
  };
  const renderSourceItem = (item) =>
    item.type === "image" ? (
      <div
        key={item.id}
        draggable
        className="comparison-source-item comparison-source-image"
        style={{
          left: `${item.x}%`,
          top: `${item.y}%`,
          width: `${item.width}%`,
          height: `${item.height}%`,
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            "application/x-calepin-cover-element",
            String(item.id),
          );
        }}
      >
        <img src={item.src} alt={item.name || ""} />
        <span>
          <GripVertical size={11} />
        </span>
      </div>
    ) : (
      <div
        key={item.id}
        draggable
        className="comparison-source-item comparison-source-text"
        style={{
          left: `${item.x}%`,
          top: `${item.y}%`,
          width: `${item.width}%`,
          minHeight: `${item.height}%`,
          fontFamily: item.fontFamily,
          fontSize: `${Math.max(6, item.fontSizePt || 10)}px`,
          fontWeight: item.bold ? 700 : 400,
          color: item.color,
          textAlign: item.align || "left",
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            "application/x-calepin-cover-element",
            String(item.id),
          );
        }}
      >
        {item.text}
        <span>
          <GripVertical size={11} />
        </span>
      </div>
    );
  return (
    <section
      className={`cover-reconstruction-editor ${comparisonOpen ? "is-comparing" : ""}`}
    >
      <header>
        <div>
          <span className="eyebrow">
            {mode === "blank" ? "PAGE DE GARDE VIERGE" : "PAGE EXTRAITE DU PDF"}
          </span>
          <h2>
            {mode === "blank"
              ? "Composez librement votre page de garde"
              : "Modifiez chaque élément de la page de garde"}
          </h2>
          <p>
            Cliquez sur une zone vide pour écrire à cet endroit, comme dans Word.
            Déplacez et redimensionnez les blocs avec leurs poignées, puis mettez
            le texte en forme dans la barre contextuelle.
          </p>
        </div>
        <div className="reconstruction-header-actions">
          {selected && (
            <button
              type="button"
              className={`cover-selection-settings ${inspectorOpen ? "active" : ""}`}
              onClick={() => setInspectorOpen((value) => !value)}
              aria-expanded={inspectorOpen}
            >
              <SlidersHorizontal size={14} />
              {inspectorOpen ? "Masquer les réglages" : "Position et dimensions"}
            </button>
          )}
          <button
            type="button"
            className="cover-undo"
            onClick={undo}
            disabled={!historyRef.current.length}
            title="Annuler la dernière modification (Ctrl+Z)"
          >
            <Undo2 size={14} /> Annuler
          </button>
          <span className="reconstruction-count">
            <Type size={14} />
            {elements.filter((item) => item.type === "text").length} textes{" "}
            <ImageIcon size={14} />
            {elements.filter((item) => item.type === "image").length} images
          </span>
          {allowCompare && layouts.length > 1 && (
            <button
              className="cover-compare-button"
              onClick={() => setComparisonOpen((value) => !value)}
            >
              {comparisonOpen ? (
                <X size={15} />
              ) : (
                <GitCompareArrows size={15} />
              )}{" "}
              {comparisonOpen ? "Fermer" : "Comparer les pages de garde"}
            </button>
          )}
        </div>
      </header>
      {comparisonOpen && (
        <div className="cover-comparison-bar">
          <div>
            <span className="eyebrow">PAGE SOURCE</span>
            <b>Choisissez une autre page de garde</b>
          </div>
          <select
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            {layouts.map((layout) => (
              <option value={layout.id} key={layout.id}>
                {layout.filename}
              </option>
            ))}
          </select>
          <small>
            Glissez un texte ou une image de la page source vers votre page.
          </small>
        </div>
      )}
      <div
        className={`reconstruction-workspace${comparisonOpen ? " has-comparison" : ""}${inspectorOpen && selected ? " inspector-open" : ""}`}
      >
        {comparisonOpen && source && (
          <aside className="cover-comparison-source">
            <header>
              <b>{source.filename}</b>
              <small>
                {sourceElements.length} élément
                {sourceElements.length > 1 ? "s" : ""} récupérable
                {sourceElements.length > 1 ? "s" : ""}
              </small>
            </header>
            <article
              className="comparison-source-cover"
              style={{ aspectRatio: `1 / ${source.pageAspect || 1.4142}` }}
            >
              {sourceElements.map(renderSourceItem)}
            </article>
            <div className="comparison-element-list">
              {sourceElements.map((item) => (
                <button
                  key={item.id}
                  draggable
                  onDragStart={(event) => startElementDrag(event, item)}
                  onClick={() => insert(item)}
                >
                  {item.type === "image" ? (
                    <ImageIcon size={14} />
                  ) : (
                    <Type size={14} />
                  )}
                  <span>
                    {item.type === "image"
                      ? item.name || "Image"
                      : String(item.text || "Texte")
                          .replace(/\s+/g, " ")
                          .slice(0, 45)}
                  </span>
                  <Plus size={13} />
                </button>
              ))}
            </div>
          </aside>
        )}
        <article
          ref={canvasRef}
          className={`reconstructed-cover ${dragOver ? "drag-over" : ""}${readOnly ? " read-only" : ""}`}
          style={{ aspectRatio: `1 / ${aspect}` }}
          onDragOver={(event) => {
            if (comparisonOpen) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDragEnter={(event) => {
            if (comparisonOpen) {
              event.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={(event) => {
            if (
              comparisonOpen &&
              !event.currentTarget.contains(event.relatedTarget)
            )
              setDragOver(false);
          }}
          onDrop={drop}
          onPointerDown={(event) => {
            if (readOnly) return;
            if (event.target !== event.currentTarget) return;
            setSelectedId(null);
            setGroupIds([]);
            if (!comparisonOpen && event.button === 0) {
              rubberRef.current = { startX: event.clientX, startY: event.clientY, rect: canvasRef.current.getBoundingClientRect(), active: false, box: null };
            }
          }}
          onPointerUp={() => {
            const band = rubberRef.current;
            rubberRef.current = null;
            if (!band?.active || !band.box) return;
            setMarquee(null);
            setGroupIds(coverElementsInRect(elements, band.box));
            suppressClickRef.current = true; // le « clic » qui suit le relâchement ne doit pas créer de zone de texte
            setTimeout(() => (suppressClickRef.current = false), 0);
          }}
          onClick={canvasClick}
          onDoubleClick={addTextAt}
          onPointerMove={(event) => {
            const band = rubberRef.current;
            if (band && event.buttons & 1) {
              if (!band.active && Math.hypot(event.clientX - band.startX, event.clientY - band.startY) > 6) band.active = true;
              if (band.active) {
                const { rect } = band;
                const clamp = (value) => Math.max(0, Math.min(100, value));
                const x0 = clamp(((Math.min(band.startX, event.clientX) - rect.left) / rect.width) * 100);
                const y0 = clamp(((Math.min(band.startY, event.clientY) - rect.top) / rect.height) * 100);
                const x1 = clamp(((Math.max(band.startX, event.clientX) - rect.left) / rect.width) * 100);
                const y1 = clamp(((Math.max(band.startY, event.clientY) - rect.top) / rect.height) * 100);
                band.box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
                setMarquee(band.box);
                return;
              }
            }
            // Vrai déplacement de la souris (> 4 px) : les poignées de survol réapparaissent. Chrome émet aussi de faux
            // mouvements après chaque changement d'affichage ; ceux-ci ne comptent pas.
            const last = pointerRef.current;
            const moved = Math.abs(event.clientX - last.x) + Math.abs(event.clientY - last.y) >= 4;
            if (canvasRef.current?.classList.contains("is-typing")) {
              if (!moved) return;
              canvasRef.current.classList.remove("is-typing");
            }
            pointerRef.current = { x: event.clientX, y: event.clientY };
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
          }}
        >
          {marquee && <div className="reconstructed-marquee" style={{ left: `${marquee.x}%`, top: `${marquee.y}%`, width: `${marquee.width}%`, height: `${marquee.height}%` }} />}
          {groupIds.length > 0 && (() => {
            const members = elements.filter((item) => groupIds.includes(item.id));
            if (!members.length) return null;
            const top = Math.min(...members.map((item) => Number(item.y) || 0));
            const left = Math.min(...members.map((item) => Number(item.x) || 0));
            return (
              <div className="reconstructed-group-bar" data-cover-group-bar style={{ left: `${left}%`, top: `calc(${top}% - 40px)` }}
                onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                <span>{members.length} élément{members.length > 1 ? "s" : ""} sélectionné{members.length > 1 ? "s" : ""}</span>
                <button type="button" data-cover-group-delete onClick={removeGroup}><Trash2 size={13} /> Supprimer</button>
                <button type="button" aria-label="Désélectionner" onClick={() => setGroupIds([])}><X size={13} /></button>
              </div>
            );
          })()}
          {comparisonOpen && (
            <div className="cover-drop-hint">
              Déposez l’élément à l’endroit souhaité
            </div>
          )}
          {elements.map((item) =>
            item.type === "shape" ? (
              <div
                key={item.id}
                data-cover-id={item.id}
                className={`reconstructed-shape${selectedId === item.id ? " selected" : ""}${isCoverFrame(item) ? " frame" : ""}${groupIds.includes(item.id) ? " group-selected" : ""}`}
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  width: `${item.width}%`,
                  height: `${item.height}%`,
                  background: item.fill,
                  border: `${Math.max(0.5, item.strokeWidth || 0.5)}px solid ${item.stroke}`,
                }}
              >
                {selectedId === item.id && isCoverFrame(item) && (
                  <div
                    className="reconstructed-format-toolbar reconstructed-frame-toolbar"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span>Cadre</span>
                    <button
                      type="button"
                      className="danger"
                      data-cover-frame-delete
                      onClick={() => remove(item.id)}
                      title="Supprimer le cadre : le texte et les images en dessous remontent"
                    >
                      <Trash2 size={13} /> Supprimer le cadre
                    </button>
                  </div>
                )}
              </div>
            ) : item.type === "image" ? (
              <div
                key={item.id}
                data-cover-id={item.id}
                className={`reconstructed-item reconstructed-image ${selectedId === item.id ? "selected" : ""} ${groupIds.includes(item.id) ? "group-selected" : ""}`}
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  width: `${item.width}%`,
                  height: `${item.height}%`,
                }}
                onClick={() => setSelectedId(item.id)}
                onPointerDown={(event) => !readOnly && beginDrag(event, item)}
                onPointerMove={move}
                onPointerUp={() => (dragRef.current = null)}
                onPointerCancel={() => (dragRef.current = null)}
              >
                <img src={item.src} alt={item.name || ""} draggable="false" />
                <span>
                  <Move size={12} />
                </span>
                {(
                  <button
                    className="reconstructed-delete"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(item.id);
                    }}
                    title="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                {(
                  <span
                    className="reconstructed-resize-handle"
                    onPointerDown={(event) => beginResize(event, item)}
                    onPointerMove={resize}
                    onPointerUp={() => (resizeRef.current = null)}
                  />
                )}
              </div>
            ) : (
              <div
                key={item.id}
                data-cover-id={item.id}
                className={`reconstructed-item reconstructed-text ${selectedId === item.id ? "selected" : ""} ${groupIds.includes(item.id) ? "group-selected" : ""}`}
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  width: `${item.width}%`,
                  minHeight: `${item.height}%`,
                }}
                onClick={() => setSelectedId(item.id)}
                onPointerDown={(event) => beginDrag(event, item)}
                onPointerMove={move}
                onPointerUp={() => (dragRef.current = null)}
                onPointerCancel={() => (dragRef.current = null)}
              >
                <button
                  type="button"
                  className="reconstructed-move"
                  aria-label="Déplacer le texte"
                  title="Glisser pour déplacer le texte"
                >
                  <Move size={13} />
                </button>
                <div
                  className="reconstructed-text-content"
                  contentEditable={!readOnly}
                  suppressContentEditableWarning
                  spellCheck={false}
                  data-text-id={item.id}
                  onKeyDown={(event) => {
                    if (readOnly) return;
                    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                      const key = event.key.toLowerCase();
                      const direction = key === "y" || (key === "z" && event.shiftKey) ? "redo" : key === "z" ? "undo" : null;
                      if (direction && applyTextHistory(event.currentTarget, item.id, direction)) { event.preventDefault(); event.stopPropagation(); return; }
                    }
                    // Comme dans Word : Retour arrière / Suppr dans une zone déjà vide la supprime (sinon une cellule ou un bloc vide
                    // resterait impossible à effacer, aucune saisie n'étant détectée).
                    if ((event.key === "Backspace" || event.key === "Delete") && editableIsEmpty(event.currentTarget)) {
                      event.preventDefault();
                      const sourceItems = liveRef.current?.items || elements;
                      if (!shrinkEmptyBlock(item, event.currentTarget, sourceItems)) {
                        liveRef.current = null;
                        // Une fois la dernière ligne supprimée, le curseur passe au bloc
                        // adjacent et la répétition clavier peut continuer sans clic.
                        removeAndKeepEditing(item, sourceItems);
                      }
                    }
                  }}
                  onFocus={(event) => {
                    canvasRef.current?.classList.add("is-typing"); // on écrit : plus rien que le curseur
                    setSelectedId(item.id);
                    setInspectorOpen(false);
                    liveRef.current = {
                      id: item.id,
                      last: measureEditableHeight(event.currentTarget),
                      lines: editableLineCount(event.currentTarget),
                      touched: false,
                      items: elements.map((entry) => ({ ...entry })),
                    };
                    textHistoryRef.current.set(item.id, { values: [event.currentTarget.innerText], index: 0 });
                  }}
                  onInput={(event) => {
                    if (readOnly) return;
                    canvasRef.current?.classList.add("is-typing");
                    // Comme dans Word : quand le texte rétrécit (on efface des lignes) ce qui est dessous remonte aussitôt ; quand il
                    // grandit, cela descend. Le texte lui-même n'est pas touché (le curseur reste en place).
                    const target = event.currentTarget;
                    if (!applyingTextHistoryRef.current) {
                      const history = textHistoryRef.current.get(item.id) || { values: [], index: -1 };
                      const value = target.innerText;
                      if (history.values[history.index] !== value) {
                        history.values = [...history.values.slice(0, history.index + 1), value].slice(-150);
                        history.index = history.values.length - 1;
                        textHistoryRef.current.set(item.id, history);
                      }
                    }
                    const offset = caretOffset(target);
                    const live = liveRef.current;
                    if (!live || live.id !== item.id) {
                      keepEditingFocus(item.id, offset);
                      return;
                    }
                    // Une zone devenue vide disparaît immédiatement : les textes et images
                    // situés dessous remontent sans attendre que l'utilisateur clique ailleurs.
                    if (editableIsEmpty(target)) {
                      const sourceItems = liveRef.current?.items || elements;
                      if (!shrinkEmptyBlock(item, target, sourceItems)) {
                        liveRef.current = null;
                        removeAndKeepEditing(item, sourceItems);
                      }
                      return;
                    }
                    const currentLive = liveRef.current;
                    const natural = measureEditableHeight(target);
                    const lines = editableLineCount(target);
                    const removedLines = Math.max(0, currentLive.lines - lines);
                    const measuredDelta = natural - currentLive.last;
                    // Le comptage des lignes couvre le cas où Chrome conserve encore
                    // l'ancienne géométrie du contentEditable pendant l'événement input.
                    // Ce raccourci ne vaut que pour une vraie SUPPRESSION de texte : en tapant après « Entrée », la ligne vide
                    // temporaire disparaît du comptage, ce qui ressemblait à une ligne effacée et annulait la descente.
                    const isDeletion = /^delete/.test(event.nativeEvent?.inputType || "");
                    const delta = removedLines && isDeletion && measuredDelta > -0.05
                      ? -removedLines * editableLineHeight(target)
                      : measuredDelta;
                    currentLive.last = natural;
                    currentLive.lines = lines;
                    if (Math.abs(delta) < 0.05) {
                      keepEditingFocus(item.id, offset);
                      return;
                    }
                    // Pas de requestAnimationFrame : React valide la nouvelle position
                    // avant de rendre la main au navigateur. L'image bouge donc pendant
                    // la pression elle-même, même si Retour arrière reste enfoncé.
                    if (!currentLive.touched) {
                      currentLive.touched = true;
                      historyRef.current = [
                        ...historyRef.current.slice(-39),
                        currentLive.items.map((entry) => ({ ...entry })),
                      ];
                    }
                    const current = currentLive.items.find((entry) => entry.id === item.id);
                    if (!current) return;
                    currentLive.items = resizeCoverTextAndReflow(
                      currentLive.items,
                      item.id,
                      (Number(current.height) || 1) + delta,
                      current.text,
                    );
                    // Aucun setState ici : le contentEditable et sa sélection restent
                    // intacts, donc Backspace peut rester enfoncé comme dans Word.
                    paintLiveGeometry(currentLive.items);
                    keepEditingFocus(item.id, offset);
                  }}
                  onBlur={(event) => {
                    if (readOnly) return;
                    const value = event.currentTarget.innerText;
                    if (!value.replace(/[\s\u00a0\u200b\uFEFF]/g, "")) {
                      if (liveRef.current?.id === item.id && liveRef.current.touched) {
                        const pending = liveRef.current.items;
                        liveRef.current = null;
                        setElements(pending.map((entry) => (entry.id === item.id ? { ...entry, text: "" } : entry)));
                        onChange?.();
                        return;
                      }
                      liveRef.current = null;
                      if (item.userCreated && !item.text) {
                        discardEmptyDraft(item.id);
                        return;
                      }
                      remove(item.id);
                      return;
                    }
                    if (liveRef.current?.id === item.id && liveRef.current.touched) {
                      // La mise en page a déjà été ajustée en direct : on valide d'un
                      // seul coup la géométrie affichée et le texte final.
                      const pending = liveRef.current.items;
                      liveRef.current = null;
                      setElements(pending.map((entry) => (entry.id === item.id ? { ...entry, text: value } : entry)));
                      onChange?.();
                      return;
                    }
                    liveRef.current = null;
                    const measuredHeight = Math.max(
                      1,
                      measureEditableHeight(event.currentTarget),
                    );
                    // Seul un texte réellement modifié déclenche un recalcul de la mise en page : un simple clic dans une zone puis ailleurs
                    // ne doit rien déplacer (avant, l'écart entre la hauteur mesurée et celle du PDF faisait remonter tout ce qui est dessous).
                    // innerText n'est pas strictement identique au texte stocké (retour à la ligne final, espaces insécables…) :
                    // on compare donc des textes normalisés, sinon un simple clic suffisait à tout faire remonter.
                    const plain = (text) => String(text ?? "").replace(/ /g, " ").replace(/\r/g, "").replace(/[\s​﻿]+$/g, "");
                    if (plain(value) !== plain(item.text)) {
                      commit((items) =>
                        resizeCoverTextAndReflow(
                          items,
                          item.id,
                          measuredHeight,
                          value,
                        ),
                      );
                      onChange?.();
                    }
                  }}
                  title="Cliquez pour écrire · utilisez la poignée pour déplacer"
                  style={{
                    fontFamily: item.fontFamily,
                    fontSize: `${Math.max(6, item.fontSizePt || 10)}px`,
                    fontWeight: item.bold ? 700 : 400,
                    fontStyle: item.italic ? "italic" : "normal",
                    color: item.color,
                    textAlign: item.align || "left",
                    whiteSpace: item.noWrap ? "pre" : undefined,
                  }}
                >
                  {item.text}
                </div>
                {(
                  <button
                    className="reconstructed-delete"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(item.id);
                    }}
                    title="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                {(
                  <span
                    className="reconstructed-resize-handle"
                    onPointerDown={(event) => beginResize(event, item)}
                    onPointerMove={resize}
                    onPointerUp={() => (resizeRef.current = null)}
                  />
                )}
              </div>
            ),
          )}
        </article>
        {selected && inspectorOpen && (
          <aside className="reconstruction-inspector">
            <button
              type="button"
              className="reconstruction-inspector-close"
              onClick={() => setInspectorOpen(false)}
              aria-label="Fermer les réglages"
              title="Fermer"
            >
              <X size={14} />
            </button>
            <b>
              {selected.type === "image"
                ? "Image sélectionnée"
                : "Bloc de texte sélectionné"}
            </b>
            <small>
              Vous pouvez aussi le déplacer directement sur la page.
            </small>
            <label>
              Horizontal{" "}
              <input
                type="number"
                min="0"
                max={Math.max(0, 100 - selected.width)}
                step="0.5"
                value={Math.round(selected.x * 10) / 10}
                onChange={(event) =>
                  update(selected.id, {
                    x: Math.max(
                      0,
                      Math.min(
                        100 - selected.width,
                        Number(event.target.value),
                      ),
                    ),
                  })
                }
              />
              <strong>%</strong>
            </label>
            <label>
              Vertical{" "}
              <input
                type="number"
                min="0"
                max={Math.max(0, 100 - selected.height)}
                step="0.5"
                value={Math.round(selected.y * 10) / 10}
                onChange={(event) =>
                  update(selected.id, {
                    y: Math.max(
                      0,
                      Math.min(
                        100 - selected.height,
                        Number(event.target.value),
                      ),
                    ),
                  })
                }
              />
              <strong>%</strong>
            </label>
            <label>
              Largeur{" "}
              <input
                type="range"
                min="3"
                max="95"
                step=".5"
                value={selected.width}
                onChange={(event) =>
                  update(selected.id, { width: Number(event.target.value) })
                }
              />
              <strong>{Math.round(selected.width)}%</strong>
            </label>
            <label>
              Hauteur{" "}
              <input
                type="range"
                min="1"
                max="80"
                step=".5"
                value={selected.height}
                onChange={(event) =>
                  update(selected.id, { height: Number(event.target.value) })
                }
              />
              <strong>{Math.round(selected.height)}%</strong>
            </label>
            {selected.type === "text" && (
              <>
                <label>
                  Alignement{" "}
                  <select
                    value={selected.align || "left"}
                    onChange={(event) =>
                      update(selected.id, { align: event.target.value })
                    }
                  >
                    <option value="left">Gauche</option>
                    <option value="center">Centré</option>
                    <option value="right">Droite</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    update(selected.id, {
                      text: String(selected.text || "")
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .join("\n"),
                      height: 1,
                    })
                  }
                >
                  Supprimer les lignes vides
                </button>
                <label>
                  Taille{" "}
                  <input
                    type="range"
                    min="6"
                    max="40"
                    step=".5"
                    value={selected.fontSizePt || 10}
                    onChange={(event) =>
                      update(selected.id, {
                        fontSizePt: Number(event.target.value),
                      })
                    }
                  />
                  <strong>{selected.fontSizePt || 10} pt</strong>
                </label>
                <label>
                  Couleur{" "}
                  <input
                    type="color"
                    value={selected.color || "#000000"}
                    onChange={(event) =>
                      update(selected.id, { color: event.target.value })
                    }
                  />
                </label>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
