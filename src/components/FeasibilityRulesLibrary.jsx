import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api/client";
import "../feasibility-rules.css";

// EPIC FEAS-RULES-UX-V2 + LIBRARY-STANDARD-UX-01 : une règle de Faisabilité se lit en quatre questions — Quand s'applique-t-elle ? Que fait Calepin aujourd'hui ? Que veux-je changer ? Quel impact ?
// Langage métier uniquement : jamais d'identifiant de règle, de chemin technique, d'énumération brute ni de JSON à l'écran.
const MODES = [
  ["ADD", "Compléter le Standard Calepin", "La règle Calepin reste active. Votre agence ajoute des conditions ou des conséquences supplémentaires."],
  ["REPLACE", "Remplacer le Standard Calepin", "Votre règle prend la place de la règle Standard Calepin pour votre agence. Le comportement standard ne sera plus exécuté pour les nouveaux projets utilisant cette version."],
  ["DISABLE", "Désactiver pour mon agence", "Cette règle Standard Calepin ne sera plus appliquée dans les nouveaux projets de votre agence utilisant cette version. Le Standard Calepin n’est pas supprimé."],
];
const POINT_TYPES = [["ADD_STUDY_OR_ACTION", "Étude ou action à obtenir"], ["ADD_POINT_TO_SECURE", "Point à sécuriser"]];
const VISIBILITY = [["UNTIL_RESOLVED", "Afficher tant que le point n’est pas résolu"], ["ALWAYS", "Toujours afficher"], ["HIDDEN", "Ne pas afficher"]];
const STATUS_LABEL = { DRAFT: "Brouillon", PUBLISHED: "Publiée", ARCHIVED: "Archivée" };
const MODULE_BADGES = ["Cadrage", "Points à traiter", "Estimation", "Notice"];
const emptyRule = () => ({ rule_key: null, name: "", description: "", category: "TECHNICAL", mode: "ADD", base_rule_id: null, conditions: { operator: "AND", children: [] }, actions: [], priority: 500, notice_wording: "", notice_visibility: "UNTIL_RESOLVED" });
const errorText = (error) => error?.detail?.message || error?.message || "Une erreur est survenue";
const joinList = (items) => (items.length ? items.join(", ") : "");

function Badges({ items }) { return <span className="frl-badges">{items.map((item) => <span key={item} className={`frl-badge ${item === "Cadrage" ? "source" : ""}`}>{item}</span>)}</span>; }

/** « Ce que fait actuellement Calepin » : Quand / Estimation / Points à traiter / Notice, lus depuis la règle réellement enregistrée. */
function Behaviour({ rule, title = "Ce que fait actuellement Calepin" }) {
  return <section className="frl-behaviour" data-feasibility-behaviour>
    <h4>{title}</h4>
    <p><b>Quand ?</b></p>
    <ul>{rule.clauses.map((clause) => <li key={clause}>{clause}</li>)}</ul>
    <p><b>Estimation</b></p>
    {rule.effects.estimation.length ? <ul>{rule.effects.estimation.map((label) => <li key={label}>+ {label}</li>)}</ul> : <p className="muted">Aucun composant ajouté par cette règle.</p>}
    <p><b>Points à traiter</b></p>
    {rule.effects.points.length ? <ul>{rule.effects.points.map((label) => <li key={label}>+ {label}</li>)}</ul> : <p className="muted">Aucun point ajouté par cette règle.</p>}
    <p><b>Notice</b></p>
    {rule.effects.notice ? <p>{rule.effects.notice}</p> : <p className="muted">Aucune conséquence.</p>}
  </section>;
}

export function FeasibilityRulesLibrary({ canPublish = false, agencyName = "" }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [detail, setDetail] = useState(null);
  const [menu, setMenu] = useState(null);
  const [impact, setImpact] = useState(null);
  const [existing, setExisting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setData(await apiFetch("/feasibility-rules")); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { load(); }, [load]);
  const standardById = useMemo(() => Object.fromEntries((data?.standard || []).map((s) => [s.rule_id, s])), [data]);
  if (!data) return <section className="price-library" data-feasibility-rules>{error ? <div className="err" role="alert">{error}</div> : <p>Chargement…</p>}</section>;
  const fields = Object.fromEntries(data.vocabulary.fields.map((f) => [f.key, f]));
  const act = async (fn, done) => { setError(""); setMessage(""); try { const result = await fn(); await load(); if (done) setMessage(done); return result; } catch (e) { setError(errorText(e)); return null; } };
  const agencyFor = (ruleId) => data.agency.find((r) => r.base_rule_id === ruleId && r.status === "PUBLISHED" && r.mode !== "ADD");
  const stateOf = (standard) => { const mine = agencyFor(standard.rule_id); return mine ? (mine.mode === "DISABLE" ? "disabled" : "custom") : "active"; };
  const STATE_BADGE = { active: "Actif", custom: "Personnalisé par l’agence", disabled: "Désactivé pour l’agence" };
  const base = draft?.base_rule_id ? standardById[draft.base_rule_id] : null;

  const setCondition = (index, patch) => setDraft({ ...draft, conditions: { ...draft.conditions, children: draft.conditions.children.map((c, i) => (i === index ? { ...c, ...patch } : c)) } });
  const setAction = (index, patch) => setDraft({ ...draft, actions: draft.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)) });
  const removeAction = (index) => setDraft({ ...draft, actions: draft.actions.filter((_, i) => i !== index) });
  const save = async () => {
    const saved = await act(() => apiFetch("/feasibility-rules", { method: "PUT", body: JSON.stringify(draft) }), "Brouillon enregistré.");
    if (saved) setDraft({ ...draft, rule_key: saved.rule_key });
    return saved;
  };
  const showImpact = async () => { const saved = await save(); if (saved) setImpact(await act(() => apiFetch(`/feasibility-rules/${saved.rule_key}/impact`))); };
  const publish = (proposeExisting) => act(async () => {
    const saved = await save(); if (!saved) return null;
    const result = await apiFetch(`/feasibility-rules/${saved.rule_key}/publish`, { method: "POST", body: JSON.stringify({ propose_existing: proposeExisting }) });
    setDraft(null); setImpact(null); return result;
  }, proposeExisting ? "Règle publiée et proposée aux projets en cours." : "Règle publiée pour les nouveaux projets.");
  const edit = (rule) => { setImpact(null); setDetail(null); setDraft({ ...emptyRule(), ...rule }); };
  const startFrom = (standard, mode) => {
    setImpact(null); setDetail(null);
    const mine = agencyFor(standard.rule_id);
    if (mine) return setDraft({ ...emptyRule(), ...mine });   // ma version existante
    setDraft({ ...emptyRule(), mode, base_rule_id: standard.rule_id, name: mode === "DISABLE" ? `Ne pas appliquer : ${standard.name}` : standard.name,
      conditions: mode === "REPLACE" && standard.structured ? JSON.parse(JSON.stringify(standard.structured)) : { operator: "AND", children: [] } });
  };
  const disableNow = (standard) => act(async () => {
    const saved = await apiFetch("/feasibility-rules", { method: "PUT", body: JSON.stringify({ ...emptyRule(), mode: "DISABLE", base_rule_id: standard.rule_id, name: `Ne pas appliquer : ${standard.name}` }) });
    return apiFetch(`/feasibility-rules/${saved.rule_key}/publish`, { method: "POST", body: JSON.stringify({ propose_existing: false }) });
  }, "Règle désactivée pour votre agence (nouveaux projets). Le Standard Calepin n’est pas supprimé.");
  const reactivate = (standard) => { const mine = agencyFor(standard.rule_id); return act(() => apiFetch(`/feasibility-rules/${mine.rule_key}/archive`, { method: "POST", body: "{}" }), "Règle réactivée : les nouveaux projets reviennent au Standard Calepin."); };

  // comparaison Avant / Après et différences importantes
  const after = draft ? { estimation: draft.actions.filter((a) => a.type === "ADD_COMPONENT" && a.component_id).map((a) => data.vocabulary.components.find((c) => c.id === a.component_id)?.label).filter(Boolean),
    points: draft.actions.filter((a) => a.type !== "ADD_COMPONENT" && (a.label || "").trim()).map((a) => a.label.trim()), notice: draft.notice_wording.trim() && draft.notice_visibility !== "HIDDEN" ? draft.notice_wording.trim() : "" } : null;
  const before = base ? base.effects : { estimation: [], points: [], notice: "" };
  const kept = draft?.mode === "ADD" ? before : { estimation: [], points: [], notice: "" };
  const diff = draft ? [
    ...(draft.mode !== "ADD" ? before.estimation.filter((x) => !after.estimation.includes(x) || draft.mode === "DISABLE").map((x) => `− « ${x} » ne sera plus ajouté automatiquement`) : []),
    ...(draft.mode !== "ADD" ? before.points.filter((x) => !after.points.includes(x) || draft.mode === "DISABLE").map((x) => `− Le point « ${x} » ne sera plus créé`) : []),
    ...(draft.mode !== "DISABLE" ? after.estimation.filter((x) => !before.estimation.includes(x) || draft.mode === "ADD").map((x) => `+ « ${x} » sera ajouté à l’Estimation`) : []),
    ...(draft.mode !== "DISABLE" ? after.points.filter((x) => !before.points.includes(x) || draft.mode === "ADD").map((x) => `+ Le point « ${x} » sera créé dans les Points à traiter`) : []),
    ...(draft.mode !== "DISABLE" && after.notice ? ["+ Une mention sera ajoutée dans la Notice (Points restant à sécuriser)"] : []),
    ...(draft.mode === "DISABLE" && before.notice ? ["− La mention de la Notice liée à cette règle ne sera plus ajoutée"] : []),
  ] : [];
  const published = data.agency.filter((r) => r.status === "PUBLISHED");
  const replaced = published.filter((r) => r.mode === "REPLACE").length + (draft?.mode === "REPLACE" && !published.some((r) => r.rule_key === draft.rule_key) ? 1 : 0);
  const disabled = published.filter((r) => r.mode === "DISABLE").length + (draft?.mode === "DISABLE" && !published.some((r) => r.rule_key === draft.rule_key) ? 1 : 0);
  const conditionsText = (conditions) => (conditions.children || []).map((c) => `${fields[c.field]?.label || ""} ${data.vocabulary.operators.find((o) => o.code === c.operator)?.label || ""} ${[].concat(c.value || []).map((v) => fields[c.field]?.values.find((x) => x.code === v)?.label || v).join(" ou ")}`).join(" et ");

  return <section className="price-library frl" data-feasibility-rules>
    <header>
      <h2>Règles de faisabilité</h2>
      <p data-feasibility-intro><b>Les règles de Faisabilité transforment les informations du Cadrage en conséquences dans l’analyse du projet.</b> Une règle peut notamment faire apparaître un point à traiter, ajouter un composant dans l’Estimation, compléter la Notice de Faisabilité ou demander une information complémentaire.
        Les personnalisations de votre agence s’appliquent aux <b>nouveaux projets</b> utilisant la version publiée ; les projets déjà en cours ne changent pas automatiquement.</p>
      <div className="frl-flow" data-feasibility-flow aria-label="Fonctionnement d’une règle"><span className="frl-node source">Cadrage</span><span aria-hidden="true">→</span><span className="frl-node">Condition de la règle</span><span aria-hidden="true">→</span>
        <span className="frl-node targets"><b>Conséquences</b><span>Points à traiter</span><span>Estimation</span><span>Notice</span></span></div>
    </header>
    {error && <div className="err" role="alert" data-feasibility-rules-error>{error}</div>}
    {message && <div className="price-message" role="status" data-feasibility-rules-message>{message}</div>}
    {!draft && <button type="button" className="primary" data-feasibility-rule-new onClick={() => edit(emptyRule())}>Nouvelle règle d’agence</button>}

    <h3>Règles de votre agence</h3>
    {data.agency.length === 0 ? <p className="muted" data-feasibility-agency-empty>Aucune règle d’agence : le Standard Calepin s’applique.</p> : <ul className="frl-agency" data-feasibility-agency-list>{data.agency.map((r) => <li key={r.rule_key} data-feasibility-agency-rule={r.status}>
      <b>{r.name}</b> <span className="frl-badge">{STATUS_LABEL[r.status]}</span> <small className="muted">v{r.version}{r.mode !== "ADD" ? ` · ${r.mode === "REPLACE" ? "remplace" : "désactive"} une règle Standard Calepin` : ""}</small>{" "}
      <button type="button" className="link-button" onClick={() => edit(r)}>Modifier</button>{" "}
      {r.status !== "ARCHIVED" && <button type="button" className="link-button" disabled={!canPublish} onClick={() => act(() => apiFetch(`/feasibility-rules/${r.rule_key}/archive`, { method: "POST", body: "{}" }), "Règle archivée : les nouveaux projets reviennent au Standard Calepin.")}>Archiver</button>}</li>)}</ul>}

    <h3>Standard Calepin</h3>
    <div className="frl-table" role="table" aria-label="Standard Calepin" data-feasibility-standard-list>
      <div className="frl-row frl-head" role="row"><span role="columnheader">Règle / effet</span><span role="columnheader">Quand ?</span><span role="columnheader">Statut</span><span role="columnheader">Actions</span></div>
      {data.standard.map((s) => { const state = stateOf(s); return <div key={s.rule_id} className={`frl-row ${state}`} role="row" data-feasibility-standard-row={state} tabIndex={0} onClick={() => setDetail(s)} onKeyDown={(e) => { if (e.key === "Enter") setDetail(s); }}>
        <span className="frl-name" role="cell"><b>{s.name}</b><small>{s.behaviour}</small></span>
        <span className="frl-when" role="cell">{s.clauses.map((c) => c.replace(/^Cadrage · /, "")).join(" · ")}</span>
        <span className="frl-state" role="cell"><span className="frl-badge">Standard Calepin</span><span className={`frl-badge ${state}`} data-feasibility-state>{STATE_BADGE[state]}</span></span>
        <span className="frl-actions" role="cell" onClick={(e) => e.stopPropagation()}>
          {state === "disabled"
            ? <button type="button" className="secondary" data-feasibility-reactivate disabled={!canPublish} onClick={() => reactivate(s)}>Réactiver</button>
            : <button type="button" className="secondary" data-feasibility-customize onClick={() => startFrom(s, "REPLACE")}>{state === "custom" ? "Voir ma version" : "Modifier pour mon agence"}</button>}
          <span className="frl-menu"><button type="button" className="link-button" aria-label={`Autres actions pour ${s.name}`} aria-expanded={menu === s.rule_id} data-feasibility-menu onClick={() => setMenu(menu === s.rule_id ? null : s.rule_id)}>⋯</button>
            {menu === s.rule_id && <span className="frl-menu-list" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenu(null); setDetail(s); }}>Voir le détail de la règle</button>
              {state === "active" && <button type="button" role="menuitem" data-feasibility-disable disabled={!canPublish} onClick={() => { setMenu(null); disableNow(s); }}>Désactiver pour mon agence</button>}
              {state === "disabled" && <button type="button" role="menuitem" onClick={() => { setMenu(null); reactivate(s); }}>Réactiver</button>}</span>}</span></span></div>; })}
    </div>

    {detail && !draft && <aside className="frl-drawer" role="dialog" aria-label="Détail de la règle" data-feasibility-detail>
      <div className="frl-drawer-head"><h3>{detail.name}</h3><button type="button" className="link-button" data-feasibility-detail-close onClick={() => setDetail(null)}>Fermer</button></div>
      <p className="frl-meta"><span className="frl-badge">Standard Calepin</span> Source : <Badges items={["Cadrage"]} /> Impact : <Badges items={detail.modules} /></p>
      <Behaviour rule={detail} />
      <section><h4>Pour votre agence</h4><p>{{ active: "Aucune personnalisation active : le Standard Calepin s’applique.", custom: "Votre agence utilise sa propre version de cette règle.", disabled: "Cette règle n’est plus appliquée dans les nouveaux projets de votre agence." }[stateOf(detail)]}</p></section>
      {stateOf(detail) !== "disabled" && <button type="button" className="primary" onClick={() => startFrom(detail, "REPLACE")}>{stateOf(detail) === "custom" ? "Voir ma version" : "Modifier pour mon agence"}</button>}
    </aside>}

    {draft && <aside className="frl-drawer wide" role="dialog" aria-label="Personnaliser la règle" data-feasibility-rule-editor>
      <div className="frl-drawer-head"><h3>{draft.rule_key ? "Modifier la règle" : base ? "Personnaliser une règle du Standard Calepin" : "Nouvelle règle d’agence"}</h3><button type="button" className="link-button" onClick={() => { setDraft(null); setImpact(null); }}>Fermer</button></div>
      <label>Nom de la règle<input data-feasibility-rule-name value={draft.name} maxLength={200} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>

      {base && <><h4>1 · Standard actuel</h4><p className="frl-meta">Source : <Badges items={["Cadrage"]} /> Impact : <Badges items={base.modules} /></p><Behaviour rule={base} title="Comportement actuel" /></>}

      <h4>{base ? "2" : "1"} · Que voulez-vous faire ?</h4>
      <div className="frl-modes" role="radiogroup" aria-label="Mode de personnalisation">{MODES.filter(([value]) => base || value === "ADD").map(([value, label, help]) => <label key={value} className={`frl-mode ${draft.mode === value ? "on" : ""}`}>
        <input type="radio" name="rule-mode" data-feasibility-rule-mode={value} checked={draft.mode === value} onChange={() => setDraft({ ...draft, mode: value })} /><b>{label}</b><small>{help}</small></label>)}</div>
      {!base && draft.mode !== "ADD" && <label>Règle Standard Calepin concernée<select data-feasibility-rule-base value={draft.base_rule_id || ""} onChange={(e) => setDraft({ ...draft, base_rule_id: e.target.value || null })}><option value="">— choisir —</option>{data.standard.map((s) => <option key={s.rule_id} value={s.rule_id}>{s.name}</option>)}</select></label>}

      {draft.mode !== "DISABLE" && <>
        <h4>{base ? "3" : "2"} · Quand cette règle doit-elle s’appliquer ?</h4>
        <p className="muted">Les conditions utilisent les informations du Cadrage du projet.</p>
        {draft.conditions.children.map((c, index) => <div key={index} data-feasibility-condition className="frl-condition">
          <span className="frl-badge source">Cadrage</span>
          <select aria-label="Information du Cadrage" value={c.field} onChange={(e) => setCondition(index, { field: e.target.value, value: [fields[e.target.value].values[0].code] })}>{data.vocabulary.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
          <select aria-label="Comparaison" value={c.operator} onChange={(e) => setCondition(index, { operator: e.target.value })}>{data.vocabulary.operators.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
          <select multiple aria-label="Valeurs" value={[].concat(c.value || [])} onChange={(e) => setCondition(index, { value: [...e.target.selectedOptions].map((o) => o.value) })}>{fields[c.field].values.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}</select>
          <button type="button" className="link-button" onClick={() => setDraft({ ...draft, conditions: { ...draft.conditions, children: draft.conditions.children.filter((_, i) => i !== index) } })}>Retirer</button></div>)}
        <button type="button" className="secondary" data-feasibility-add-condition onClick={() => setDraft({ ...draft, conditions: { ...draft.conditions, children: [...draft.conditions.children, { field: data.vocabulary.fields[0].key, operator: "EQ", value: [data.vocabulary.fields[0].values[0].code] }] } })}>+ Ajouter une condition</button>
        {base?.structured && draft.conditions.children.length === 0 && <button type="button" className="link-button" data-feasibility-reuse-conditions onClick={() => setDraft({ ...draft, conditions: JSON.parse(JSON.stringify(base.structured)) })}>Reprendre les conditions du Standard Calepin</button>}
        {draft.conditions.children.length > 1 && <label className="inline-check"> Les conditions se combinent avec <select value={draft.conditions.operator} onChange={(e) => setDraft({ ...draft, conditions: { ...draft.conditions, operator: e.target.value } })}><option value="AND">ET (toutes)</option><option value="OR">OU (au moins une)</option></select></label>}

        <h4>{base ? "4" : "3"} · Que doit faire cette règle ?</h4>
        <section className="frl-dest" data-feasibility-dest="estimation"><h5><Badges items={["Estimation"]} /></h5>
          {draft.actions.map((a, index) => a.type === "ADD_COMPONENT" && <div key={index} data-feasibility-action="estimation" className="frl-action"><span>Ajouter à l’Estimation :</span>
            <select aria-label="Composant" value={a.component_id || ""} onChange={(e) => setAction(index, { component_id: e.target.value })}><option value="">— composant —</option>{data.vocabulary.components.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            <button type="button" className="link-button" onClick={() => removeAction(index)}>Supprimer</button></div>)}
          <button type="button" className="secondary" data-feasibility-add-component onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: "ADD_COMPONENT", component_id: "", include: "SUGGEST" }] })}>+ Ajouter une conséquence Estimation</button></section>
        <section className="frl-dest" data-feasibility-dest="points"><h5><Badges items={["Points à traiter"]} /></h5>
          {draft.actions.map((a, index) => a.type !== "ADD_COMPONENT" && <div key={index} data-feasibility-action="points" className="frl-action"><span>Ajouter :</span>
            <select aria-label="Type de point" value={a.type} onChange={(e) => setAction(index, { type: e.target.value })}>{POINT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input aria-label="Intitulé du point" placeholder="Intitulé (ex. Étude géotechnique à confirmer)" value={a.label || ""} onChange={(e) => setAction(index, { label: e.target.value })} />
            <button type="button" className="link-button" onClick={() => removeAction(index)}>Supprimer</button></div>)}
          <button type="button" className="secondary" data-feasibility-add-action onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: "ADD_STUDY_OR_ACTION", label: "", item_type: "STUDY" }] })}>+ Ajouter un point à traiter</button></section>
        <section className="frl-dest" data-feasibility-dest="notice"><h5><Badges items={["Notice"]} /></h5>
          {draft.notice_wording === "" && !draft.noticeOpen
            ? <p data-feasibility-notice-none>Notice : aucune conséquence. <button type="button" className="link-button" data-feasibility-add-notice onClick={() => setDraft({ ...draft, noticeOpen: true })}>+ Ajouter une mention dans la Notice</button></p>
            : <><label>Mention dans le chapitre « Points restant à sécuriser » (formulation pour le maître d’ouvrage)<textarea data-feasibility-rule-wording rows={2} maxLength={1000} value={draft.notice_wording} onChange={(e) => setDraft({ ...draft, notice_wording: e.target.value })} /></label>
              <label>Affichage<select value={draft.notice_visibility} onChange={(e) => setDraft({ ...draft, notice_visibility: e.target.value })}>{VISIBILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></>}</section>
      </>}

      <h4>Impact de votre modification</h4>
      <div data-feasibility-diff>{diff.length ? <ul className="frl-diff">{diff.map((line) => <li key={line} className={line.startsWith("−") ? "minus" : "plus"}>{line}</li>)}</ul> : <p className="muted">Aucune différence avec le comportement actuel pour l’instant.</p>}</div>
      <div className="frl-compare" data-feasibility-compare>
        <div><h5>Standard Calepin actuel</h5><p>Estimation : {joinList(before.estimation) || "aucun ajout"}</p><p>Points à traiter : {joinList(before.points) || "aucun"}</p><p>Notice : {before.notice || "aucune conséquence"}</p></div>
        <div><h5>Version de mon agence</h5><p>Estimation : {joinList([...kept.estimation, ...(draft.mode === "DISABLE" ? [] : after.estimation)]) || "aucun ajout"}</p><p>Points à traiter : {joinList([...kept.points, ...(draft.mode === "DISABLE" ? [] : after.points)]) || "aucun"}</p><p>Notice : {(draft.mode === "DISABLE" ? "" : after.notice || kept.notice) || "aucune conséquence"}</p></div></div>
      {impact && <div data-feasibility-impact><b>Effet sur vos projets (lecture seule)</b>
        {impact.affectedProjects.length ? <ul>{impact.affectedProjects.map((p) => <li key={p.project}>{p.project} : {[...p.addedStudies.map((x) => `+ ${x}`), ...p.removedStudies.map((x) => `− ${x}`), ...p.addedComponents.map((x) => `+ poste ${x}`), ...p.removedComponents.map((x) => `− poste ${x}`)].join(" · ")}</li>)}</ul> : <p>Aucun de vos projets actuels ne serait concerné.</p>}
        <p className="consult-hint">{impact.inProgressNote}</p></div>}
      <button type="button" className="secondary" data-feasibility-rule-impact onClick={showImpact}>Prévisualiser l’impact</button>

      <h4>Où cette modification s’appliquera-t-elle ?</h4>
      <div className="frl-scope" data-feasibility-scope>
        <p><b>Bibliothèque : {agencyName || "votre agence"}</b></p>
        <p>Cette modification s’appliquera aux nouveaux projets utilisant la prochaine version publiée de vos règles de Faisabilité. <b>Les projets actuellement gelés sur une version précédente ne seront pas modifiés automatiquement.</b></p>
        <p className="muted" data-feasibility-counts>{replaced} règle{replaced > 1 ? "s" : ""} remplacée{replaced > 1 ? "s" : ""} · {disabled} règle{disabled > 1 ? "s" : ""} désactivée{disabled > 1 ? "s" : ""} · {draft.conditions.children.length ? conditionsText(draft.conditions) : "sans condition propre"}</p></div>
      <div className="consult-buttons">
        <button type="button" className="secondary" data-feasibility-rule-save onClick={save}>Enregistrer le brouillon</button>
        <button type="button" className="primary" data-feasibility-rule-publish disabled={!canPublish} title={canPublish ? "" : "Un administrateur ou un membre autorisé publie les règles."} onClick={() => publish(false)}>Publier cette version pour les nouveaux projets</button>
        <label className="inline-check"><input type="checkbox" checked={existing} onChange={(e) => setExisting(e.target.checked)} /> aussi proposer aux projets en cours</label>
        {existing && <button type="button" className="secondary" data-feasibility-rule-propose disabled={!canPublish} onClick={() => publish(true)}>Publier et proposer aux projets en cours</button>}</div>
    </aside>}
  </section>;
}

/** Cadrage › Points à traiter : « Des règles agence ont évolué » — voir l'impact, appliquer au projet ou conserver les règles actuelles (jamais appliqué seul). */
export function FeasibilityRulesBanner({ id, editable = true, onChanged }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch(`/cctps/${id}/feasibility/canonical/rules`).then(setStatus).catch(() => setStatus(null)); }, [id]);
  if (!status || !status.updates.length) return null;
  const decide = async (action) => { setError(""); try { await apiFetch(`/cctps/${id}/feasibility/canonical/rules/update`, { method: "POST", body: JSON.stringify({ action }) }); setStatus({ ...status, updates: [] }); onChanged?.(); } catch (e) { setError(errorText(e)); } };
  return <section className="feas-note" role="status" data-feasibility-rules-banner>
    <b>Des règles agence ont évolué</b>
    <ul>{status.updates.map((u) => <li key={u.rule_key}>{u.name} — {u.behaviour}</li>)}</ul>
    {error && <div className="err" role="alert">{error}</div>}
    {editable && <><button type="button" className="secondary" data-feasibility-rules-apply onClick={() => decide("apply")}>Appliquer au projet</button>{" "}
      <button type="button" className="link-button" data-feasibility-rules-keep onClick={() => decide("keep")}>Conserver les règles actuelles</button></>}
  </section>;
}

/** « Pourquoi ce point ? » en langage humain (jamais d'identifiant de règle ni d'expression). */
export function WhyPoint({ id, ruleId }) {
  const [why, setWhy] = useState(null);
  const [open, setOpen] = useState(false);
  const toggle = async () => { setOpen(!open); if (!why) { try { setWhy(await apiFetch(`/cctps/${id}/feasibility/canonical/why?rule_id=${encodeURIComponent(ruleId)}`)); } catch { setWhy({ because: "Selon le cadrage.", name: "", origin: "UNKNOWN", actions: [] }); } } };
  return <span data-why-point><button type="button" className="link-button" data-why-point-toggle aria-expanded={open} onClick={toggle}>Pourquoi ce point ?</button>
    {open && why && <small className="muted" data-why-point-text style={{ display: "block" }}>{why.origin === "AGENCY" ? "Règle de votre agence" : "Règle Calepin"}{why.name ? ` — ${why.name}` : ""}. {why.because}</small>}</span>;
}
