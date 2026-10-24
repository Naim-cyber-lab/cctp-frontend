import { useEffect, useState } from "react";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { listSharedDevis } from "../api/client";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
/** DPGF partagés avec moi en tant qu'invité EXTERNE (ils n'appartiennent pas à mon espace de travail). */
export function ExternalDevisList({ knownIds = [], onOpen }) {
  const [items, setItems] = useState([]);
  useEffect(() => { listSharedDevis().then((data) => setItems((data.devis || []).filter((item) => !item.mine && !knownIds.includes(item.cctpId)))).catch(() => setItems([])); }, [knownIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return null;
  return <section className="quotes-projects premium-grid" data-external-devis>
    <header><div><span className="eyebrow">INVITÉ EXTERNE</span><h2>Partagés avec moi</h2></div><small>{items.length} DPGF</small></header>
    <div className="quote-card-grid">{items.map((item) => <button type="button" className="quote-card" key={item.cctpId} data-external-devis-card={item.cctpId} onClick={() => onOpen(item.cctpId)}>
      <div className="quote-card-top"><span className="project-file"><FileSpreadsheet size={21} /></span><em className="active">{item.myRole === "write" ? "Écriture" : "Lecture seule"}</em></div>
      <h3>{item.name}</h3><p>{item.project} · partagé par {item.sharedBy || item.ownerEmail}</p>
      <div className="quote-amount"><small>Total HT</small><strong>{money.format(item.totalHt || 0)}</strong></div>
      <footer><span /><em>Ouvrir <ArrowRight size={16} /></em></footer>
    </button>)}</div>
  </section>;
}
