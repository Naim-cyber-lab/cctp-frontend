import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Plus, RotateCcw, Search, Upload, X } from "lucide-react";
import { confirmPriceImport, createPriceReference, deletePriceLibraryFile, getPriceLibrary, listPriceReferences, previewPriceImport, updatePriceReference } from "../api/client";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const UNITS = ["m²", "ml", "m³", "u", "ens", "forfait", "kg", "h"];
const date = (value) => new Date(value).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });

/** Bibliothèque agence › DPGF › Références de prix : UNE mémoire économique (saisies, devis importés et validés, estimations MOE, offres).
 *  Un devis importé n'est jamais enregistré tel quel : les lignes détectées sont montrées, l'utilisateur confirme celles qui sont ambiguës. */
export function PriceReferences({ canWrite = true }) {
  const [filters, setFilters] = useState({ q: "", lot: "", unit: "", source: "", project: "", dateFrom: "", dateTo: "" });
  const [archived, setArchived] = useState(false);
  const [data, setData] = useState({ total: 0, matching: 0, items: [], facets: { lots: [], units: [], sources: [], projects: [] }, sources: {} });
  const [legacy, setLegacy] = useState(null);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false), [preview, setPreview] = useState(null);
  const file = useRef(null);
  const load = useCallback(() => listPriceReferences({ ...filters, status: archived ? "ARCHIVED" : "ACTIVE" }).then(setData).catch((reason) => setError(reason.message)), [filters, archived]);
  useEffect(() => { const timer = setTimeout(load, 220); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { getPriceLibrary().then(setLegacy).catch(() => {}); }, [data.total]);
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const onFile = async (event) => {
    const chosen = event.target.files?.[0]; event.target.value = "";
    if (!chosen) return;
    setError(""); setMessage("");
    try { setPreview(await previewPriceImport(chosen)); } catch (reason) { setError(reason.message); }
  };
  const archive = async (item) => { try { await updatePriceReference(item.id, { status: archived ? "ACTIVE" : "ARCHIVED" }); await load(); } catch (reason) { setError(reason.message); } };
  return <section className="price-library price-references" data-price-library data-price-references>
    <header className="price-references-head">
      <div><h2>Références de prix</h2><p>La mémoire économique de l’agence : chaque prix cite sa source et n’est jamais appliqué sans votre clic.</p></div>
      {canWrite && <div className="price-references-actions">
        <button type="button" className="secondary" data-price-import onClick={() => file.current?.click()}><Upload size={15} /> Importer un devis</button>
        <input ref={file} type="file" hidden accept=".xlsx,.xlsm,.csv,.txt" data-price-library-file onChange={onFile} />
        <button type="button" className="primary" data-price-add onClick={() => setAdding(true)}><Plus size={15} /> Ajouter une référence</button>
      </div>}
    </header>
    {message && <div className="price-message" data-price-library-message>{message}</div>}
    {error && <div className="err" data-price-library-error role="alert">{error}</div>}
    <div className="price-filters" data-price-filters>
      <label className="library-search"><Search size={15} /><input type="search" data-price-search value={filters.q} onChange={set("q")} placeholder="Rechercher un ouvrage…" aria-label="Rechercher dans les références de prix" /></label>
      <select data-price-filter="lot" value={filters.lot} onChange={set("lot")} aria-label="Lot"><option value="">Tous les lots</option>{data.facets.lots.map((lot) => <option key={lot} value={lot}>Lot {lot}</option>)}</select>
      <select data-price-filter="unit" value={filters.unit} onChange={set("unit")} aria-label="Unité"><option value="">Toutes les unités</option>{data.facets.units.map((unit) => <option key={unit}>{unit}</option>)}</select>
      <select data-price-filter="source" value={filters.source} onChange={set("source")} aria-label="Source"><option value="">Toutes les sources</option>{data.facets.sources.map((source) => <option key={source} value={source}>{data.sources[source] || source}</option>)}</select>
      <select data-price-filter="project" value={filters.project} onChange={set("project")} aria-label="Projet"><option value="">Tous les projets</option>{data.facets.projects.map((project) => <option key={project}>{project}</option>)}</select>
      <label className="price-date">Du <input type="date" data-price-filter="dateFrom" value={filters.dateFrom} onChange={set("dateFrom")} /></label>
      <label className="price-date">au <input type="date" data-price-filter="dateTo" value={filters.dateTo} onChange={set("dateTo")} /></label>
      <label className="inline-check"><input type="checkbox" data-price-show-archived checked={archived} onChange={(event) => setArchived(event.target.checked)} /> Archivées</label>
    </div>
    <div className="price-references-list" data-price-references-list>
      {data.items.length === 0
        ? <p className="panel-empty" data-price-empty>{data.total === 0 && !archived ? "Aucune référence pour l’instant : importez un ancien devis ou ajoutez un prix." : "Aucune référence ne correspond à votre recherche."}</p>
        : <div className="price-table-wrap"><table className="price-table" data-price-table>
          <thead><tr><th>Désignation</th><th>Unité</th><th>PU</th><th>Projet source</th><th>Date</th><th>Source</th><th aria-label="Actions" /></tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.id} data-price-row data-price-source={item.sourceType}>
            <td>{item.designation}</td><td>{item.unit || "—"}</td><td>{money.format(item.unitPrice)}</td>
            <td>{item.sourceProject || (item.sourceDocument || "").replace(/\.[^.]+$/, "") || "—"}</td><td>{date(item.sourceDate)}</td>
            <td><span className={`origin-badge o-${item.sourceType}`}>{item.sourceLabel}</span>{item.sourceDocument && <small className="price-doc"> {item.sourceDocument}</small>}</td>
            <td className="standard-actions">{canWrite && item.editable && <button type="button" data-price-archive title={archived ? "Restaurer" : "Archiver"} onClick={() => archive(item)}>{archived ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      {data.matching > data.items.length && <small>{data.items.length} références affichées sur {data.matching} : affinez la recherche.</small>}
    </div>
    {legacy?.files?.length > 0 && canWrite && <details className="price-legacy" data-price-library-files-wrap>
      <summary>Anciens imports ({legacy.files.length})</summary>
      <ul data-price-library-files>{legacy.files.map((entry) => <li key={entry.name} data-price-library-file-row><span><b>{entry.name}</b> <small>{entry.count} prix</small></span><button type="button" onClick={() => deletePriceLibraryFile(entry.name).then(() => { getPriceLibrary().then(setLegacy); load(); })}>Retirer</button></li>)}</ul>
    </details>}
    {adding && <AddReference onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setMessage("Référence enregistrée."); load(); }} />}
    {preview && <ImportPreview preview={preview} onClose={() => setPreview(null)} onImported={(count, name) => { setPreview(null); setMessage(`${count} référence${count > 1 ? "s" : ""} importée${count > 1 ? "s" : ""} depuis ${name}.`); load(); }} />}
  </section>;
}

function AddReference({ onClose, onSaved }) {
  const [form, setForm] = useState({ designation: "", unit: "ml", unitPrice: "", sourceType: "MANUAL", lotId: "" });
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await createPriceReference({ designation: form.designation.trim(), unit: form.unit, unitPrice: Number(String(form.unitPrice).replace(",", ".")), sourceType: form.sourceType, lotId: form.lotId }); onSaved(); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="estimate-documents price-modal" data-price-add-modal onSubmit={save}>
      <header><h2>Ajouter une référence</h2><button type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header>
      {error && <div className="err" role="alert">{error}</div>}
      <label>Ouvrage<input required minLength={3} data-price-add-designation value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} placeholder="Ex. Traitement joint de structure" /></label>
      <div className="price-modal-row">
        <label>Prix unitaire HT<input required type="number" min="0.01" step="0.01" data-price-add-price value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} /></label>
        <label>Unité<select data-price-add-unit value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label>Source<select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })}><option value="MANUAL">Manuel</option><option value="MOE_ESTIMATE">Estimation MOE</option></select></label>
      </div>
      <p className="price-modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button><button className="primary" disabled={busy} data-price-add-save>Enregistrer</button></p>
    </form>
  </div>;
}

function ImportPreview({ preview, onClose, onImported }) {
  const [units, setUnits] = useState({}); // unité confirmée pour chaque ligne « à confirmer »
  const [skipped, setSkipped] = useState({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const state = useMemo(() => preview.lines.map((line) => {
    const unit = line.unit || units[line.index] || "";
    return { ...line, unit, valid: !skipped[line.index] && Boolean(unit) };
  }), [preview, units, skipped]);
  const valid = state.filter((line) => line.valid);
  const pending = state.filter((line) => !line.unit && !skipped[line.index]);
  const confirm = async () => {
    setBusy(true); setError("");
    try { await confirmPriceImport({ file: preview.file, lines: valid.map((line) => ({ designation: line.designation, unit: line.unit, unitPrice: line.unitPrice, sheet: line.sheet, row: line.row })) }); onImported(valid.length, preview.file); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="estimate-documents price-modal price-import" role="dialog" aria-modal="true" aria-label="Valider les références détectées" data-price-import-preview>
      <header><h2>{preview.detected} référence{preview.detected > 1 ? "s" : ""} détectée{preview.detected > 1 ? "s" : ""}</h2><button type="button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></header>
      <p className="consult-hint">Fichier : <b>{preview.file}</b>. Rien n’est enregistré avant votre validation ; une ligne dont l’unité n’est pas reconnue doit être confirmée ou ignorée.</p>
      {error && <div className="err" role="alert">{error}</div>}
      <ul className="price-import-lines" data-price-import-lines>{state.map((line) => <li key={line.index} className={line.unit ? "ok" : "todo"} data-price-import-line={line.status} hidden={skipped[line.index]}>
        <span className="mark">{line.unit ? "✓" : "?"}</span>
        <span className="name">{line.designation}</span>
        {line.unit ? <span className="price">{money.format(line.unitPrice)} / {line.unit}</span>
          : <span className="price">{money.format(line.unitPrice)} <select data-price-import-unit aria-label={`Unité de ${line.designation}`} value={units[line.index] || ""} onChange={(event) => setUnits({ ...units, [line.index]: event.target.value })}><option value="">Unité à confirmer</option>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></span>}
        <button type="button" className="doc-action" title="Ignorer cette ligne" onClick={() => setSkipped({ ...skipped, [line.index]: true })}><X size={13} /></button>
      </li>)}</ul>
      <p className="price-modal-actions"><button type="button" className="secondary" onClick={onClose}>Annuler</button>
        <button type="button" className="primary" data-price-import-confirm disabled={busy || valid.length === 0 || pending.length > 0} onClick={confirm}>Valider {valid.length} référence{valid.length > 1 ? "s" : ""}</button></p>
      {pending.length > 0 && <small data-price-import-pending>{pending.length} ligne{pending.length > 1 ? "s" : ""} à confirmer ou ignorer avant de valider.</small>}
    </section>
  </div>;
}
