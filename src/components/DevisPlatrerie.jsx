import { useEffect, useState } from "react";
import { createPriceReference } from "../api/client";
import { CircleAlert, ExternalLink, Info, Plus, Trash2, X } from "lucide-react";
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
      {(data.policyOutdated || []).length > 0 && <div className="rules-outdated" data-devis-rules-outdated><span>{data.policyOutdated.length} règle{data.policyOutdated.length > 1 ? "s" : ""} de l’agence {data.policyOutdated.length > 1 ? "ont" : "a"} changé depuis la création de ce projet.</span>{editable && <button type="button" className="secondary" data-devis-rules-sync onClick={() => devis.syncAgencyRules()}>Appliquer les règles actuelles de l’agence</button>}</div>}
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

/** D'où vient le prix affiché + les références de l'agence : sous le PU, « Suggestion agence · N références » ouvre la liste (dernière, médiane, fourchette ; Utiliser / Voir la source) ;
 *  un prix repris d'une référence garde sa provenance ; un prix saisi peut être enregistré comme référence. */
function PriceOrigin({ line, editable, devis }) {
  const [showRefs, setShowRefs] = useState(false), [showAgency, setShowAgency] = useState(false), [sourceOf, setSourceOf] = useState(""), [saving, setSaving] = useState(false);
  const ref = devis.references?.[line.templateCode];
  const source = line.priceSource || "NONE";
  const agencyRefs = devis.suggestions?.[line.stableKey] || [];
  const summary = devis.summaries?.[line.stableKey];
  const unitOf = (item) => (item.unit ? ` / ${item.unit}` : "");
  const provenance = (item) => ({ source: SOURCE[item.sourceType] || "Devis importé", sourceType: item.sourceType, document: item.file, project: item.project, date: item.date, author: item.author, referenceId: item.referenceId });
  return <div className="price-origin" data-devis-price-origin={source}>
    {ref && <span className="refs-chip" data-devis-references title="Prix réellement retenus sur vos marchés attribués précédents"><button type="button" data-devis-references-toggle onClick={() => setShowRefs(!showRefs)}>{ref.count} référence{ref.count > 1 ? "s" : ""} comparable{ref.count > 1 ? "s" : ""} · médiane {money.format(ref.median)}</button>
      {editable && source !== "CUSTOM" && <button type="button" data-devis-use-median onClick={() => devis.patchLine(line, { unitPrice: ref.median, _origin: { kind: "AWARDED", project: ref.items?.[0]?.project, company: ref.items?.[0]?.company }, _provenance: { source: "Offres retenues (médiane)", sourceType: "AWARDED_OFFER", project: ref.items?.[0]?.project, date: ref.lastDate } })}>Utiliser la médiane</button>}</span>}
    {ref && showRefs && <div className="refs-list" data-devis-references-list><b>{ref.count} marché{ref.count > 1 ? "s" : ""} attribué{ref.count > 1 ? "s" : ""} · {money.format(ref.min)} à {money.format(ref.max)} (moyenne {money.format(ref.mean)}) · {ref.projects} projet{ref.projects > 1 ? "s" : ""}</b>
      {ref.items.map((item, i) => <span key={i}>{money.format(item.unitPrice)}{item.unit ? `/${item.unit}` : ""} · {item.company || "entreprise"} · {item.project} · {new Date(item.date).toLocaleDateString("fr-FR")}</span>)}</div>}
    {source === "CUSTOM" && line.priceProvenance && <span className="tag provenance" data-devis-price-provenance title="D'où vient ce prix">Repris de · {provenanceText({ sourceType: line.priceProvenance.sourceType, file: line.priceProvenance.document, project: line.priceProvenance.project, date: line.priceProvenance.date, author: line.priceProvenance.author })}</span>}
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

/** Tableau d'un lot : lignes générées par le moteur (Plâtrerie) puis lignes libres, sur une seule grille. */
export function LotTable({ devis, lotId, engine, editable, onOpenWork }) {
  const { data, patchLine, acknowledge, addManual, updateManual, removeManual } = devis;
  const [explain, setExplain] = useState("");
  const manual = data.manualLines.filter((row) => (row.lotId || "") === lotId);
  const groups = [];
  for (const line of engine ? data.lines : []) {
    const key = line.workId || "PROJECT";
    let group = groups.find((item) => item.key === key);
    if (!group) { group = { key, label: line.workLabel || "Projet", lines: [] }; groups.push(group); }
    group.lines.push(line);
  }
  const colSpan = 9;
  return <div className="devis-table-wrap" data-devis-platrerie={engine ? "" : undefined}>
    <table className="devis-table">
      <Columns />
      <thead><tr>
        <th>N°</th><th>Désignation</th><th>Description</th><th>Unité</th>
        <th className="num">Quantité</th><th className="num">PU HT</th><th className="num">Total HT</th><th>Statut</th><th />
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
              </td>
            </tr>;
            const extra = [];
            if (line.status === "TECHNIQUE_MODIFIE") extra.push(<tr key={`${line.stableKey}-warn`} className="devis-note warn" data-devis-changed><td colSpan={colSpan}><CircleAlert size={14} /> La prescription technique a changé depuis le dernier prix. Vérifiez ou recalculez le prix.{editable && <button type="button" data-devis-ack onClick={() => acknowledge(line)}>Prix vérifié</button>}</td></tr>);
            if (explain === line.stableKey) extra.push(<tr key={`${line.stableKey}-why`} className="devis-note devis-origin" data-devis-why-row><td colSpan={colSpan}><LineOrigin line={line} /></td></tr>);
            return [row, ...extra];
          }),
        ])}
        {(manual.length > 0 || engine) && <tr className="devis-group"><td colSpan={colSpan}>{engine ? "Éléments libres du lot" : "Éléments du lot"}</td></tr>}
        {manual.map((row, index) => <tr key={row.id} className="devis-row devis-manual-row" data-devis-manual-line>
          <td className="muted">{index + 1}</td>
          <td><input value={row.designation} placeholder="Désignation" disabled={!editable} data-devis-manual-designation onChange={(event) => updateManual(row.id, { designation: event.target.value })} /></td>
          <td><input value={row.shortDescription || row.description || ""} placeholder="Description (facultatif)" disabled={!editable} onChange={(event) => updateManual(row.id, { shortDescription: event.target.value })} /></td>
          <td><select value={row.unit} disabled={!editable} onChange={(event) => updateManual(row.id, { unit: event.target.value })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></td>
          <td className="num"><input type="number" min="0" step="any" value={asInput(row.quantity?.value)} disabled={!editable} placeholder="—" data-devis-manual-qty onChange={(event) => updateManual(row.id, { quantity: { value: event.target.value } })} /></td>
          <td className="num"><input type="number" min="0" step="any" value={asInput(row.unitPrice)} disabled={!editable} placeholder="—" data-devis-manual-price onChange={(event) => updateManual(row.id, { unitPrice: event.target.value })} /></td>
          <td className="num total" data-devis-manual-amount>{row.amount === null || row.amount === undefined ? "—" : money.format(row.amount)}</td>
          <td><span className="devis-pl-status manual">Manuel</span></td>
          <td className="act">{editable && <button type="button" title="Supprimer l'élément" onClick={() => removeManual(row.id)}><Trash2 size={15} /></button>}</td>
        </tr>)}
        {editable && <tr className="devis-add-row"><td colSpan={colSpan}><button type="button" className="devis-add" data-devis-add onClick={() => addManual(lotId)}><Plus size={14} /> Ajouter un élément</button></td></tr>}
      </tbody>
    </table>
  </div>;
}
