import { useEffect, useState } from "react";
import { getProjectConsistency } from "../api/client";

/** Points à vérifier entre DPGF et Planning : calculés par le serveur, jamais bloquants, repliés tant qu'il n'y a rien à signaler. */
export function ConsistencyPanel({ projectId, version }) {
  const [data, setData] = useState(null), [open, setOpen] = useState(false);
  useEffect(() => { getProjectConsistency(projectId).then(setData).catch(() => setData(null)); }, [projectId, version]);
  if (!data) return null;
  if (!data.count) return <p className="muted" data-consistency-ok>✓ Aucun point à vérifier entre le DPGF et le Planning.</p>;
  return <section className="pln-consistency" data-consistency>
    <button type="button" className="link-button" data-consistency-toggle aria-expanded={open} onClick={() => setOpen(!open)}>{data.count} point{data.count > 1 ? "s" : ""} à vérifier entre le DPGF et le Planning</button>
    {open && <ul data-consistency-list>{data.issues.map((issue) => <li key={issue.code} data-consistency-issue={issue.code} className={issue.severity}>
      <b>{issue.area} · {issue.message}</b> <span className="muted">{issue.action}</span>
      {!!issue.items.length && <small style={{ display: "block" }}>{issue.items.join(" · ")}{issue.count > issue.items.length ? ` … (+${issue.count - issue.items.length})` : ""}</small>}
    </li>)}</ul>}
  </section>;
}
