import { useEffect, useState } from "react";
import { getPersonalDocuments, importPersonalDocuments } from "../api/client";
import { useWorkspaces } from "../hooks/useWorkspaces";

const key = (workspaceId) => `cctp:personal-import:${workspaceId}`;
/** Documents créés avant de rejoindre l'agence : jamais déplacés automatiquement. La personne choisit : tout importer, choisir, ou les garder dans son espace personnel. */
export function PersonalDocumentsPanel({ onImported }) {
  const { active, isAgency } = useWorkspaces();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("all");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(() => { try { return Boolean(active && localStorage.getItem(key(active.id))); } catch { return false; } });
  useEffect(() => {
    if (!isAgency) return;
    getPersonalDocuments().then(setData).catch(() => setData(null));
  }, [isAgency, active?.id]);
  if (!isAgency || !data || data.count === 0 || hidden) return null;
  const remember = (value) => { try { localStorage.setItem(key(active.id), value); } catch { /* stockage indisponible */ } setHidden(true); };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (mode === "none") { remember("keep"); return; }
      await importPersonalDocuments({ mode, cctpIds: mode === "selected" ? selected : undefined });
      remember("done");
      onImported?.();
    } catch (reason) { setError(reason.message); } finally { setBusy(false); }
  };
  return <section className="personal-import" data-personal-import>
    <h3>Vous avez des documents créés avant de rejoindre {active.name}.</h3>
    <p>{data.count} document{data.count > 1 ? "s" : ""} personnel{data.count > 1 ? "s" : ""} (avec leurs DPGF). Rien n’est partagé avec l’agence sans votre accord.</p>
    <label><input type="radio" name="personal-import" checked={mode === "all"} onChange={() => setMode("all")} data-import-mode="all" /> Importer tous mes documents dans {active.name}</label>
    <label><input type="radio" name="personal-import" checked={mode === "selected"} onChange={() => setMode("selected")} data-import-mode="selected" /> Choisir les documents à importer</label>
    {mode === "selected" && <ul>{data.documents.map((item) => <li key={item.id}><label><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((list) => event.target.checked ? [...list, item.id] : list.filter((id) => id !== item.id))} data-import-doc={item.id} /> {item.name}</label></li>)}</ul>}
    <label><input type="radio" name="personal-import" checked={mode === "none"} onChange={() => setMode("none")} data-import-mode="none" /> Les conserver dans mon espace personnel</label>
    {error && <div className="login-error">{error}</div>}
    <footer><button type="button" className="primary" disabled={busy || (mode === "selected" && selected.length === 0)} data-import-confirm onClick={submit}>Valider mon choix</button></footer>
  </section>;
}
