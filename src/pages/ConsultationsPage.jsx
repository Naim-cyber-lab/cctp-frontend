import { useCallback, useEffect, useMemo, useState } from "react";
import { consultationStatusLabel } from "../utils/statuses";
import { HelpOnboarding } from "../components/HelpOnboarding";
import { Building2, LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { apiFetch } from "../api/client";
import { ConsultationDetail } from "../components/ConsultationDetail";
import "../consultations.css";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function ConsultationsPage({ projects, initialProjectId = "", target = null }) {
  const [tab, setTab] = useState("consultations");
  const [projectId, setProjectId] = useState(initialProjectId || "all");
  const [openId, setOpenId] = useState(target?.consultationId || null);
  return (
    <main className={`consult-page ${openId && tab !== "directory" ? "layout-work" : "layout-portfolio"}`} data-consult-page>
      <header className="consult-head">
        <div className="consult-title"><h1>Consultations</h1><HelpOnboarding topic="consultation" /></div>
        <nav className="consult-tabs" role="tablist">
          <button role="tab" className={tab === "consultations" ? "active" : ""} data-consult-tab="consultations" onClick={() => { setTab("consultations"); setOpenId(null); }}>Consultations</button>
          <button role="tab" className={tab === "directory" ? "active" : ""} data-consult-tab="directory" onClick={() => setTab("directory")}>Annuaire des entreprises</button>
        </nav>
      </header>
      {tab === "directory" ? <Directory /> : openId ? <ConsultationDetail id={openId} project={projects.find((p) => p.id === projectId)} initialTab={target?.consultationId === openId ? target.tab : undefined} onBack={() => setOpenId(null)} /> : <List projects={projects} projectId={projectId} setProjectId={setProjectId} onOpen={setOpenId} />}
    </main>
  );
}

function List({ projects, projectId, setProjectId, onOpen }) {
  const [items, setItems] = useState(null);
  const [name, setName] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [newProject, setNewProject] = useState("");
  const projectKey = projects.map((item) => item.id).join("|"); // `projects` change d'identité à chaque rendu : on ne recharge que si la liste change vraiment
  const load = useCallback(() => {
    if (!projectId) return;
    const targets = projectId === "all" ? projects : projects.filter((item) => item.id === projectId);
    Promise.all(targets.map((item) => apiFetch(`/cctps/${item.id}/consultations`).then((data) => data.consultations.map((row) => ({ ...row, projectId: item.id, projectName: item.name }))).catch(() => [])))
      .then((groups) => setItems(groups.flat().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))))
      .catch((e) => setError(e.message));
  }, [projectId, projectKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setItems(null); load(); }, [load]);
  const project = projects.find((item) => item.id === (projectId === "all" ? newProject || projects[0]?.id : projectId));
  const create = async () => {
    setError("");
    try {
      const data = await apiFetch(`/cctps/${project.id}/consultations`, { method: "POST", body: JSON.stringify({ name: name.trim() || `Consultation ${project?.name || ""}`, lots: project?.selected || [] }) });
      setAsking(false); setName("");
      if (projectId === "all") setProjectId(project.id);
      onOpen(data.id);
    } catch (e) { setError(e.message); setAsking(false); }
  };
  if (!projects.length) return <div className="consult-empty">Créez d'abord un CCTP pour lancer une consultation.</div>;
  return (
    <section className="consult-card">
      <div className="consult-row">
        <label>Projet<select value={projectId} data-consult-project onChange={(e) => setProjectId(e.target.value)}><option value="all">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="primary" data-consult-create onClick={() => { setName(""); setAsking(true); }}><Plus size={15} /> Nouvelle consultation</button>
      </div>
      {asking && <div className="consult-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAsking(false)}>
        <form className="consult-modal" role="dialog" aria-modal="true" aria-label="Nouvelle consultation" data-consult-new-dialog onSubmit={(e) => { e.preventDefault(); create(); }}>
          <h3>Nouvelle consultation</h3>
          {projectId === "all" ? <label>Projet<select data-consult-new-project value={project?.id || ""} onChange={(e) => setNewProject(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : <p className="consult-hint">Projet : <b>{project?.name}</b></p>}
          <label>Nom de la consultation<input autoFocus value={name} data-consult-new-name placeholder="Ex. Consultation gros œuvre" onChange={(e) => setName(e.target.value)} /></label>
          <p className="consult-hint">Laissé vide, le nom sera « Consultation {project?.name || ""} ». Vous pourrez le modifier ensuite.</p>
          <div className="consult-buttons"><button type="submit" className="primary" data-consult-create-confirm>Créer la consultation</button><button type="button" onClick={() => setAsking(false)}>Annuler</button></div>
        </form></div>}
      {error && <div className="quotes-error">{error}</div>}
      {!items ? <div className="quotes-loading"><LoaderCircle className="spin" /> Chargement…</div> : !items.length ? <div className="consult-empty">Aucune consultation.</div> : (
        <table className="consult-table"><thead><tr><th>Consultation</th><th>Projet</th><th>Statut</th><th>Échéance</th><th>Réponses</th><th /></tr></thead><tbody>
          {items.map((item) => <tr key={item.id} data-consult-item={item.id} onClick={() => { if (projectId === "all") setProjectId(item.projectId); onOpen(item.id); }}><td><b>{item.name}</b><small>{item.lots} lot{item.lots > 1 ? "s" : ""} · {item.companies} entreprise{item.companies > 1 ? "s" : ""}</small></td><td data-consult-project-name>{item.projectName}</td><td>{item.companies > 0 && item.declined === item.companies && !["DRAFT", "READY"].includes(item.status) ? <span className="consult-status s-CANCELLED decline-chip" data-consult-declined data-consult-all-declined>Toutes déclinées</span> : <><span className={`consult-status s-${item.status}`} data-consult-status-chip>{consultationStatusLabel(item.status, item.statusLabel)}</span>{item.declined > 0 && <span className="consult-status s-CANCELLED decline-chip" data-consult-declined>{`${item.declined} déclinée${item.declined > 1 ? "s" : ""}`}</span>}</>}</td><td>{item.responseDeadline ? dateTime.format(new Date(item.responseDeadline)) : "—"}</td><td>{item.lots} lot{item.lots > 1 ? "s" : ""} · {item.companies} entreprise{item.companies > 1 ? "s" : ""}</td><td>{item.submitted} réponse{item.submitted > 1 ? "s" : ""} reçue{item.submitted > 1 ? "s" : ""}{item.declined > 0 ? ` · ${item.declined} déclin${item.declined > 1 ? "s" : ""}` : ""}</td><td><button type="button">Ouvrir</button></td></tr>)}
        </tbody></table>
      )}
    </section>
  );
}

const emptyCompany = { name: "", email: "", phone: "", siret: "", trades: "", areas: "", notes: "" };

function Directory() {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(emptyCompany);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [menu, setMenu] = useState(null);
  useEffect(() => { if (!menu) return undefined; const close = (event) => { if (!event.target.closest(".row-more")) setMenu(null); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, [menu]);
  const [formOpen, setFormOpen] = useState(false); // « + Ajouter » / « Modifier » : fenêtre, plus de formulaire permanent
  const load = useCallback(() => apiFetch("/companies").then((d) => setItems(d.companies)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const payload = () => ({ ...form, trades: form.trades.split(",").map((s) => s.trim()).filter(Boolean), areas: form.areas.split(",").map((s) => s.trim()).filter(Boolean) });
  const submit = async () => {
    setError("");
    try {
      await apiFetch(editing ? `/companies/${editing}` : "/companies", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload()) });
      setForm(emptyCompany); setEditing(null); setFormOpen(false); load();
    } catch (e) { setError(e.message); }
  };
  const edit = (c) => { setFormOpen(true); setEditing(c.id); setForm({ name: c.name, email: c.email, phone: c.phone, siret: c.siret, trades: c.trades.join(", "), areas: c.areas.join(", "), notes: c.notes }); };
  const importFile = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setError(""); setNotice("");
    const form = new FormData(); form.append("file", file);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/companies/import`, { method: "POST", credentials: "include", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "Import impossible");
      setNotice(`${body.created} entreprise${body.created > 1 ? "s" : ""} ajoutée${body.created > 1 ? "s" : ""}, ${body.updated} mise${body.updated > 1 ? "s" : ""} à jour${body.invalid ? `, ${body.invalid} ignorée(s) (e-mail invalide)` : ""}.`);
      load();
    } catch (e) { setError(e.message); }
  };
  const anonymize = async (c) => { if (confirm(`Effacer les coordonnées de ${c.name} (e-mail, téléphone, contacts, notes) ? Son historique de consultations est conservé.`)) { try { await apiFetch(`/companies/${c.id}/anonymize`, { method: "POST" }); load(); } catch (e) { setError(e.message); } } };
  const remove = async (c) => { try { await apiFetch(`/companies/${c.id}`, { method: "DELETE" }); load(); } catch (e) { setError(e.message); } };
  const shown = useMemo(() => (items || []).filter((c) => !query || `${c.name} ${c.trades.join(" ")} ${c.areas.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  return (
    <section className="consult-card" data-company-directory>
      <h3><Building2 size={16} /> Entreprises</h3>
      <div className="consult-toolbar" data-company-toolbar>
        <input className="consult-search" data-company-search placeholder="Rechercher nom, métier, zone…" aria-label="Rechercher une entreprise" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="upload secondary"><Upload size={14} /> Importer Excel / CSV<input type="file" hidden accept=".xlsx,.xlsm,.csv,.txt" data-company-import onChange={importFile} /></label>
        <button type="button" className="primary" data-company-add onClick={() => { setEditing(null); setForm(emptyCompany); setFormOpen(true); }}><Plus size={15} /> Ajouter</button>
      </div>
      {formOpen && <div className="consult-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && (setFormOpen(false), setEditing(null), setForm(emptyCompany))}><div className="consult-modal wide" role="dialog" aria-modal="true" aria-label={editing ? "Modifier l’entreprise" : "Ajouter une entreprise"} data-company-modal><h3>{editing ? "Modifier l’entreprise" : "Ajouter une entreprise"}</h3>
      <div className="consult-form">
        <label>Raison sociale<input data-company-name value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>E-mail<input data-company-email type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Téléphone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>SIRET<input value={form.siret} onChange={(e) => setForm({ ...form, siret: e.target.value })} /></label>
        <label>Corps d'état (séparés par des virgules)<input data-company-trades value={form.trades} onChange={(e) => setForm({ ...form, trades: e.target.value })} /></label>
        <label>Zones<input value={form.areas} onChange={(e) => setForm({ ...form, areas: e.target.value })} /></label>
        <button className="primary" data-company-save disabled={!form.name.trim()} onClick={submit}>{editing ? "Enregistrer" : "Ajouter l'entreprise"}</button>
        <button type="button" data-company-cancel onClick={() => { setEditing(null); setForm(emptyCompany); setFormOpen(false); }}>Annuler</button>
      </div>
      </div></div>}
      {notice && <div className="consult-banner" data-company-import-notice>{notice}</div>}
      {error && <div className="quotes-error">{error}</div>}
      {!items ? <div className="quotes-loading"><LoaderCircle className="spin" /></div> : !shown.length ? <div className="consult-empty">Aucune entreprise.</div> : (
        <table className="consult-table"><thead><tr><th>Entreprise</th><th>Corps d'état</th><th>Zone</th><th>Contact</th><th>Projets</th><th /></tr></thead><tbody>
          {shown.map((c) => <tr key={c.id} data-company-row={c.id}><td><b>{c.name}</b><small>{c.siret}</small></td><td>{c.trades.join(", ")}</td><td>{(c.areas || []).join(", ") || "—"}</td><td>{c.email}<small>{c.phone}</small></td><td>{c.projects || 0}</td><td className="company-actions"><button onClick={() => edit(c)}>Modifier</button><div className="row-more"><button type="button" className="icon" data-company-more={c.id} aria-haspopup="menu" aria-label={`Plus d’actions pour ${c.name}`} onClick={() => setMenu(menu === c.id ? null : c.id)}>•••</button>{menu === c.id && <div className="sel-bar-menu row-more-menu" role="menu" data-company-menu onClick={() => setMenu(null)}><button type="button" role="menuitem" data-company-anonymize onClick={() => anonymize(c)}>Effacer les coordonnées (RGPD)</button><button type="button" role="menuitem" className="danger" data-company-delete onClick={() => remove(c)}><Trash2 size={14} /> Supprimer l’entreprise</button></div>}</div></td></tr>)}
        </tbody></table>
      )}
    </section>
  );
}
