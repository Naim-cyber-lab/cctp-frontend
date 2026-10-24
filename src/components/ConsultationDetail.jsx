import { consultationStatusLabel, offerStatusLabel } from "../utils/statuses";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, Eye, FileDown, LoaderCircle, Send, Trash2 } from "lucide-react";
import { apiFetch } from "../api/client";
import { chapters } from "../data/chapters";
import { ConsultationOps } from "./ConsultationOps";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const STEPS = ["Lots", "Entreprises", "Dossier", "Date limite", "Vérification", "Envoyer"];
const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const lotTitle = (id) => chapters.find((item) => item.id === id)?.title || `Lot ${id}`;
const API = import.meta.env.VITE_API_URL || "/api";
/** Ouvre un document du dossier : PDF dans un nouvel onglet, autres fichiers en téléchargement. */
async function openDocument(path, name) {
  const response = await fetch(`${API}${path}`, { credentials: "include" });
  if (!response.ok) throw new Error("Impossible d'ouvrir ce document");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (blob.type === "application/pdf" || /\.(png|jpe?g|txt)$/i.test(name)) window.open(url, "_blank", "noopener");
  else { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const fold = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Options à chiffrer : définies par le MOE, identiques pour toutes les entreprises du lot, figées dans l'indice du DCE. */
function OptionsEditor({ id, data, run }) {
  const [items, setItems] = useState(() => data.options || []);
  const [dirty, setDirty] = useState(false);
  const change = (list) => { setItems(list); setDirty(true); };
  const patch = (i, p) => change(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const published = data.status !== "DRAFT" && data.status !== "READY";
  return (
    <div className="options-editor" data-consult-options>
      <h4>Options à chiffrer</h4>
      <p className="consult-hint">Prestations facultatives que les entreprises doivent chiffrer à part de leur prix de base. Elles sont les mêmes pour toutes les entreprises du lot et figées dans le dossier envoyé.{published ? " Le dossier est déjà publié : une modification impose un nouvel indice." : ""}</p>
      {items.map((o, i) => <div className="portal-option" key={o.id || i} data-consult-option>
        <label>Intitulé<input type="text" data-consult-option-label value={o.label} onChange={(e) => patch(i, { label: e.target.value })} /></label>
        <label>Lot<select data-consult-option-lot value={o.lotId} onChange={(e) => patch(i, { lotId: e.target.value })}>{data.lots.map((l) => <option key={l.lotId} value={l.lotId}>Lot {l.lotId} · {l.title}</option>)}</select></label>
        <label>Mode de chiffrage<select data-consult-option-mode value={o.pricingMode} onChange={(e) => patch(i, { pricingMode: e.target.value })}><option value="LUMP">Prix forfaitaire</option><option value="UNIT">Prix unitaire × quantité</option></select></label>
        {o.pricingMode === "UNIT" && <><label>Unité<input type="text" data-consult-option-unit value={o.unit || ""} onChange={(e) => patch(i, { unit: e.target.value })} /></label>
          <label>Quantité<input type="number" min="0" step=".01" data-consult-option-qty value={o.quantity ?? ""} onChange={(e) => patch(i, { quantity: e.target.value })} /></label></>}
        <label>Chiffrage obligatoire<select data-consult-option-required value={o.required ? "1" : "0"} onChange={(e) => patch(i, { required: e.target.value === "1" })}><option value="0">Non</option><option value="1">Oui</option></select></label>
        <label style={{ gridColumn: "1 / -1" }}>Description<textarea rows={2} data-consult-option-desc value={o.description || ""} onChange={(e) => patch(i, { description: e.target.value })} /></label>
        <button type="button" className="icon" aria-label="Supprimer l'option" onClick={() => change(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
      </div>)}
      {items.length === 0 && <p className="consult-hint">Aucune option à chiffrer.</p>}
      <div className="consult-buttons">
        <button type="button" data-consult-add-option disabled={!data.lots.length} onClick={() => change([...items, { id: Math.random().toString(36).slice(2, 12), lotId: data.lots[0].lotId, label: "", description: "", pricingMode: "LUMP", unit: "", quantity: "", required: false }])}>Ajouter une option à chiffrer</button>
        {dirty && <button type="button" className="primary" data-consult-save-options onClick={() => run(async () => { const r = await apiFetch(`/consultations/${id}/options`, { method: "PUT", body: JSON.stringify({ options: items }) }); setItems(r.options); setDirty(false); })}>Enregistrer les options</button>}
      </div>
    </div>
  );
}

export function ConsultationDetail({ id, project, initialTab, onBack }) {
  const [data, setData] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [links, setLinks] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState(null);
  const [opsTab, setOpsTab] = useState(initialTab || "tracking");
  const [consultMenu, setConsultMenu] = useState(false);
  const submittedCount = (data?.companies || []).filter((company) => company.status === "SUBMITTED").length;
  // Une action principale selon l'état ; les autres (prolonger, clôturer, rouvrir, historique, annuler) sont dans •••
  const cta = !data ? null : ["PUBLISHED", "IN_PROGRESS"].includes(data.status) ? (submittedCount > 0 ? { label: "Analyser les offres", tab: "compare" } : { label: "Voir le suivi", tab: "tracking" })
    : ["CLOSED", "ANALYSIS"].includes(data.status) ? { label: "Voir l'analyse", tab: "compare" } : data.status === "AWARDED" ? { label: "Voir l'attribution", tab: "award" } : null;
  const [opsKey, setOpsKey] = useState(0);
  const [extend, setExtend] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const detail = await apiFetch(`/consultations/${id}`);
      setData(detail);
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { refresh(); apiFetch("/companies").then((d) => setDirectory(d.companies)).catch(() => {}); }, [refresh]);
  const run = async (fn) => { setBusy(true); setError(""); try { await fn(); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  if (!data) return <div className="quotes-loading"><LoaderCircle className="spin" /> {error || "Chargement…"}</div>;
  const editable = ["DRAFT", "READY"].includes(data.status);
  const save = (patch) => run(async () => { setData(await apiFetch(`/consultations/${id}`, { method: "PUT", body: JSON.stringify(patch) })); });
  const lotsPatch = (lots) => save({ lots });
  const currentLots = data.lots.map((l) => ({ lotId: l.lotId, estimateAmount: l.estimateAmount }));
  const toggleLot = (lotId) => lotsPatch(currentLots.some((l) => l.lotId === lotId) ? currentLots.filter((l) => l.lotId !== lotId) : [...currentLots, { lotId, estimateAmount: null }]);
  const setEstimate = (lotId, value) => lotsPatch(currentLots.map((l) => (l.lotId === lotId ? { ...l, estimateAmount: value === "" ? null : Number(value) } : l)));
  const companiesPatch = (list) => save({ companies: list.map((c) => ({ companyId: c.companyId, invitedLots: c.invitedLots })) });
  const addCompany = (companyId) => companiesPatch([...data.companies, { companyId, invitedLots: data.lots.map((l) => l.lotId) }]);
  const removeCompany = (companyId) => companiesPatch(data.companies.filter((c) => c.companyId !== companyId));
  const toggleCompanyLot = (company, lotId) => companiesPatch(data.companies.map((c) => (c.companyId === company.companyId ? { ...c, invitedLots: c.invitedLots.includes(lotId) ? c.invitedLots.filter((l) => l !== lotId) : [...c.invitedLots, lotId] } : c)));
  const setStatus = (status) => run(async () => { await apiFetch(`/consultations/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); });
  const publish = (path) => run(async () => { const result = await apiFetch(`/consultations/${id}/${path}`, { method: "POST" }); setLinks(result.invitations); });
  const download = async (revision) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/consultations/${id}/dce.pdf?revision=${revision}`, { credentials: "include" });
    if (!response.ok) return setError("Impossible de générer le DCE");
    const url = URL.createObjectURL(await response.blob()); const a = document.createElement("a"); a.href = url; a.download = `DCE-${revision}.pdf`; a.click(); URL.revokeObjectURL(url);
  };
  const openHistory = async (companyId) => { try { setHistory(await apiFetch(`/companies/${companyId}/history`)); } catch (e) { setError(e.message); } };
  const projectLots = (project?.selected || data.lots.map((l) => l.lotId)).filter((lotId) => lotId && !String(lotId).startsWith("__"));
  const nextIndex = data.nextRevisionLabel || "A";
  const lotsWithoutEstimate = data.lots.filter((l) => !l.estimateAmount);
  const current = data.revisions.find((r) => r.active);
  const previousRevision = current && data.revisions.find((r) => r.index === current.previousIndex);
  const lotTitles = data.lots.map((l) => fold(l.title));
  const matches = (company) => company.trades.some((trade) => lotTitles.some((title) => title.includes(fold(trade)) || fold(trade).includes(title)));
  const available = directory.filter((c) => !data.companies.some((l) => l.companyId === c.id));
  const habitual = available.filter(matches);
  const others = available.filter((c) => !matches(c));
  const optionLabel = (c) => `${c.name}${c.projects ? ` — ${c.projects} projet${c.projects > 1 ? "s" : ""} précédent${c.projects > 1 ? "s" : ""}` : ""}`;
  const checks = [
    { ok: data.lots.length > 0, text: data.lots.length ? `${data.lots.length} lot${data.lots.length > 1 ? "s" : ""} consulté${data.lots.length > 1 ? "s" : ""}` : "Aucun lot sélectionné" },
    { ok: data.companies.length > 0, text: data.companies.length ? `${data.companies.length} entreprise${data.companies.length > 1 ? "s" : ""} invitée${data.companies.length > 1 ? "s" : ""}` : "Aucune entreprise sélectionnée" },
    { ok: Boolean(data.responseDeadline), text: data.responseDeadline ? `Réponse avant le ${dateTime.format(new Date(data.responseDeadline))}` : "Date limite non renseignée" },
    { ok: !lotsWithoutEstimate.length, warn: true, text: !lotsWithoutEstimate.length ? "Estimation MOE renseignée pour chaque lot (jamais visible des entreprises)" : `Estimation manquante pour : ${lotsWithoutEstimate.map((l) => `lot ${l.lotId} · ${l.title}`).join(" ; ")} (facultatif : elle sert à comparer les offres)`, lots: lotsWithoutEstimate },
    { ok: data.companies.every((c) => c.email), warn: true, text: data.companies.every((c) => c.email) ? "Toutes les entreprises ont une adresse e-mail" : "Une entreprise n'a pas d'e-mail : vous devrez lui transmettre le lien vous-même" },
  ];
  const blocking = checks.slice(0, 3).some((c) => !c.ok);

  return (
    <section className="consult-detail" data-consult-detail>
      <nav className="dpgf-breadcrumb consult-breadcrumb" data-consult-breadcrumb aria-label="Fil d’Ariane"><button type="button" data-breadcrumb-consultations onClick={onBack}>Consultations</button><span aria-hidden="true">/</span><b aria-current="page" data-breadcrumb-current>{data.name || "Consultation"}</b></nav>
      <div className="consult-title">
        <div><input aria-label="Nom" value={data.name} disabled={!editable} data-consult-name onChange={(e) => setData({ ...data, name: e.target.value })} onBlur={() => editable && save({ name: data.name })} /><small>{data.cctpName}{data.currentRevision ? ` · version publiée : indice ${data.currentRevision}` : ""}</small></div>
        {data.companies.length > 0 && data.companies.every((c) => c.status === "DECLINED") && !["DRAFT", "READY"].includes(data.status)
          ? <span className="consult-status s-CANCELLED" data-consult-status="ALL_DECLINED">Toutes déclinées</span>
          : <span className={`consult-status s-${data.status}`} data-consult-status={data.status}>{consultationStatusLabel(data.status, data.statusLabel)}</span>}
      </div>
      {error && <div className="quotes-error" data-consult-error>{error}</div>}

      {editable && (
        <>
          <ol className="wizard-steps" data-consult-wizard>{STEPS.map((label, index) => <li key={label}><button className={index === step ? "active" : index < step ? "done" : ""} data-wizard-step={index + 1} onClick={() => setStep(index)}><b>{index + 1}</b> {label}</button></li>)}</ol>
          <article className="consult-card" data-wizard-panel={step + 1}>
            {step === 0 && <>
              <h3>1 · Lots à consulter</h3>
              <p className="consult-hint">Les lots viennent directement de votre CCTP. L'estimation est préremplie depuis votre DPGF : elle reste <b>confidentielle</b> (jamais visible des entreprises).</p>
              <table className="consult-table compact"><thead><tr><th /><th>Lot</th><th>Estimation MOE (€ HT)</th></tr></thead><tbody>
                {projectLots.map((lotId) => { const lot = data.lots.find((l) => l.lotId === lotId); return <tr key={lotId} data-consult-lot={lotId}><td><input type="checkbox" checked={Boolean(lot)} data-consult-lot-check onChange={() => toggleLot(lotId)} /></td><td>{lotId} · {lot?.title || lotTitle(lotId)}</td><td>{lot ? <input type="number" min="0" defaultValue={lot.estimateAmount ?? ""} data-consult-estimate placeholder="—" onBlur={(e) => String(lot.estimateAmount ?? "") !== e.target.value && setEstimate(lotId, e.target.value)} /> : "—"}</td></tr>; })}
              </tbody></table>
            </>}
            {step === 1 && <>
              <h3>2 · Entreprises consultées</h3>
              <label>Ajouter depuis votre annuaire
                <select value="" data-consult-add-company onChange={(e) => e.target.value && addCompany(e.target.value)}>
                  <option value="">{available.length ? "Choisir une entreprise…" : "Annuaire vide : ajoutez des entreprises dans l'onglet Annuaire"}</option>
                  {habitual.length > 0 && <optgroup label="Mes entreprises habituelles (même corps d'état)">{habitual.map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}</optgroup>}
                  {others.length > 0 && <optgroup label="Autres entreprises de mon annuaire">{others.map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}</optgroup>}
                </select>
              </label>
              {!data.companies.length && <p className="consult-empty" data-consult-no-company>Aucune entreprise pour l'instant : choisissez-en dans votre annuaire ci-dessus.</p>}
              <table className="consult-table compact" hidden={!data.companies.length}><thead><tr><th>Entreprise</th><th>Lots invités</th><th /></tr></thead><tbody>
                {data.companies.map((c) => <tr key={c.linkId} data-consult-company={c.companyId}><td><b>{c.name}</b><small>{c.email || "pas d'e-mail"}</small></td><td>{data.lots.map((l) => <label key={l.lotId} className="inline-check"><input type="checkbox" checked={c.invitedLots.includes(l.lotId)} onChange={() => toggleCompanyLot(c, l.lotId)} /> {l.lotId}</label>)}</td><td><button className="icon" title="Voir l'historique" data-company-history onClick={() => openHistory(c.companyId)}>Historique</button><button className="icon" title="Retirer" onClick={() => removeCompany(c.companyId)}><Trash2 size={14} /></button></td></tr>)}
              </tbody></table>
            </>}
            {step === 2 && <>
              <h3>3 · Dossier envoyé</h3>
              <p className="consult-hint">À l'envoi, le dossier est <b>figé</b> en une version : une modification ultérieure du CCTP ne change jamais ce que les entreprises ont reçu. Cliquez sur un document pour le consulter.</p>
              <ul className="consult-docs" data-consult-docs>
                {data.lots.map((l) => <li key={l.lotId}><button type="button" className="doc-link" data-consult-doc={`cctp-${l.lotId}`} onClick={() => openDocument(`/consultations/${id}/dossier/cctp.pdf?lot=${l.lotId}`, `CCTP-lot-${l.lotId}.pdf`).catch((e) => setError(e.message))}><Eye size={14} /> CCTP — lot {l.lotId} · {l.title}</button></li>)}
                {data.documents.map((d) => <li key={d.name}><button type="button" className="doc-link" data-consult-doc={d.id || d.name} onClick={() => openDocument(d.name === "CCTP.pdf" ? `/consultations/${id}/dossier/cctp.pdf` : d.name === "DPGF.xlsx" ? `/consultations/${id}/dossier/dpgf.xlsx` : `/consultations/${id}/dossier/documents/${d.id}`, d.name).catch((e) => setError(e.message))}><Eye size={14} /> {d.name}{d.size ? <small> ({Math.round(d.size / 1024)} Ko)</small> : null}</button></li>)}
              </ul>
              <OptionsEditor id={id} data={data} run={run} />
            </>}
            {step === 3 && <>
              <h3>4 · Date limite de remise des offres</h3>
              <label>Date et heure<input type="datetime-local" data-consult-deadline value={toLocalInput(data.responseDeadline)} onChange={(e) => e.target.value && save({ responseDeadline: new Date(e.target.value).toISOString() })} /></label>
            </>}
            {step === 4 && <>
              <h3>5 · Vérification</h3>
              <ul className="consult-checks" data-consult-checks>{checks.map((c) => <li key={c.text} className={c.ok ? "ok" : c.warn ? "warn" : "bad"}>{c.ok ? "✓" : c.warn ? "!" : "✗"} {c.text}</li>)}</ul>
            </>}
            {step === 5 && <>
              <h3>6 · Envoyer</h3>
              <p data-consult-confirm>Vous allez publier la <b>première version du DCE</b> et l'envoyer à <b>{data.companies.length}</b> entreprise{data.companies.length > 1 ? "s" : ""}, avec une date limite {data.responseDeadline ? `au ${dateTime.format(new Date(data.responseDeadline))}` : "non renseignée"}.</p>
              <p className="consult-hint">Elle sera enregistrée comme <b>Indice {nextIndex}</b> afin de conserver l'historique des futurs envois. Vous n'avez rien à saisir.</p>
              <details className="consult-help" data-consult-help><summary>Qu'est-ce qu'une version du DCE ?</summary>
                <p>Une version correspond à l'état exact du dossier transmis aux entreprises à un instant donné. Si vous modifiez ensuite le CCTP, la DPGF ou les documents de consultation, vous pourrez créer une nouvelle version afin de conserver l'historique des dossiers reçus par chaque entreprise.</p></details>
              <details className="consult-help"><summary>Numérotation des versions</summary>
                <label>Convention<select value={data.revisionConvention} data-consult-convention onChange={(e) => saveSettings({ revisionConvention: e.target.value })}><option value="letters">Lettres (A, B, C…)</option><option value="zero">Numérique depuis 0 (0, 1, 2…)</option><option value="one">Numérique depuis 1 (1, 2, 3…)</option><option value="custom">Personnalisée</option></select></label>
                {data.revisionConvention === "custom" && <label>Libellés dans l'ordre, séparés par des virgules<input defaultValue={(data.settings?.revisionCustom || []).join(", ")} placeholder="ex. PRO, DCE1, DCE2" onBlur={(e) => saveSettings({ revisionCustom: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>}</details>
              <div className="consult-buttons"><button className="primary" data-consult-publish disabled={busy || data.status !== "READY"} onClick={() => publish("publish")}><Send size={15} /> Publier le dossier et inviter</button>{blocking && <span className="consult-hint">Complétez d'abord : lots, entreprises et date limite (étape 5).</span>}</div>
            </>}
            <div className="consult-buttons wizard-nav">
              <button disabled={step === 0} data-wizard-prev onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Précédent</button>
              {step < 5 && <button className="primary" data-wizard-next onClick={() => setStep(step + 1)}>Suivant <ArrowRight size={14} /></button>}
              <button className="danger" data-consult-cancel disabled={busy} onClick={() => confirm("Annuler cette consultation ?") && setStatus("CANCELLED")}>Annuler la consultation</button>
            </div>
          </article>
        </>
      )}

      {!editable && (
        <>
          {current && (
            <article className="consult-card version-bar" data-consult-version>
              <div><small>DCE actuellement publié</small><b>Indice {current.index}</b><span>Publié le {dateTime.format(new Date(current.createdAt))}{current.publishedBy ? ` par ${current.publishedBy}` : ""}</span></div>
              {previousRevision && <div><small>Version précédente</small><b>Indice {previousRevision.index}</b></div>}
              <button type="button" data-consult-history onClick={() => { setOpsTab("revisions"); setOpsKey((n) => n + 1); }}>Voir l'historique</button>
            </article>
          )}
          {["PUBLISHED", "IN_PROGRESS", "CLOSED"].includes(data.status) && (data.modifiedSinceRevision ? (
            <div className="consult-banner" data-consult-modified><div><b>Des modifications ont été apportées au projet depuis l'indice {data.currentRevision}.</b><br />Pour les transmettre aux entreprises, créez une nouvelle version du DCE. Elles travaillent toujours sur l'indice {data.currentRevision}.</div>
              <span className="banner-actions"><button type="button" className="secondary" data-consult-see-changes onClick={() => { setOpsTab("revisions"); setOpsKey((n) => n + 1); }}>Voir les modifications</button><button className="primary" data-consult-revision disabled={busy} onClick={() => { setOpsTab("revisions"); setOpsKey((n) => n + 1); }}>Créer l'indice {nextIndex}</button></span></div>
          ) : <p className="consult-hint version-ok" data-consult-uptodate>Le dossier actuellement publié est à jour.</p>)}
          <article className="consult-card ops-bar" data-consult-actions>
            <div className="ops-deadline"><small>Remise des offres avant le</small><b>{data.responseDeadline ? dateTime.format(new Date(data.responseDeadline)) : "—"}</b><span>{data.lots.map((l) => `Lot ${l.lotId}`).join(" · ")}</span></div>
            <div className="ops-summary" data-consult-summary><b>{data.companies.length} entreprise{data.companies.length > 1 ? "s" : ""} invitée{data.companies.length > 1 ? "s" : ""}</b><span>{submittedCount} offre{submittedCount > 1 ? "s" : ""} reçue{submittedCount > 1 ? "s" : ""}</span></div>
            <div className="consult-buttons ops-cta-row">
              {cta && <button className={data.modifiedSinceRevision ? "secondary" : "primary"} data-consult-cta onClick={() => { setOpsTab(cta.tab); setOpsKey((n) => n + 1); }}>{cta.label}</button>}
              <div className="ops-more consult-more">
                <button type="button" data-consult-more aria-haspopup="menu" aria-expanded={consultMenu} aria-label="Plus d’actions" onClick={() => setConsultMenu((value) => !value)}>•••</button>
                {consultMenu && <div className="sel-bar-menu consult-more-menu" role="menu" data-consult-menu onClick={() => setConsultMenu(false)}>
                  {["PUBLISHED", "IN_PROGRESS"].includes(data.status) && <button role="menuitem" data-consult-extend disabled={busy} onClick={() => setExtend({ deadline: toLocalInput(data.responseDeadline), reopen: false })}>Prolonger la date limite</button>}
                  {["PUBLISHED", "IN_PROGRESS"].includes(data.status) && <button role="menuitem" data-consult-close disabled={busy} onClick={() => setStatus("CLOSED")}>Clôturer la remise des offres</button>}
                  {data.status === "CLOSED" && <button role="menuitem" data-consult-analysis disabled={busy} onClick={() => setStatus("ANALYSIS")}>Passer à l'analyse</button>}
                  {data.status === "ANALYSIS" && <button role="menuitem" data-consult-award disabled={busy} onClick={() => setStatus("AWARDED")}>Marquer comme attribuée</button>}
                  {["CLOSED", "ANALYSIS"].includes(data.status) && !data.awards.length && <button role="menuitem" data-consult-reopen disabled={busy} onClick={() => setExtend({ deadline: "", reopen: true })}>Rouvrir la consultation</button>}
                  <button role="menuitem" data-consult-history-menu onClick={() => { setOpsTab("revisions"); setOpsKey((n) => n + 1); }}>Historique</button>
                  {!["AWARDED", "CANCELLED"].includes(data.status) && <button role="menuitem" className="danger" data-consult-cancel disabled={busy} onClick={() => confirm("Annuler cette consultation ?") && setStatus("CANCELLED")}>Annuler</button>}
                </div>}
              </div>
            </div>
          </article>
          <ConsultationOps key={opsKey} tab={opsTab} data={data} id={id} project={project} run={run} setLinks={setLinks} onError={setError} />
        </>
      )}

      {links.length > 0 && <article className="consult-card" data-consult-links><h3>Liens d'invitation</h3><small>Ils ont été envoyés par e-mail quand l'adresse est renseignée. Vous pouvez aussi les transmettre vous-même.</small><div className="consult-links">{links.map((l) => <div key={l.companyId}><span>{l.name} {l.emailSent ? <em className="ok">e-mail envoyé</em> : <em>e-mail non envoyé</em>}</span><code>{l.link}</code><button className="icon" onClick={() => navigator.clipboard?.writeText(l.link)}><Copy size={14} /></button></div>)}</div></article>}

      {extend && (
        <div className="consult-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setExtend(null)}>
          <div className="consult-modal" role="dialog" aria-modal="true" data-consult-extend-modal>
            <h3>{extend.reopen ? "Rouvrir la consultation" : "Prolonger la date limite"}</h3>
            <p className="consult-hint">Les liens déjà envoyés restent valables. Les entreprises qui n'ont pas remis d'offre sont prévenues par e-mail{extend.reopen ? " ; celles marquées « sans réponse » redeviennent actives" : ""}.</p>
            <label>Nouvelle date et heure limite<input type="datetime-local" data-consult-extend-input value={extend.deadline} onChange={(e) => setExtend({ ...extend, deadline: e.target.value })} /></label>
            <div className="consult-buttons"><button className="primary" data-consult-extend-confirm disabled={!extend.deadline || busy} onClick={() => run(async () => { await apiFetch(`/consultations/${id}/extend`, { method: "POST", body: JSON.stringify({ deadline: new Date(extend.deadline).toISOString(), reopen: extend.reopen }) }); setExtend(null); })}>Confirmer</button><button onClick={() => setExtend(null)}>Annuler</button></div>
          </div>
        </div>
      )}
      {history && (
        <div className="consult-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setHistory(null)}>
          <div className="consult-modal" role="dialog" aria-modal="true" data-company-history-modal>
            <h3>{history.company.name} — historique</h3>
            {!history.history.length ? <p className="consult-hint">Cette entreprise n'a pas encore été consultée.</p> : <ul className="consult-docs">{history.history.map((h) => <li key={h.consultationId}><b>{h.name}</b> · {consultationStatusLabel(h.status, h.statusLabel)} · {offerStatusLabel(h.companyStatus)} · offres remises : {h.submittedLots.join(", ") || "aucune"}</li>)}</ul>}
            <div className="consult-buttons"><button onClick={() => setHistory(null)}>Fermer</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
