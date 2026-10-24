import { useCallback, useEffect, useState } from "react";
import { Archive, Clock3, Copy, MoreHorizontal, Search, X } from "lucide-react";
import { archiveWorkTemplate, createWorkTemplate, getWorkTemplate, listWorkTemplates, restoreWorkTemplate } from "../api/client";
import { chapters } from "../data/chapters";
import { WorkTemplateEditor } from "./WorkTemplateEditor";
import "../consultations.css";

const lotTitle = (id) => chapters.find((item) => item.id === id)?.title || `Lot ${id}`;
const day = (value) => new Date(value).toLocaleDateString("fr-FR");
const who = (email) => String(email || "").split("@")[0];

/** Bibliothèque agence › Modèles d'ouvrages : liste, recherche, filtres (lot, famille, statut) et menu d'actions (dupliquer, historique, archiver). */
export function WorkTemplates({ externalQuery = "" }) {
  const [filters, setFilters] = useState({ q: "", lotId: "", family: "", status: "ACTIVE" });
  const [query, setQuery] = useState(externalQuery);
  useEffect(() => { setQuery(externalQuery); }, [externalQuery]);
  const [state, setState] = useState({ loading: true, templates: [], canManage: false, error: "" });
  const [families, setFamilies] = useState([]);
  const [menu, setMenu] = useState(null);
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => { const timer = setTimeout(() => setFilters((current) => ({ ...current, q: query })), 250); return () => clearTimeout(timer); }, [query]);
  const load = useCallback(async () => {
    try {
      const data = await listWorkTemplates(filters);
      setState({ loading: false, templates: data.templates || [], canManage: Boolean(data.canManage), error: "" });
      setFamilies((current) => [...new Set([...current, ...(data.templates || []).map((item) => item.workFamily)])].sort((a, b) => a.localeCompare(b, "fr")));
    } catch (reason) { setState((current) => ({ ...current, loading: false, error: reason.message })); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => { if (!event.target.closest("[data-template-menu], [data-template-menu-button]")) setMenu(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  const act = async (action) => {
    setBusy(true); setMenu(null);
    try { await action(); await load(); } catch (reason) { setState((current) => ({ ...current, error: reason.message })); } finally { setBusy(false); }
  };
  const duplicate = (item) => act(async () => {
    await createWorkTemplate({ name: `${item.name} (copie)`, description: item.description, lotId: item.lotId, workFamily: item.workFamily, workType: item.workType, questionnaireVersion: item.questionnaireVersion, answers: item.answers.map(({ questionId, value, metadata }) => ({ questionId, value, metadata })) });
  });
  const openHistory = async (item) => {
    setMenu(null);
    try { setHistory({ item, versions: (await getWorkTemplate(item.id)).versions || [] }); } catch (reason) { setState((current) => ({ ...current, error: reason.message })); }
  };
  const filtered = Boolean(filters.q || filters.lotId || filters.family || filters.status !== "ACTIVE");

  return <section className="settings-section work-templates" data-agency-types data-work-templates>
    <h2>Modèles d’ouvrages</h2>
    {state.error && <div className="login-error" role="alert">{state.error}</div>}
    {state.loading ? <p className="panel-empty">Chargement…</p> : state.templates.length === 0 && !filtered ? <div data-agency-types-empty>
      <p><b>Enregistrez les solutions techniques que votre agence utilise régulièrement.</b></p>
      <p>Un modèle d’ouvrage permet de préremplir le questionnaire d’un futur projet tout en conservant les contrôles et règles métier. Vous pourrez également enregistrer un ouvrage directement depuis un CCTP.</p>
      <p><button type="button" className="primary" data-agency-type-create disabled={!state.canManage} title={state.canManage ? "" : "Réservé aux administrateurs et aux membres autorisés à gérer la bibliothèque."} onClick={() => setCreating(true)}>+ Créer un modèle d’ouvrage</button>{!state.canManage && <small data-agency-types-soon> Réservé aux gestionnaires de la bibliothèque.</small>}</p>
    </div> : <>
      <div className="template-toolbar" data-template-filters>
        <label className="library-search"><Search size={15} /><input type="search" data-template-search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un modèle d’ouvrage…" aria-label="Rechercher un modèle d’ouvrage" /></label>
        <label>Lot<select data-template-lot value={filters.lotId} onChange={(event) => setFilters({ ...filters, lotId: event.target.value })}><option value="">Tous</option>{chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>Famille d’ouvrage<select data-template-family value={filters.family} onChange={(event) => setFilters({ ...filters, family: event.target.value })}><option value="">Toutes</option>{families.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>Statut<select data-template-status value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="ACTIVE">Actifs</option><option value="ARCHIVED">Archivés</option><option value="ALL">Tous</option></select></label>
      </div>
      {state.templates.length === 0 ? <p className="panel-empty" data-template-none>Aucun modèle d’ouvrage ne correspond à votre recherche.</p> : <ul className="template-list" data-template-list>
        {state.templates.map((item) => <li key={item.id} className={item.status === "ARCHIVED" ? "archived" : ""} data-template={item.id}>
          <div className="template-main"><b>{item.name}</b><span>{lotTitle(item.lotId)} · {item.workFamily}{item.workType ? ` · ${item.workType}` : ""}</span>
            <small>Version {item.versionNumber || 1} · Modifié le {day(item.updatedAt)}{item.updatedBy ? ` par ${who(item.updatedBy)}` : ""}</small></div>
          <em className={`template-status ${item.status === "ACTIVE" ? "active" : "archived"}`} data-template-status-badge>{item.status === "ACTIVE" ? "Actif" : "Archivé"}</em>
          <div className="template-actions"><button type="button" aria-label={`Actions pour ${item.name}`} aria-haspopup="menu" data-template-menu-button={item.id} onClick={() => setMenu(menu === item.id ? null : item.id)}><MoreHorizontal size={17} /></button>
            {menu === item.id && <div className="sel-bar-menu template-menu" role="menu" data-template-menu>
              {state.canManage && <button type="button" role="menuitem" data-template-duplicate disabled={busy} onClick={() => duplicate(item)}><Copy size={14} /> Dupliquer</button>}
              <button type="button" role="menuitem" data-template-history onClick={() => openHistory(item)}><Clock3 size={14} /> Voir l’historique</button>
              {state.canManage && (item.status === "ACTIVE"
                ? <button type="button" role="menuitem" data-template-archive disabled={busy} onClick={() => act(() => archiveWorkTemplate(item.id))}><Archive size={14} /> Archiver</button>
                : <button type="button" role="menuitem" data-template-restore disabled={busy} onClick={() => act(() => restoreWorkTemplate(item.id))}><Archive size={14} /> Restaurer</button>)}
            </div>}
          </div>
        </li>)}
      </ul>}
      <p><button type="button" className="primary" data-agency-type-create disabled={!state.canManage} title={state.canManage ? "" : "Réservé aux administrateurs et aux membres autorisés à gérer la bibliothèque."} onClick={() => setCreating(true)}>+ Créer un modèle d’ouvrage</button></p>
    </>}
    {creating && <WorkTemplateEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setFilters({ q: "", lotId: "", family: "", status: "ACTIVE" }); setQuery(""); load(); }} />}
    {history && <div className="consult-modal-backdrop" data-template-history-modal onMouseDown={(event) => event.target === event.currentTarget && setHistory(null)}>
      <div className="consult-modal" role="dialog" aria-label={`Historique de ${history.item.name}`}>
        <h3>Historique · {history.item.name}</h3>
        <ul className="template-versions">{history.versions.map((version) => <li key={version.id}><b>Version {version.versionNumber}</b><span>{day(version.createdAt)}{version.createdBy ? ` · ${who(version.createdBy)}` : ""}</span><small>{version.changeNote || `${version.answerCount} réponse${version.answerCount > 1 ? "s" : ""}`}</small></li>)}</ul>
        <div className="consult-buttons"><button type="button" data-template-history-close onClick={() => setHistory(null)}><X size={14} /> Fermer</button></div>
      </div>
    </div>}
  </section>;
}
