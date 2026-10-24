import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Info,
  Check,
  FilePlus2,
  ImagePlus,
  Layers3,
  Loader2,
  Merge,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { useCatalog } from "../catalog/CatalogContext";
import { ChapterCard } from "../components/ChapterCard";
import { CoverReconstructionEditor } from "../components/CoverReconstructionEditor";
import { getCoverSuggestions, uploadReferenceCctp } from "../api/client";
import {
  createBlankCoverElements,
  normalizeCoverElements,
} from "../utils/coverElements";

const detectCoverTitle = (elements) => {
  const excluded =
    /^(cctp|cahier des clauses|lot\s|date$|indice$|phase$|dce$|ma[iî]tre|architecte|bureau|coordonnateur|t[eé]l|m[eé]l)/i;
  const candidates = (elements || [])
    .filter((item) => item.type === "text")
    .map((item) => ({
      ...item,
      clean: String(item.text || "")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter(
      (item) =>
        item.clean.length >= 8 &&
        item.clean.length <= 140 &&
        !excluded.test(item.clean),
    );
  candidates.sort(
    (a, b) =>
      (Number(b.fontSizePt) || 0) * 10 +
      Math.min(b.clean.length, 80) -
      Math.abs((Number(b.x) || 50) + (Number(b.width) || 0) / 2 - 50) -
      ((Number(a.fontSizePt) || 0) * 10 +
        Math.min(a.clean.length, 80) -
        Math.abs((Number(a.x) || 50) + (Number(a.width) || 0) / 2 - 50)),
  );
  return candidates[0]?.clean || "";
};

export function SelectionPage({
  initial,
  onSubmit,
  onCancel,
  lotsOnly = false,
}) {
  const { categories, chapters } = useCatalog();
  const titleInputRef = useRef(null);
  const lotsRef = useRef(null);
  const coverChoiceRef = useRef(null);
  const [name, setName] = useState(initial?.name || "");
  const [selected, setSelected] = useState(initial?.selected || []);
  const [category, setCategory] = useState("Tous");
  const [query, setQuery] = useState("");
  const documentData = initial?.sections?.__document || {};
  const [contacts, setContacts] = useState(documentData.coverContacts || "");
  const [subtitle, setSubtitle] = useState(documentData.coverSubtitle || "");
  const [logos, setLogos] = useState(documentData.coverLogos || []);
  const [coverLabel, setCoverLabel] = useState(
    documentData.coverLabelText ||
      "CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES",
  );
  const [coverElements, setCoverElements] = useState(
    normalizeCoverElements(documentData.coverElements || []),
  );
  const [coverAspect, setCoverAspect] = useState(
    documentData.coverAspect || 1.4142,
  );
  const [coverStyle, setCoverStyle] = useState({
    coverLayout: documentData.coverLayout || "sidebar",
    coverAccent: documentData.coverAccent || "#315f51",
    coverPageColor: documentData.coverPageColor || "#ffffff",
    coverSourceReference: documentData.coverSourceReference || "",
    coverSourceReferenceId: documentData.coverSourceReferenceId || "",
    pageTemplate: documentData.pageTemplate || null,
  });
  const [workingSections, setWorkingSections] = useState(() => ({
    ...initial?.sections,
  }));
  const [lotTitles, setLotTitles] = useState(() =>
    Object.fromEntries(
      (initial?.selected || []).map((id) => [
        id,
        initial?.sections?.[id]?.customTitle ||
          chapters.find((item) => item.id === id)?.title ||
          `Lot ${id}`,
      ]),
    ),
  );
  const [mergeSelection, setMergeSelection] = useState([]);
  const [coverMode, setCoverMode] = useState(
    documentData.coverSourceReference
      ? "reference"
      : initial
        ? "scratch"
        : null,
  );
  const coverMissing =
    !lotsOnly &&
    (!coverMode ||
      (coverMode === "reference" && !coverStyle.coverSourceReference));
  const focusCover = () => {
    coverChoiceRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    coverChoiceRef.current?.focus({ preventScroll: true });
  };
  const [suggestions, setSuggestions] = useState({
    subtitles: [],
    contacts: [],
    logos: [],
    referenceLayouts: [],
  });
  useEffect(() => {
    getCoverSuggestions()
      .then((data) => {
        setSuggestions(data);
        if (initial) return;
        const template = data.template || {};
        setSubtitle(
          (current) =>
            current || template.coverSubtitle || data.subtitles?.[0] || "",
        );
        setContacts(
          (current) =>
            current || template.coverContacts || data.contacts?.[0] || "",
        );
        setLogos((current) =>
          current.length
            ? current
            : (template.coverLogos || []).map((logo) => ({
                ...logo,
                layout: logo.layout || "below",
              })),
        );
        setCoverStyle((current) => ({
          ...current,
          coverLayout: template.coverLayout || current.coverLayout,
          coverAccent: template.coverAccent || current.coverAccent,
          coverPageColor: template.coverPageColor || current.coverPageColor,
          pageTemplate: template.pageTemplate || current.pageTemplate,
        }));
      })
      .catch(() => {});
  }, [initial]);
  const coverFilePicker = useRef(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState("");
  // Importer un nouveau CCTP directement depuis le choix de la page de garde : il rejoint la
  // bibliothèque de modèles puis est sélectionné tout de suite.
  const importCoverModel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setCoverUploadError("");
    setCoverUploading(true);
    try {
      const created = await uploadReferenceCctp(file);
      const data = await getCoverSuggestions();
      setSuggestions(data);
      const layout =
        (data.referenceLayouts || []).find(
          (item) => String(item.id) === String(created?.id),
        ) || (data.referenceLayouts || [])[0];
      if (layout) {
        setCoverMode("reference");
        applyReferenceLayout(layout);
      } else
        setCoverUploadError(
          "Ce document a bien été ajouté, mais aucune page de garde exploitable n’en a été extraite. Essayez un PDF dont la première page est la page de garde.",
        );
    } catch (reason) {
      setCoverUploadError(
        reason?.message ||
          "Import impossible. Vérifiez que le fichier est un PDF ou un Word de moins de 30 Mo.",
      );
    } finally {
      setCoverUploading(false);
    }
  };
  const applyReferenceLayout = (layout) => {
    const elements = normalizeCoverElements(layout.elements || []);
    const textElements = elements.filter(
      (item) => item.type === "text" && item.text?.trim(),
    );
    const weightBy = (field, fallback) => {
      const weights = {};
      textElements.forEach((item) => {
        const value = item[field] || fallback;
        weights[value] =
          (weights[value] || 0) + Math.max(1, item.text.trim().length);
      });
      return (
        Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] || fallback
      );
    };
    const bodySizes = textElements
      .map((item) => Number(item.fontSizePt))
      .filter((size) => size >= 7 && size <= 14)
      .sort((a, b) => a - b);
    const bodySize = bodySizes.length
      ? bodySizes[Math.floor(bodySizes.length / 2)]
      : Number(layout.pageTemplate?.fontSizePt || 10.5);
    const fontFamily = weightBy(
      "fontFamily",
      layout.pageTemplate?.fontFamily || "Arial",
    );
    const textColor = weightBy(
      "color",
      layout.pageTemplate?.textColor || "#343a37",
    );
    const pageTemplate = {
      ...(layout.pageTemplate || {}),
      fontFamily,
      fontSizePt: bodySize,
      lineHeightPt: Math.round(bodySize * 1.5 * 10) / 10,
      textColor,
      headingColor:
        layout.accentColor || layout.pageTemplate?.headingColor || textColor,
      accentColor:
        layout.accentColor || layout.pageTemplate?.accentColor || "#315f51",
      sourceReference: layout.filename,
      ...(layout.bodyStyle || {}),
      ...(layout.bodyStyle?.fontSizePt
        ? {
            lineHeightPt:
              Math.round(layout.bodyStyle.fontSizePt * 1.5 * 10) / 10,
          }
        : {}),
    };
    setCoverStyle({
      coverLayout: layout.layout || "reconstructed",
      coverAccent: layout.accentColor || "#315f51",
      coverPageColor: layout.pageColor || "#ffffff",
      coverSourceReference: layout.filename,
      coverSourceReferenceId: layout.id,
      pageTemplate,
    });
    setCoverElements(elements);
    setCoverAspect(layout.pageAspect || 1.4142);
    setName((current) =>
      current.trim()
        ? current
        : layout.suggestedTitle || detectCoverTitle(elements) || "",
    );
  };
  const chooseScratch = () => {
    setCoverMode("scratch");
    setCoverElements(
      createBlankCoverElements({
        title: name,
        subtitle,
        contacts,
        label: coverLabel,
        logos,
      }),
    );
    setCoverAspect(1.4142);
    setCoverStyle((current) => ({
      ...current,
      coverLayout: "sidebar",
      coverSourceReference: "",
      coverSourceReferenceId: "",
      pageTemplate: null,
    }));
  };
  const filtered = useMemo(
    () =>
      chapters.filter(
        (c) =>
          (category === "Tous" || c.category === category) &&
          `${c.title} ${c.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [category, query],
  );
  const originalSelected = initial?.selected || [];
  const addedLots = selected.filter((id) => !originalSelected.includes(id));
  const toggle = (id) =>
    setSelected((items) =>
      lotsOnly && originalSelected.includes(id)
        ? items
        : items.includes(id)
          ? items.filter((x) => x !== id)
          : [...items, id],
    );
  const mergeLots = () => {
    if (mergeSelection.length < 2) return;
    const ordered = selected.filter((id) => mergeSelection.includes(id));
    const targetId = ordered[0];
    const mergedTitle = lotTitles[targetId] || "Lot fusionné";
    const parts = ordered.map((id) => workingSections[id]).filter(Boolean);
    const html = parts
      .map(
        (section, index) =>
          `${index ? `<h2>${lotTitles[ordered[index]] || ""}</h2>` : ""}${
            section.html ||
            String(section.content || "")
              .split(/\n\n+/)
              .map((text) => `<p>${text}</p>`)
              .join("")
          }`,
      )
      .join("");
    const content = parts
      .map(
        (section, index) =>
          `${index ? `${lotTitles[ordered[index]] || ""}\n\n` : ""}${section.content || ""}`,
      )
      .filter(Boolean)
      .join("\n\n");
    setWorkingSections((current) => {
      const next = {
        ...current,
        [targetId]: {
          ...(current[targetId] || {}),
          customTitle: mergedTitle,
          html,
          content,
          summary: content.slice(0, 92),
        },
      };
      ordered.slice(1).forEach((id) => delete next[id]);
      return next;
    });
    setSelected((current) =>
      current.filter((id) => !ordered.slice(1).includes(id)),
    );
    setMergeSelection([]);
  };
  const sectionsForSave = () => {
    const next = { ...workingSections };
    selected.forEach((id) => {
      next[id] = {
        ...(next[id] || {}),
        customTitle: (
          lotTitles[id] ||
          chapters.find((item) => item.id === id)?.title ||
          `Lot ${id}`
        ).trim(),
      };
    });
    return next;
  };
  const addLogos = (event) => {
    Array.from(event.target.files || [])
      .slice(0, 6 - logos.length)
      .forEach((file) => {
        if (file.size > 2 * 1024 * 1024) return;
        const reader = new FileReader();
        reader.onload = () =>
          setLogos((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              name: file.name,
              src: reader.result,
              x: 12 + (current.length % 2) * 58,
              y: 12 + Math.floor(current.length / 2) * 18,
              width: 28,
              caption: "",
              layout: "below",
            },
          ]);
        reader.readAsDataURL(file);
      });
    event.target.value = "";
  };
  const focusTitle = () => {
    titleInputRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    titleInputRef.current?.focus({ preventScroll: true });
  };
  return (
    <main className={`selection-page ${lotsOnly ? "lots-only" : ""}`}>
      <button className="cancel-link" onClick={onCancel}>
        ← Retour au brouillon
      </button>
      {lotsOnly && (
        <section className="lots-only-heading">
          <span className="eyebrow">AJOUTER DES LOTS</span>
          <h1>Complétez votre CCTP</h1>
          <p>
            Sélectionnez uniquement les nouveaux lots à ajouter. Le titre, la
            page de garde et les chapitres déjà rédigés resteront inchangés.
          </p>
        </section>
      )}
      <section className="hero">
        <span className="eyebrow">
          {initial ? "MODIFIER LE CCTP" : "NOUVEAU CCTP"}
        </span>
        <h1>Donnez un nom à votre CCTP</h1>
        <p>
          Ce titre permettra de l’identifier et de le reprendre plus tard, comme
          une conversation dans votre historique.
        </p>
        <label className="title-field">
          <span>Titre du CCTP</span>
          <input
            ref={titleInputRef}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Rénovation école Jean Moulin"
            maxLength={100}
          />
          <small>{name.length}/100</small>
        </label>
      </section>
      {!lotsOnly && (
        <section
          className="cover-origin-choice"
          ref={coverChoiceRef}
          tabIndex={-1}
          aria-label="Choix obligatoire de la page de garde"
        >
          <header>
            <span className="eyebrow">POINT DE DÉPART</span>
            <h2>Comment souhaitez-vous créer la page de garde&nbsp;?</h2>
            <p>
              Choix obligatoire : sélectionnez une méthode pour créer le
              brouillon. Vous pourrez personnaliser la page ensuite.
            </p>
          </header>
          <div>
            <button
              className={coverMode === "reference" ? "active" : ""}
              onClick={() => setCoverMode("reference")}
              aria-pressed={coverMode === "reference"}
            >
              <span>
                <Layers3 size={22} />
              </span>
              <b>Repartir d’un CCTP existant</b>
              <small>
                Reprendre sa mise en page, ses images et son style : choisissez
                un CCTP déjà importé, ou importez-en un nouveau (PDF ou Word).
              </small>
              {coverMode === "reference" && (
                <i>
                  <Check size={13} /> Sélectionné
                </i>
              )}
            </button>
            <strong>OU</strong>
            <button
              className={coverMode === "scratch" ? "active" : ""}
              onClick={chooseScratch}
              aria-pressed={coverMode === "scratch"}
            >
              <span>
                <FilePlus2 size={22} />
              </span>
              <b>Créer une page de garde vierge</b>
              <small>Commencer de zéro avec vos propres textes et logos.</small>
              {coverMode === "scratch" && (
                <i>
                  <Check size={13} /> Sélectionné
                </i>
              )}
            </button>
          </div>
        </section>
      )}
      {coverMode === "reference" && (
        <section className="reference-cover-presets">
          <div>
            <span className="eyebrow">ÉTAPE 2 · CHOIX DU MODÈLE</span>
            <h2>
              {suggestions.referenceLayouts?.length
                ? "Sélectionnez le CCTP à reprendre"
                : "Importez le CCTP à reprendre"}
            </h2>
            <p>
              Sa page de garde (images, textes, positions) puis le style de ses
              titres, sa police, ses couleurs et ses marges seront repris. Tout
              reste modifiable ensuite.
            </p>
          </div>
          <div className="reference-cover-grid">
            {suggestions.referenceLayouts.map((layout) => {
              const active = coverStyle.coverSourceReferenceId
                ? coverStyle.coverSourceReferenceId === layout.id
                : coverStyle.coverSourceReference === layout.filename;
              return (
                <button
                  key={layout.id}
                  className={active ? "active" : ""}
                  onClick={() => applyReferenceLayout(layout)}
                  aria-pressed={active}
                >
                  <img
                    src={layout.preview}
                    alt={`Aperçu de ${layout.filename}`}
                  />
                  <span>
                    <strong>{layout.filename}</strong>
                    <small>{layout.label}</small>
                    <i>
                      {active ? "✓ Modèle sélectionné" : "Choisir ce modèle"}
                    </i>
                    {active && (
                      <em>Page de garde, titres, police et marges repris</em>
                    )}
                  </span>
                </button>
              );
            })}
            <input
              ref={coverFilePicker}
              type="file"
              hidden
              accept=".pdf,.docx"
              onChange={importCoverModel}
            />
            <button
              type="button"
              className="reference-import-tile"
              onClick={() => coverFilePicker.current?.click()}
              disabled={coverUploading}
            >
              {coverUploading ? (
                <Loader2 size={20} className="spin" />
              ) : (
                <Upload size={20} />
              )}
              <span>
                <strong>
                  {coverUploading
                    ? "Analyse du document…"
                    : "Importer un autre CCTP"}
                </strong>
                <small>
                  {coverUploading
                    ? "Extraction de la page de garde, des titres et du style (quelques secondes)."
                    : "PDF ou Word, 30 Mo maximum. Il sera aussi ajouté à vos modèles de référence."}
                </small>
              </span>
            </button>
          </div>
          {coverUploadError && (
            <p className="reference-import-error" role="alert">
              {coverUploadError}
            </p>
          )}
        </section>
      )}
      {coverMode && coverElements.length > 0 && (
        <CoverReconstructionEditor
          elements={coverElements}
          setElements={setCoverElements}
          aspect={coverAspect}
          mode={coverMode === "scratch" ? "blank" : "imported"}
        />
      )}
      {coverStyle.coverSourceReference && (
        <section className="cover-template-editor">
          <header>
            <div>
              <span className="eyebrow">APERÇU MODIFIABLE</span>
              <h2>Adaptez la page de garde proposée</h2>
              <p>
                Cliquez directement sur les textes de la page pour les modifier.
              </p>
            </div>
            <label>
              Couleur d’accent{" "}
              <input
                type="color"
                value={coverStyle.coverAccent}
                onChange={(event) =>
                  setCoverStyle((current) => ({
                    ...current,
                    coverAccent: event.target.value,
                    pageTemplate: {
                      ...(current.pageTemplate || {}),
                      accentColor: event.target.value,
                    },
                  }))
                }
              />
            </label>
          </header>
          <article
            className={`cover-template-sheet layout-${coverStyle.coverLayout}`}
            style={{
              "--template-accent": coverStyle.coverAccent,
              "--template-page": coverStyle.coverPageColor,
            }}
          >
            <input
              className="template-label"
              value={coverLabel}
              onChange={(event) => setCoverLabel(event.target.value)}
              aria-label="Libellé de la page de garde"
            />
            <input
              className="template-title"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Titre du CCTP"
              maxLength={100}
            />
            <input
              className="template-subtitle"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="Sous-titre ou adresse de l’opération"
            />
            <textarea
              className="template-contacts"
              value={contacts}
              onChange={(event) => setContacts(event.target.value)}
              placeholder="Coordonnées et intervenants du projet"
            />
            <div className="template-rule" />
          </article>
        </section>
      )}
      <section className="cover-setup">
        <div>
          <span className="eyebrow">PAGE DE GARDE</span>
          <h2>Personnalisez les informations du projet</h2>
          <p>
            Ces éléments seront réutilisés comme base pour vos prochains CCTP.
          </p>
          {(suggestions.logos.length ||
            suggestions.subtitles.length ||
            suggestions.contacts.length) > 0 && (
            <div className="cover-history">
              <b>Éléments déjà utilisés</b>
              <small>Cliquez sur un élément pour le reprendre.</small>
              {suggestions.logos.length > 0 && (
                <div className="cover-history-logos">
                  {suggestions.logos.map((logo, index) => (
                    <button
                      key={`${logo.id}-${index}`}
                      onClick={() =>
                        setLogos((current) =>
                          current.some((item) => item.src === logo.src)
                            ? current
                            : [
                                ...current,
                                { ...logo, id: crypto.randomUUID() },
                              ],
                        )
                      }
                      title={`Réutiliser ${logo.name || "ce logo"}`}
                    >
                      <img src={logo.src} alt="" />
                    </button>
                  ))}
                </div>
              )}
              {suggestions.subtitles.length > 0 && (
                <div className="cover-history-values">
                  <span>Adresses et sous-titres</span>
                  {suggestions.subtitles.map((value) => (
                    <button key={value} onClick={() => setSubtitle(value)}>
                      {value}
                    </button>
                  ))}
                </div>
              )}
              {suggestions.contacts.length > 0 && (
                <div className="cover-history-values">
                  <span>Coordonnées</span>
                  {suggestions.contacts.map((value) => (
                    <button key={value} onClick={() => setContacts(value)}>
                      {value.split("\n")[0]}
                      {value.includes("\n") ? "…" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="cover-setup-fields">
          <label>
            <span>Sous-titre ou adresse de l’opération</span>
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="Ex. Construction d’une crèche · 12 rue des Écoles"
            />
          </label>
          <label>
            <span>Coordonnées et intervenants</span>
            <textarea
              value={contacts}
              onChange={(event) => setContacts(event.target.value)}
              placeholder={
                "Maître d’œuvre : Société…\nAdresse…\nTéléphone…\nEmail…"
              }
            />
          </label>
          <label className="cover-logo-picker">
            <ImagePlus size={18} />
            <b>Ajouter des logos</b>
            <small>PNG, JPG ou WebP · 2 Mo maximum</small>
            <input
              hidden
              multiple
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={addLogos}
            />
          </label>
          {logos.length > 0 && (
            <div className="cover-logo-list">
              {logos.map((logo) => (
                <span key={logo.id}>
                  <img src={logo.src} />
                  <small>{logo.name}</small>
                  <button
                    onClick={() =>
                      setLogos((items) =>
                        items.filter((item) => item.id !== logo.id),
                      )
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="cover-data-note">
            <ShieldCheck size={15} /> Logos et coordonnées restent privés et
            associés uniquement à votre compte.
          </div>
        </div>
      </section>
      <section className="lots-heading" ref={lotsRef} tabIndex={-1}>
        <span className="eyebrow">
          {lotsOnly ? "LOTS DISPONIBLES" : "COMPOSITION"}
        </span>
        <h2>
          {lotsOnly
            ? "Quels lots souhaitez-vous ajouter ?"
            : "Quels lots composent votre projet ?"}
        </h2>
        {lotsOnly && (
          <p>
            Les lots déjà présents sont cochés et verrouillés afin d’éviter
            toute suppression accidentelle.
          </p>
        )}
      </section>
      {initial && selected.length > 0 && (
        <section className="lot-manager">
          <header>
            <div>
              <span className="eyebrow">ORGANISATION DES LOTS</span>
              <h2>Renommez ou fusionnez vos lots</h2>
              <p>
                Modifiez librement leur titre. Pour une fusion, cochez au moins
                deux lots : leurs contenus seront réunis dans le premier lot
                sélectionné.
              </p>
            </div>
            <button
              type="button"
              disabled={mergeSelection.length < 2}
              onClick={mergeLots}
            >
              <Merge size={16} /> Fusionner{" "}
              {mergeSelection.length > 1 ? `${mergeSelection.length} lots` : ""}
            </button>
          </header>
          <div>
            {selected.map((id, index) => {
              const chapter = chapters.find((item) => item.id === id);
              return (
                <article
                  key={id}
                  className={mergeSelection.includes(id) ? "selected" : ""}
                >
                  <label className="merge-check">
                    <input
                      type="checkbox"
                      checked={mergeSelection.includes(id)}
                      onChange={() =>
                        setMergeSelection((current) =>
                          current.includes(id)
                            ? current.filter((item) => item !== id)
                            : [...current, id],
                        )
                      }
                    />
                    <span>
                      {mergeSelection.includes(id) ? <Check size={13} /> : null}
                    </span>
                  </label>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <label className="lot-title-editor">
                    <span>Titre du lot</span>
                    <input
                      value={lotTitles[id] ?? chapter?.title ?? ""}
                      onChange={(event) =>
                        setLotTitles((current) => ({
                          ...current,
                          [id]: event.target.value,
                        }))
                      }
                      maxLength={120}
                    />
                  </label>
                  <button
                    type="button"
                    className="remove-lot"
                    onClick={() => {
                      setSelected((current) =>
                        current.filter((item) => item !== id),
                      );
                      setMergeSelection((current) =>
                        current.filter((item) => item !== id),
                      );
                    }}
                    title="Retirer ce lot"
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <section className="toolbar">
        <div className="categories">
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un lot…"
          />
        </label>
      </section>
      <section className="chapter-grid">
        {filtered.map((c) => (
          <ChapterCard
            key={c.id}
            chapter={c}
            selected={selected.includes(c.id)}
            onToggle={toggle}
          />
        ))}
      </section>
      <footer className="selection-footer">
        <div>
          <b>
            {lotsOnly
              ? `${addedLots.length} nouveau${addedLots.length > 1 ? "x" : ""} lot${addedLots.length > 1 ? "s" : ""}`
              : `${selected.length} lot${selected.length > 1 ? "s" : ""} sélectionné${selected.length > 1 ? "s" : ""}`}
          </b>
          <span>
            {lotsOnly
              ? `CCTP actuel : « ${initial?.name || name} »`
              : name.trim()
                ? `« ${name.trim()} »`
                : "Préparation du brouillon"}
          </span>
        </div>
        <section className="selection-submit">
          {!lotsOnly && (!name.trim() || !selected.length || coverMissing) && (
            <aside
              className="selection-missing"
              aria-label="Informations à compléter"
            >
              <header>
                <Info size={15} />
                <strong>À compléter</strong>
              </header>
              <ul>
                {!name.trim() && (
                  <li>
                    <button type="button" onClick={focusTitle}>
                      Titre du CCTP <ArrowRight size={12} />
                    </button>
                  </li>
                )}
                {!selected.length && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        lotsRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                        lotsRef.current?.focus({ preventScroll: true });
                      }}
                    >
                      Au moins un lot <ArrowRight size={12} />
                    </button>
                  </li>
                )}
                {coverMissing && (
                  <li>
                    <button type="button" onClick={focusCover}>
                      {coverMode === "reference"
                        ? "Modèle de page de garde"
                        : "Page de garde"}{" "}
                      <ArrowRight size={12} />
                    </button>
                  </li>
                )}
              </ul>
            </aside>
          )}
          <button
            className="primary"
            disabled={
              lotsOnly
                ? !addedLots.length
                : !name.trim() || !selected.length || coverMissing
            }
            onClick={() => {
              if (
                !lotsOnly &&
                (!name.trim() || !selected.length || coverMissing)
              )
                return;
              return lotsOnly
                ? onSubmit(initial.name, selected, {}, workingSections)
                : onSubmit(
                    name,
                    selected,
                    {
                      coverSubtitle: subtitle,
                      coverContacts: contacts,
                      coverLogos: logos,
                      coverLabelText: coverLabel,
                      coverElements,
                      coverAspect,
                      ...coverStyle,
                    },
                    initial ? sectionsForSave() : null,
                  );
            }}
          >
            {lotsOnly
              ? "Ajouter les lots"
              : initial
                ? "Enregistrer les modifications"
                : "Créer le brouillon"}{" "}
            <ArrowRight size={17} />
          </button>
        </section>
      </footer>
    </main>
  );
}
