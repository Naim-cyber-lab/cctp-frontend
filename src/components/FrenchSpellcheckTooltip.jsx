import { useEffect, useRef, useState } from "react";
import nspell from "nspell";
import aff from "../../node_modules/dictionary-fr/index.aff?raw";
import dic from "../../node_modules/dictionary-fr/index.dic?raw";

// Le dictionnaire français (84 000 entrées) est volumineux : l'indexer d'un seul bloc gelait la
// page pendant plus de 3 secondes à l'ouverture. On le charge donc par petites tranches entre
// deux affichages, et l'analyse ne démarre qu'une fois le dictionnaire complet.
const checker = nspell(aff);
let dictionaryReady = false;
const readyCallbacks = new Set();
function whenDictionaryReady(callback) {
  if (dictionaryReady) {
    callback();
    return () => {};
  }
  readyCallbacks.add(callback);
  return () => readyCallbacks.delete(callback);
}
(function loadDictionary() {
  const lines = dic.split("\n");
  let index = 1;
  const step = () => {
    const started = performance.now();
    while (index < lines.length && performance.now() - started < 14) {
      const end = Math.min(lines.length, index + 150);
      // nspell ignore la première ligne de chaque bloc (le décompte de la version complète).
      checker.dictionary("0\n" + lines.slice(index, end).join("\n"));
      index = end;
    }
    if (index < lines.length) {
      setTimeout(step, 0);
      return;
    }
    dictionaryReady = true;
    readyCallbacks.forEach((callback) => callback());
    readyCallbacks.clear();
  };
  setTimeout(step, 0);
})();
[
  "CCTP",
  "DCE",
  "DTU",
  "ERP",
  "BA13",
  "placo",
  "plâtrerie",
  "doublage",
  "cloisonnement",
  "hydrofuge",
  "acoustique",
  "acrotère",
  "calepinage",
  "CVC",
  "DOE",
  "OPR",
  "DGD",
  "RGE",
  "thermique",
  "menuiseries",
  "anti-chaleur",
  "pare-vapeur",
  "coupe-feu",
  "procès-verbal",
].forEach((word) => checker.add(word));
const spellCache = new Map(),
  ignored = new Set(),
  highlightNames = [
    "writing-spelling",
    "writing-grammar",
    "writing-typography",
    "writing-incomplete",
    "writing-style",
  ];
function editableTextNode(node, root) {
  const p = node?.parentElement;
  return Boolean(
    p &&
      root.contains(p) &&
      p.closest('[contenteditable="true"]') &&
      !p.closest(
        ".document-subheading,.document-source-footer,.paper-toc,.paper-footer,.cover-label,.chapter-code-edit",
      ),
  );
}
// Mots composés avec trait d'union : le dictionnaire ne connaît pas les inversions (« existe-t-il »,
// « peut-on », « donnez-moi ») ni les composés libres (« plâtrerie-isolation »). Un mot est correct
// si le mot entier l'est, ou si chaque élément l'est (les pronoms/particules compris).
const HYPHEN_PARTICLES = new Set(
  "t il ils elle elles on je tu nous vous ce moi toi lui leur le la les y en ci là là-bas même mêmes".split(" "),
);
function hyphenatedCorrect(word) {
  if (!word.includes("-")) return false;
  const parts = word.split("-").filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((part, index) => {
    const lower = part.toLocaleLowerCase("fr");
    if (index > 0 && HYPHEN_PARTICLES.has(lower)) return true;
    return lower.length < 2 || /[0-9]/.test(part) || checker.correct(part) || checker.correct(lower);
  });
}
function misspelled(word) {
  if (!dictionaryReady) return false;
  const key = word.toLocaleLowerCase("fr");
  if (ignored.has(key)) return false;
  if (spellCache.has(key)) return spellCache.get(key);
  const invalid =
    word.length >= 3 &&
    !/^[A-ZÀ-ÖØ-Þ0-9-]+$/.test(word) &&
    !/[0-9]/.test(word) &&
    !checker.correct(word) &&
    !hyphenatedCorrect(word);
  spellCache.set(key, invalid);
  return invalid;
}
function rankedSuggestions(word) {
  const lower = word.toLocaleLowerCase("fr"),
    common = {
      gen: ["gens"],
      metre: ["mètre"],
      oeuvre: ["œuvre"],
      batiment: ["bâtiment"],
    },
    forms = [
      lower + "s",
      lower + "e",
      lower + "es",
      lower + "er",
      lower + "é",
      lower + "ée",
      lower.endsWith("s") ? lower.slice(0, -1) : "",
    ].filter(Boolean),
    values = [
      ...(common[lower] || []),
      ...forms.filter((v) => checker.correct(v)),
      ...checker.suggest(word),
    ];
  return [...new Set(values)]
    .slice(0, 5)
    .map((v) =>
      /^[A-ZÀ-ÖØ-Þ]/.test(word)
        ? v.charAt(0).toLocaleUpperCase("fr") + v.slice(1)
        : v,
    );
}
const suggestionCache = new Map();
function cachedSuggestions(word) {
  if (!suggestionCache.has(word)) suggestionCache.set(word, rankedSuggestions(word));
  return suggestionCache.get(word);
}
function matchCase(source, replacement) {
  return /^[A-ZÀ-ÖØ-Þ]/.test(source)
    ? replacement.charAt(0).toLocaleUpperCase("fr") + replacement.slice(1)
    : replacement;
}
// Décalage appliqué aux positions quand on n'analyse qu'une fenêtre d'un gros bloc de texte.
let scanBase = 0;
function addIssue(list, node, start, end, issue) {
  start += scanBase;
  end += scanBase;
  // Les doublons se repèrent par une clé : un simple list.some() deviendrait quadratique sur
  // un CCTP de plusieurs dizaines de pages.
  const keys = list.seenKeys || (list.seenKeys = new Set());
  const key = start + ":" + end;
  if (end <= start || keys.has(key)) return;
  keys.add(key);
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  list.push({
    ...issue,
    node,
    start,
    end,
    range,
    word: node.data.slice(start, end),
  });
}
function regexIssues(list, node, value, regex, makeIssue) {
  for (const match of value.matchAll(regex)) {
    const issue = makeIssue(match),
      offset = issue.offset || 0;
    addIssue(
      list,
      node,
      match.index + offset,
      match.index + offset + (issue.length || match[0].length),
      issue,
    );
  }
}
function issuesForNode(node, from = 0, to = null) {
  const full = node.data || "",
    value = to == null ? full : full.slice(from, to),
    issues = [];
  scanBase = to == null ? 0 : from;
  try {
    return collectIssues(node, value, issues);
  } finally {
    scanBase = 0;
  }
}
function collectIssues(node, value, issues) {
  regexIssues(
    issues,
    node,
    value,
    /\b(\d+(?:[.,]\d+)?)(mm|cm|m²|m³|m|kg|dB)\b/gi,
    (m) => ({
      kind: "typography",
      label: "Unité mal espacée",
      message: "Une espace doit séparer la valeur de son unité.",
      suggestions: [m[1] + " " + m[2]],
    }),
  );
  regexIssues(issues, node, value, /\b(\d+(?:[.,]\d+)?)%/g, (m) => ({
    kind: "typography",
    label: "Typographie française",
    message: "Une espace est attendue avant le signe %.",
    suggestions: [m[1] + " %"],
  }));
  regexIssues(issues, node, value, /\bfourniture et pose\b/gi, (m) => ({
    kind: "grammar",
    label: "Article manquant",
    message:
      "La coordination est plus naturelle avec un article devant chaque nom.",
    suggestions: [matchCase(m[0], "fourniture et la pose")],
  }));
  regexIssues(issues, node, value, /\bcarrées type\b/gi, (m) => ({
    kind: "grammar",
    label: "Construction maladroite",
    message: "La locution « de type » rend la phrase plus correcte.",
    suggestions: [matchCase(m[0], "carrées de type")],
  }));
  regexIssues(
    issues,
    node,
    value,
    /\b([A-Za-zÀ-ÖØ-öø-ÿŒœ]{3,})\s+\1\b/gi,
    (m) => ({
      kind: "style",
      label: "Répétition",
      message: "Ce mot apparaît deux fois à la suite.",
      suggestions: [m[1]],
    }),
  );
  regexIssues(
    issues,
    node,
    value,
    /\b(?:divers(?:es)?|adapté(?:e)?s?|si nécessaire|etc\.)\b/gi,
    () => ({
      kind: "style",
      label: "Formulation trop vague",
      message:
        "Précisez le produit, la performance ou les conditions d’application pour rendre la prescription vérifiable.",
      suggestions: [],
    }),
  );
  regexIssues(
    issues,
    node,
    value,
    /\b(ne\s+(?:sont|sera|seront|peut|peuvent|doit|doivent|devra|devront)\s+pas|afin\s+de|de\s+manière\s+à|à\s+condition\s+de|avec|sans|pour|par|mais|et|ou|de|du|des|à|au|aux|dans|sur|sous|entre|vers|selon|dont|que|qui)\s*[,;:]?\s*$/gi,
    (m) => ({
      kind: "incomplete",
      label: "Phrase probablement interrompue",
      message:
        "Cette fin appelle une suite. Complétez la phrase ou supprimez les derniers mots.",
      suggestions: [],
      length: m[0].length,
    }),
  );
  for (const match of value.matchAll(
    /[A-Za-zÀ-ÖØ-öø-ÿŒœ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿŒœ]+)*/g,
  ))
    if (misspelled(match[0]))
      addIssue(issues, node, match.index, match.index + match[0].length, {
        kind: "spelling",
        label: "Orthographe",
        message:
          "Ce mot n’est reconnu ni dans le français courant ni dans le lexique bâtiment.",
        // Calculées à l'affichage de la bulle seulement : suggest() est très coûteux.
        suggestions: [],
        lazySuggestions: true,
      });
  return issues;
}
function scan(root) {
  const issues = [],
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()))
    if (editableTextNode(node, root)) issues.push(...issuesForNode(node));
  return issues;
}
function refreshHighlights(root) {
  if (!globalThis.CSS?.highlights || typeof Highlight === "undefined")
    return [];
  const issues = scan(root);
  highlightNames.forEach((name) =>
    CSS.highlights.set(
      name,
      new Highlight(
        ...issues
          .filter((i) => "writing-" + i.kind === name)
          .map((i) => i.range),
      ),
    ),
  );
  return issues;
}
function paintHighlights(issues) {
  if (!globalThis.CSS?.highlights || typeof Highlight === "undefined") return;
  highlightNames.forEach((name) =>
    CSS.highlights.set(
      name,
      new Highlight(
        ...issues
          .filter((item) => "writing-" + item.kind === name)
          .map((item) => item.range),
      ),
    ),
  );
}
function scanInSlices(root, onDone, onError) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
    issues = [];
  let cancelled = false,
    handle = null,
    current = null,
    offset = 0;
  const schedule = (callback) => {
    handle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(callback, { timeout: 500 })
        : setTimeout(() => callback({ timeRemaining: () => 8 }), 0);
  };
  const WINDOW = 2500;
  const work = (deadline) => {
    if (cancelled) return;
    try {
      const started = performance.now();
      for (;;) {
        if (!current) {
          current = walker.nextNode();
          offset = 0;
          if (!current) break;
          if (!editableTextNode(current, root)) {
            current = null;
            continue;
          }
        }
        const length = current.data.length;
        if (length <= WINDOW) {
          issues.push(...issuesForNode(current));
          current = null;
        } else {
          // Gros bloc de texte (document importé) : tranches de ~2 500 caractères, coupées
          // sur une espace, pour pouvoir rendre la main au navigateur entre deux tranches.
          let end = Math.min(length, offset + WINDOW);
          while (end < length && !/\s/.test(current.data[end])) end += 1;
          issues.push(...issuesForNode(current, offset, end));
          offset = end;
          if (offset >= length) current = null;
        }
        if (performance.now() - started > 12 || deadline.timeRemaining() < 2) {
          schedule(work);
          return;
        }
      }
      paintHighlights(issues);
      onDone(issues);
    } catch (error) {
      onError(error);
    }
  };
  schedule(work);
  return () => {
    cancelled = true;
    if (typeof cancelIdleCallback === "function") cancelIdleCallback(handle);
    else clearTimeout(handle);
  };
}
function textNodesIn(target, root) {
  if (!target) return [];
  if (target.nodeType === Node.TEXT_NODE)
    return editableTextNode(target, root) ? [target] : [];
  if (target.nodeType !== Node.ELEMENT_NODE) return [];
  const nodes = [],
    walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()))
    if (editableTextNode(node, root)) nodes.push(node);
  return nodes;
}
function issueAtPoint(event, root, issues) {
  const position = document.caretPositionFromPoint?.(
      event.clientX,
      event.clientY,
    ),
    legacy =
      !position && document.caretRangeFromPoint?.(event.clientX, event.clientY),
    node = position?.offsetNode || legacy?.startContainer,
    offset = position?.offset ?? legacy?.startOffset;
  if (
    !node ||
    node.nodeType !== Node.TEXT_NODE ||
    !editableTextNode(node, root)
  )
    return null;
  return (
    issues.find(
      (i) => i.node === node && offset >= i.start && offset <= i.end,
    ) || null
  );
}
export function FrenchSpellcheckTooltip({ enabled, rootRef, dictionaryTerms = [] }) {
  const dictionaryKey = dictionaryTerms.filter(Boolean).join(" ");
  const [issue, setIssue] = useState(null),
    timer = useRef(null),
    leaveTimer = useRef(null),
    dismissedIssue = useRef(null),
    issuesRef = useRef([]),
    // Suggestion actuellement affichée : tant que la souris reste sur le même mot, la bulle
    // ne doit pas être replacée sous le curseur, sinon elle fuit quand on veut la saisir.
    shownRef = useRef(null);
  useEffect(() => {
    // Les noms du projet, des lots et des intervenants ne sont pas des fautes. Les ajouter
    // au dictionnaire du document évite les propositions absurdes sur des noms propres
    // comme « Bodemer », tout en conservant la correction du français courant.
    for (const match of dictionaryKey.matchAll(
      /[A-Za-zÀ-ÖØ-öø-ÿŒœ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿŒœ]+)*/g,
    )) {
      if (match[0].length < 3) continue;
      checker.add(match[0]);
      spellCache.delete(match[0].toLocaleLowerCase("fr"));
    }
  }, [dictionaryKey]);
  useEffect(() => {
    shownRef.current = issue;
  }, [issue]);
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) {
      setIssue(null);
      highlightNames.forEach((n) => CSS?.highlights?.delete?.(n));
      return;
    }
    const runWhenIdle = (callback) =>
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(callback, { timeout: 700 })
        : setTimeout(callback, 0);
    let stopScan = () => {};
    const stopWaiting = whenDictionaryReady(() => {
      stopScan = scanInSlices(
        root,
        (issues) => {
          issuesRef.current = issues;
          root.removeAttribute("data-writing-error");
        },
        (error) => {
          root.setAttribute("data-writing-error", error?.message || String(error));
          console.error("Writing assistance scan failed", error);
        },
      );
    });
    const cancelInitialScan = () => {
      stopWaiting();
      stopScan();
    };
    let idleHandle = null,
      refreshTimer;
    const observer = new MutationObserver((mutations) => {
      const changed = new Set();
      mutations.forEach((mutation) => {
        textNodesIn(mutation.target, root).forEach((node) => changed.add(node));
        mutation.addedNodes.forEach((added) =>
          textNodesIn(added, root).forEach((node) => changed.add(node)),
        );
      });
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (!changed.size) return;
        idleHandle = runWhenIdle(() => {
          try {
            const retained = issuesRef.current.filter(
              (item) => item.node.isConnected && !changed.has(item.node),
            );
            changed.forEach((node) => {
              if (!node.isConnected || !editableTextNode(node, root)) return;
              const length = node.data.length;
              const selection = getSelection();
              if (length > 1500 && selection?.anchorNode === node) {
                // Gros bloc de texte (document importé) : on ne ré-analyse que le passage
                // autour du curseur, les autres résultats sont conservés.
                const full = node.data;
                let from = Math.max(0, selection.anchorOffset - 700);
                let to = Math.min(length, selection.anchorOffset + 700);
                while (from > 0 && !/\s/.test(full[from])) from -= 1;
                while (to < length && !/\s/.test(full[to])) to += 1;
                for (const item of issuesRef.current) {
                  if (item.node !== node || !item.range || item.range.startContainer !== node) continue;
                  item.start = item.range.startOffset;
                  item.end = item.range.endOffset;
                  if (item.end <= from || item.start >= to) retained.push(item);
                }
                retained.push(...issuesForNode(node, from, to));
              } else {
                retained.push(...issuesForNode(node));
              }
            });
            issuesRef.current = retained;
            paintHighlights(retained);
          } catch (error) {
            console.error("Writing assistance incremental scan failed", error);
          }
        });
      }, 450);
    });
    observer.observe(root, {
      subtree: true,
      characterData: true,
      childList: true,
    });
    const closeLater = (delay = 800) => {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => setIssue(null), delay);
    };
    const inspect = (event) => {
      clearTimeout(timer.current);
      const found = issueAtPoint(event, root, issuesRef.current);
      if (!found) {
        dismissedIssue.current = null;
        return closeLater();
      }
      if (
        dismissedIssue.current?.node === found.node &&
        dismissedIssue.current?.start === found.start &&
        dismissedIssue.current?.end === found.end
      )
        return;
      dismissedIssue.current = null;
      clearTimeout(leaveTimer.current);
      const shown = shownRef.current;
      if (
        shown &&
        shown.node === found.node &&
        shown.start === found.start &&
        shown.end === found.end
      )
        return;
      timer.current = setTimeout(
        () =>
          setIssue({
            ...found,
            x: Math.min(event.clientX + 12, window.innerWidth - 310),
            y: Math.min(event.clientY + 18, window.innerHeight - 190),
          }),
        220,
      );
    };
    root.addEventListener("mousemove", inspect);
    root.addEventListener("click", inspect);
    root.addEventListener("mouseleave", closeLater);
    return () => {
      observer.disconnect();
      cancelInitialScan();
      clearTimeout(refreshTimer);
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idleHandle);
      else clearTimeout(idleHandle);
      clearTimeout(timer.current);
      clearTimeout(leaveTimer.current);
      highlightNames.forEach((n) => CSS?.highlights?.delete?.(n));
      root.removeEventListener("mousemove", inspect);
      root.removeEventListener("click", inspect);
      root.removeEventListener("mouseleave", closeLater);
    };
  }, [enabled, rootRef, dictionaryKey]);
  if (!enabled || !issue) return null;
  const replace = (value) => {
    // La plage mémorisée au moment de l'analyse peut ne plus correspondre au texte (frappe
    // depuis, fusion de nœuds) : on relocalise le mot fautif dans son nœud avant de le remplacer,
    // et on le remplace en place pour ne jamais laisser l'ancien mot à côté du nouveau.
    const node = issue.node;
    if (!node?.isConnected) return setIssue(null);
    const data = node.data;
    let start = issue.start;
    if (data.slice(start, start + issue.word.length) !== issue.word) {
      start = -1;
      for (let i = data.indexOf(issue.word); i >= 0; i = data.indexOf(issue.word, i + 1))
        if (start < 0 || Math.abs(i - issue.start) < Math.abs(start - issue.start)) start = i;
    }
    if (start < 0) return setIssue(null);
    node.replaceData(start, issue.word.length, value);
    rootRef.current?.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: value,
      }),
    );
    setIssue(null);
  };
  const ignore = () => {
    ignored.add(issue.word.toLocaleLowerCase("fr"));
    checker.add(issue.word);
    setIssue(null);
    issuesRef.current = refreshHighlights(rootRef.current);
  };
  const dismiss = () => {
    clearTimeout(timer.current);
    clearTimeout(leaveTimer.current);
    dismissedIssue.current = {
      node: issue.node,
      start: issue.start,
      end: issue.end,
    };
    setIssue(null);
  };
  const suggestions = issue.lazySuggestions
    ? cachedSuggestions(issue.word)
    : issue.suggestions;
  return (
    <div
      className={"spellcheck-tooltip " + issue.kind}
      style={{ left: issue.x, top: issue.y }}
      onPointerEnter={() => clearTimeout(leaveTimer.current)}
      onPointerDown={() => clearTimeout(leaveTimer.current)}
      onPointerLeave={() => {
        leaveTimer.current = setTimeout(() => setIssue(null), 400);
      }}
    >
      <button
        type="button"
        className="spell-close"
        aria-label="Fermer la suggestion"
        title="Fermer"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={dismiss}
      >
        ×
      </button>
      <small>{issue.label}</small>
      <strong>« {issue.word.trim()} »</strong>
      <p>{issue.message}</p>
      {suggestions.length > 0 ? (
        <div>
          {suggestions.map((value, index) => (
            <button
              type="button"
              className={index === 0 ? "best" : ""}
              key={value}
              onClick={() => replace(value)}
            >
              {value}
              {index === 0 && <em>Recommandé</em>}
            </button>
          ))}
        </div>
      ) : (
        <span className="spell-no-suggestion">
          Aucune correction automatique sûre — à reformuler.
        </span>
      )}
      {issue.kind === "spelling" && (
        <button type="button" className="spell-ignore" onClick={ignore}>
          Ajouter au dictionnaire
        </button>
      )}
    </div>
  );
}
