import { useCallback, useEffect, useRef, useState } from "react";
import { getDevis, getPriceReferences, getPriceSuggestions, saveDevis } from "../api/client";

const toNumber = (value) => (value === "" || value === null || value === undefined ? null : Number(String(value).replace(",", ".")));
const amountOf = (quantity, price) => (quantity === null || quantity === undefined || price === null || price === undefined ? null : Math.round(quantity * price * 100) / 100);

/** État du Devis d'un CCTP : lignes générées par le moteur (lot Plâtrerie), lignes libres de chaque lot, politique agence. Les saisies sont
 *  enregistrées automatiquement, regroupées ; elles ne modifient jamais les réponses du CCTP. */
export function useDevis(cctpId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState({});
  const [summaries, setSummaries] = useState({});
  const [references, setReferences] = useState({});
  const [saving, setSaving] = useState(false);
  const pending = useRef({ lines: {}, acknowledge: new Set(), manual: null, policy: null, customItems: null });
  const priceOrigins = useRef({}); // d'où vient le prix posé sur un élément : bibliothèque importée, marché attribué ; sinon saisi à la main
  const timer = useRef(null);

  const load = useCallback(() => (!cctpId ? Promise.resolve() : getDevis(cctpId)).then((next) => { if (next) { setData(next); setError(""); } }).catch((reason) => setError(reason.message || "Le Devis n'a pas pu être chargé.")), [cctpId]);
  useEffect(() => { setData(null); load(); return () => clearTimeout(timer.current); }, [load]);
  // mémoire de prix de l'agence : propositions sourcées, jamais appliquées sans clic
  useEffect(() => { setReferences({}); if (cctpId) getPriceReferences(cctpId).then((result) => setReferences(result.references || {})).catch(() => {}); }, [cctpId]);
  const refreshSuggestions = useCallback(() => { if (cctpId) getPriceSuggestions(cctpId).then((result) => { setSuggestions(result.suggestions || {}); setSummaries(result.summaries || {}); }).catch(() => {}); }, [cctpId]);
  useEffect(() => { setSuggestions({}); setSummaries({}); refreshSuggestions(); }, [cctpId, refreshSuggestions]);

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = { lines: {}, acknowledge: new Set(), manual: null, policy: null, customItems: null };
    setSaving(true);
    try {
      const payload = { lines: batch.lines, acknowledge: [...batch.acknowledge] };
      if (batch.manual) payload.manualLines = batch.manual;
      if (batch.policy) payload.policy = batch.policy;
      if (batch.customItems) payload.customItems = batch.customItems;
      const next = await saveDevis(cctpId, payload);
      // on garde ce qui est à l'écran pour les lignes libres (le serveur renvoie la même chose, sans faire sauter le curseur)
      setData((current) => ({ ...next, manualLines: batch.manual && current ? current.manualLines : next.manualLines }));
      setError("");
    } catch (reason) {
      setError(reason.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }, [cctpId]);
  const schedule = useCallback(() => { clearTimeout(timer.current); timer.current = setTimeout(flush, 700); }, [flush]);

  const patchLine = useCallback((line, change) => {
    const key = line.stableKey;
    if ("unitPrice" in change) { if (change._origin) priceOrigins.current[key] = change._origin; else delete priceOrigins.current[key]; }
    setData((current) => ({
      ...current,
      lines: current.lines.map((item) => {
        if (item.stableKey !== key) return item;
        const quantity = "quantity" in change ? { ...item.quantity, value: toNumber(change.quantity), unit: item.quantity?.unit || item.unit, source: "MANUAL" } : item.quantity;
        const unitPrice = "unitPrice" in change ? toNumber(change.unitPrice) : item.unitPrice;
        const unit = change.resetUnit ? item.ruleUnit : change.unit || item.unit;
        const unitSource = change.resetUnit ? "RULE" : change.unit ? "MANUAL" : item.unitSource;
        const noQuantity = quantity?.value === null || quantity?.value === undefined;
        const noPrice = unitPrice === null || unitPrice === undefined;
        const status = item.status === "TECHNIQUE_MODIFIE" && !("unitPrice" in change) ? item.status : noQuantity ? "A_COMPLETER" : noPrice ? "PRET" : "COMPLET";
        const priceSource = "unitPrice" in change ? (noPrice ? (item.standardPrice !== null && item.standardPrice !== undefined ? "STANDARD" : "NONE") : "CUSTOM") : item.priceSource;
        const shown = "unitPrice" in change && noPrice && item.standardPrice !== null && item.standardPrice !== undefined ? item.standardPrice : unitPrice;
        const infoSource = "unitPrice" in change ? (noPrice ? (shown !== null && shown !== undefined ? "AGENCY_STANDARD" : "NONE") : "MANUAL") : item.unitPriceInfo?.source;
        return { ...item, quantity: quantity && { ...quantity, source: noQuantity ? "NONE" : "MANUAL" }, unitPrice: shown, unitPriceInfo: { value: shown, source: infoSource }, unit, unitSource, status, priceSource, amount: amountOf(quantity?.value, shown), ...("unitPrice" in change ? { priceProvenance: change._provenance || null } : {}) };
      }),
    }));
    const entry = (pending.current.lines[key] ||= {});
    if ("quantity" in change) entry.quantity = { value: toNumber(change.quantity), unit: line.quantity?.unit || line.unit, source: "MANUAL" };
    if ("unitPrice" in change) { entry.unitPrice = toNumber(change.unitPrice); entry.provenance = change._provenance || null; }
    if (change.unit) { entry.unit = change.unit; entry.unitSource = "MANUAL"; }
    if (change.resetUnit) entry.resetUnit = true;
    schedule();
  }, [schedule]);

  const acknowledge = useCallback((line) => {
    pending.current.acknowledge.add(line.stableKey);
    setData((current) => ({ ...current, lines: current.lines.map((item) => (item.stableKey === line.stableKey ? { ...item, status: item.quantity?.value === null || item.quantity?.value === undefined ? "A_COMPLETER" : "COMPLET" } : item)) }));
    schedule();
  }, [schedule]);

  const setPolicy = useCallback((key, value) => {
    setData((current) => ({ ...current, policy: { ...current.policy, [key]: value } }));
    pending.current.policy = { ...(pending.current.policy || {}), [key]: value };
    schedule();
  }, [schedule]);

  // lignes libres (tous lots confondus, chacune rattachée à son lot)
  const writeManual = useCallback((list) => {
    setData((current) => ({
      ...current,
      manualLines: list.map((row) => {
        const quantity = toNumber(row.quantity?.value ?? row.quantity);
        const price = toNumber(row.unitPrice);
        return { ...row, quantity: { value: row.quantity?.value ?? row.quantity ?? null }, amount: amountOf(quantity, price), status: "MANUEL" };
      }),
    }));
    pending.current.manual = list.map((row) => ({ id: row.id, lotId: row.lotId || "", designation: row.designation, description: row.shortDescription || row.description || "", unit: row.unit, quantity: { value: toNumber(row.quantity?.value ?? row.quantity), unit: row.unit, source: "MANUAL" }, unitPrice: toNumber(row.unitPrice), policyId: row.policyId || "" }));
    schedule();
  }, [schedule]);
  const addManual = useCallback((lotId) => writeManual([...(data?.manualLines || []), { id: crypto.randomUUID(), lotId, designation: "", shortDescription: "", unit: "u", quantity: { value: null }, unitPrice: null }]), [data, writeManual]);
  const updateManual = useCallback((id, change) => writeManual((data?.manualLines || []).map((row) => (row.id === id ? { ...row, ...change } : row))), [data, writeManual]);
  const removeManual = useCallback((id) => writeManual((data?.manualLines || []).filter((row) => row.id !== id)), [data, writeManual]);

  // éléments que l'agence veut chiffrer à part : « ajouter » crée aussi l'élément libre correspondant dans le lot ; « compris » ou « retirer » le retire
  const saveCustomItems = useCallback((items, manualLines) => {
    setData((current) => ({ ...current, customItems: items }));
    pending.current.customItems = items;
    if (manualLines) writeManual(manualLines); else schedule();
  }, [schedule, writeManual]);

  // adopter explicitement les règles de chiffrage actuelles de l'agence (jamais rétroactif sinon)
  const syncAgencyRules = useCallback(async () => {
    try { await flush(); const next = await saveDevis(cctpId, { syncAgencyPolicy: true }); setData(next); } catch (reason) { setError(reason.message || "Mise à jour impossible."); }
  }, [flush, cctpId]);

  return { data, error, saving, suggestions, summaries, refreshSuggestions, syncAgencyRules, references, reload: load, patchLine, acknowledge, setPolicy, addManual, updateManual, removeManual, saveCustomItems };
}
