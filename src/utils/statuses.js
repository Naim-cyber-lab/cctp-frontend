/** Source centrale des statuts affichés : même statut = même libellé partout (CCTP, Estimation, Consultation).
 *  Les identifiants techniques (brouillon, en_relecture, valide, PUBLISHED…) ne changent pas ; seul l'affichage passe par ici. */
export const CCTP_STATUS = {
  brouillon: { label: "Brouillon", tone: "draft" },
  en_relecture: { label: "À vérifier", tone: "review" },
  valide: { label: "Prêt", tone: "ready" },
  archive: { label: "Archivé", tone: "muted" },
};
export const ESTIMATE_STATUS = {
  todo: { label: "À compléter", tone: "draft" },
  progress: { label: "En cours", tone: "review" },
  ready: { label: "Prête", tone: "ready" },
};
export const CONSULTATION_STATUS = {
  DRAFT: { label: "Brouillon", tone: "draft" }, READY: { label: "Brouillon", tone: "draft" },
  PUBLISHED: { label: "Ouverte", tone: "open" }, IN_PROGRESS: { label: "Ouverte", tone: "open" },
  ANALYSIS: { label: "Analyse", tone: "review" },
  CLOSED: { label: "Clôturée", tone: "ready" }, AWARDED: { label: "Clôturée", tone: "ready" },
  CANCELLED: { label: "Annulée", tone: "muted" },
};
export const cctpStatusLabel = (id, archived = false) => (archived ? CCTP_STATUS.archive : CCTP_STATUS[id] || CCTP_STATUS.brouillon).label;
export const consultationStatusLabel = (status, fallback = "") => CONSULTATION_STATUS[status]?.label || fallback;
export const estimateStatusLabel = (progress, started) => (progress === 100 ? ESTIMATE_STATUS.ready : started ? ESTIMATE_STATUS.progress : ESTIMATE_STATUS.todo).label;

/** Offre d'une entreprise : quatre statuts seulement. Le détail technique (invitée, dossier ouvert…) reste disponible en info-bulle. */
export const OFFER_STATUS = {
  NOT_INVITED: { label: "En attente", tone: "draft" }, INVITED: { label: "En attente", tone: "draft" }, OPENED: { label: "En attente", tone: "draft" },
  IN_PROGRESS: { label: "En attente", tone: "draft" }, NO_RESPONSE: { label: "En attente", tone: "draft" },
  SUBMITTED: { label: "Reçue", tone: "ready" }, DECLINED: { label: "Déclinée", tone: "muted" }, TO_CLARIFY: { label: "À clarifier", tone: "review" },
};
const OFFER_DETAIL = { NOT_INVITED: "Non invitée", INVITED: "Invitée", OPENED: "Dossier ouvert", IN_PROGRESS: "Réponse en cours", NO_RESPONSE: "Sans réponse", SUBMITTED: "Offre remise", DECLINED: "A décliné" };
export const offerStatusLabel = (status) => OFFER_STATUS[status]?.label || "En attente";
export const offerStatusDetail = (status) => OFFER_DETAIL[status] || "";
