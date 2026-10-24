import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, File, FileUp, Info, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { analyzeProjectDocuments, getRecommendedDocuments } from "../api/client";

const FAMILIES = { cloison: "Cloison", doublage: "Doublage", plafond: "Plafond / faux-plafond", gaine: "Gaine / coffre", habillage: "Habillage", protection_feu: "Protection feu", acoustique: "Traitement acoustique", combles: "Combles / rampants", enduit: "Enduit / reprise" };
const SOURCE_TYPE = { PLAN: "Plan", NOTICE: "Notice", CCTP: "CCTP", STUDY: "Étude", TECHNICAL_DOCUMENT: "Document technique", OTHER: "Autre pièce" };

/**
 * Mode « Préremplir à partir de vos documents » : dépôt de plusieurs pièces, analyse croisée, ouvrages détectés (à corriger),
 * puis envoi vers le questionnaire EXISTANT (source de vérité). Aucun CCTP n'est rédigé depuis les documents.
 */
export function DocumentPrefill({ projectId, chapterId, chapterTitle, files, uploading, onUpload, onRemove, onBack, onApply, statsFor }) {
  const [analysis, setAnalysis] = useState(null);
  const [works, setWorks] = useState([]);
  const [assign, setAssign] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [adding, setAdding] = useState({ open: false, family: "cloison", label: "" });
  // documents conseillés : lus dans le référentiel central du lot courant (jamais codés ici)
  const [recommended, setRecommended] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [openInfo, setOpenInfo] = useState("");
  useEffect(() => { setRecommended(null); setShowAll(false); setOpenInfo(""); getRecommendedDocuments(chapterId).then(setRecommended).catch(() => setRecommended({ documents: [], highlighted: [], label: "" })); }, [chapterId]);
  // documents du projet déjà disponibles : sélectionnables (tous cochés par défaut, les nouveaux aussi)
  const [selected, setSelected] = useState(null);
  const [seen, setSeen] = useState([]);
  useEffect(() => {
    const ids = files.map((file) => file.id);
    const fresh = ids.filter((id) => !seen.includes(id));
    if (fresh.length) { setSeen([...seen, ...fresh]); setSelected([...(selected || []), ...fresh]); }
    else if (selected === null) setSelected([]);
    setSelected((current) => (current || []).filter((id) => ids.includes(id)));
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = selected || [];
  const highlighted = recommended ? (recommended.highlighted?.length ? recommended.highlighted : recommended.documents.slice(0, 6)) : [];
  const others = recommended ? recommended.documents.filter((doc) => !highlighted.some((item) => item.code === doc.code)) : [];

  const analyze = async () => {
    setBusy(true); setError("");
    try {
      const result = await analyzeProjectDocuments(projectId, chosen);
      setAnalysis(result);
      setWorks(result.works.map((work) => ({ ...work, kept: true })));
      setAssign({});
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  };
  const kept = works.filter((work) => work.kept);
  const unattached = useMemo(() => (analysis?.answers || []).filter((answer) => answer.workId === ""), [analysis]);
  const attachedCount = (analysis?.answers || []).filter((answer) => answer.workId !== "").length;
  const preview = analysis && statsFor ? statsFor(kept, analysis, assign) : null;
  const choose = (event) => { onUpload(Array.from(event.target.files || [])); event.target.value = ""; };
  const apply = () => onApply({ analysis, works: kept, assign });
  const patchWork = (id, patch) => setWorks(works.map((work) => (work.id === id ? { ...work, ...patch } : work)));
  const addWork = () => {
    const label = adding.label.trim();
    if (!label) return;
    const prefix = { cloison: "CLO", doublage: "DOU", plafond: "PLF", gaine: "GAI", habillage: "HAB", protection_feu: "PFI", acoustique: "ACO", combles: "COM", enduit: "END" }[adding.family] || "OUV";
    const taken = new Set(works.map((work) => work.id));
    let index = 1;
    while (taken.has(`${prefix}-${String(index).padStart(2, "0")}`)) index += 1;
    setWorks([...works, { id: `${prefix}-${String(index).padStart(2, "0")}`, family: adding.family, label, kept: true, detected: "manual", source: "ajouté par vous" }]);
    setAdding({ open: false, family: "cloison", label: "" });
  };

  return (
    <main className="assistant-page document-prefill" data-document-prefill>
      <header className="dp-head">
        <button type="button" className="secondary" onClick={onBack}><ArrowLeft size={15} /> Retour au choix de départ</button>
        <div>
          <h2>Préremplir {chapterTitle ? `le lot ${chapterTitle}` : "le lot"} à partir de vos documents</h2>
          <p>Déposez les pièces utiles : nous identifions les ouvrages et préremplissons le questionnaire. <b>Vous vérifiez ensuite chaque information</b> avant la rédaction du CCTP.</p>
        </div>
      </header>

      {!analysis && <>
        <section className={`dp-drop ${dragging ? "dragging" : ""}`} data-dp-drop
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); onUpload(Array.from(event.dataTransfer.files || [])); }}>
          <FileUp size={28} />
          <b>Glissez vos fichiers ici</b>
          <span>ou</span>
          <label className="primary dp-choose">Choisir des fichiers<input type="file" multiple hidden data-dp-file accept=".pdf,.docx,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.webp" onChange={choose} /></label>
          <small>PDF, DOCX, XLSX, images de plans… Plusieurs documents peuvent être analysés ensemble (jusqu'à 15 Mo chacun).</small>
          {uploading && <small><LoaderCircle size={13} className="spin" /> Ajout en cours…</small>}
        </section>

        <section className="dp-useful" data-dp-useful>
          <b>Documents particulièrement utiles{recommended?.label ? ` — ${recommended.label}` : ""}</b>
          {!recommended ? <small>Chargement…</small> : !recommended.documents.length ? <p className="consult-hint" data-dp-no-recommendation>Aucune recommandation de documents n'est encore définie pour ce lot. Vous pouvez tout de même importer vos documents : ils seront analysés.</p> : <>
            <ul data-dp-recommended>{[...highlighted, ...(showAll ? others : [])].map((doc) => <li key={doc.code} data-dp-doc={doc.code}>
              <span>{doc.label}</span>
              <button type="button" className="dp-info" aria-label={`Pourquoi « ${doc.label} » ?`} aria-expanded={openInfo === doc.code} title={doc.description} data-dp-info onClick={() => setOpenInfo(openInfo === doc.code ? "" : doc.code)}><Info size={13} /></button>
              {openInfo === doc.code && <small className="dp-doc-description" data-dp-description>{doc.description}</small>}
            </li>)}</ul>
            {others.length > 0 && <button type="button" className="dp-more" data-dp-more aria-expanded={showAll} onClick={() => setShowAll(!showAll)}><span>{showAll ? "Masquer les autres documents" : `Voir ${others.length} autre${others.length > 1 ? "s" : ""} document${others.length > 1 ? "s" : ""}`}</span><ArrowRight size={14} /></button>}
          </>}
          <small data-dp-optional>Aucun de ces documents n'est obligatoire. Plus le dossier contient d'informations pertinentes, plus le questionnaire pourra être prérempli.</small>
        </section>

        {files.length > 0 && <section className="dp-files" data-dp-files>
          <b>Documents du projet déjà disponibles</b>
          {files.map((file) => <label key={file.id} data-dp-file-row className="dp-file-row"><input type="checkbox" checked={chosen.includes(file.id)} data-dp-file-check onChange={(event) => setSelected(event.target.checked ? [...chosen, file.id] : chosen.filter((id) => id !== file.id))} /><File size={14} /><span><b>{file.filename}</b><small>{Math.max(1, Math.round(file.size / 1024))} Ko{file.chapterId && file.chapterId !== chapterId ? ` · déposé dans le lot ${file.chapterId}` : ""}</small></span>
            <button type="button" aria-label={`Retirer ${file.filename}`} onClick={(event) => { event.preventDefault(); onRemove(file); }}><X size={14} /></button></label>)}
          <label className="secondary dp-add-files" data-dp-add-files>Ajouter d'autres fichiers<input type="file" multiple hidden onChange={choose} /></label>
          <button type="button" className="primary" data-dp-analyze disabled={busy || uploading || !chosen.length} onClick={analyze}>{busy ? <><LoaderCircle size={15} className="spin" /> Analyse en cours… (un plan peut prendre quelques minutes)</> : `Analyser ${chosen.length} document${chosen.length > 1 ? "s" : ""} sélectionné${chosen.length > 1 ? "s" : ""}`}</button>
        </section>}
        {error && <div className="quotes-error" role="alert" data-dp-error>{error}</div>}
      </>}

      {analysis && <section className="dp-result" data-dp-result>
        <h3>Vos documents ont été analysés</h3>
        {(analysis.unreadDocuments?.length > 0 || analysis.warnings?.length > 0) && <div className="consult-banner" data-dp-warnings>
          {analysis.unreadDocuments?.length > 0 && <p>Pièces non lisibles (aucun texte extrait) : {analysis.unreadDocuments.join(", ")}.</p>}
          {(analysis.warnings || []).map((warning, index) => <p key={index}>{warning}</p>)}</div>}
        <ul className="dp-sources" data-dp-sources>{analysis.documents.map((doc) => <li key={doc.id}>{doc.filename} <small>· {SOURCE_TYPE[doc.sourceType]}{doc.analyzed ? "" : " · aucun texte exploitable"}{doc.recognizedAs?.length ? ` · reconnu comme : ${doc.recognizedAs.join(", ")}` : ""}</small></li>)}</ul>

        <h4>{kept.length} ouvrage{kept.length > 1 ? "s" : ""} détecté{kept.length > 1 ? "s" : ""}</h4>
        <p className="consult-hint">Conservez, renommez, supprimez ou ajoutez des ouvrages : les réponses sont ensuite rattachées aux bons ouvrages.</p>
        <div className="dp-works" data-dp-works>
          {works.map((work) => <div key={work.id} className={`dp-work ${work.kept ? "" : "off"}`} data-dp-work={work.id}>
            <b>{work.id}</b>
            <input value={work.label} aria-label="Nom de l'ouvrage" disabled={!work.kept} onChange={(event) => patchWork(work.id, { label: event.target.value })} />
            <select value={work.family} aria-label="Famille" disabled={!work.kept} onChange={(event) => patchWork(work.id, { family: event.target.value })}>{Object.entries(FAMILIES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
            <small>{work.source ? `${work.source}${work.page ? ` p.${work.page}` : ""}` : ""}</small>
            <button type="button" className="icon" aria-label={work.kept ? "Supprimer l'ouvrage" : "Rétablir l'ouvrage"} data-dp-work-toggle onClick={() => patchWork(work.id, { kept: !work.kept })}>{work.kept ? <Trash2 size={14} /> : <Plus size={14} />}</button>
          </div>)}
          {works.length === 0 && <p className="consult-hint">Aucun ouvrage identifié avec certitude : ajoutez-en un ci-dessous, ou revenez au questionnaire.</p>}
          {adding.open
            ? <div className="dp-work dp-add"><select value={adding.family} onChange={(event) => setAdding({ ...adding, family: event.target.value })}>{Object.entries(FAMILIES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
              <input autoFocus placeholder="Nom de l'ouvrage" value={adding.label} data-dp-add-label onChange={(event) => setAdding({ ...adding, label: event.target.value })} />
              <button type="button" className="primary" onClick={addWork} disabled={!adding.label.trim()}>Ajouter</button><button type="button" onClick={() => setAdding({ ...adding, open: false })}>Annuler</button></div>
            : <button type="button" className="secondary" data-dp-add-work onClick={() => setAdding({ ...adding, open: true })}><Plus size={14} /> Ajouter un ouvrage</button>}
        </div>

        {unattached.length > 0 && kept.length > 0 && <div className="dp-unattached" data-dp-unattached>
          <h4>{unattached.length} information{unattached.length > 1 ? "s" : ""} à rattacher à un ouvrage</h4>
          <p className="consult-hint">Ces informations ne désignent pas clairement un ouvrage : choisissez lequel (ou ignorez-les).</p>
          {unattached.map((answer, index) => <div className="dp-assign" key={index}><span><b>{answer.questionId}</b> {String(answer.value)}<small> — {answer.documentName}{answer.page ? ` p.${answer.page}` : ""}</small></span>
            <select value={assign[`${answer.questionId}|${index}`] ?? ""} onChange={(event) => setAssign({ ...assign, [`${answer.questionId}|${index}`]: event.target.value })}><option value="">Ignorer</option>{kept.map((work) => <option key={work.id} value={work.id}>{work.id} — {work.label}</option>)}</select></div>)}
        </div>}

        <div className="dp-summary" data-dp-summary>
          <div className="ok"><b>{(preview?.found ?? analysis.counts.found)}</b> informations trouvées dans les documents</div>
          <div className="verify"><b>{(preview?.toConfirm ?? analysis.counts.toConfirm)}</b> propositions à vérifier</div>
          <div className="missing"><b>{preview ? preview.missing : "—"}</b> informations restent à renseigner</div>
          <div className="conflict"><b>{analysis.counts.conflicts}</b> conflit{analysis.counts.conflicts > 1 ? "s" : ""} entre documents</div>
        </div>
        <p className="consult-hint">Rien n'est validé à votre place : chaque information reste modifiable et vous la confirmez dans le questionnaire.{attachedCount === 0 && unattached.length === 0 ? " Aucune information exploitable n'a été trouvée dans ces documents." : ""}</p>
        <div className="consult-buttons">
          <button type="button" onClick={() => setAnalysis(null)}>Ajouter / changer des documents</button>
          <button type="button" className="primary" data-dp-review onClick={apply}>Vérifier le questionnaire <ArrowRight size={15} /></button>
        </div>
      </section>}
    </main>
  );
}
