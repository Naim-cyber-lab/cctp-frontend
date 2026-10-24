/** Synthèse déterministe d'un projet (jamais d'IA) : état des trois briques et « points à traiter », à partir de données structurées uniquement
 *  (lots prêts, lignes d'estimation sans quantité ou prix, offres reçues non clôturées). Utilisée par la page Projets et la vue d'ensemble. */
const CLOSED = new Set(["CLOSED", "AWARDED", "CANCELLED", "ARCHIVED"]);
const clamp = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));
const plural = (count, one, many) => (count > 1 ? many : one);

export function summarizeProject({ project, progress = 0, estimate = null, consultations = [], documents = [] }) {
  const cctpTotal = project.selected?.length || 0;
  const cctpReady = Math.min(cctpTotal, Math.round(cctpTotal * clamp(progress) / 100));
  const estimateTotal = estimate?.total || 0;
  const estimateDone = Math.min(estimateTotal, estimate?.complete || 0);
  const open = consultations.filter((item) => !CLOSED.has(item.status));
  const received = consultations.reduce((sum, item) => sum + (item.submitted || 0), 0);
  const toReview = open.reduce((sum, item) => sum + (item.submitted || 0), 0);
  const points = [];
  const missingLots = cctpTotal - cctpReady;
  if (missingLots > 0) points.push({ id: "cctp-missing", section: "cctp", count: missingLots, label: `${missingLots} lot${plural(missingLots, "", "s")} CCTP ${plural(missingLots, "comporte", "comportent")} des informations manquantes` });
  const missingLines = estimateTotal - estimateDone;
  if (missingLines > 0) points.push({ id: "estimate-missing", section: "estimate", count: missingLines, label: `${missingLines} ligne${plural(missingLines, "", "s")} de DPGF ${plural(missingLines, "n’a", "n’ont")} pas de quantité ou de prix` });
  if (toReview > 0) points.push({ id: "offers-to-review", section: "consultation", count: toReview, label: `${toReview} offre${plural(toReview, "", "s")} reçue${plural(toReview, "", "s")} ${plural(toReview, "n’a", "n’ont")} pas encore été analysée${plural(toReview, "", "s")}` });
  const consultationTotal = consultations.length;
  // Prochaine action du PROJET : règle de priorité explicite et testable (jamais de génération IA)
  const next = cctpTotal === 0 ? { section: "cctp", label: "Ajouter les lots du CCTP", detail: "Le projet n’a pas encore de périmètre technique." }
    : missingLots > 0 ? { section: "cctp", label: "Continuer le CCTP", detail: `${missingLots} lot${plural(missingLots, "", "s")} à compléter sur ${cctpTotal}.` }
    : missingLines > 0 && estimateDone === 0 ? { section: "estimate", label: "Préparer le DPGF", detail: `Le CCTP est prêt : ${missingLines} ligne${plural(missingLines, "", "s")} à chiffrer.` }
    : missingLines > 0 ? { section: "estimate", label: "Compléter le DPGF", detail: `${missingLines} ligne${plural(missingLines, "", "s")} sans quantité ou prix.` }
    : estimateTotal === 0 && consultationTotal === 0 ? { section: "estimate", label: "Préparer le DPGF", detail: "Le CCTP est prêt : chiffrez-le lot par lot." }
    : consultationTotal === 0 ? { section: "consultation", label: "Préparer une consultation", detail: "Le CCTP et le DPGF sont prêts." }
    : toReview > 0 ? { section: "consultation", label: "Analyser les offres", detail: `${toReview} offre${plural(toReview, "", "s")} reçue${plural(toReview, "", "s")}.` }
    : open.length > 0 ? { section: "consultation", label: "Suivre les réponses des entreprises", detail: `${open.length} consultation${plural(open.length, "", "s")} ouverte${plural(open.length, "", "s")}.` }
    : { section: "consultation", label: "Voir les consultations", detail: "Toutes les consultations sont clôturées." };
  // Prochaine action de CHAQUE brique (affichée sur sa carte)
  const bricks = {
    cctp: cctpTotal === 0 ? { label: "Ajouter les lots du CCTP", detail: "Aucun lot" } : missingLots > 0 ? { label: "Continuer le CCTP", detail: `${missingLots} lot${plural(missingLots, "", "s")} à compléter` } : null,
    estimate: estimateTotal === 0 && consultationTotal === 0 && cctpTotal > 0 && missingLots === 0 ? { label: "Préparer le DPGF", detail: "CCTP prêt" } : missingLines > 0 && estimateDone === 0 && missingLots === 0 ? { label: "Préparer le DPGF", detail: `${missingLines} ligne${plural(missingLines, "", "s")} à chiffrer` } : missingLines > 0 ? { label: "Compléter le DPGF", detail: `${missingLines} ligne${plural(missingLines, "", "s")} sans quantité` } : null,
    consultation: toReview > 0 ? { label: "Analyser les offres", detail: `${toReview} offre${plural(toReview, "", "s")} reçue${plural(toReview, "", "s")}` } : null,
  };
  return {
    next, bricks,
    cctp: { ready: cctpReady, total: cctpTotal, pct: cctpTotal ? cctpReady / cctpTotal * 100 : 0 },
    estimate: { done: estimateDone, total: estimateTotal, pct: estimateTotal ? estimateDone / estimateTotal * 100 : 0 },
    consultations: { open: open.length, received, toReview, total: consultations.length },
    documents: documents.length,
    points, attention: points.reduce((sum, point) => sum + point.count, 0),
  };
}
