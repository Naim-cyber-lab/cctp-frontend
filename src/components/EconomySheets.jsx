import { useCallback, useEffect, useState } from "react";
import { archiveAgencyReference, createAgencyReference, listAgencyReferences, listEconomySheets, updateAgencyReference } from "../api/client";
import { money } from "./DevisPlatrerie";

const FILTERS = [["all", "Tout"], ["agency", "Personnalisé par l’agence"], ["history", "Historique"], ["standard", "Standard Calepin"]];
const errorText = (reason) => reason?.detail?.message || reason?.message || "Une erreur est survenue";
const range = (price) => (price?.min != null && price?.max != null ? `${money.format(price.min)} – ${money.format(price.max)}` : null);

/** Économie › Prix : UNE fiche par poste (référence agence, historique, standard Calepin). Remplace les deux parcours « Références de prix » et « Historique de prix » qui montraient le même poste deux fois. */
export function EconomySheets({ onNavigateSection, onOpenRule, canWrite, query = "", origin, onOriginChange, onOpenOperations }) {
  const [sheets, setSheets] = useState(null);
  const [edit, setEdit] = useState({});
  const [versions, setVersions] = useState({});
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setSheets(await listEconomySheets({ granularity: "DPGF", origin, ...(query.trim() ? { q: query.trim() } : {}) }));
      setError("");
    } catch (reason) { setError(errorText(reason)); }
  }, [origin, query]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn) => { setError(""); try { await fn(); await load(); } catch (reason) { setError(errorText(reason)); } };
  const save = (sheet) => act(async () => {
    const price = Number(edit[sheet.itemKey]);
    if (sheet.agencyReferenceId) await updateAgencyReference(sheet.agencyReferenceId, { unit_price_eur: price });
    else await createAgencyReference({ item_key: sheet.itemKey, granularity: "DPGF", unit: sheet.unit, unit_price_eur: price });
    const next = { ...edit }; delete next[sheet.itemKey]; setEdit(next);
  });
  const showVersions = async (sheet) => {
    if (versions[sheet.itemKey]) { const next = { ...versions }; delete next[sheet.itemKey]; setVersions(next); return; }
    const all = await listAgencyReferences({ item_key: sheet.itemKey, include_archived: "true" }).catch(() => ({ references: [] }));
    setVersions({ ...versions, [sheet.itemKey]: all.references || [] });
  };
  return <section data-economy-sheets>
    {/* ECONOMICS-PRICE-HUB : un seul endroit pour ajouter et importer les prix ; chaque entrée ouvre la vue qui sait le faire */}
    {canWrite && <div className="economy-actions" data-economy-actions style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="primary" data-economy-add onClick={() => onNavigateSection?.("references")}>+ Ajouter un prix</button>
      <details className="row-menu" data-economy-import><summary className="secondary" role="button">Importer des prix ▾</summary><div className="row-menu-list" role="menu">
        <button type="button" role="menuitem" data-economy-import-file onClick={() => onNavigateSection?.("references")}>Importer un fichier Excel / CSV</button>
        <button type="button" role="menuitem" data-economy-import-estimate onClick={() => onNavigateSection?.("history")}>Importer une estimation ou un ancien DPGF</button></div></details>
    </div>}
    <nav className="library-filters" aria-label="Origine" data-library-origin-filters style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>{FILTERS.map(([id, label]) => <button key={id} type="button" className={origin === id ? "active" : "secondary"} data-library-origin={id} aria-pressed={origin === id} onClick={() => onOriginChange(id)}>{label}</button>)}</nav>
    {error && <div className="err" role="alert" data-economy-error>{error}</div>}
    {sheets === null ? <p className="muted">Chargement…</p> : !sheets.sheets.length ? <p className="muted" data-economy-empty>Aucun poste ne correspond à ce filtre.</p>
      : sheets.sheets.map((sheet) => <article key={sheet.itemKey} className="price-card economy-sheet" data-economy-sheet={sheet.itemKey} data-customized={sheet.customized ? "1" : "0"} style={{ border: "1px solid var(--border, #d8dee4)", borderRadius: 8, padding: 12, margin: "8px 0" }}>
        <h3 style={{ margin: 0 }}>{sheet.label} <small className="muted">{sheet.unit}</small></h3>
        <ul style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>
          <li data-sheet-agency><b>Référence agence</b> : {edit[sheet.itemKey] !== undefined ? <input type="number" min="0" step="any" aria-label="Prix de l’agence" data-sheet-edit-price value={edit[sheet.itemKey]} onChange={(event) => setEdit({ ...edit, [sheet.itemKey]: event.target.value })} />
            : sheet.agency ? <b>{money.format(sheet.agency.unitPriceHT)}/{sheet.unit}</b> : <span className="muted">—</span>}</li>
          <li data-sheet-history><b>Historique</b> : {sheet.history.operations ? <>{sheet.history.operations} opération{sheet.history.operations > 1 ? "s" : ""} · médiane <b>{money.format(sheet.history.median)}/{sheet.unit}</b></> : <span className="muted">aucune opération</span>}</li>
          <li data-sheet-standard><b>Standard Calepin</b> : {sheet.standard ? <><b>{money.format(sheet.standard.unitPriceHT)}/{sheet.unit}</b>{range(sheet.standard) ? <> · fourchette {range(sheet.standard)}/{sheet.unit}</> : null} <small className="muted">({sheet.standard.label})</small></> : <span className="muted">—</span>}</li>
        </ul>
        <div className="price-library-actions">
          {canWrite && (edit[sheet.itemKey] === undefined
            ? <button type="button" className="secondary" data-sheet-edit onClick={() => setEdit({ ...edit, [sheet.itemKey]: sheet.agency?.unitPriceHT ?? sheet.standard?.unitPriceHT ?? "" })}>{sheet.agency ? "Modifier la référence agence" : "Définir le prix de mon agence"}</button>
            : <button type="button" className="primary" data-sheet-save disabled={!(Number(edit[sheet.itemKey]) > 0)} onClick={() => save(sheet)}>Enregistrer</button>)}
          {(sheet.rules || []).length > 0 && <button type="button" className="secondary" data-sheet-rule onClick={() => onOpenRule?.(sheet.rules[0].rule_key)}>{["CREATE_MAIN_LINE", "CREATE_PLUS_VALUE", "CREATE_ACCESSORY_LINE", "CREATE_OPTION_LINE", "CREATE_ADMIN_LINE"].includes(sheet.rules[0].effect) ? "Voir la règle DPGF qui crée ce poste" : "Voir la règle DPGF qui agit sur ce poste"}</button>}
          {sheet.history.operations > 0 && <button type="button" className="secondary" data-sheet-operations onClick={() => onOpenOperations?.(sheet)}>Voir les opérations</button>}
          {canWrite && sheet.customized && <button type="button" className="secondary" data-sheet-revert onClick={() => act(() => archiveAgencyReference(sheet.agencyReferenceId))}>Revenir au standard</button>}
          {sheet.versions > 0 && <button type="button" className="link-button" data-sheet-versions onClick={() => showVersions(sheet)}>{sheet.versions} version{sheet.versions > 1 ? "s" : ""} antérieure{sheet.versions > 1 ? "s" : ""}</button>}
        </div>
        {versions[sheet.itemKey] && <ul data-sheet-version-list className="muted">{versions[sheet.itemKey].flatMap((ref) => [...(ref.versions || []).map((v, i) => <li key={`${ref.agency_price_reference_id}-${i}`}>{money.format(v.unit_price_eur)} jusqu’au {String(v.replaced_at).slice(0, 10)}</li>), ...(ref.status === "ARCHIVED" ? [<li key={`${ref.agency_price_reference_id}-a`}>{money.format(ref.unit_price_eur)} — archivée</li>] : [])])}</ul>}
      </article>)}
  </section>;
}
