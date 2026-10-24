import { useEffect, useMemo, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { getSharedCctp } from "../api/client";
import { useCatalog } from "../catalog/CatalogContext";
import { sanitizeHtml } from "../utils/sanitizeHtml";
import "../shared-cctp.css";

/** Aperçu en lecture seule d'un CCTP envoyé dans la discussion (version actuelle de l'auteur). */
export function SharedCctpPreview({ message, onClose, onImport, onOpenOwn }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const catalog = useCatalog();

  useEffect(() => {
    let cancelled = false;
    getSharedCctp(message.id).then((result) => !cancelled && setData(result)).catch((reason) => !cancelled && setError(reason.message));
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { cancelled = true; window.removeEventListener("keydown", onKey); };
  }, [message.id, onClose]);

  const chapters = useMemo(
    () => (data?.chapters || []).map((chapter) => ({ ...chapter, title: catalog?.chapters?.find((item) => item.id === chapter.id)?.title || `Lot ${chapter.id}`, safe: sanitizeHtml(chapter.html) })),
    [data, catalog],
  );

  return (
    <div className="shared-cctp" role="dialog" aria-modal="true" aria-label="Aperçu du CCTP" data-shared-cctp>
      <header>
        <span className="shared-cctp-icon"><FileText size={20} /></span>
        <div>
          <small>APERÇU DU CCTP · lecture seule</small>
          <h2 data-shared-cctp-title>{data?.name || message.payload?.name || "CCTP"}</h2>
          {data && <small>Envoyé par {data.author} · version actuelle · {chapters.length} chapitre{chapters.length > 1 ? "s" : ""}</small>}
        </div>
        <div className="shared-cctp-actions">
          {data && !data.mine && <button className="primary" data-shared-cctp-import onClick={() => onImport(message)}><Download size={14} /> Importer dans mes CCTP</button>}
          {data?.mine && <button className="primary" data-shared-cctp-open-own onClick={() => onOpenOwn(data.id)}>Ouvrir dans mon espace</button>}
          <button aria-label="Fermer l’aperçu" data-shared-cctp-close onClick={onClose}><X size={18} /></button>
        </div>
      </header>
      {error ? (
        <div className="shared-cctp-state" role="alert">{error}</div>
      ) : !data ? (
        <div className="shared-cctp-state">Chargement de l’aperçu…</div>
      ) : (
        <div className="shared-cctp-body">
          <nav aria-label="Chapitres">
            {chapters.map((chapter) => <a key={chapter.id} href={`#shared-${chapter.id}`} onClick={(event) => { event.preventDefault(); document.getElementById(`shared-${chapter.id}`)?.scrollIntoView({ behavior: "smooth" }); }}>{chapter.title}</a>)}
          </nav>
          <main>
            {chapters.length === 0 && <p className="shared-cctp-empty">Ce CCTP ne contient encore aucun chapitre.</p>}
            {chapters.map((chapter) => (
              <section key={chapter.id} id={`shared-${chapter.id}`} data-shared-chapter={chapter.id}>
                <h3>{chapter.title}</h3>
                {chapter.safe.trim() ? <div className="shared-cctp-content" dangerouslySetInnerHTML={{ __html: chapter.safe }} /> : <p className="shared-cctp-empty">Chapitre pas encore rédigé.</p>}
              </section>
            ))}
          </main>
        </div>
      )}
    </div>
  );
}
