import { useEffect, useState } from "react";
import { createPriceReference, getEconomicsLibrary, getPlanningProjection } from "../api/client";
import { CircleAlert, ExternalLink, Info, Plus, Trash2, X } from "lucide-react";
import { InlinePersonalizationDrawer, InlinePersonalizationTrigger } from "./InlinePersonalization";
import "../devis-platrerie.css";

export const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const UNITS = ["u", "m²", "m² développé", "ml", "m³", "forfait", "h", "ens."];
const STATUS = {
  COMPLET: ["Chiffré", "ok"],
  A_COMPLETER: ["À compléter · quantité manquante", "todo"],
  PRET: ["Prêt pour chiffrage", "ready"],
  TECHNIQUE_MODIFIE: ["À vérifier", "warn"],
  MANUEL: ["Manuel", "manual"],
  OPTION: ["Option", "option"],
};
const TYPE_LABEL = { MAIN: "Ouvrage", ACCESSORY: "Accessoire", PLUS_VALUE: "Plus-value", DEPOSE: "Dépose", REPRISE: "Reprise", OPTION: "Option" };
const asInput = (value) => (value === null || value === undefined ? "" : String(value));

/** Colonnes communes à toutes les lignes du lot (générées et libres) : tout s'aligne sur la même grille. */
function Columns() {
  return <colgroup><col className="c-num" /><col className="c-name" /><col className="c-desc" /><col className="c-unit" /><col className="c-qty" /><col className="c-price" /><col className="c-total" /><col className="c-status" /><col className="c-act" /></colgroup>;
}

const POLICY = [
  ["membranePricing", "Membrane / pare-vapeur", "Comprise dans l'élément principal ou chiffrée à part"],
  ["penetrationPricing", "Réservations, traversées, calfeutrements", "Compris ou chiffrés à part"],
  ["siteConstraintPricing", "Site occupé / phasage", "Compris ou forfait à part"],
  ["controlPricing", "Contrôles, prototypes, études", "Compris ou option à part"],
  ["airtightnessTestPricing", "Essais d'étanchéité à l'air", "Compris ou chiffrés à part"],
];
const MODE = { INCLUDED: "Inclus dans le prix principal", SEPARATE: "Ligne séparée" };

/** Règles de chiffrage de CE projet : la règle de l'agence s'applique par défaut ; le projet peut y déroger sans jamais modifier la règle agence. */
const TREATMENT_LABEL = { CREATE_MAIN_LINE: "Ligne principale", CREATE_PLUS_VALUE: "Plus-value", CREATE_ACCESSORY_LINE: "Accessoire", CREATE_OPTION_LINE: "Option", CREATE_ADMIN_LINE: "Ligne administrative" };

export function ProjectPricingRules({ devis, editable, lotId = "06", onClose }) {
  const [newLabel, setNewLabel] = useState("");
  const { data, setPolicy } = devis;
  const items = data.customItems || [];
  const manual = data.manualLines || [];
  const withLine = (item) => manual.find((row) => row.policyId === item.id);
  const addCustom = () => {
    const label = newLabel.trim();
    if (!label) return;
    const item = { id: crypto.randomUUID(), label, mode: "SEPARATE" };
    devis.saveCustomItems([...items, item], [...manual, { id: crypto.randomUUID(), lotId, designation: label, shortDescription: "", unit: "forfait", quantity: { value: null }, unitPrice: null, policyId: item.id }]);
    setNewLabel("");
  };
  const setMode = (item, mode) => {
    const existing = withLine(item);
    const next = items.map((x) => (x.id === item.id ? { ...x, mode } : x));
    if (mode === "SEPARATE" && !existing) devis.saveCustomItems(next, [...manual, { id: crypto.randomUUID(), lotId, designation: item.label, shortDescription: "", unit: "forfait", quantity: { value: null }, unitPrice: null, policyId: item.id }]);
    else if (mode === "INCLUDED" && existing) devis.saveCustomItems(next, manual.filter((row) => row.id !== existing.id));
    else devis.saveCustomItems(next);
  };
  const removeCustom = (item) => { const existing = withLine(item); devis.saveCustomItems(items.filter((x) => x.id !== item.id), existing ? manual.filter((row) => row.id !== existing.id) : undefined); };
  const agency = data.agencyPolicy || {}, overrides = data.policyOverrides || {};
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="estimate-documents project-rules" role="dialog" aria-modal="true" aria-label="Règles de chiffrage du projet" data-devis-policy>
      <header><h2>Règles de chiffrage du projet</h2><button type="button" aria-label="Fermer" data-devis-policy-close onClick={onClose}><X size={18} /></button></header>
      <p className="consult-hint">La règle de votre agence, telle qu’elle était à la création de ce projet, s’applique par défaut. Vous pouvez y déroger pour ce projet seulement : la règle de l’agence n’est jamais modifiée, et les règles qu’elle modifie ensuite ne changent pas ce projet sans votre accord.</p>
      {((data.policyOutdated || []).length > 0 || data.agencyRules?.outdated) && <div className="rules-outdated" data-devis-rules-outdated><span>{(data.policyOutdated || []).length > 0 ? `${data.policyOutdated.length} règle${data.policyOutdated.length > 1 ? "s" : ""} de chiffrage de l’agence ${data.policyOutdated.length > 1 ? "ont" : "a"} changé depuis la création de ce projet.` : ""}{(data.policyOutdated || []).length > 0 && data.agencyRules?.outdated ? " " : ""}{data.agencyRules?.outdated ? <span data-devis-policy-generation-outdated>Des règles de génération de l’agence sont disponibles ; ce projet garde les siennes tant que vous ne les appliquez pas.</span> : null}</span>{editable && <button type="button" className="secondary" data-devis-rules-sync onClick={() => devis.syncAgencyRules()}>Appliquer les règles actuelles de l’agence</button>}</div>}
      {POLICY.map(([key, label, hint]) => <label key={key} data-devis-rule={key}><span><b>{label}</b><small>{hint}</small>{overrides[key] ? <small className="rule-override" data-devis-rule-override>Choix propre à ce projet · règle agence : {MODE[agency[key]]}</small> : <small>Règle agence : {MODE[agency[key]]}</small>}</span>
        <select value={overrides[key] ? `PROJECT_${overrides[key]}` : "AGENCY"} disabled={!editable} data-devis-policy-select={key} onChange={(event) => setPolicy(key, event.target.value === "AGENCY" ? agency[key] : event.target.value.replace("PROJECT_", ""))}>
          <option value="AGENCY">Règle agence — {MODE[agency[key]]}</option>
          <option value={`PROJECT_${agency[key] === "INCLUDED" ? "SEPARATE" : "INCLUDED"}`}>{agency[key] === "INCLUDED" ? "Ligne séparée pour ce projet" : "Inclus dans le prix principal pour ce projet"}</option>
        </select></label>)}
      {items.length > 0 && <h5 className="devis-policy-title">Éléments ajoutés pour ce projet</h5>}
      {items.map((item) => <label key={item.id} data-devis-custom-item={item.id}><span><b>{item.label}</b><small>Ajouté pour ce projet</small></span>
        <span className="custom-actions"><select value={item.mode} disabled={!editable} data-devis-custom-mode onChange={(event) => setMode(item, event.target.value)}><option value="INCLUDED">Compris dans les prix</option><option value="SEPARATE">Ligne séparée</option></select>
          <button type="button" className="custom-remove" data-devis-custom-remove title="Retirer cet élément" onClick={() => removeCustom(item)}>Retirer</button></span></label>)}
      {editable && <div className="custom-add" data-devis-custom-add><input value={newLabel} data-devis-custom-label placeholder="Ex. Échafaudage, évacuation des gravats…" onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCustom()} /><button type="button" data-devis-custom-save disabled={!newLabel.trim()} onClick={addCustom}><Plus size={13} /> Ajouter un élément</button></div>}
    </section>
  </div>;
}

/** Enregistrer un prix saisi comme référence de l'agence : jamais automatique ; le prix du projet reste indépendant de la référence. */
function SaveReferenceModal({ line, devis, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [done, setDone] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const save = async () => {
    setBusy(true); setError("");
    try { await createPriceReference({ designation: line.designation, unit: line.unit, unitPrice: Number(line.unitPrice), sourceType: "MANUAL", sourceProjectId: devis.data.cctpId, templateCode: line.templateCode, lotId: "06", sourceDate: new Date().toISOString() }); setDone(true); devis.refreshSuggestions?.(); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="estimate-documents price-modal" role="dialog" aria-modal="true" aria-label="Enregistrer comme référence agence" data-devis-reference-modal>
      <header><h2>Enregistrer comme référence agence</h2><button type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header>
      <dl className="reference-facts"><dt>Prix</dt><dd data-reference-price>{money.format(line.unitPrice)} / {line.unit}</dd><dt>Ouvrage</dt><dd>{line.designation}</dd><dt>Projet source</dt><dd>{devis.data.cctpName}</dd><dt>Date</dt><dd>{new Date(today).toLocaleDateString("fr-FR")}</dd></dl>
      <p className="consult-hint">La référence est indépendante du projet : modifier ensuite le prix ici ne change pas la référence enregistrée.</p>
      {error && <div className="err" role="alert">{error}</div>}
      {done ? <p className="price-message" data-reference-saved>Référence enregistrée dans la Bibliothèque agence › DPGF.</p> : null}
      <p className="price-modal-actions"><button type="button" className="secondary" onClick={onClose}>{done ? "Fermer" : "Annuler"}</button>{!done && <button type="button" className="primary" data-reference-save disabled={busy} onClick={save}>Enregistrer</button>}</p>
    </section>
  </div>;
}

/** Fiche d'une ligne : d'où elle vient (ouvrage, questions, gabarit DPGF) et d'où viennent ses unité, quantité et prix : rien n'apparaît sans origine. */
function LineOrigin({ line }) {
  const unitSource = line.unitSource === "MANUAL" ? "choisie par vous" : line.unitSource === "AGENCY_STANDARD" ? "standard de l'agence" : "règle DPGF du gabarit";
  const qty = line.quantity?.value;
  const priceSource = line.unitPriceInfo?.source || "NONE";
  return <div className="line-origin">
    <section data-line-origin>
      <h5>Origine de l'élément</h5>
      <dl>
        <dt>Ouvrage</dt><dd>{line.workLabel || line.workId}</dd>
        <dt>Créée depuis</dt><dd>{(line.sources || []).length ? (line.sources || []).map((item) => <span key={item.id} className="src"><b>{item.id}</b> — {item.label}{item.answer ? <> · Réponse : <mark>{item.answer}</mark></> : null}</span>) : line.reason}</dd>
        <dt>Type</dt><dd>{TYPE_LABEL[line.lineType]}</dd>
        <dt>Référence DPGF</dt><dd>{line.templateCode}</dd>
        {line.economicTreatment && <><dt>Traitement économique</dt><dd data-line-treatment>{TREATMENT_LABEL[line.economicTreatment] || line.economicTreatment}{line.parentStableKey && <small className="muted"> · rattachée à la ligne principale de l’ouvrage</small>}</dd></>}
        {line.trace?.generationRuleId && <><dt>Règle de génération</dt><dd data-line-trace>{line.trace.generationRuleId} <small className="muted">· jeu de règles {line.trace.rulesetVersion}</small></dd></>}
      </dl>
    </section>
    <section data-line-pricing>
      <h5>Données de chiffrage</h5>
      <dl>
        <dt>Unité</dt><dd data-origin-unit><b>{line.unit}</b> <small>Source : {unitSource}</small></dd>
        <dt>Quantité</dt><dd data-origin-qty><b>{qty === null || qty === undefined ? "—" : qty}</b> <small>Source : {qty === null || qty === undefined ? "non renseignée" : line.quantity?.source === "MANUAL" ? "saisie dans le DPGF" : line.quantity?.source}</small></dd>
        <dt>PU HT</dt><dd data-origin-price><b>{line.unitPrice === null || line.unitPrice === undefined ? "—" : money.format(line.unitPrice)}</b> <small>Source : {priceSource === "NONE" ? "non renseigné" : priceSource === "MANUAL" ? "saisi par vous" : "standard de l'agence (prix que votre agence a enregistré)"}</small></dd>
      </dl>
    </section>
  </div>;
}

const SOURCE = { MANUAL: "Manuel", IMPORTED_QUOTE: "Devis importé", MOE_ESTIMATE: "Estimation MOE", COMPANY_OFFER: "Offre entreprise", AWARDED_OFFER: "Offre retenue" };
const dateFr = (value) => (value ? new Date(value).toLocaleDateString("fr-FR") : "");
/** Provenance d'un prix proposé : source, projet, date (et auteur pour une saisie manuelle). Jamais un prix « agence » sans explication. */
export function provenanceParts(item) {
  const manual = item.sourceType === "MANUAL";
  const source = manual ? `Saisi manuellement${item.author ? ` par ${item.author}` : ""}` : [SOURCE[item.sourceType] || "Devis importé", item.file].filter(Boolean).join(" — ");
  return [["Source", source], ["Projet", item.project], ["Date", dateFr(item.date)]].filter(([, value]) => value);
}
const provenanceText = (item) => provenanceParts(item).map(([label, value]) => `${label} : ${value}`).join(" · ");

/** Prix proposé par l'historique (DPGF V0.3) : jamais appliqué seul. « PU proposé : 48 €/m² · Basé sur 5 références » + Utiliser / Voir les références ; après modification :
 *  « modifié depuis 48 € ». Sans historique suffisant : « À renseigner · Pas assez de références comparables ». Aucun jargon interne (signature, type canonique…). */
function PriceProposal({ line, editable, devis }) {
  const [open, setOpen] = useState(false);
  const proposal = line.priceProposal;
  const decision = line.priceDecision || {};
  if (!proposal) return null;
  const hasPrice = line.unitPrice !== null && line.unitPrice !== undefined && Number(line.unitPrice) > 0;
  const isProposal = proposal.kind === "PROPOSAL";
  const resolution = line.priceResolution || {};
  const standard = resolution.source === "STANDARD_NORMANDIE" && !isProposal;
  return <div className="price-proposal" data-dpgf-proposal={proposal.kind} data-dpgf-decision={decision.state || "NONE"}>
    <span className={`price-badge ${resolution.source || "NONE"}`} data-dpgf-source-badge={resolution.source || "NONE"}>{resolution.label || "Aucune référence"}</span>
    {proposal.unitMigrationNote && <small className="err-text" data-dpgf-unit-migration style={{ display: "block" }}>⚠ {proposal.unitMigrationNote}</small>}
    {standard && <div className="standard-proposal" data-dpgf-standard-proposal><b>Prix standard Normandie — indicatif : {money.format(resolution.unitPriceHT)}/{proposal.unit || line.unit}</b>
      <small>Fourchette {money.format(resolution.priceRange[0])} – {money.format(resolution.priceRange[1])} · {resolution.sampleCount} observations · {resolution.projectCount} projets · zone {resolution.geographicScope} · confiance {resolution.confidence}</small>
      <small className="muted">{resolution.disclaimer}</small>
      {editable && <button type="button" className="proposal-use" data-dpgf-use-standard onClick={() => devis.acceptStandard(line)}>Utiliser ce prix</button>}</div>}
    {resolution.source === "AGENCY_CURATED" && !hasPrice && <div className="standard-proposal agency-proposal" data-dpgf-agency-proposal><b>Référence agence : {money.format(resolution.unitPriceHT)}/{proposal.unit || line.unit}</b>
      <small>{resolution.priceRange ? `Fourchette ${money.format(resolution.priceRange[0])} – ${money.format(resolution.priceRange[1])} · ` : ""}confiance {resolution.confidence}{resolution.economicDate ? ` · prix de ${resolution.economicDate}` : ""}</small>
      {editable && <button type="button" className="proposal-use" data-dpgf-use-agency onClick={() => devis.acceptAgency(line)}>Utiliser la référence agence</button>}</div>}
    {(resolution.warnings || []).map((w) => <small key={w} className="muted" data-dpgf-stale-warning>{w}</small>)}
    {isProposal && <>
      <span data-dpgf-proposal-label><b>{`PU proposé : ${money.format(decision.state === "MODIFIED" ? decision.proposedUnitPriceHT : proposal.proposedUnitPriceHT)}/${proposal.unit}`}</b></span>
      <small data-dpgf-proposal-detail>{proposal.detail}</small>
      {decision.state === "MODIFIED" && <small className="modified-from" data-dpgf-modified-from>modifié depuis {money.format(decision.proposedUnitPriceHT)}</small>}
      {decision.state === "ACCEPTED" && <small data-dpgf-accepted>Prix de l’historique retenu</small>}
      {editable && !(hasPrice && Math.abs(Number(line.unitPrice) - proposal.proposedUnitPriceHT) < 0.005) && <button type="button" className="proposal-use" data-dpgf-use-proposal onClick={() => devis.acceptPrice(line)}>Utiliser {money.format(proposal.proposedUnitPriceHT)}</button>}
      <button type="button" className="proposal-refs" data-dpgf-references-toggle aria-expanded={open} onClick={() => setOpen(!open)}>Voir les références</button>
      {editable && <button type="button" className="proposal-refs" data-dpgf-other-price onClick={() => document.querySelector(`[data-devis-line="${line.stableKey}"] [data-devis-price]`)?.focus()}>Saisir un autre PU</button>}
      {editable && !decision.declinedProposalId && !hasPrice && <button type="button" className="proposal-refs" data-dpgf-decline onClick={() => devis.declinePrice(line)}>Ne pas utiliser</button>}
      {decision.declinedProposalId === proposal.proposalId && <small className="muted" data-dpgf-declined>Proposition écartée</small>}
    </>}
    {!isProposal && !hasPrice && !standard && <small className="proposal-none" data-dpgf-no-history><b>À renseigner</b> · Aucun prix comparable disponible — renseignez un PU ou importez une estimation.</small>}
    {!isProposal && hasPrice && decision.state === "MANUAL" && <small data-dpgf-manual>Saisi par vous</small>}
    {!isProposal && proposal.informative?.length === 1 && !hasPrice && <button type="button" className="proposal-refs" data-dpgf-references-toggle aria-expanded={open} onClick={() => setOpen(!open)}>1 référence (information)</button>}
    {open && <div className="proposal-references" data-dpgf-references>
      {isProposal && <b data-dpgf-method>{proposal.methodLabel}</b>}
      <table><thead><tr><th>Projet</th><th>PU HT</th><th>Qté</th><th>Date du prix</th><th>Source</th></tr></thead>
        <tbody>{(isProposal ? proposal.references : proposal.informative).map((ref) => <tr key={ref.id} data-dpgf-reference>
          <td>{ref.project}</td><td>{money.format(ref.unitPriceHT)}/{ref.unit}{ref.derivedFromAmount ? " (calculé)" : ""}</td><td>{ref.quantity ?? "—"}</td><td>{ref.priceDate || "date inconnue"}</td><td data-dpgf-reference-source>{ref.source}</td></tr>)}</tbody></table>
      {(proposal.warnings || []).map((warning) => <small key={warning} className="muted">{warning}</small>)}
      {isProposal && <small className="muted">Aucune actualisation de prix dans le temps n’est appliquée.</small>}
    </div>}
  </div>;
}

/** D'où vient le prix affiché + les références de l'agence : sous le PU, « Suggestion agence · N références » ouvre la liste (dernière, médiane, fourchette ; Utiliser / Voir la source) ;
 *  un prix repris d'une référence garde sa provenance ; un prix saisi peut être enregistré comme référence. */
function PriceOrigin({ line, editable, devis }) {
  const [showRefs, setShowRefs] = useState(false), [showAgency, setShowAgency] = useState(false), [sourceOf, setSourceOf] = useState(""), [saving, setSaving] = useState(false), [detail, setDetail] = useState(false);
  const ref = devis.references?.[line.templateCode];
  const source = line.priceSource || "NONE";
  const agencyRefs = devis.suggestions?.[line.stableKey] || [];
  const summary = devis.summaries?.[line.stableKey];
  const unitOf = (item) => (item.unit ? ` / ${item.unit}` : "");
  const provenance = (item) => ({ source: SOURCE[item.sourceType] || "Devis importé", sourceType: item.sourceType, document: item.file, project: item.project, date: item.date, author: item.author, referenceId: item.referenceId });
  // DPGF-UX-PRICE-CELL-SIMPLIFY-01 : la cellule répond à « quel prix est utilisé ? » et « puis-je le modifier ? » : prix + UNE provenance courte, éventuellement une suggestion agence avec sa valeur.
  // Historique, standard, agence, auteur, date et capitalisation (« Enregistrer comme référence agence ») sont dans « Détail du prix » (ⓘ) ; aucune donnée n'est perdue.
  const hasPrice = Number(line.unitPrice) > 0;
  const resolution = line.priceResolution || {};
  const origin = line.priceProvenance?.sourceType;
  const shortLabel = !hasPrice ? "Aucun prix" : source !== "CUSTOM" ? (resolution.source === "STANDARD_NORMANDIE" ? "Standard Calepin" : resolution.source === "AGENCY_CURATED" ? "Référence agence" : "Historique")
    : !origin || origin === "MANUAL" ? "Prix projet" : origin === "AWARDED_OFFER" ? "Historique" : "Référence agence";
  const suggestion = agencyRefs.find((item) => Number(item.unitPrice) > 0 && Number(item.unitPrice) !== Number(line.unitPrice));
  const useSuggestion = (item) => devis.patchLine(line, { unitPrice: item.unitPrice, _provenance: provenance(item), _origin: item.sourceType === "AWARDED_OFFER" ? { kind: "AWARDED", project: item.project } : { kind: "LIBRARY", file: item.file, sheet: item.sheet, row: item.row } });
  return <div className="price-origin" data-devis-price-origin={source}>
    {line.priceProvenance && source === "CUSTOM"
      ? <span className="tag provenance" data-devis-price-provenance data-full-provenance={provenanceText({ sourceType: origin, file: line.priceProvenance.document, project: line.priceProvenance.project, date: line.priceProvenance.date, author: line.priceProvenance.author })} title={`D'où vient ce prix — ${provenanceText({ sourceType: origin, file: line.priceProvenance.document, project: line.priceProvenance.project, date: line.priceProvenance.date, author: line.priceProvenance.author })}`}>Repris de · {origin === "MANUAL" ? "Saisi manuellement" : SOURCE[origin] || "Devis importé"}</span>
      : <span className="price-source" data-devis-price-source={shortLabel}>{shortLabel}</span>}
    <PriceProposal line={line} editable={editable} devis={devis} />
    {suggestion && hasPrice && <span className="price-suggestion" data-devis-suggestion>Suggestion agence : <b>{money.format(suggestion.unitPrice)}</b>{editable && <button type="button" data-devis-suggestion-use onClick={() => useSuggestion(suggestion)}>Utiliser</button>}</span>}
    <button type="button" className="price-detail-toggle" data-devis-price-detail-toggle aria-expanded={detail} aria-label="Détail du prix" title="Détail du prix" onClick={() => setDetail(!detail)}>ⓘ</button>
    {detail && <div className="price-detail" data-devis-price-detail role="group" aria-label="Détail du prix">
      <b>Détail du prix</b>
      {hasPrice && <small data-devis-price-used>Prix utilisé : {money.format(line.unitPrice)}{line.unit ? ` / ${line.unit}` : ""} · {shortLabel}</small>}
    {ref && <span className="refs-chip" data-devis-references title="Prix réellement retenus sur vos marchés attribués précédents"><button type="button" data-devis-references-toggle onClick={() => setShowRefs(!showRefs)}>{ref.count} référence{ref.count > 1 ? "s" : ""} comparable{ref.count > 1 ? "s" : ""} · médiane {money.format(ref.median)}</button>
      {editable && source !== "CUSTOM" && <button type="button" data-devis-use-median onClick={() => devis.patchLine(line, { unitPrice: ref.median, _origin: { kind: "AWARDED", project: ref.items?.[0]?.project, company: ref.items?.[0]?.company }, _provenance: { source: "Offres retenues (médiane)", sourceType: "AWARDED_OFFER", project: ref.items?.[0]?.project, date: ref.lastDate } })}>Utiliser la médiane</button>}</span>}
    {ref && showRefs && <div className="refs-list" data-devis-references-list><b>{ref.count} marché{ref.count > 1 ? "s" : ""} attribué{ref.count > 1 ? "s" : ""} · {money.format(ref.min)} à {money.format(ref.max)} (moyenne {money.format(ref.mean)}) · {ref.projects} projet{ref.projects > 1 ? "s" : ""}</b>
      {ref.items.map((item, i) => <span key={i}>{money.format(item.unitPrice)}{item.unit ? `/${item.unit}` : ""} · {item.company || "entreprise"} · {item.project} · {new Date(item.date).toLocaleDateString("fr-FR")}</span>)}</div>}
    {source === "CUSTOM" && line.priceProvenance && (() => {
      const origin = { sourceType: line.priceProvenance.sourceType, file: line.priceProvenance.document, project: line.priceProvenance.project, date: line.priceProvenance.date, author: line.priceProvenance.author };
      // DPGF-UX-RESPONSIVE-01 : libellé court dans la ligne (la provenance ne fixe jamais la largeur du tableau) ; le détail complet est en infobulle et au clic
      const short = origin.sourceType === "MANUAL" ? "Saisi manuellement" : SOURCE[origin.sourceType] || "Devis importé";
      return <span className="tag provenance" data-devis-price-provenance data-full-provenance={provenanceText(origin)} tabIndex={0} title={`D'où vient ce prix — ${provenanceText(origin)}`}>Repris de · {short}</span>;
    })()}
    {source === "CUSTOM" && !line.priceProvenance && <span className="tag custom">Prix de ce DPGF</span>}
    {agencyRefs.length > 0 && <button type="button" className="agency-suggestion" data-devis-agency-suggestion aria-expanded={showAgency} onClick={() => setShowAgency(!showAgency)}>Suggestion agence · {agencyRefs.length} référence{agencyRefs.length > 1 ? "s" : ""}</button>}
    {showAgency && <div className="refs-list agency-refs" data-devis-agency-refs>
      {summary && <b data-devis-agency-summary>{summary.count} référence{summary.count > 1 ? "s" : ""} agence · Dernière : {money.format(summary.last.unitPrice)}{summary.unit ? ` / ${summary.unit}` : ""}{summary.last.date ? ` (${dateFr(summary.last.date)})` : ""} · Médiane : {money.format(summary.median)} · Fourchette : {money.format(summary.min)} – {money.format(summary.max)}</b>}
      {agencyRefs.map((item, i) => <span key={(item.referenceId || item.file) + i} data-devis-agency-ref data-ref-match={item.match}>
        <em>{money.format(item.unitPrice)}{unitOf(item)}</em> <small className="ref-match">{item.match === "STRUCTURED" ? "Même ouvrage" : "Désignation proche"}</small>
        <small className="ref-prov" data-devis-reference-provenance>{provenanceText(item)}</small>
        {editable && <button type="button" data-devis-use-reference onClick={() => devis.patchLine(line, { unitPrice: item.unitPrice, _provenance: provenance(item), _origin: item.sourceType === "AWARDED_OFFER" ? { kind: "AWARDED", project: item.project } : { kind: "LIBRARY", file: item.file, sheet: item.sheet, row: item.row } })}>Utiliser {money.format(item.unitPrice)}</button>}
        <button type="button" data-devis-reference-source onClick={() => setSourceOf(sourceOf === i ? "" : i)}>Voir la source</button>
        {sourceOf === i && <small className="ref-source" data-devis-reference-source-detail>{[item.file, item.sheet, item.row ? `ligne ${item.row}` : ""].filter(Boolean).join(" · ") || "Saisie manuelle"} · « {item.designation} »</small>}
      </span>)}</div>}
      {editable && source === "CUSTOM" && Number(line.unitPrice) > 0 && <button type="button" className="save-reference" data-devis-save-reference onClick={() => setSaving(true)}>Enregistrer comme référence agence</button>}
    </div>}
    {saving && <SaveReferenceModal line={line} devis={devis} onClose={() => setSaving(false)} />}
  </div>;
}

/** Une ligne qui existe à cause d'une règle de chiffrage le dit : « Règle agence · Ligne séparée » ; le projet peut y déroger sans toucher à la règle agence. */
function RuleTag({ line, editable, devis }) {
  const [open, setOpen] = useState(false);
  const own = line.rule.source === "PROJECT";
  const label = own ? "Choix de ce projet · Ligne séparée" : line.rule.source === "AGENCY" ? "Règle agence · Ligne séparée" : "Règle système · Ligne séparée";
  const hint = own ? "Cette prestation est chiffrée séparément à la demande de ce projet." : "Cette prestation est chiffrée séparément selon les règles de votre agence.";
  return <span className="rule-tag" data-devis-rule-tag={line.rule.source} title={hint}><em>{label}</em>
    {editable && <button type="button" data-devis-rule-edit onClick={() => setOpen(!open)}>Modifier pour ce projet</button>}
    {open && <span className="rule-choice" data-devis-rule-choice>
      <label><input type="radio" checked={!own} readOnly /> Règle agence — Ligne séparée</label>
      <label><input type="radio" checked={own} readOnly onChange={() => {}} /> <button type="button" data-devis-rule-include onClick={() => { devis.setPolicy(line.rule.subject, "INCLUDED"); setOpen(false); }}>Inclus dans le prix principal pour ce projet</button></label>
    </span>}
  </span>;
}

/** « Ajouter depuis la bibliothèque » : tableau structuré (élément, famille, unité, référence agence, standard / benchmark, statut, action). Le prix vient du résolveur économique (agence avant standard publié) ;
 *  le standard Normandie est présenté comme benchmark hors région quand le projet n'est pas en Normandie ; sans prix publié compatible : « À chiffrer ». Aucun identifiant technique n'est affiché. */
const LIB_STATUS = { AGENCY: ["Référence agence", "ok"], STANDARD: ["Prix disponible", "info"], TO_PRICE: ["À chiffrer", "todo"] };
const range = (price) => (price?.min != null && price?.max != null ? `${money.format(price.min)} – ${money.format(price.max)}` : null);
function LibraryPicker({ projectId, onPick }) {
  const regionKey = `calepin.region.${projectId}`;
  const [q, setQ] = useState(""), [filter, setFilter] = useState("all"), [family, setFamily] = useState(""), [data, setData] = useState(null), [fail, setFail] = useState(""), [detail, setDetail] = useState("");
  const [region, setRegion] = useState(() => { try { return localStorage.getItem(regionKey) || ""; } catch { return ""; } });
  useEffect(() => {
    let cancelled = false;
    getEconomicsLibrary({ granularity: "DPGF", ...(q.trim() ? { q: q.trim() } : {}), ...(region ? { region } : {}) })
      .then((result) => { if (!cancelled) setData(result); }).catch((reason) => !cancelled && setFail(reason?.detail?.message || reason?.message || "Bibliothèque indisponible"));
    return () => { cancelled = true; };
  }, [q, region]);
  const chooseRegion = (value) => { setRegion(value); try { localStorage.setItem(regionKey, value); } catch { /* stockage indisponible */ } };
  const families = [...new Set((data?.items || []).map((item) => item.family).filter(Boolean))].sort();
  const rows = (data?.items || []).filter((item) => (!family || item.family === family) && (filter === "all" || (filter === "priced" && item.primary) || (filter === "agency" && item.agency) || (filter === "standard" && item.standard) || (filter === "toprice" && !item.primary)));
  return <div className="library-picker" data-devis-library-picker>
    <div className="library-tools" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input type="search" placeholder="Rechercher un poste…" aria-label="Rechercher un poste" data-devis-library-search value={q} onChange={(event) => setQ(event.target.value)} />
      <select aria-label="Famille" data-devis-library-family value={family} onChange={(event) => setFamily(event.target.value)}><option value="">Toutes les familles</option>{families.map((item) => <option key={item}>{item}</option>)}</select>
      <select aria-label="Filtre" data-devis-library-filter value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tous</option><option value="priced">Avec prix</option><option value="agency">Référence agence</option><option value="standard">Standard</option><option value="toprice">À chiffrer</option></select>
      <select aria-label="Région du projet" data-devis-library-region value={region} onChange={(event) => chooseRegion(event.target.value)}><option value="">Région du projet : non précisée</option><option value="Normandie">Normandie</option><option value="Autre">Hors Normandie</option></select>
    </div>
    {fail && <div className="err" role="alert">{fail}</div>}
    <div className="devis-table-wrap"><table className="devis-table" data-devis-library-table><thead><tr><th>Élément</th><th>Famille</th><th>Unité</th><th className="num">Référence agence</th><th className="num">Standard / benchmark</th><th>Statut</th><th>Action</th></tr></thead>
      <tbody>{rows.map((item) => { const [statusText, tone] = LIB_STATUS[item.status]; return <tr key={item.itemKey} data-devis-library-item={item.itemKey} data-library-status={item.status}>
        <td><b>{item.label}</b></td><td>{item.family || "—"}</td><td>{item.unit || "—"}</td>
        <td className="num">{item.agency ? <button type="button" className="link-button" data-library-price-detail onClick={() => setDetail(detail === item.itemKey ? "" : item.itemKey)}>{money.format(item.agency.unitPriceHT)}/{item.unit}</button> : "—"}</td>
        <td className="num">{item.standard ? <button type="button" className="link-button" data-library-price-detail onClick={() => setDetail(detail === item.itemKey ? "" : item.itemKey)}><b>{money.format(item.standard.unitPriceHT)}/{item.unit}</b>{range(item.standard) ? <small> {range(item.standard)}</small> : null}</button> : "—"}
          {item.standard && <small className="muted" data-library-standard-label style={{ display: "block" }}>{item.standard.label}</small>}</td>
        <td><span className={`devis-pl-status ${tone}`}>{statusText}</span></td>
        <td>{item.primary ? <button type="button" className="primary" data-devis-library-add-priced onClick={() => onPick({ label: item.label, unit: item.unit, itemKey: item.itemKey }, { unit_price_eur: item.primary.unitPriceHT, provenance: item.primary.source === "AGENCY_CURATED" ? "Référence agence" : item.primary.label, note: item.agency?.note })}>Ajouter avec {money.format(item.primary.unitPriceHT)}</button> : null}
          <button type="button" className={item.primary ? "link-button" : "secondary"} data-devis-library-add onClick={() => onPick({ label: item.label, unit: item.unit, itemKey: item.itemKey }, null)}>{item.primary ? "Ajouter sans prix" : "Ajouter"}</button>
          {detail === item.itemKey && <div className="refs-list" data-library-detail><small>{item.agency ? `Référence agence${item.agency.economicDate ? ` · prix de ${item.agency.economicDate}` : ""} · confiance ${item.agency.confidence}` : ""}</small>
            <small>{item.standard ? `${item.standard.label} · date économique ${item.standard.economicDate || "—"} · confiance ${item.standard.confidence}${range(item.standard) ? ` · fourchette ${range(item.standard)}` : ""}` : ""}</small></div>}</td></tr>; })}
        {!rows.length && !fail && <tr><td colSpan={7} className="muted" data-devis-library-empty>Aucun poste ne correspond.</td></tr>}</tbody></table></div>
  </div>;
}

/** Tableau d'un lot : lignes générées par le moteur (Plâtrerie) puis lignes libres, sur une seule grille. */
const TODO_STATUS = ["A_COMPLETER", "PRET", "TECHNIQUE_MODIFIE"];   // lignes moteur « à compléter » (mêmes statuts que le décompte du lot)

export function LotTable({ devis, lotId, engine, editable, onOpenWork, filter = "all" }) {
  const { data, patchLine, acknowledge, addManual, updateManual, removeManual } = devis;
  const [explain, setExplain] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false), [duplicate, setDuplicate] = useState(null), [inlineFor, setInlineFor] = useState(null);
  // « LIBRE » est le lot virtuel affiché lorsqu'aucun lot CCTP n'existe
  // encore. Les lignes importées depuis un document ont alors un lotId vide.
  // Elles doivent être visibles ici, au même titre que les lignes ajoutées à
  // la main, sinon l'import semble avoir disparu après confirmation.
  const manual = data.manualLines.filter((row) => (
    lotId === "LIBRE" ? (!(row.lotId || "") || row.lotId === "LIBRE") : (row.lotId || "") === lotId
  )).filter((row) => filter !== "todo" || row.amount === null || row.amount === undefined);
  // résultat de la projection Planning de chaque ligne (sans avoir à ouvrir le Planning) ; silencieux si le module Planning est désactivé ou pas encore généré
  const [projection, setProjection] = useState({});
  useEffect(() => {
    let live = true;
    if (!devis.cctpId || devis.saving) return undefined;
    getPlanningProjection(devis.cctpId).then((result) => { if (live) setProjection(result?.exists ? result.projection || {} : {}); }).catch(() => { if (live) setProjection({}); });
    return () => { live = false; };
  }, [devis.cctpId, devis.saving, manual.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = [];
  for (const line of engine ? data.lines : []) {
    if (filter === "todo" && !TODO_STATUS.includes(line.status)) continue;
    const key = line.workId || "PROJECT";
    let group = groups.find((item) => item.key === key);
    if (!group) { group = { key, label: line.workLabel || "Projet", lines: [] }; groups.push(group); }
    group.lines.push(line);
  }
  const colSpan = 9;
  return <div className="devis-table-wrap" data-devis-platrerie={engine ? "" : undefined}>
    {inlineFor && <InlinePersonalizationDrawer target={{ entityType: "dpgf_line", entityId: inlineFor, projectId: devis.cctpId }} onClose={() => setInlineFor(null)} onViewCctp={() => { const line = data.lines.find((l) => l.stableKey === inlineFor); setInlineFor(null); onOpenWork?.({ workId: line?.workId, questionId: line?.sourceQuestionIds?.[0] }); }} />}
    <table className="devis-table">
      <Columns />
      <thead><tr>
        <th>N°</th><th>Désignation</th><th>Description</th><th>Unité</th>
        <th className="num" title="Quantité">Qté</th><th className="num">PU HT</th><th className="num">Total HT</th><th>Statut</th><th />
      </tr></thead>
      <tbody>
        {groups.map((group, groupIndex) => [
          <tr key={`g-${group.key}`} className="devis-group"><td colSpan={colSpan}>{group.label}</td></tr>,
          ...group.lines.flatMap((line, index) => {
            const row = <tr key={line.stableKey} data-devis-line={line.stableKey} data-devis-status={line.status} className={`devis-row devis-pl-${line.lineType.toLowerCase()}`}>
              <td className="muted">{groupIndex + 1}.{index + 1}</td>
              <td className="name"><b>{line.designation}</b><small>{TYPE_LABEL[line.lineType]} · {line.templateCode}</small>
                {line.rule && <RuleTag line={line} editable={editable} devis={devis} />}</td>
              <td className="desc">{line.shortDescription || <span className="muted">—</span>}</td>
              <td>
                <select value={line.unit} disabled={!editable} data-devis-unit onChange={(event) => patchLine(line, { unit: event.target.value })}>{[...new Set([line.unit, line.ruleUnit, ...UNITS])].filter(Boolean).map((unit) => <option key={unit}>{unit}</option>)}</select>
                <span className="unit-origin" data-devis-unit-origin={line.unitSource || "RULE"}>{line.unitSource === "MANUAL" ? <>Choisie par vous · <button type="button" data-devis-unit-reset onClick={() => patchLine(line, { resetUnit: true })}>règle : {line.ruleUnit}</button></> : line.unitSource === "AGENCY_STANDARD" ? "Standard agence" : "Règle DPGF"}</span>
              </td>
              <td className="num"><input type="number" min="0" step="any" inputMode="decimal" data-devis-qty value={asInput(line.quantity?.value)} disabled={!editable} placeholder="—" onChange={(event) => patchLine(line, { quantity: event.target.value })} /><span className="qty-origin" data-devis-qty-origin>{line.quantity?.value === null || line.quantity?.value === undefined ? "Non renseignée" : "Saisie"}</span></td>
              <td className="num price">
                <input type="number" min="0" step="any" inputMode="decimal" data-devis-price value={asInput(line.unitPrice)} disabled={!editable} placeholder="—" onChange={(event) => patchLine(line, { unitPrice: event.target.value })} />
                <PriceOrigin line={line} editable={editable} devis={devis} />
              </td>
              <td className="num total" data-devis-amount>{line.amount === null || line.amount === undefined ? "—" : money.format(line.amount)}</td>
              <td><span className={`devis-pl-status ${STATUS[line.status]?.[1]}`}>{STATUS[line.status]?.[0] || line.status}</span></td>
              <td className="act">
                <button type="button" title="Voir l'ouvrage CCTP" data-devis-goto onClick={() => onOpenWork?.({ workId: line.workId, questionId: line.sourceQuestionIds?.[0] })}><ExternalLink size={15} /></button>
                <button type="button" title="Pourquoi cet élément existe-t-il ?" data-devis-why aria-expanded={explain === line.stableKey} onClick={() => setExplain(explain === line.stableKey ? "" : line.stableKey)}><Info size={15} /></button>
                {engine && line.origin !== "MANUAL" && <InlinePersonalizationTrigger onOpen={() => setInlineFor(line.stableKey)} />}
              </td>
            </tr>;
            const extra = [];
            if (line.status === "TECHNIQUE_MODIFIE") extra.push(<tr key={`${line.stableKey}-warn`} className="devis-note warn" data-devis-changed><td colSpan={colSpan}><CircleAlert size={14} /> La prescription technique a changé depuis le dernier prix. Vérifiez ou recalculez le prix.{editable && <button type="button" data-devis-ack onClick={() => acknowledge(line)}>Prix vérifié</button>}</td></tr>);
            if (explain === line.stableKey) extra.push(<tr key={`${line.stableKey}-why`} className="devis-note devis-origin" data-devis-why-row><td colSpan={colSpan}><LineOrigin line={line} /></td></tr>);
            return [row, ...extra];
          }),
        ])}
        {(manual.length > 0 || engine) && <tr className="devis-group"><td colSpan={colSpan}>{engine ? "Éléments libres du lot" : "Éléments du lot"}</td></tr>}
        {manual.map((row, index) => <tr key={row.id} className="devis-row devis-manual-row" data-devis-manual-line data-devis-line-id={row.id}>
          <td className="muted">{index + 1}</td>
          <td><input value={row.designation} placeholder="Désignation" disabled={!editable} data-devis-manual-designation onChange={(event) => updateManual(row.id, { designation: event.target.value })} />
            {projection[row.id] && <small className="devis-planning-link" data-dpgf-planning={projection[row.id].state} style={{ display: "block", color: "#5b6157" }}>Planning : {projection[row.id].text}</small>}</td>
          <td><input value={row.shortDescription || row.description || ""} placeholder="Description (facultatif)" disabled={!editable} onChange={(event) => updateManual(row.id, { shortDescription: event.target.value })} /></td>
          <td><select value={row.unit} disabled={!editable} onChange={(event) => updateManual(row.id, { unit: event.target.value })}>{[...new Set([row.unit, ...UNITS])].filter(Boolean).map((unit) => <option key={unit}>{unit}</option>)}</select></td>
          <td className="num"><input type="number" min="0" step="any" value={asInput(row.quantity?.value)} disabled={!editable} placeholder="—" data-devis-manual-qty onChange={(event) => updateManual(row.id, { quantity: { value: event.target.value } })} /></td>
          <td className="num"><input type="number" min="0" step="any" value={asInput(row.unitPrice)} disabled={!editable} placeholder="—" data-devis-manual-price onChange={(event) => updateManual(row.id, { unitPrice: event.target.value })} /></td>
          <td className="num total" data-devis-manual-amount>{row.amount === null || row.amount === undefined ? "—" : money.format(row.amount)}</td>
          <td>{row.itemKey || row.origin === "LIBRARY" || row.sourceOrigin === "LIBRARY" ? <span className="devis-pl-status library" data-devis-origin="LIBRARY_ADDED" title="Ajouté depuis la bibliothèque">Bibliothèque</span> : <span className="devis-pl-status manual" data-devis-origin="MANUAL">Manuel</span>}</td>
          <td className="act">{editable && <button type="button" title="Supprimer l'élément" onClick={() => removeManual(row.id)}><Trash2 size={15} /></button>}</td>
        </tr>)}
        {editable && <tr className="devis-add-row"><td colSpan={colSpan}><button type="button" className="devis-add" data-devis-add onClick={() => addManual(lotId)}><Plus size={14} /> Ajouter un élément</button>
          <button type="button" className="devis-add" data-devis-add-library aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}><Plus size={14} /> Ajouter depuis la bibliothèque</button>
          {duplicate && <div className="devis-duplicate" role="alert" data-devis-duplicate style={{ margin: "8px 0", padding: "8px 12px", background: "#fff7e0", border: "1px solid #ecd9a0", borderRadius: 10 }}>Ce poste existe déjà dans le DPGF.{" "}
            <button type="button" className="link-button" data-devis-duplicate-open onClick={() => { document.querySelector(`[data-devis-manual-line][data-devis-line-id="${duplicate.existingId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }); setDuplicate(null); }}>Ouvrir le poste existant</button>{" · "}
            <button type="button" className="link-button" data-devis-duplicate-add onClick={() => { devis.addFromLibrary(lotId, duplicate.item, duplicate.reference); setDuplicate(null); }}>Ajouter quand même</button></div>}
          {libraryOpen && <LibraryPicker projectId={devis.cctpId} onPick={(item, reference) => { const existing = manual.find((row) => row.itemKey && row.itemKey === item.itemKey); if (existing) setDuplicate({ item, reference, existingId: existing.id }); else devis.addFromLibrary(lotId, item, reference); setLibraryOpen(false); }} />}</td></tr>}
      </tbody>
    </table>
  </div>;
}
