import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  GitCompareArrows,
  Layers3,
  Search,
  X,
} from "lucide-react";
import { getChapterReuseSources } from "../api/client";

const NEWLINES = new RegExp(String.fromCharCode(10) + "+");
const normalize = (value) =>
  (value || "")
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\d+(?:\.\d+)*[\s.\-–—:]*/, "")
    .replace(/\s+/g, " ")
    .trim();
const isTocLine = (value) =>
  /\.{4,}\s*\d{1,4}\s*$/.test(value) ||
  /^\s*\d+(?:\.\d+)*\s+.{3,120}\.{3,}\s*\d+\s*$/.test(value);
const blocks = (value) =>
  (value || "")
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 2 && !isTocLine(item));
const isHeading = (value) =>
  /^\d+(?:\.\d+)*(?:[\s.\-–—:]+|$)/.test(value) ||
  (/^[A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9 '\-/]{4,90}$/.test(value) &&
    value.length < 95);

function sections(value) {
  const result = [];
  let current = {
    title: "Introduction et dispositions générales",
    heading: "",
    paragraphs: [],
  };
  blocks(value).forEach((block) => {
    if (isHeading(block)) {
      if (current.heading || current.paragraphs.length) result.push(current);
      current = {
        title: block.replace(/^\d+(?:\.\d+)*[\s.\-–—:]*/, ""),
        heading: block,
        paragraphs: [],
      };
    } else current.paragraphs.push(block);
  });
  if (current.heading || current.paragraphs.length) result.push(current);
  return result.filter((item) =>
    item.paragraphs.some((paragraph) => paragraph.length >= 25),
  );
}

function sectionRows(currentText, sourceText) {
  const current = sections(currentText),
    source = sections(sourceText),
    used = new Set();
  return source.map((incoming, index) => {
    let match = current.findIndex(
      (item, i) =>
        !used.has(i) && normalize(item.title) === normalize(incoming.title),
    );
    if (match < 0 && index < current.length && !used.has(index)) match = index;
    if (match >= 0) used.add(match);
    const local = match >= 0 ? current[match] : null;
    const same =
      local &&
      normalize(local.paragraphs.join(" ")) ===
        normalize(incoming.paragraphs.join(" "));
    return {
      id: `part-${index}`,
      local,
      incoming,
      status: !local ? "new" : same ? "same" : "changed",
    };
  });
}

/** Nombre de différences d'une partie : paragraphes qui ne correspondent pas, position par position (au moins 1 si la partie est « changée »). */
export const differenceCount = (row) => {
  if (row.status === "same") return 0;
  if (row.status === "new" || !row.local) return row.incoming?.paragraphs?.length || 1;
  const total = Math.max(row.local.paragraphs.length, row.incoming.paragraphs.length);
  let count = 0;
  for (let index = 0; index < total; index += 1) if (normalize(row.local.paragraphs[index] || "") !== normalize(row.incoming.paragraphs[index] || "")) count += 1;
  return Math.max(1, count);
};

const rowSignature = (row) => JSON.stringify([row.id, row.status, row.local?.heading, row.local?.title, row.local?.paragraphs, row.incoming.heading, row.incoming.title, row.incoming.paragraphs]);

// Une carte ne se redessine que si SA partie change : un collage ou une modification n'oblige plus à tout recalculer et réafficher.
const MergeCard = memo(
  function MergeCard({ row, index, open, done, onToggle, apply, pastePlainText, addPastedPart, saveLocalEdit }) {
    const heading = row.local?.heading || row.local?.title || "";
    return (
      <article
        className={`section-merge-card ${row.status}`}
        id={row.id}
        key={row.id}
      >
        <header
          onClick={() => onToggle(row.id, !open)}
          role="button"
          aria-expanded={open}
        >
          <span className="section-index">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>
            <b>{row.incoming.title}</b>
            <small>
              {row.status === "same"
                ? "Partie identique"
                : row.status === "new"
                  ? "Nouvelle partie disponible"
                  : `${differenceCount(row)} différence${differenceCount(row) > 1 ? "s" : ""}`}
            </small>
          </span>
          <i>
            {row.status === "same"
              ? "Identique"
              : row.status === "new"
                ? "Nouveau"
                : "À comparer"}
          </i>
          <ChevronDown className={open ? "open" : ""} size={17} />
        </header>
        {open && (
          <div className="section-merge-body">
            <div>
              <small>
                VERSION ACTUELLE · CLIQUEZ POUR MODIFIER OU COLLER
                DU TEXTE
              </small>
              {row.local ? (
                <>
                  <div className="merge-drop-target">
                    <h3
                      key={`h-${heading}`}
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck
                      onPaste={(event) =>
                        pastePlainText(event, (node) =>
                          saveLocalEdit(row, node.innerText, row.local.paragraphs),
                        )
                      }
                      onDrop={(event) => {
                        const node = event.currentTarget;
                        setTimeout(() => saveLocalEdit(row, node.innerText, row.local.paragraphs), 0);
                      }}
                      onBlur={(event) =>
                        saveLocalEdit(
                          row,
                          event.currentTarget.innerText,
                          row.local.paragraphs,
                        )
                      }
                    >
                      {heading}
                    </h3>
                  </div>
                  {row.local.paragraphs.map((text, i) => {
                    const commit = (node) => {
                      const paragraphs = [...row.local.paragraphs];
                      paragraphs[i] = node.innerText;
                      saveLocalEdit(row, heading, paragraphs);
                    };
                    return (
                      <div className="merge-drop-target" key={`${i}-${text}`}>
                        <p
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck
                          data-merge-paragraph
                          onPaste={(event) => pastePlainText(event, commit)}
                          onDrop={(event) => {
                            const node = event.currentTarget;
                            setTimeout(() => commit(node), 0);
                          }}
                          onBlur={(event) => commit(event.currentTarget)}
                        >
                          {text}
                        </p>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div
                  className="section-empty merge-drop-target"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck
                  data-merge-empty
                  data-placeholder="Collez ici le passage copié à droite pour créer cette partie."
                  onPaste={(event) =>
                    pastePlainText(event, (node) => addPastedPart(row, node))
                  }
                  onDrop={(event) => {
                    const node = event.currentTarget;
                    setTimeout(() => addPastedPart(row, node), 0);
                  }}
                />
              )}
            </div>
            <div className="selectable-source">
              <small>
                VERSION DU CCTP SÉLECTIONNÉ · SÉLECTIONNEZ UN PASSAGE,
                COPIEZ-LE (CTRL+C) PUIS COLLEZ-LE (CTRL+V) À GAUCHE, OÙ VOUS
                VOULEZ — OU GLISSEZ-LE À LA SOURIS
              </small>
              <h3>
                {row.incoming.heading || row.incoming.title}
              </h3>
              {row.incoming.paragraphs.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
              {row.status !== "same" && (
                <button disabled={done} onClick={() => apply(row)}>
                  {done ? (
                    <>
                      <Check size={15} /> Version récupérée
                    </>
                  ) : (
                    <>
                      <Layers3 size={15} />{" "}
                      {row.local
                        ? "Utiliser cette version"
                        : "Ajouter toute cette partie"}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </article>
    );
  },
  (before, after) =>
    before.index === after.index && before.open === after.open && before.done === after.done && rowSignature(before.row) === rowSignature(after.row),
);

export function ChapterReusePanel({
  cctpId,
  chapterId,
  chapterTitle,
  currentText,
  onClose,
  onMerge,
}) {
  const deferredText = useDeferredValue(currentText);
  const onMergeRef = useRef(onMerge);
  onMergeRef.current = onMerge;
  const [sources, setSources] = useState([]),
    [sourceId, setSourceId] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [applied, setApplied] = useState([]),
    [expanded, setExpanded] = useState({});
  useEffect(() => {
    getChapterReuseSources(cctpId, chapterId)
      .then((items) => {
        setSources(items);
        setSourceId("");
      })
      .catch((item) => setError(item.message))
      .finally(() => setLoading(false));
  }, [cctpId, chapterId]);
  const source = sources.find((item) => item.id === sourceId);
  const allRows = useMemo(
    () => sectionRows(deferredText, source?.content || ""),
    [deferredText, source],
  );
  const rows = useMemo(() => {
    const needle = normalize(query);
    return allRows.filter(
      (row) =>
        !needle ||
        normalize(
          `${row.incoming.title} ${row.incoming.paragraphs.join(" ")}`,
        ).includes(needle),
    );
  }, [allRows, query]);
  const changed = allRows.filter((row) => row.status === "changed").length,
    newCount = allRows.filter((row) => row.status === "new").length,
    same = allRows.filter((row) => row.status === "same").length;
  const toggleCard = useCallback((id, next) => setExpanded((value) => ({ ...value, [id]: next })), []);
  const apply = useCallback((row) => {
    onMergeRef.current({
      mode: row.local ? "replace" : "add",
      anchor: row.local?.heading || row.local?.paragraphs[0] || "",
      heading: row.incoming.heading,
      paragraphs: row.incoming.paragraphs,
    });
    setApplied((items) => [...items, row.id]);
  }, []);
  // Collage direct : le texte copié dans la colonne de droite s'insère exactement à l'endroit du curseur (jamais en haut),
  // en texte brut ; l'aperçu du document est mis à jour dans la foulée.
  const pastePlainText = useCallback((event, commit) => {
    event.preventDefault();
    document.execCommand(
      "insertText",
      false,
      event.clipboardData.getData("text/plain"),
    );
    commit?.(event.currentTarget);
  }, []);
  // Partie absente de votre lot : un collage la crée avec son titre, à sa place dans le chapitre.
  const addPastedPart = useCallback((row, node) => {
    const paragraphs = (node.innerText || "").split(NEWLINES).map((value) => value.trim()).filter(Boolean);
    if (!paragraphs.length) return;
    onMergeRef.current({ mode: "add", anchor: "", heading: row.incoming.heading, paragraphs });
    node.innerText = "";
    setApplied((items) => [...items, row.id]);
  }, []);
  const saveLocalEdit = useCallback((row, heading, paragraphs) => {
    const nextHeading = heading.trim();
    const nextParagraphs = paragraphs.map((value) => value.trim()).filter(Boolean);
    // Un simple clic dans une zone puis en dehors ne change rien : inutile de réécrire et réenregistrer tout le chapitre.
    const sameHeading = nextHeading === (row.local?.heading || row.local?.title || "").trim();
    const sameParagraphs = nextParagraphs.length === row.local.paragraphs.length && nextParagraphs.every((value, i) => value === row.local.paragraphs[i].trim());
    if (sameHeading && sameParagraphs) return;
    onMergeRef.current({
      mode: "replace",
      anchor: row.local?.heading || row.local?.paragraphs[0] || "",
      heading: nextHeading,
      paragraphs: nextParagraphs,
    });
  }, []);
  return (
    <>
      <div className="reuse-backdrop" onClick={onClose} />
      <aside className="reuse-panel reuse-merge-panel">
        <header>
          <div>
            <small>FUSION ENTRE DEUX CCTP</small>
            <h2>{chapterTitle}</h2>
          </div>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {source && (
          <div className="merge-summary">
            <GitCompareArrows size={19} />
            <span>
              <b>
                {changed} partie{changed > 1 ? "s" : ""} modifiée
                {changed > 1 ? "s" : ""}
              </b>
              <small>
                {newCount} nouvelle{newCount > 1 ? "s" : ""} · {same} identique
                {same > 1 ? "s" : ""}
              </small>
            </span>
            <p>
              Comparez des parties complètes. Rien n’est modifié tant que vous
              ne choisissez pas une version.
            </p>
          </div>
        )}
        {loading ? (
          <div className="reuse-state">Préparation de la comparaison…</div>
        ) : error ? (
          <div className="login-error">{error}</div>
        ) : sources.length === 0 ? (
          <div className="reuse-state">
            <FileText size={25} />
            <b>Aucun autre CCTP ne contient ce lot</b>
            <span>
              Ajoutez ce lot dans un autre CCTP ou importez un ancien document
              de référence.
            </span>
          </div>
        ) : !source ? (
          <section className="comparison-source-picker">
            <header>
              <small>ÉTAPE 1 SUR 2</small>
              <h3>Choisissez le CCTP à comparer</h3>
              <p>
                {sources.length} document{sources.length > 1 ? "s" : ""}{" "}
                contient{sources.length === 1 ? "" : "nent"} un lot
                correspondant à <strong>{chapterTitle}</strong>.
              </p>
            </header>
            <div>
              {sources.map((item) => (
                <button
                  type="button"
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    setSourceId(item.id);
                    setApplied([]);
                  }}
                >
                  <span className={`source-kind ${item.type}`}>
                    {item.type === "reference"
                      ? "CCTP IMPORTÉ"
                      : item.archived
                        ? "CCTP ARCHIVÉ"
                        : "CCTP DU PROJET"}
                  </span>
                  <b>{item.title}</b>
                  <small>
                    {item.matchedLot || `Lot ${chapterTitle} détecté`}
                  </small>
                  <i>
                    Comparer avec ce CCTP <GitCompareArrows size={14} />
                  </i>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <>
            <div className="reuse-merge-controls">
              <label>
                <span>CCTP comparé</span>
                <button
                  type="button"
                  className="change-comparison-source"
                  onClick={() => {
                    setSourceId("");
                    setQuery("");
                  }}
                >
                  <b>{source.title}</b>
                  <small>Changer de CCTP</small>
                </button>
              </label>
              <label className="reuse-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher une partie ou une prescription…"
                />
              </label>
            </div>
            {(() => {
              const different = rows.filter((row) => row.status !== "same").length;
              return <div className="reuse-summary" data-reuse-summary>
                <span>Comparaison avec</span>
                <b>{source?.title}</b>
                <em>{rows.length} partie{rows.length > 1 ? "s" : ""} · {different === 0 ? "toutes identiques" : `${different} différente${different > 1 ? "s" : ""}`}</em>
                <small>Choisissez la partie qui vous intéresse : les deux versions s’affichent côte à côte seulement ensuite.</small>
              </div>;
            })()}
            {rows.some((row) => expanded[row.id]) && <div className="reuse-merge-head">
              <span>VOTRE VERSION</span>
              <GitCompareArrows size={16} />
              <span>VERSION COMPARÉE · {source?.title}</span>
            </div>}
            <section className="section-merge-list">
              {rows.map((row, index) => {
                const open = expanded[row.id] ?? false;
                const done = applied.includes(row.id);
                return (
                  <MergeCard
                    key={row.id}
                    row={row}
                    index={index}
                    open={open}
                    done={done}
                    onToggle={toggleCard}
                    apply={apply}
                    pastePlainText={pastePlainText}
                    addPastedPart={addPastedPart}
                    saveLocalEdit={saveLocalEdit}
                  />
                );
              })}
              {!rows.length && (
                <div className="reuse-state">
                  Aucune partie ne correspond à cette recherche.
                </div>
              )}
            </section>
          </>
        )}
        <footer>
          <span>
            Chaque partie récupérée reste entièrement modifiable dans votre
            document.
          </span>
          <button onClick={onClose}>Terminer la comparaison</button>
        </footer>
      </aside>
    </>
  );
}
