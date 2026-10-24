import { useState } from "react";
import { CheckCircle2, CircleAlert, Download, PenLine, Sparkles } from "lucide-react";
import { LotTable, money } from "./DevisPlatrerie";
import "../devis-platrerie.css";

const ENGINE_LOTS = ["06"];

/** Chiffres d'un lot : nombre de lignes, lignes à compléter, total HT. */
export function lotFigures(devis, lotId) {
  const engine = ENGINE_LOTS.includes(lotId) ? devis.data.lines : [];
  const manual = devis.data.manualLines.filter((row) => (row.lotId || "") === lotId);
  const all = [...engine, ...manual];
  const todo = engine.filter((line) => ["A_COMPLETER", "PRET", "TECHNIQUE_MODIFIE"].includes(line.status)).length
    + manual.filter((row) => row.amount === null || row.amount === undefined).length;
  return { engine: engine.length, manual: manual.length, count: all.length, todo, total: all.reduce((sum, line) => sum + (line.amount || 0), 0) };
}

/** Devis lot par lot : on choisit un lot, ses lignes s'affichent (générées depuis le CCTP pour la Plâtrerie, libres pour les autres). */
export function DevisByLot({ devis, lots, editable, onOpenWork, active, onActive }) {
  const [localActive, setLocalActive] = useState("");
  const current = active ?? localActive;
  const setCurrent = onActive ?? setLocalActive;
  const lotId = lots.some((lot) => lot.lotId === current) ? current : (lots.find((lot) => ENGINE_LOTS.includes(lot.lotId)) || lots[0])?.lotId || "";
  const lot = lots.find((item) => item.lotId === lotId);
  if (!lots.length) return <p className="devis-empty-text" data-devis-empty>Ce CCTP ne contient encore aucun lot : ajoutez des lots depuis le CCTP pour les chiffrer.</p>;
  const engineLot = ENGINE_LOTS.includes(lotId);
  const figures = lotFigures(devis, lotId);
  return <div className="devis-lots" data-devis-by-lot>
    <nav className="devis-lot-picker" aria-label="Lots du CCTP">
      {lots.map((item, index) => {
        const info = lotFigures(devis, item.lotId);
        return <button type="button" key={item.lotId} className={item.lotId === lotId ? "active" : ""} data-devis-lot={item.lotId} onClick={() => setCurrent(item.lotId)}>
          <span className="devis-lot-num">LOT {String(index + 1).padStart(2, "0")}</span>
          <b>{item.designation}</b>
          <small>{ENGINE_LOTS.includes(item.lotId) ? <><Sparkles size={12} /> généré depuis le CCTP</> : <><PenLine size={12} /> saisie libre</>}</small>
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
            : "Ce lot n'a pas encore de moteur de chiffrage automatique : saisissez vos éléments (désignation, unité, quantité, prix)."}</p>
        </div>
        <div className="devis-lot-total"><small>Total HT du lot</small><b data-devis-lot-total>{money.format(figures.total)}</b></div>
      </header>
      {devis.error && <div className="quotes-error" role="alert">{devis.error}</div>}
      {engineLot && figures.engine === 0 && <div className="devis-notice" data-devis-empty>
        <CircleAlert size={18} />
        <div><b>Aucun élément du DPGF n'a pu être généré pour ce lot.</b>
          <p>Le moteur part des ouvrages décrits dans le questionnaire Plâtrerie (cloisons, doublages, plafonds…). Répondez-y dans le CCTP, puis revenez ici : les éléments du DPGF apparaîtront tout seuls.</p>
          {editable && <button type="button" className="devis-btn" data-devis-open-questionnaire onClick={() => onOpenWork?.({})}>Ouvrir le questionnaire Plâtrerie</button>}</div>
      </div>}
      {engineLot && figures.engine > 0 && <div className="devis-toolbar">
        <span data-devis-engine-count>{figures.engine} élément{figures.engine > 1 ? "s" : ""} du DPGF généré{figures.engine > 1 ? "s" : ""} depuis votre questionnaire · {figures.todo > 0 ? `${figures.todo} à compléter` : "tout est renseigné"}</span>
      </div>}
      {engineLot && (devis.data.archivedLines || []).length > 0 && <p className="devis-archived" data-devis-archived>{devis.data.archivedLines.length} élément{devis.data.archivedLines.length > 1 ? "s" : ""} retiré{devis.data.archivedLines.length > 1 ? "s" : ""} du CCTP ne compte{devis.data.archivedLines.length > 1 ? "nt" : ""} plus dans le chiffrage : {devis.data.archivedLines.length > 1 ? "leurs saisies sont" : "sa saisie est"} conservée{devis.data.archivedLines.length > 1 ? "s" : ""} au cas où {devis.data.archivedLines.length > 1 ? "elles reviendraient" : "elle reviendrait"}.</p>}
      <LotTable devis={devis} lotId={lotId} engine={engineLot && figures.engine > 0} editable={editable} onOpenWork={onOpenWork} />
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
