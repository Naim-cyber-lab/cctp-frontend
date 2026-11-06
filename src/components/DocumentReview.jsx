import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, attachmentFileUrl } from "../api/client";
import "../document-review.css";

// DI-09 / DI-10 / DI-24 : revue MOE des réponses extraites des documents. Principe : rien n'est écrit dans le projet avant « Confirmer » ; chaque réponse affiche sa source (document, page, extrait),
// reste « À vérifier » même à confiance élevée, et un conflit ne choisit jamais de gagnant à votre place. Aucun code interne à l'écran.
const errorText = (error) => error?.detail?.message || error?.message || "Une erreur est survenue";
const GROUPS = [
  ["conflict", "Valeurs contradictoires détectées", "Deux sources donnent des valeurs différentes : choisissez-en une ou saisissez-en une autre."],
  ["review", "À vérifier", "Réponses trouvées dans vos documents. Confirmez, corrigez ou rejetez : rien n'est modifié avant."],
  ["low", "Faible confiance (exceptions)", "Trop incertaines pour préremplir : à consulter seulement si vous le souhaitez."],
  ["notfound", "Non trouvé ou ambigu", "Les documents ne permettent pas de répondre : Calepin ne devine pas."],
];
const MODULES = [
  { id: "FEASIBILITY", label: "Faisabilité", help: "Cadrage et données projet" },
  { id: "CCTP", label: "CCTP", help: "Réponses techniques du lot" },
  { id: "DPGF", label: "DPGF", help: "Lignes Excel à importer" },
];
const TECHNICAL_HELP = {
  "R60": "Capacité portante maintenue pendant 60 minutes en situation d’incendie.",
  "EI60": "Étanchéité au feu et isolation thermique maintenues pendant 60 minutes.",
  "REI60": "Capacité portante, étanchéité au feu et isolation thermique maintenues pendant 60 minutes.",
  "SS4": "Sous-section 4 de la réglementation amiante : interventions ponctuelles ou limitées sur des matériaux susceptibles de contenir de l’amiante, avec mesures de prévention adaptées.",
  "DTU": "Document technique unifié : règles professionnelles de mise en œuvre applicables à un type d’ouvrage.",
  "DTU25.41": "Règles de mise en œuvre des ouvrages en plaques de plâtre, notamment cloisons, plafonds et habillages.",
  "DTU25.42": "Règles de mise en œuvre des complexes de doublage et des solutions d’isolation associées.",
  "BA13": "Plaque de plâtre courante de 13 mm d’épaisseur ; son usage exact dépend du système, du local et des performances exigées.",
  "Q2": "Niveau de finition des joints de plaques de plâtre ; il correspond à une finition courante avant peinture, selon le système prévu.",
  "Q3": "Niveau de finition renforcé des joints et de la surface, destiné à limiter davantage les défauts visibles après finition.",
  "Q4": "Niveau de finition le plus exigeant pour obtenir une surface très homogène, notamment sous éclairage rasant.",
  "R": "Résistance thermique : capacité d’un matériau ou d’une paroi à s’opposer au passage de la chaleur ; plus R est élevé, plus l’isolation est importante.",
  "U": "Coefficient de transmission thermique d’une paroi ; plus U est faible, plus la paroi est isolante.",
  "LAMBDA": "Conductivité thermique d’un matériau ; plus la valeur lambda est faible, moins le matériau conduit la chaleur.",
  "RA": "Indice d’affaiblissement acoustique mesuré en laboratoire pour un élément séparatif.",
  "R W": "Indice pondéré d’affaiblissement acoustique, utilisé pour comparer la performance acoustique d’un élément testé.",
  "DNT": "Isolement acoustique entre locaux mesuré sur site ; il dépend de l’ouvrage réel et de ses transmissions latérales.",
  "DTA": "Document technique d’application évaluant les conditions d’emploi et de mise en œuvre d’un produit ou système innovant.",
  "AT": "Avis technique portant sur l’aptitude à l’emploi et les conditions de mise en œuvre d’un procédé de construction.",
  "ERP": "Établissement recevant du public ; des exigences particulières de sécurité, accessibilité et évacuation peuvent s’appliquer.",
  "PMR": "Personnes à mobilité réduite ; le terme renvoie notamment aux règles d’accessibilité des bâtiments et cheminements.",
  "VMC": "Ventilation mécanique contrôlée : système qui renouvelle l’air du bâtiment de façon organisée.",
  "CCTP": "Cahier des clauses techniques particulières : document qui décrit les prestations, matériaux et performances exigés.",
  "DPGF": "Décomposition du prix global et forfaitaire : tableau détaillant les postes, unités, quantités et prix d’un marché.",
};
const FEASIBILITY_HELP = {
  "typologie": "Cette réponse décrit l’usage principal du bâtiment (bureaux, logements, commerce, ERP…). Elle sert à appliquer les bonnes contraintes réglementaires, techniques et d’accessibilité au projet.",
  "destination": "La destination indique à quoi le bâtiment ou le local sera principalement utilisé. Elle influence notamment les règles de sécurité incendie, d’accessibilité, de ventilation et les performances attendues.",
  "hauteur": "La hauteur du bâtiment peut modifier les exigences de sécurité incendie, d’accès des secours, de désenfumage et parfois de structure. Vérifiez la hauteur indiquée dans les plans ou pièces du projet.",
  "nature de l'opération": "Cette donnée distingue notamment une construction neuve, une rénovation, une extension ou une réhabilitation. Elle détermine quelles exigences s’appliquent et dans quelle mesure l’existant est conservé.",
};

export function DocumentReview({ project, documents = [] }) {
  const activeDocuments = useMemo(() => documents.filter((item) => !item.archived), [documents]);
  const [candidates, setCandidates] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [editing, setEditing] = useState(null);   // { id, value }
  const [showDone, setShowDone] = useState(false);
  const [module, setModule] = useState("FEASIBILITY");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [helpTerm, setHelpTerm] = useState(null);
  const [helpData, setHelpData] = useState({});
  const [dpgfPreview, setDpgfPreview] = useState(null);
  const [dpgfSelected, setDpgfSelected] = useState(new Set());
  const [detailCandidate, setDetailCandidate] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [autoAnalysis, setAutoAnalysis] = useState(null);
  const [analysedSignature, setAnalysedSignature] = useState("");
  const names = useMemo(() => Object.fromEntries(documents.map((d) => [String(d.id), d.filename])), [documents]);
  const archivedNames = useMemo(() => Object.fromEntries(documents.filter((d) => d.archived).map((d) => [String(d.id), d.filename])), [documents]);
  const base = `/cctps/${project.id}/document-intelligence`;

  const load = useCallback(async () => {
    try { const result = await apiFetch(`${base}/candidates`); setCandidates(result.candidates); } catch (e) { if (e?.status === 404) setCandidates(null); else setError(errorText(e)); }
  }, [base]);
  useEffect(() => { load(); }, [load, documents.length]);
  const excelIds = useMemo(() => activeDocuments.filter((item) => /\.(?:xls[xm]?|csv)$/i.test(item.filename || "")).map((item) => String(item.id)), [activeDocuments]);
  const loadDpgfPreview = useCallback(async (selectTab = false) => {
    if (!excelIds.length) { setDpgfPreview(null); return; }
    try {
      const result = await apiFetch(`${base}/dpgf-preview`, { method: "POST", body: JSON.stringify({ document_ids: excelIds }) });
      setDpgfPreview(result);
      setDpgfSelected(new Set((result.rows || []).map((row) => `${row.documentId}:${row.row}`)));
      if (selectTab && result.count) setModule("DPGF");
    } catch (e) { setError(errorText(e)); }
  }, [base, excelIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadDpgfPreview(true); }, [loadDpgfPreview]);

  const analyseAll = useCallback(async () => {
    if (!activeDocuments.length) return;
    const signature = activeDocuments.map((item) => `${item.id}:${item.size}:${item.createdAt || ""}`).join("|");
    if (signature === analysedSignature) return;
    setAnalysedSignature(signature);
    setAutoAnalysis({ state: "reading", label: "Lecture des documents…", done: 0 });
    setError(""); setMessage("");
    try {
      setAutoAnalysis({ state: "extracting", label: "Extraction des informations utiles…", done: 1 });
      const created = await apiFetch(`${base}/jobs`, { method: "POST", body: JSON.stringify({ modules: ["FEASIBILITY", "CCTP", "DPGF"], document_ids: activeDocuments.map((item) => String(item.id)) }) });
      setJob(created);
      setAutoAnalysis({ state: "matching", label: "Rattachement aux onglets Faisabilité, CCTP et DPGF…", done: 2, summary: created.summary });
      await load();
      await loadDpgfPreview(true);
      const count = created.summary?.candidates || 0;
      setAutoAnalysis({ state: "ready", label: count ? `${count} proposition${count > 1 ? "s" : ""} prête${count > 1 ? "s" : ""} à vérifier` : "Analyse terminée : aucune donnée exploitable détectée", done: 3, summary: created.summary });
      setMessage(count ? "Le document a été analysé. Les informations trouvées sont réparties par onglet et restent à confirmer avant modification du projet." : "Le document a été lu, mais aucune information exploitable n'a été reconnue pour les questionnaires actuels.");
    } catch (e) {
      setAutoAnalysis({ state: "error", label: "Analyse impossible", done: 0 });
      setError(errorText(e));
    }
  }, [base, activeDocuments, excelIds, analysedSignature, load, loadDpgfPreview]);
  useEffect(() => { analyseAll(); }, [analyseAll]);

  const analyse = async () => {
    setBusy(true); setError(""); setMessage(""); setSelected(new Set());
    try {
      if (module === "DPGF" && excelIds.length) {
        await loadDpgfPreview();
        setMessage("Le bordereau Excel a été lu. Vérifiez les postes détectés puis confirmez leur import dans le DPGF.");
        return;
      }
      const created = await apiFetch(`${base}/jobs`, { method: "POST", body: JSON.stringify({ modules: [module] }) });
      setJob(created);
      await load();
      setMessage(created.summary?.candidates ? `${created.summary.candidates} proposition${created.summary.candidates > 1 ? "s" : ""} trouvée${created.summary.candidates > 1 ? "s" : ""} pour ${MODULES.find((item) => item.id === module)?.label} : à vérifier avant toute modification du projet.` : "Aucune information explicite et exploitable trouvée pour ce module.");
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const importDpgf = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      let imported = 0; let skipped = 0;
      for (const document of dpgfPreview?.documents || []) {
        const rows = [...dpgfSelected].filter((key) => key.startsWith(`${document.id}:`)).map((key) => Number(key.split(":").pop()));
        if (!rows.length) continue;
        const result = await apiFetch(`${base}/dpgf-import`, { method: "POST", body: JSON.stringify({ document_id: document.id, rows }) });
        imported += result.imported || 0; skipped += result.skipped || 0;
      }
      const importedKeys = new Set(dpgfSelected);
      const remainingRows = (dpgfPreview?.rows || []).filter((row) => !importedKeys.has(`${row.documentId}:${row.row}`));
      setDpgfPreview((current) => current ? { ...current, rows: remainingRows, count: remainingRows.length } : current);
      setDpgfSelected(new Set());
      setMessage(`${imported} poste${imported > 1 ? "s" : ""} nouvel${imported > 1 ? "s" : ""} importé${imported > 1 ? "s" : ""} dans le DPGF${skipped ? ` · ${skipped} déjà présent${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}` : ""}. Les quantités absentes restent à renseigner.`);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const review = async (items, done) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiFetch(`${base}/candidates/review`, { method: "POST", body: JSON.stringify({ items }) });
      const failed = result.results.filter((r) => !r.ok);
      const ok = result.results.filter((r) => r.ok);
      const kept = ok.filter((r) => r.factStatus === "CONFIRMED" && !r.committed).length;
      const destination = MODULES.find((item) => item.id === module)?.label || "le projet";
      setMessage(`${done(ok.length)}${result.committed ? ` · ${result.committed} reportée${result.committed > 1 ? "s" : ""} dans ${destination}` : ""}${kept ? ` · ${kept} confirmée${kept > 1 ? "s" : ""} sans correspondance automatique (à reporter à la main)` : ""}${failed.length ? ` · ${failed.length} non traitée${failed.length > 1 ? "s" : ""} : ${failed[0].message}` : ""}.`);
      setSelected(new Set()); setEditing(null);
      await load();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  if (candidates === null) return null;   // ingestion non activée pour ce compte
  const visible = candidates.filter((c) => c.module === module);
  const live = visible.filter((c) => ["PROPOSED", "CONFLICT"].includes(c.factStatus));
  const liveByModule = Object.fromEntries(MODULES.map((item) => [item.id, candidates.filter((candidate) => candidate.module === item.id && ["PROPOSED", "CONFLICT"].includes(candidate.factStatus)).length]));
  const selectedLotCount = Array.isArray(project.selected) ? project.selected.length : 0;
  const stale = visible.filter((c) => c.factStatus === "STALE");
  const done = visible.filter((c) => ["CONFIRMED", "REJECTED"].includes(c.factStatus));
  const groupOf = (c) => (c.status === "CONFLICT" ? "conflict" : !["FOUND_EXACT", "FOUND_DERIVED"].includes(c.status) ? "notfound" : c.band.prefill ? "review" : "low");
  const searchNeedle = reviewSearch.trim().toLowerCase();
  const filteredLive = live.filter((candidate) => (!searchNeedle || `${candidate.label} ${candidate.displayValue || ""}`.toLowerCase().includes(searchNeedle)) && (reviewFilter === "all" || (reviewFilter === "conflict" && candidate.status === "CONFLICT") || (reviewFilter === "review" && candidate.band.prefill && candidate.status !== "CONFLICT") || (reviewFilter === "low" && !candidate.band.prefill && candidate.status !== "CONFLICT")));
  const grouped = Object.fromEntries(GROUPS.map(([id]) => [id, filteredLive.filter((c) => groupOf(c) === id)]));
  const selectable = live.filter((c) => ["FOUND_EXACT", "FOUND_DERIVED"].includes(c.status));
  const toggle = (id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const conflictExplanation = (candidate) => {
    const values = (candidate.alternatives || []).map((item) => item.display ?? item.value).filter(Boolean);
    const excerpts = (candidate.alternatives || []).flatMap((item) => (item.evidence || []).map((evidence) => evidence.excerpt).filter(Boolean));
    if (values.length < 2) return "Plusieurs réponses ont été trouvées pour cette question ; vérifiez l’extrait source avant de confirmer.";
    const short = excerpts.slice(0, 2).map((item) => `«${String(item).slice(0, 130)}${String(item).length > 130 ? "…" : ""}»`);
    return `Cette question reçoit ${values.map((value) => `«${value}»`).join(" et ")} dans les documents${short.length ? ` : ${short.join(" / ")}` : ""}. Vérifiez si ces extraits parlent du même ouvrage, de la même zone et de la même exigence ; sinon, ce sont deux prescriptions distinctes.`;
  };
  const conflictVerdict = (candidate) => {
    const excerpts = (candidate.alternatives || []).flatMap((item) => (item.evidence || []).map((evidence) => String(evidence.excerpt || "").toLowerCase()));
    const shared = excerpts.length > 1 && excerpts[0].split(/\W+/).filter((word) => word.length > 4).some((word) => excerpts.slice(1).every((excerpt) => excerpt.includes(word)));
    return shared ? { label: "Incohérence probable", text: "Les extraits semblent décrire le même contexte : vérifiez la pièce contractuelle prioritaire avant de retenir une valeur." } : { label: "Compatibilité possible", text: "Les extraits semblent parler de contextes différents : ne remplacez pas une valeur sans préciser le périmètre de la question." };
  };
  const nextConflict = (candidate) => { const conflicts = live.filter((item) => item.status === "CONFLICT"); const index = conflicts.findIndex((item) => item.id === candidate.id); return conflicts[(index + 1) % conflicts.length]; };
  const technicalTerm = (value) => Object.keys(TECHNICAL_HELP).filter((term) => term !== "R").find((term) => new RegExp(`\\b${term.replace(/[. ]/g, "\\s*").replace(/[0-9]/g, "\\s*$&")}\\b`, "i").test(String(value || ""))) || (/\bR\s*\d{2,3}\b/i.test(String(value || "")) ? "R" : null);
  const feasibilityHelp = (label) => Object.entries(FEASIBILITY_HELP).find(([key]) => String(label || "").toLowerCase().includes(key));
  const FieldHelp = ({ candidate }) => { if (candidate?.module !== "FEASIBILITY") return null; const entry = feasibilityHelp(candidate.label); if (!entry) return null; return <div className="dr-field-help"><b>Pourquoi cette question est importante</b><p>{entry[1]}</p><span>La valeur proposée vient de l’extrait affiché ci-dessous. Vérifiez qu’il décrit bien le projet avant de confirmer.</span></div>; };
  const proposalMeaning = (candidate) => { if (candidate?.module !== "FEASIBILITY") return null; const label = String(candidate.label || "").toLowerCase(); const value = candidate.displayValue || "la valeur proposée"; if (label.includes("typologie") || label.includes("destination")) return `Dans ce projet, « ${value} » signifie que le bâtiment ou la zone concernée est décrite comme destinée principalement à cet usage dans le document source.`; if (label.includes("hauteur")) return `Dans ce projet, la hauteur retenue est « ${value} » : elle sert de donnée de cadrage pour vérifier les exigences applicables.`; if (label.includes("nature de l'opération")) return `Dans ce projet, « ${value} » décrit le type d’intervention à prendre en compte pour la suite des études.`; return `Dans ce projet, le document source propose « ${value} » comme réponse à cette question de cadrage.`; };
  const TechnicalHelp = ({ value, evidence = [] }) => { const term = technicalTerm(value); if (!term) return null; const projectExcerpt = evidence.find((item) => item?.excerpt)?.excerpt; const data = helpData[term]; const open = helpTerm === term; const fetchHelp = async () => { if (open) { setHelpTerm(null); return; } setHelpTerm(term); if (helpData[term]) return; try { const result = await apiFetch(`${base}/technical-explanation`, { method: "POST", body: JSON.stringify({ term, excerpts: evidence.map((item) => item?.excerpt).filter(Boolean) }) }); setHelpData((current) => ({ ...current, [term]: result })); } catch (error) { setHelpData((current) => ({ ...current, [term]: { definition: TECHNICAL_HELP[term], message: "Définition locale affichée ; la source backend est momentanément indisponible.", project_context: projectExcerpt ? [projectExcerpt] : [] } })); } }; return <div className="dr-technical-help"><button type="button" onClick={fetchHelp}>Comprendre {term}</button>{open && <p><b>{term}</b> — {data?.definition || "Recherche de l’explication…"} {(data?.project_context?.[0] || projectExcerpt) ? <span><b>Dans vos documents :</b> « {data?.project_context?.[0] || projectExcerpt} »</span> : <span>Aucune occurrence exploitable n’a été retrouvée dans les documents liés à ce ticket.</span>}<span>{data?.message || "La valeur finale doit être validée selon l’ouvrage et la pièce contractuelle."}</span></p>}</div>; };

  const Source = ({ evidence, compact = false }) => <ul className={`dr-sources ${compact ? "dr-sources-compact" : ""}`} data-dr-sources>{evidence.map((e, index) => { const archived = Boolean(archivedNames[e.document_id]); const filename = names[e.document_id] || ""; const excel = /\.xls[xm]?$/i.test(filename); const rawUrl = attachmentFileUrl(project.id, e.document_id); const sourceUrl = excel ? `${rawUrl.replace(/\/file$/, "/preview")}?q=${encodeURIComponent(e.excerpt || "")}${e.page ? `&row=${e.page}` : ""}` : `${rawUrl}${e.page ? `#page=${e.page}` : ""}`; return <li key={index}>
    <q>{e.excerpt}</q> <small>{names[e.document_id] || "Document"}{archived ? " · source archivée" : ""}{e.page ? ` · page ${e.page}` : ""}</small>{" "}
    <a className={archived ? "dr-source-archived" : ""} href={sourceUrl} data-dr-open-source onClick={(event) => { event.preventDefault(); setSourcePreview({ url: sourceUrl, downloadUrl: rawUrl, filename, excerpt: e.excerpt, archived, excel, page: e.page, question: detailCandidate?.label, value: detailCandidate?.displayValue, confidence: detailCandidate?.band?.label, conflict: detailCandidate?.status === "CONFLICT" }); }}>{excel ? (archived ? "Voir la ligne archivée" : "Voir la ligne source") : (archived ? "Voir la source archivée" : "Voir la source")}</a></li>; })}</ul>;

  const Editor = ({ c }) => <div className="dr-editor" data-dr-editor>
    {c.choices.length ? <select aria-label="Valeur retenue" value={editing.value ?? ""} onChange={(e) => setEditing({ ...editing, value: e.target.value })}><option value="">— choisir —</option>{c.choices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      : c.inputKind === "BOOLEAN" ? <select aria-label="Valeur retenue" value={String(editing.value ?? "")} onChange={(e) => setEditing({ ...editing, value: e.target.value === "" ? "" : e.target.value === "true" })}><option value="">— choisir —</option><option value="true">Oui</option><option value="false">Non</option></select>
        : <input aria-label="Valeur retenue" inputMode={["NUMBER", "MONEY"].includes(c.inputKind) ? "decimal" : "text"} value={editing.value ?? ""} onChange={(e) => setEditing({ ...editing, value: e.target.value })} />}
    <button type="button" className="primary" data-dr-save-correction disabled={busy || editing.value === "" || editing.value === undefined}
      onClick={() => review([{ id: c.id, action: "correct", value: ["NUMBER", "MONEY"].includes(c.inputKind) ? Number(String(editing.value).replace(",", ".")) : editing.value }], (n) => `${n} réponse retenue`)}>Retenir cette valeur</button>
    <button type="button" className="link-button" onClick={() => setEditing(null)}>Annuler</button></div>;

  const Card = ({ c }) => <li className={`dr-card status-${c.status}`} data-dr-candidate={c.specId} data-dr-status={c.status}>
    <div className="dr-head">
      {selectable.includes(c) && <input type="checkbox" aria-label={`Sélectionner ${c.label}`} data-dr-select checked={selected.has(c.id)} onChange={() => toggle(c.id)} />}
      <b data-dr-label>{c.label}</b><span className={`dr-band ${c.band.prefill ? "" : "low"}`} data-dr-band>{c.band.label}</span><span className="dr-todo">À vérifier</span></div>
    {c.status === "CONFLICT"
      ? <div data-dr-conflict><p className="dr-section-kicker">DÉCISION À PRENDRE</p><div className="dr-verdict"><b>{conflictVerdict(c).label}</b><span>{conflictVerdict(c).text}</span></div><p className="dr-conflict-explanation">{conflictExplanation(c)}</p><TechnicalHelp value={`${c.label} ${c.alternatives.map((a) => a.display ?? a.value).join(" ")}`} evidence={c.evidence || []} /><ul className="dr-alternative-list">{c.alternatives.map((a, index) => <li key={index} data-dr-alternative><b>{a.display ?? String(a.value)}</b><TechnicalHelp value={a.display ?? a.value} evidence={a.evidence || []} /><Source evidence={a.evidence || []} compact />
        <button type="button" className="secondary" data-dr-choose disabled={busy} onClick={() => review([{ id: c.id, action: "correct", value: a.value }], (n) => `${n} valeur choisie`)}>Choisir cette valeur</button></li>)}</ul></div>
      : ["FOUND_EXACT", "FOUND_DERIVED"].includes(c.status) ? <><p className="dr-value" data-dr-value>{c.displayValue}</p>
        {c.currentDisplay && c.currentDisplay !== c.displayValue && <p className="dr-current" data-dr-current>Valeur actuelle dans le projet : <b>{c.currentDisplay}</b></p>}
        <Source evidence={c.evidence} /></>
        : <p className="muted" data-dr-notfound>{c.status === "AMBIGUOUS" ? "Plusieurs interprétations possibles dans les documents : " + c.alternatives.map((a) => a.display ?? a.value).join(" · ") : "Les documents ne donnent pas cette information."}</p>}
    {editing?.id === c.id ? <Editor c={c} /> : <div className="dr-actions">
      <button type="button" className="link-button dr-understand" data-dr-understand disabled={busy} onClick={() => setDetailCandidate(c)}>Comprendre</button>
      {["FOUND_EXACT", "FOUND_DERIVED"].includes(c.status) && <button type="button" className="primary" data-dr-confirm disabled={busy} onClick={() => review([{ id: c.id, action: "confirm" }], (n) => `${n} réponse confirmée`)}>Confirmer</button>}
      <button type="button" className="secondary" data-dr-correct disabled={busy} onClick={() => setEditing({ id: c.id, value: "" })}>{c.status === "CONFLICT" ? "Saisir une autre valeur" : c.status === "NOT_FOUND" || c.status === "AMBIGUOUS" ? "Saisir la valeur" : "Corriger"}</button>
      <button type="button" className="link-button" data-dr-reject disabled={busy} onClick={() => review([{ id: c.id, action: "reject" }], (n) => `${n} réponse rejetée`)}>Rejeter</button></div>}
  </li>;

  return <section className="dr" data-document-review aria-label="Exploiter les documents dans le projet">
    <header>
      <span className="eyebrow">EXPLOITER LES PIÈCES DU PROJET</span>
      <h2>Préremplir les onglets depuis les documents</h2>
      <p>Choisissez une destination : Calepin recherche uniquement les informations écrites dans vos pièces et affiche la source exacte. <b>Rien n’est modifié tant que vous n’avez pas confirmé.</b></p>
      <div className="dr-modules" role="tablist" aria-label="Destination des informations">
        {MODULES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={module === item.id} className={module === item.id ? "active" : ""} data-dr-module={item.id} onClick={() => { setModule(item.id); setSelected(new Set()); setMessage(""); }}>
          <b>{item.label}</b><small>{item.help}</small><span>{liveByModule[item.id] || ""}</span>
        </button>)}
      </div>
      {module === "CCTP" && selectedLotCount === 0 && <div className="dr-module-guide"><div><b>Pour préremplir le CCTP, sélectionnez d’abord un lot</b><p>Le document peut contenir des ouvrages à exploiter, mais Calepin ne peut pas les rattacher au questionnaire tant qu’aucun lot CCTP n’est sélectionné. Ajoutez par exemple le lot « Plâtrerie – Isolation », puis relancez l’analyse.</p></div></div>}
      {module === "FEASIBILITY" && <div className="dr-module-guide"><div><b>Comment fonctionne le préremplissage Faisabilité ?</b><p>Calepin lit les documents, propose les réponses trouvées et conserve leur source. Rien n’est reporté dans le questionnaire tant que vous n’avez pas confirmé.</p></div><ol><li><b>1</b> Vérifier la proposition</li><li><b>2</b> Consulter la source</li><li><b>3</b> Confirmer ou corriger</li></ol></div>}
      <div className="dr-review-filters" role="toolbar" aria-label="Filtrer les propositions"><span>Afficher :</span>{[["all", "Toutes"], ["conflict", "Conflits"], ["review", "À vérifier"], ["low", "Faible confiance"]].map(([id, label]) => <button key={id} type="button" className={reviewFilter === id ? "active" : ""} onClick={() => setReviewFilter(id)}>{label}{id === "conflict" && live.filter((c) => c.status === "CONFLICT").length ? ` (${live.filter((c) => c.status === "CONFLICT").length})` : ""}</button>)}</div>
      <label className="dr-review-search"><span>Rechercher une proposition</span><input value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} placeholder="Question ou valeur…" /></label>
      <div className="dr-confidence-legend" aria-label="Légende des niveaux de confiance"><span><i className="high" /> Élevée : correspondance directe</span><span><i className="medium" /> Moyenne : interprétation à vérifier</span><span><i className="low" /> Faible : contexte incomplet</span></div>
      {activeDocuments.length === 0 && <small className="muted">Importez d’abord un document pour lancer l’analyse.</small>}
      {autoAnalysis?.state === "ready" && <button type="button" className="link-button dr-reanalyse" data-dr-analyse disabled={busy} onClick={() => { setAnalysedSignature(""); setAutoAnalysis(null); }}>{busy ? "Analyse…" : "Relancer l’analyse"}</button>}
      {autoAnalysis && <div className={`dr-auto-analysis is-${autoAnalysis.state}`} role="status" aria-live="polite" data-dr-auto-analysis>
        <div className="dr-auto-spinner" aria-hidden="true">{autoAnalysis.state === "ready" ? "✓" : autoAnalysis.state === "error" ? "!" : ""}</div>
        <div><b>{autoAnalysis.label}</b>{autoAnalysis.state !== "ready" && autoAnalysis.state !== "error" && <small>Calepin traite le document sans modifier vos données.</small>}{autoAnalysis.state === "ready" && <small>{Object.entries(liveByModule).filter(([, value]) => value).map(([key, value]) => `${value} en ${MODULES.find((item) => item.id === key)?.label}`).join(" · ") || "Aucune réponse suffisamment explicite à proposer"}</small>}</div>
        <div className="dr-auto-progress"><span style={{ width: `${Math.round((autoAnalysis.done / 3) * 100)}%` }} /></div>
        {autoAnalysis.state === "ready" && autoAnalysis.summary?.regulatory?.count > 0 && <div className="dr-regulatory-results" data-dr-regulatory-results><b>Références réglementaires à vérifier ({autoAnalysis.summary.regulatory.count})</b>{autoAnalysis.summary.regulatory.references.slice(0, 5).map((reference) => <span key={reference.sourceKey}><strong>{reference.title}</strong><small>{reference.summary} · <a href={reference.sourceUrl} target="_blank" rel="noreferrer">Source officielle</a>{reference.articleRef ? ` · ${reference.articleRef}` : ""}</small></span>)}</div>}
        {autoAnalysis.state === "ready" && autoAnalysis.summary?.metrics && <small className="dr-analysis-metrics" data-dr-analysis-metrics>Contrôles effectués : {autoAnalysis.summary.metrics.documents} document{autoAnalysis.summary.metrics.documents > 1 ? "s" : ""} · {autoAnalysis.summary.metrics.pages} page{autoAnalysis.summary.metrics.pages > 1 ? "s" : ""} · {autoAnalysis.summary.metrics.characters.toLocaleString("fr-FR")} caractères · {autoAnalysis.summary.metrics.regulatoryRulesChecked} règles réglementaires consultées · {autoAnalysis.summary.metrics.durationMs} ms</small>}
        {autoAnalysis.state === "ready" && candidates && <div className="dr-auto-results" data-dr-auto-results>{MODULES.map((item) => { const rows = candidates.filter((candidate) => candidate.module === item.id && ["PROPOSED", "CONFLICT"].includes(candidate.factStatus)); const sources = [...new Set(rows.flatMap((candidate) => (candidate.evidence || []).map((evidence) => names[evidence.document_id]).filter(Boolean)))]; return <span key={item.id} className={rows.length ? "has-results" : ""}><b>{item.label}</b> {rows.length ? `${rows.length} à vérifier` : "aucune proposition"}{sources.length ? <small className="dr-result-source">Source : {sources.join(", ")}</small> : null}</span>; })}</div>}
      </div>}
    </header>
    {error && <div className="err" role="alert" data-dr-error>{error}</div>}
    {message && <div className="price-message" role="status" data-dr-message>{message}</div>}
    {module === "DPGF" && dpgfPreview?.count > 0 && <section className="dr-excel" data-dr-excel-preview>
      <div className="dr-excel-head"><div><h3>Bordereau Excel détecté</h3><p>{dpgfPreview.count} poste{dpgfPreview.count > 1 ? "s" : ""} identifié{dpgfPreview.count > 1 ? "s" : ""}. Les quantités et prix vides ne sont pas inventés.</p></div>
        <button type="button" className="primary" disabled={busy || dpgfSelected.size === 0} onClick={importDpgf}>Importer la sélection dans le DPGF ({dpgfSelected.size})</button></div>
      <div className="dr-excel-list">{dpgfPreview.rows.map((row) => { const key = `${row.documentId}:${row.row}`; return <label key={key}>
        <input type="checkbox" checked={dpgfSelected.has(key)} onChange={() => setDpgfSelected((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; })}/>
        <span><b>{row.externalCode}</b> {row.designation}<small><b>Source : {dpgfPreview.documents.find((document) => document.id === row.documentId)?.filename || "document Excel"}</b> · {row.sheet} · ligne {row.row}{row.sourceCell ? ` · cellule ${row.sourceCell}` : ""} · {row.unit}{row.quantity != null ? ` · quantité ${row.quantity}` : " · quantité à renseigner"}{row.unitPrice != null ? ` · ${row.unitPrice} € HT` : " · prix à renseigner"}</small></span>
      </label>; })}</div>
    </section>}
    {job?.summary?.unsupported_modules?.length > 0 && <small className="muted" data-dr-unsupported>Cette destination n’est pas encore exploitable automatiquement.</small>}
    {stale.length > 0 && <div className="dr-stale" role="status" data-dr-stale>Un document a changé depuis l’analyse : {stale.length} réponse{stale.length > 1 ? "s sont" : " est"} périmée{stale.length > 1 ? "s" : ""}. Relancez l’analyse.</div>}
    {selectable.length > 0 && <div className="dr-batch" data-dr-batch>
      <button type="button" className="link-button" data-dr-select-confident onClick={() => setSelected(new Set(selectable.filter((c) => c.band.prefill).map((c) => c.id)))}>Sélectionner les réponses fiables</button>
      <button type="button" className="primary" data-dr-confirm-selected disabled={busy || selected.size === 0} onClick={() => review([...selected].map((id) => ({ id, action: "confirm" })), (n) => `${n} réponse${n > 1 ? "s" : ""} confirmée${n > 1 ? "s" : ""}`)}>Confirmer la sélection ({selected.size})</button>
      <button type="button" className="secondary" data-dr-reject-selected disabled={busy || selected.size === 0} onClick={() => review([...selected].map((id) => ({ id, action: "reject" })), (n) => `${n} réponse${n > 1 ? "s" : ""} rejetée${n > 1 ? "s" : ""}`)}>Rejeter la sélection</button></div>}
    {GROUPS.map(([id, title, help]) => grouped[id].length > 0 && <section key={id} className="dr-group" data-dr-group={id}><h3>{title} <span className="dr-count">{grouped[id].length}</span></h3><p className="muted">{help}</p>
      <ul className="dr-list">{grouped[id].map((c) => <Card key={c.id} c={c} />)}</ul></section>)}
    {live.length === 0 && visible.length > 0 && <p className="muted" data-dr-nothing>Aucune proposition en attente de revue pour ce module.</p>}
    {done.length > 0 && <details open={showDone} onToggle={(e) => setShowDone(e.currentTarget.open)} data-dr-done><summary>Déjà traitées ({done.length})</summary>
      <ul className="dr-list">{done.map((c) => <li key={c.id} className="dr-card done" data-dr-done-item={c.factStatus}><b>{c.label}</b> — {c.displayValue ?? "—"} <span className="dr-badge">{c.factStatus === "REJECTED" ? "Rejetée" : c.commitStatus === "COMMITTED" ? `Confirmée et reportée dans ${MODULES.find((item) => item.id === c.module)?.label || "le projet"}` : "Confirmée (à reporter à la main)"}</span></li>)}</ul></details>}
    {detailCandidate && <div className="dr-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailCandidate(null); }}><section className="dr-detail" role="dialog" aria-modal="true" aria-labelledby="dr-detail-title" data-dr-detail>
      <button type="button" className="dr-detail-close" aria-label="Fermer" onClick={() => setDetailCandidate(null)}>×</button>
      <span className="eyebrow">DÉCISION À PRENDRE</span><h3 id="dr-detail-title">{detailCandidate.label}</h3>
      <div className="dr-detail-value"><small>Valeur proposée</small><strong>{detailCandidate.displayValue || "Aucune valeur fiable"}</strong>{proposalMeaning(detailCandidate) && <p className="dr-proposal-meaning"><b>Ce que cela signifie ici</b>{proposalMeaning(detailCandidate)}</p>}</div>
      <div className="dr-detail-grid"><div><small>Destination</small><b>{MODULES.find((item) => item.id === detailCandidate.module)?.label || detailCandidate.module}</b></div><div><small>Confiance</small><b>{detailCandidate.band?.label || "À vérifier"}</b></div></div>
      {detailCandidate.status === "CONFLICT" ? <><div className="dr-detail-warning"><b>{conflictVerdict(detailCandidate).label}</b><p>{conflictVerdict(detailCandidate).text}</p><p>{conflictExplanation(detailCandidate)}</p><FieldHelp candidate={detailCandidate} /><TechnicalHelp value={`${detailCandidate.label} ${(detailCandidate.alternatives || []).map((a) => a.display ?? a.value).join(" ")}`} evidence={detailCandidate.evidence || []} /></div><div className="dr-detail-alternatives"><b>Comparaison des valeurs trouvées</b><div className="dr-comparison-table"><div className="dr-comparison-head"><span>Valeur</span><span>Contexte source</span><span>Action</span></div>{(detailCandidate.alternatives || []).map((alternative, index) => <article key={index}><strong>{alternative.display ?? alternative.value ?? "Valeur non lisible"}</strong><span>{alternative.evidence?.[0]?.excerpt || "Contexte non disponible"}</span><TechnicalHelp value={alternative.display ?? alternative.value} evidence={alternative.evidence || []} /><Source evidence={alternative.evidence || []} compact /></article>)}</div><p className="muted">Choisissez une valeur uniquement si les extraits concernent le même ouvrage et la même exigence.</p></div></> : <div className="dr-detail-help"><b>Avant de confirmer</b><FieldHelp candidate={detailCandidate} /><p>La valeur sera reportée dans l’onglet concerné et restera liée à son document source. Elle pourra être corrigée ensuite, mais ne sera jamais appliquée automatiquement sans votre confirmation.</p><TechnicalHelp value={`${detailCandidate.label} ${detailCandidate.displayValue || ""}`} evidence={detailCandidate.evidence || []} /></div>}
      <Source evidence={detailCandidate.evidence || []} />
      <div className="dr-detail-actions"><button type="button" className="primary" disabled={busy || !["FOUND_EXACT", "FOUND_DERIVED"].includes(detailCandidate.status)} onClick={() => { review([{ id: detailCandidate.id, action: "confirm" }], (n) => `${n} réponse confirmée`); setDetailCandidate(null); }}>Confirmer cette valeur</button><button type="button" className="secondary" disabled={busy} onClick={() => { setEditing({ id: detailCandidate.id, value: "" }); setDetailCandidate(null); }}>Corriger</button>{detailCandidate.status === "CONFLICT" && <button type="button" className="link-button" onClick={() => setDetailCandidate(nextConflict(detailCandidate))}>Conflit suivant →</button>}<button type="button" className="link-button" onClick={() => setDetailCandidate(null)}>Fermer</button></div>
    </section></div>}
    {sourcePreview && <div className="dr-source-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourcePreview(null); }}><section className="dr-source-modal" role="dialog" aria-modal="true" aria-labelledby="dr-source-title" data-dr-source-modal>
      <header className="dr-source-modal-head"><button type="button" className="dr-source-back" onClick={() => setSourcePreview(null)} aria-label="Revenir à la décision">← <span>Retour à la décision</span></button><div className="dr-source-title-wrap"><span className="eyebrow">SOURCE DE LA PROPOSITION</span><h3 id="dr-source-title">{sourcePreview.filename || "Document source"}</h3><p>{sourcePreview.excel ? "La ligne correspondante est mise en évidence dans l’aperçu." : "Consultez le document au point cité avant de confirmer."}</p></div><button type="button" className="dr-detail-close" aria-label="Fermer l’aperçu" onClick={() => setSourcePreview(null)}>×</button></header>
      {sourcePreview.question && <div className="dr-source-decision"><div><small>Décision à prendre</small><b>{sourcePreview.question}</b></div><div><small>Valeur proposée</small><b>{sourcePreview.value || "Aucune valeur fiable"}</b></div><div><small>Pourquoi consulter cette source ?</small><p>{sourcePreview.conflict ? "Plusieurs valeurs ont été trouvées. Comparez le contexte exact de chaque extrait avant de confirmer." : "Vérifiez que l’extrait correspond bien au périmètre de la question avant de confirmer."}</p></div></div>}
      <div className="dr-source-context"><b>Extrait utilisé</b><q>{sourcePreview.excerpt || "Aucun extrait disponible"}</q>{sourcePreview.archived && <span className="dr-source-archived">Source archivée — elle est conservée uniquement pour expliquer la proposition.</span>}</div>
      <iframe className="dr-source-frame" src={sourcePreview.url} title={`Source ${sourcePreview.filename || "document"}`} />
      <footer className="dr-source-modal-foot"><span>Comparez l’extrait avec le contexte affiché, puis revenez à la décision.</span>{sourcePreview.downloadUrl && <a className="secondary dr-download-source" href={sourcePreview.downloadUrl} download={sourcePreview.filename}>Télécharger le document Excel</a>}</footer>
    </section></div>}
  </section>;
}
