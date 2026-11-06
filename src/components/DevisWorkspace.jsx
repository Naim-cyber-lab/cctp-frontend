import { useEffect, useState } from "react";
import { freezeDevis, getDevisRegeneratePreview, previewDevisPrices, unfreezeDevis } from "../api/client";
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, PenLine, Sparkles } from "lucide-react";
import { LotTable, money } from "./DevisPlatrerie";
import "../devis-platrerie.css";

const ENGINE_LOTS = ["06"];

/** Chiffres d'un lot : nombre de lignes, lignes à compléter, total HT. */
/** Lot virtuel des éléments saisis dans un DPGF sans CCTP (aucun lot) : même tableau, mêmes boutons d'ajout. */
export const FREE_LOT = "LIBRE";

export function lotFigures(devis, lotId) {
  const engine = ENGINE_LOTS.includes(lotId) ? devis.data.lines : [];
  // Les bordereaux importés peuvent arriver avant la création d'un lot CCTP.
  // Dans ce cas leur lotId est volontairement vide : ils appartiennent au lot
  // virtuel « Éléments libres » et ne doivent surtout pas disparaître de l'écran.
  const manual = devis.data.manualLines.filter((row) => (
    lotId === FREE_LOT ? (!(row.lotId || "") || row.lotId === FREE_LOT) : (row.lotId || "") === lotId
  ));
  const all = [...engine, ...manual];
  const todo = engine.filter((line) => ["A_COMPLETER", "PRET", "TECHNIQUE_MODIFIE"].includes(line.status)).length
    + manual.filter((row) => row.amount === null || row.amount === undefined).length;
  return { engine: engine.length, manual: manual.length, count: all.length, todo, total: all.reduce((sum, line) => sum + (line.amount || 0), 0) };
}

/** DPGF-UX-PRICE-HISTORY-01 : cette action ne « valide » pas le DPGF (elle ne le verrouille pas et ne le fige pas) : elle ajoute les prix RETENUS à l'historique de prix de l'agence.
 *  Une ligne sans prix retenu (NONE ≠ 0 €) ou incomplète n'est jamais enregistrée ; un prix déjà enregistré et inchangé n'est pas recréé. */
const money2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
function ValidatePrices({ devis }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState(false);
  const validation = devis.data.validation;
  const signature = JSON.stringify((devis.data.lines || []).map((l) => [l.stableKey, l.unitPrice, l.unit]));
  useEffect(() => { previewDevisPrices(devis.cctpId).then(setPreview).catch(() => setPreview(null)); }, [devis.cctpId, signature, validation?.validatedAt]);
  const toAdd = preview ? preview.created + preview.updated : 0;
  const added = validation ? validation.created + validation.updated : 0;
  const run = async () => { setBusy(true); await devis.validatePrices(); setBusy(false); setOpen(false); };
  return <span className="devis-validate" data-dpgf-validate-box>
    <button type="button" className="devis-btn" data-dpgf-validate disabled={busy || !preview || toAdd === 0} aria-describedby="dpgf-history-help" onClick={() => (toAdd > 1 ? setOpen(!open) : run())}
      title="Ajoute les prix retenus de cette DPGF à l'historique de votre agence pour pouvoir les réutiliser sur de futurs projets. Cela ne verrouille pas la DPGF.">
      {toAdd > 1 ? `Ajouter ${toAdd} prix à l’historique` : "Ajouter le prix à l’historique"}</button>
    <small id="dpgf-history-help" className="muted" data-dpgf-history-help>Ajoute les prix retenus à l’historique de votre agence, pour de futurs projets. La DPGF reste modifiable.</small>
    {preview && preview.unchanged > 0 && toAdd === 0 && <small data-dpgf-already-saved>Déjà enregistré dans l’historique ({plural(preview.unchanged, "prix", "prix")})</small>}
    {preview && preview.updated > 0 && <small className="warn" data-dpgf-price-changed>{preview.updated > 1 ? `${preview.updated} prix modifiés depuis le dernier enregistrement` : "Prix modifié depuis le dernier enregistrement"}</small>}
    {open && preview && <div className="devis-notice" data-dpgf-history-preview role="dialog" aria-label="Prix qui seront ajoutés à l’historique">
      <b>Prix qui seront ajoutés à l’historique</b>
      <ul>{preview.details.filter((d) => d.state !== "UNCHANGED").map((d) => <li key={d.key}>{d.designation} — {money2.format(d.price)}/{d.unit}{d.state === "CHANGED" ? ` (avant : ${money2.format(d.previousPrice)})` : ""}</li>)}</ul>
      <button type="button" className="devis-btn" data-dpgf-history-confirm disabled={busy} onClick={run}>Enregistrer {plural(toAdd, "prix", "prix")}</button>{" "}
      <button type="button" className="link-button" onClick={() => setOpen(false)}>Annuler</button></div>}
    {validation && <small data-dpgf-validated>✓ {added > 0 ? `${plural(added, "prix ajouté", "prix ajoutés")} à l’historique de votre agence` : "Aucun nouveau prix à ajouter"}{validation.unchanged ? ` · ${plural(validation.unchanged, "déjà enregistré", "déjà enregistrés")}` : ""}{validation.skipped ? ` · ${validation.skipped} sans prix retenu ou incomplète${validation.skipped > 1 ? "s" : ""} (non enregistrée${validation.skipped > 1 ? "s" : ""})` : ""}</small>}
  </span>;
}

/** Devis lot par lot : on choisit un lot, ses lignes s'affichent (générées depuis le CCTP pour la Plâtrerie, libres pour les autres). */
/** Navigation depuis le Planning (« Ouvrir dans la DPGF ») : la ligne ciblée est amenée à l'écran et mise en évidence quelques secondes. */
function useDpgfFocusLine() {
  useEffect(() => {
    let key = null;
    try { key = window.sessionStorage.getItem("calepin.dpgf.focusLine"); window.sessionStorage.removeItem("calepin.dpgf.focusLine"); } catch { /* stockage indisponible */ }
    if (!key) return undefined;
    const timer = window.setInterval(() => {
      const row = [...document.querySelectorAll("[data-devis-line], [data-devis-line-id]")].find((n) => n.getAttribute("data-devis-line") === key || n.getAttribute("data-devis-line-id") === key);
      if (!row) return;
      window.clearInterval(timer);
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.classList.add("pln-flash");
      window.setTimeout(() => row.classList.remove("pln-flash"), 3000);
    }, 400);
    const stop = window.setTimeout(() => window.clearInterval(timer), 8000);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); };
  }, []);
}

export function DevisByLot({ devis, lots: cctpLots, editable, onOpenWork, active, onActive }) {
  // DPGF sans CCTP (aucun lot) : un espace « Éléments libres » permet d'ajouter des éléments à la main ou depuis la bibliothèque, au lieu d'un simple message
  useDpgfFocusLine();
  const [regen, setRegen] = useState(null);
  const freeMode = !cctpLots.length;
  const hasDocumentImports = (devis.data.manualLines || []).some((row) => !(row.lotId || "") || row.lotId === FREE_LOT);
  const lots = freeMode ? [{ lotId: FREE_LOT, designation: "Postes importés des documents" }]
    : [...cctpLots, ...(hasDocumentImports ? [{ lotId: FREE_LOT, designation: "Postes importés des documents" }] : [])];
  const [localActive, setLocalActive] = useState("");
  const [filter, setFilter] = useState("all");   // « Toutes les lignes » | « À compléter », comme dans le Planning
  const current = active ?? localActive;
  const setCurrent = onActive ?? setLocalActive;
  const lotId = lots.some((lot) => lot.lotId === current) ? current : (lots.find((lot) => ENGINE_LOTS.includes(lot.lotId)) || lots[0])?.lotId || "";
  const lot = lots.find((item) => item.lotId === lotId);
  const engineLot = ENGINE_LOTS.includes(lotId);
  const figures = lotFigures(devis, lotId);
  return <div className="devis-lots" data-devis-by-lot>
    <nav className="devis-lot-picker" aria-label="Lots du CCTP">
      {lots.map((item, index) => {
        const info = lotFigures(devis, item.lotId);
        return <button type="button" key={item.lotId} className={item.lotId === lotId ? "active" : ""} data-devis-lot={item.lotId} onClick={() => setCurrent(item.lotId)}>
          <span className="devis-lot-num">LOT {String(index + 1).padStart(2, "0")}</span>
          <b>{item.designation}</b>
          <small>{ENGINE_LOTS.includes(item.lotId) ? <><Sparkles size={12} /> généré depuis le CCTP</> : freeMode && info.manual ? <><FileSpreadsheet size={12} /> importé depuis vos documents</> : <><PenLine size={12} /> saisie libre</>}</small>
          <em className={info.todo > 0 ? "todo" : info.count ? "ok" : ""}>{info.count} élément{info.count > 1 ? "s" : ""}{info.todo > 0 ? ` · ${info.todo} à compléter` : info.count ? " · complet" : ""}</em>
        </button>;
      })}
    </nav>
    <section className="devis-lot-panel" data-devis-lot-panel={lotId}>
      <header>
        <div>
          <h3>{lot?.designation}</h3>
          <p>{engineLot
            ? "Éléments du DPGF générés depuis le CCTP. Complétez les quantités et, si souhaité, les prix unitaires (aucun prix n'est inventé)."
            : freeMode ? figures.manual ? `${figures.manual} poste${figures.manual > 1 ? "s ont" : " a"} été importé${figures.manual > 1 ? "s" : ""} depuis vos documents. Complétez les quantités et les prix, puis créez vos lots CCTP lorsque vous serez prêt.` : "Ce projet n'a pas encore de lot de CCTP : ajoutez vos éléments librement, ou depuis la bibliothèque de l'agence. Ils rejoindront le DPGF au fil de la rédaction du CCTP."
              : "Ce lot n'a pas encore de moteur de chiffrage automatique : saisissez vos éléments (désignation, unité, quantité, prix)."}</p>
        </div>
        <div className="devis-lot-total"><small>Total HT du lot</small><b data-devis-lot-total>{money.format(figures.total)}</b></div>
      </header>
      {devis.error && <div className="quotes-error" role="alert">{devis.error}</div>}
      {engineLot && ((devis.data.agencyRules?.applied || []).length + (devis.data.agencyRules?.skipped || []).length) > 0 && <details className="devis-agency-rules" data-devis-agency-rules style={{ margin: "8px 0" }}>
        <summary>Règles de génération de votre agence appliquées à ce projet ({(devis.data.agencyRules.applied || []).length})</summary>
        <ul className="plain-list">{[...(devis.data.agencyRules.applied || []).map((r) => ({ ...r, off: false })), ...(devis.data.agencyRules.skipped || []).map((r) => ({ ...r, off: true }))].map((rule) => <li key={rule.rule_key} data-devis-agency-rule={rule.rule_key} data-skipped={rule.off ? "true" : "false"}>
          <b>{rule.name}</b> · version {rule.version}{rule.off && <> · <i>écartée pour ce projet</i></>}
          {editable && <> <button type="button" className="link-button" data-devis-agency-rule-toggle onClick={() => devis.setRuleOverride(rule.rule_key, !rule.off)}>{rule.off ? "Appliquer de nouveau" : "Ne pas appliquer à ce projet"}</button></>}</li>)}</ul>
        <small className="muted">Ce choix ne concerne que ce projet : la règle de votre agence n’est pas modifiée.</small></details>}
      {engineLot && devis.data.agencyRules?.outdated && <div className="rules-outdated" data-devis-generation-outdated style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
        <span data-devis-generation-rules-outdated><CircleAlert size={15} /> Des règles de génération de votre agence sont disponibles. Ce projet garde les siennes tant que vous ne les appliquez pas.</span>
        {editable && <button type="button" className="devis-btn" data-devis-rules-sync-banner onClick={() => devis.syncAgencyRules()}>Appliquer les règles actuelles de l’agence</button>}
        <button type="button" className="devis-btn secondary" data-devis-regen-preview onClick={() => getDevisRegeneratePreview(devis.cctpId).then(setRegen).catch(() => setRegen({ error: true }))}>Voir ce qui changerait</button></div>}
      {engineLot && editable && (devis.data.freeze
        ? <div className="rules-outdated" data-devis-frozen style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
            <span><CheckCircle2 size={15} /> DPGF gelée le {new Date(devis.data.freeze.frozenAt).toLocaleDateString("fr-FR")}{devis.data.freeze.reason ? ` — ${devis.data.freeze.reason}` : ""} : lignes, règles et quantités figées.{devis.data.freeze.outdated ? " Le CCTP ou les règles ont changé depuis : dégelez pour régénérer." : ""}</span>
            <button type="button" className="devis-btn secondary" data-devis-unfreeze onClick={() => { const reason = window.prompt("Motif du dégel (facultatif)") ; if (reason !== null) unfreezeDevis(devis.cctpId, reason).then(() => devis.reload()); }}>Dégeler</button></div>
        : <div style={{ margin: "8px 0" }}><button type="button" className="devis-btn secondary" data-devis-freeze title="Fige les lignes, les règles et les quantités : plus aucune modification sans dégel" onClick={() => { const reason = window.prompt("Marquer la DPGF prête : motif (facultatif)"); if (reason !== null) freezeDevis(devis.cctpId, reason).then(() => devis.reload()); }}>Marquer la DPGF prête (geler)</button></div>)}
      {regen && <section className="rules-outdated" data-devis-regen-panel style={{ margin: "8px 0" }}>
        {regen.error ? <p>Aperçu indisponible.</p> : !regen.changed ? <p>Aucune différence : ce projet est déjà aligné sur les règles actuelles.</p> : <>
          <p><b>Si vous appliquez les règles actuelles :</b></p>
          <ul>
            {regen.added.length > 0 && <li data-regen-added>{regen.added.length} ligne{regen.added.length > 1 ? "s" : ""} ajoutée{regen.added.length > 1 ? "s" : ""} : {regen.added.map((l) => l.designation).join(", ")}</li>}
            {regen.removed.length > 0 && <li data-regen-removed>{regen.removed.length} ligne{regen.removed.length > 1 ? "s" : ""} retirée{regen.removed.length > 1 ? "s" : ""} : {regen.removed.map((l) => l.designation).join(", ")}{regen.priceImpact.removedWithPrice ? ` — dont ${regen.priceImpact.removedWithPrice} avec un prix saisi (conservé en archive)` : ""}</li>}
            {regen.modified.length > 0 && <li data-regen-modified>{regen.modified.length} ligne{regen.modified.length > 1 ? "s" : ""} modifiée{regen.modified.length > 1 ? "s" : ""} : {regen.modified.map((l) => l.designation).join(", ")}</li>}
          </ul>
          <p className="muted">{regen.note}</p>
          {editable && <button type="button" className="devis-btn" data-devis-regen-apply onClick={() => devis.syncAgencyRules().then(() => setRegen(null))}>Appliquer ces changements</button>} </>}
        <button type="button" className="devis-btn secondary" data-devis-regen-close onClick={() => setRegen(null)}>Fermer</button></section>}
      {engineLot && figures.engine === 0 && <div className="devis-notice" data-devis-empty>
        <CircleAlert size={18} />
        <div><b>Aucun élément du DPGF n'a pu être généré pour ce lot.</b>
          <p>Le moteur part des ouvrages décrits dans le questionnaire Plâtrerie (cloisons, doublages, plafonds…). Répondez-y dans le CCTP, puis revenez ici : les éléments du DPGF apparaîtront tout seuls.</p>
          {editable && <button type="button" className="devis-btn" data-devis-open-questionnaire onClick={() => onOpenWork?.({})}>Ouvrir le questionnaire Plâtrerie</button>}</div>
      </div>}
      {engineLot && figures.engine > 0 && <div className="devis-toolbar">
        <span data-devis-engine-count>{figures.engine} élément{figures.engine > 1 ? "s" : ""} du DPGF généré{figures.engine > 1 ? "s" : ""} depuis votre questionnaire</span>
        <div className="pln-segmented" role="tablist" aria-label="Filtre des lignes" data-dpgf-filters data-dpgf-completeness={figures.todo > 0 ? "INCOMPLETE" : "COMPLETE"}>
          <button type="button" role="tab" className={filter === "all" ? "on" : ""} data-dpgf-filter="all" aria-selected={filter === "all"} onClick={() => setFilter("all")}>Toutes les lignes</button>
          <button type="button" role="tab" className={filter === "todo" ? "on" : ""} data-dpgf-filter="todo" aria-selected={filter === "todo"} aria-label={`À compléter, ${figures.todo} élément${figures.todo > 1 ? "s" : ""}`} onClick={() => setFilter("todo")}>À compléter <span className={`pln-count ${figures.todo === 0 ? "zero" : ""}`} data-dpgf-todo-count>{figures.todo}</span></button></div>
        {figures.todo === 0 && <span className="ready" data-dpgf-complete><CheckCircle2 size={14} /> DPGF complète</span>}
        {editable && <ValidatePrices devis={devis} />}
        <small className="devis-indicators" data-dpgf-indicators>{(() => { const lines = devis.data.lines; const priced = lines.filter((l) => l.unitPrice !== null && l.unitPrice !== undefined).length; const suggested = lines.filter((l) => (l.unitPrice === null || l.unitPrice === undefined) && l.priceProposal?.kind === "PROPOSAL").length;
          return `${priced}/${lines.length} lignes avec PU retenu · ${suggested} avec suggestion · ${lines.length - priced - suggested} sans comparable`; })()}</small>
      </div>}
      {engineLot && (devis.data.archivedLines || []).length > 0 && <p className="devis-archived" data-devis-archived>{devis.data.archivedLines.length} élément{devis.data.archivedLines.length > 1 ? "s" : ""} retiré{devis.data.archivedLines.length > 1 ? "s" : ""} du CCTP ne compte{devis.data.archivedLines.length > 1 ? "nt" : ""} plus dans le chiffrage : {devis.data.archivedLines.length > 1 ? "leurs saisies sont" : "sa saisie est"} conservée{devis.data.archivedLines.length > 1 ? "s" : ""} au cas où {devis.data.archivedLines.length > 1 ? "elles reviendraient" : "elle reviendrait"}.</p>}
      {filter === "todo" && figures.todo === 0 && <p className="pln-todo-empty" role="status" data-dpgf-todo-empty>Aucun élément à compléter. <button type="button" className="link-button" data-dpgf-todo-all onClick={() => setFilter("all")}>Voir toutes les lignes</button></p>}
      <LotTable devis={devis} lotId={lotId} engine={engineLot && figures.engine > 0} editable={editable} onOpenWork={onOpenWork} filter={filter} />
    </section>
  </div>;
}

/** Récapitulatif global : chaque lot, son avancement et son total, puis le total général du devis. */
export function DevisRecap({ devis, lots, vatRate, onOpenLot, onExport, exporting }) {
  const rows = lots.map((lot, index) => ({ ...lot, index, ...lotFigures(devis, lot.lotId) }));
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const vat = total * (Number(vatRate) || 0) / 100;
  const todo = rows.reduce((sum, row) => sum + row.todo, 0);
  return <div className="devis-recap" data-devis-recap>
    <table className="devis-recap-table">
      <thead><tr><th>Lot</th><th>Origine des éléments</th><th className="num">Éléments</th><th>État</th><th className="num">Total HT</th><th /></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.lotId} data-devis-recap-lot={row.lotId}>
          <td><b>{String(row.index + 1).padStart(2, "0")} · {row.designation}</b></td>
          <td className="muted">{ENGINE_LOTS.includes(row.lotId) ? "Générées depuis le CCTP" : "Saisie libre"}</td>
          <td className="num">{row.count}</td>
          <td>{row.count === 0 ? <span className="devis-pl-status todo">À renseigner</span> : row.todo > 0 ? <span className="devis-pl-status todo">{row.todo} à compléter</span> : <span className="devis-pl-status ok">Complet</span>}</td>
          <td className="num total" data-devis-recap-total>{money.format(row.total)}</td>
          <td className="act"><button type="button" className="devis-ghost" data-devis-recap-open onClick={() => onOpenLot(row.lotId)}>Ouvrir le lot</button></td>
        </tr>)}
      </tbody>
    </table>
    <div className="devis-totals">
      <div><span>Total HT</span><b data-devis-grand-total>{money.format(total)}</b></div>
      <div><span>TVA ({Number(vatRate) || 0} %)</span><b>{money.format(vat)}</b></div>
      <div className="grand"><span>Total TTC</span><b>{money.format(total + vat)}</b></div>
    </div>
    <div className="devis-recap-foot">
      {todo === 0 && rows.some((row) => row.count) ? <span className="ready"><CheckCircle2 size={16} /> DPGF complet : prêt à exporter.</span> : <span className="warning"><CircleAlert size={16} /> {todo > 0 ? `${todo} élément${todo > 1 ? "s" : ""} à compléter avant d'exporter.` : "Aucun élément pour l'instant."}</span>}
      <button type="button" className="devis-btn primary" data-devis-export disabled={exporting} onClick={onExport}><Download size={14} /> Exporter le DPGF (Excel)</button>
    </div>
  </div>;
}
