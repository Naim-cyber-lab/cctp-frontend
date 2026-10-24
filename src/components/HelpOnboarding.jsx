import { CircleHelp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getHelpSeen, markHelpSeen } from "../api/client";

/** Aides de première utilisation : les textes qui servent seulement à découvrir une fonction s'affichent la première fois (« J'ai compris »),
 *  puis l'interface reste compacte ; le bouton « ? Aide » les rouvre à tout moment. */
export const HELP_TOPICS = {
  cctp: { title: "Comment démarrer un CCTP ?", points: ["Un projet regroupe son CCTP, son DPGF et ses consultations.", "Choisissez les lots, puis répondez au questionnaire guidé ou importez vos documents pour le préremplir.", "Relisez le texte généré, commentez avec votre équipe, puis exportez."] },
  estimate: { title: "Du descriptif au prix, sans double saisie", points: ["Les lots de vos CCTP deviennent des bordereaux structurés, prêts à chiffrer et à exporter.", "1 · Choisissez un DPGF : ouvrez sa carte.", "2 · Chiffrez lot par lot : quantités et prix unitaires.", "3 · Récapitulatif global : total final et export Excel."] },
  consultation: { title: "Consulter les entreprises", points: ["Envoyez le dossier figé aux entreprises, recevez leurs offres et comparez-les lot par lot.", "Chaque envoi correspond à une version du DCE (indice A, B…) : l'état exact du dossier transmis. Si le projet change ensuite, créez un nouvel indice."] },
  tasks: { title: "Comprendre la pastille rouge", points: ["La pastille compte les tâches qui vous sont assignées et ne sont pas encore terminées.", "Elle baisse quand vous passez une tâche en « Terminée » (bouton « Terminer » sur la carte, ou glissez-la dans la colonne Terminée)."] },
};

let cache = null;
const load = () => (cache ||= getHelpSeen().then((data) => data.seen || {}).catch(() => ({})));

export function HelpOnboarding({ topic }) {
  const content = HELP_TOPICS[topic];
  const [seen, setSeen] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { let alive = true; load().then((value) => { if (alive) setSeen(Boolean(value[topic])); }); return () => { alive = false; }; }, [topic]);
  if (!content) return null;
  const firstTime = seen === false;
  const dismiss = () => { setSeen(true); setOpen(false); load().then((value) => { value[topic] = true; }); markHelpSeen(topic).catch(() => {}); };
  const card = (firstTime || open) && <aside className={`help-card ${firstTime ? "first-time" : ""}`} role="note" data-onboarding={topic} aria-label={content.title}>
    <header><b>{content.title}</b><button type="button" aria-label="Fermer" data-help-close onClick={dismiss}><X size={15} /></button></header>
    <ul>{content.points.map((point) => <li key={point}>{point}</li>)}</ul>
    <button type="button" className="primary" data-help-understood onClick={dismiss}>J’ai compris</button>
  </aside>;
  return <div className="help-onboarding" data-help={topic}>
    <button type="button" className="help-button" data-help-button aria-expanded={firstTime || open} onClick={() => setOpen((value) => !value)}><CircleHelp size={15} /> Aide</button>
    {card}
  </div>;
}
