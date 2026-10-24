import { Bookmark, ChevronDown, GitCompareArrows, RotateCcw, Tag, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { compareSnapshot, createSnapshot, deleteSnapshot, labelLiveVersion, listLiveVersions, listSnapshots, restoreLiveVersion, restoreSnapshot } from "../api/client";
import { colorFor } from "../hooks/useLiveDocumentCollaboration";
import "../version-history.css";

const initials = (email = "") => email.split("@")[0].replace(/[^a-zA-Z0-9]/g, " ").trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
const blockLabel = (key = "") => {
  if (key.startsWith("body-")) return `Lot ${key.slice(5)}`;
  if (key.startsWith("title-")) return `Titre du lot ${key.slice(6)}`;
  if (key.startsWith("code-") || key.startsWith("number-")) return `Numérotation du lot ${key.split("-")[1]}`;
  return { coverTitle: "Page de garde", coverLabel: "Page de garde", subtitle: "Page de garde", coverContacts: "Page de garde", introTitle: "Introduction", introText: "Introduction", footer: "Pied de page" }[key] || key;
};
const timeOf = (value) => new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayOf = (value) => {
  const date = new Date(value), today = new Date(), yesterday = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(date, today)) return "Aujourd’hui";
  if (same(date, yesterday)) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};
const dateTime = (value) => `${new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${timeOf(value)}`;

/** Texte comparé : ce qui a été ajouté est surligné en vert, ce qui a été supprimé est barré en rouge. */
export function DiffText({ ops = [] }) {
  if (!ops.length) return <p className="vh-nochange">Aucune différence de texte.</p>;
  return <p className="vh-diff" data-diff>{ops.map((op, index) => (op.t === "ins" ? <ins key={index} data-diff-ins>{op.s}</ins> : op.t === "del" ? <del key={index} data-diff-del>{op.s}</del> : <span key={index} className={op.gap ? "vh-gap" : undefined}>{op.s}</span>))}</p>;
}

const Stat = ({ added, removed }) => <span className="vh-stat">{added > 0 && <b className="add">+{added}</b>}{removed > 0 && <b className="del">−{removed}</b>}{!added && !removed && <b>mise en forme</b>}</span>;

/** Historique des versions façon Google Docs : versions nommées du document + séries de modifications (qui, quand, quoi, texte surligné). */
export function VersionHistory({ project, canRestore }) {
  const [groups, setGroups] = useState(null);
  const [snapshots, setSnapshots] = useState(null);
  const [open, setOpen] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [labelDraft, setLabelDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const [versions, named] = await Promise.all([listLiveVersions(project.id), listSnapshots(project.id)]);
      setGroups(versions); setSnapshots(named); setError("");
    } catch (reason) { setError(reason.message); }
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (work) => { setBusy(true); setError(""); try { await work(); await load(); } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  const save = () => act(async () => { await createSnapshot(project.id, name); setName(""); });
  const compare = async (snapshot) => {
    if (comparison?.id === snapshot.id) { setComparison(null); return; }
    setBusy(true);
    try { setComparison({ id: snapshot.id, ...(await compareSnapshot(project.id, snapshot.id)) }); setError(""); }
    catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  const saveLabel = (group) => act(async () => { await labelLiveVersion(project.id, group.id, labelDraft); setEditing(null); });

  const visible = (groups || []).filter((group) => group.changed || group.label);
  const days = [];
  for (const group of visible) {
    const label = dayOf(group.endedAt);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(group); else days.push({ label, items: [group] });
  }

  return <div className="version-history" data-version-history>
    {error && <div className="share-error" role="alert">{error}</div>}
    <section className="vh-named">
      <h4><Bookmark size={13} /> Versions nommées</h4>
      {canRestore && <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) save(); }}>
        <input value={name} maxLength={120} placeholder="Nommer la version actuelle (ex. Envoyée au client)" aria-label="Nom de la version" data-snapshot-name onChange={(event) => setName(event.target.value)} />
        <button type="submit" className="primary" data-snapshot-save disabled={busy || !name.trim()}>Enregistrer</button>
      </form>}
      {snapshots && !snapshots.length && <p className="vh-empty">Aucune version nommée. Nommez la version actuelle pour pouvoir la comparer et y revenir plus tard.</p>}
      <ul>{(snapshots || []).map((snapshot) => <li key={snapshot.id} data-snapshot={snapshot.id}>
        <div className="vh-row">
          <span><b>{snapshot.name}</b><small>{snapshot.email.split("@")[0]} · {dateTime(snapshot.createdAt)}</small></span>
          <button type="button" title="Comparer avec le document actuel" aria-label="Comparer cette version avec le document actuel" data-snapshot-compare disabled={busy} onClick={() => compare(snapshot)}><GitCompareArrows size={14} /></button>
          {canRestore && <button type="button" title="Restaurer cette version" aria-label="Restaurer cette version nommée" data-snapshot-restore disabled={busy} onClick={() => act(() => restoreSnapshot(project.id, snapshot.id))}><RotateCcw size={14} /></button>}
          <button type="button" title="Supprimer cette version" aria-label="Supprimer cette version nommée" data-snapshot-delete disabled={busy} onClick={() => act(() => deleteSnapshot(project.id, snapshot.id))}><Trash2 size={13} /></button>
        </div>
        {comparison?.id === snapshot.id && <div className="vh-compare" data-snapshot-comparison>
          {!comparison.changes.length && <p className="vh-nochange">Le document est identique à cette version.</p>}
          {comparison.changes.map((change) => <section key={change.key}><h5>{blockLabel(change.key)} <Stat added={change.added} removed={change.removed} /></h5><DiffText ops={change.ops} /></section>)}
        </div>}
      </li>)}</ul>
    </section>
    <section className="vh-timeline">
      <h4><Tag size={13} /> Modifications</h4>
      {!groups && <p className="vh-empty">Chargement…</p>}
      {groups && !visible.length && <p className="vh-empty">Aucune modification partagée pour l’instant.</p>}
      <div className="cctp-history" data-history-list>
        {days.map((day) => <div key={day.label} className="vh-day"><h5>{day.label}</h5>
          {day.items.map((group) => <article key={group.id} className={`vh-entry ${open === group.id ? "open" : ""}`} data-history-entry={group.lastId} data-history-key={group.key} data-version-group={group.id}>
            <button type="button" className="vh-head" aria-expanded={open === group.id} data-version-toggle onClick={() => setOpen(open === group.id ? null : group.id)}>
              <span className="vh-avatar" style={{ "--collab-color": colorFor(group.email) }}>{initials(group.email)}</span>
              <span className="vh-main"><b>{group.label || group.email.split("@")[0]}</b><small>{group.label ? `${group.email.split("@")[0]} · ` : ""}{timeOf(group.startedAt)}{timeOf(group.startedAt) !== timeOf(group.endedAt) ? `–${timeOf(group.endedAt)}` : ""} · {blockLabel(group.key)}</small></span>
              <Stat added={group.added} removed={group.removed} />
              <ChevronDown size={14} className="vh-chevron" />
            </button>
            <DiffText ops={open === group.id ? group.ops : group.ops.filter((op) => op.t !== "eq").slice(0, 2)} />
            {open === group.id && <div className="vh-actions">
              {editing === group.id
                ? <form onSubmit={(event) => { event.preventDefault(); saveLabel(group); }}><input autoFocus value={labelDraft} maxLength={120} placeholder="Nom de cette version" aria-label="Nom de la version" data-version-label onChange={(event) => setLabelDraft(event.target.value)} /><button type="submit" className="primary" disabled={busy}>OK</button></form>
                : canRestore && <button type="button" data-version-name onClick={() => { setEditing(group.id); setLabelDraft(group.label); }}><Tag size={13} /> {group.label ? "Renommer" : "Nommer"}</button>}
              {canRestore && <button type="button" data-history-restore title="Remet le passage dans l’état obtenu après ces modifications" disabled={busy} onClick={() => act(() => restoreLiveVersion(project.id, group.lastId))}><RotateCcw size={13} /> Restaurer cet état</button>}
              {canRestore && <button type="button" data-history-revert title="Annule ces modifications : le passage revient comme avant" disabled={busy} onClick={() => act(() => restoreLiveVersion(project.id, group.id, true))}><Undo2 size={13} /> Annuler ces modifications</button>}
            </div>}
          </article>)}
        </div>)}
      </div>
    </section>
    <small className="cctp-access-note">{canRestore ? "Restaurer remet le passage dans cet état ; l’état actuel reste dans l’historique." : "Votre droit (lecture seule) ne permet pas de restaurer une version."}</small>
  </div>;
}
