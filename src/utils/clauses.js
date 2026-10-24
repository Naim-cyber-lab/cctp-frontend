import { chapters } from "../data/chapters";

/** Types de section d'une clause agence (V1 déterministe : lot, famille, type de section, étiquettes — jamais de LLM pour décider de la clause à proposer). */
export const SECTION_TYPES = { generalites: "Généralités", materiaux: "Matériaux et fournitures", execution: "Exécution", controles: "Contrôles et essais", autres: "Autres" };
export const lotLabel = (id) => (id ? chapters.find((item) => item.id === id)?.title || `Lot ${id}` : "Tous lots");
export const WORKFLOW = { DRAFT: "Brouillon", PENDING_VALIDATION: "En attente de validation", VALIDATED: "Validée", ARCHIVED: "Archivée" };
export const clauseMeta = (clause) => [lotLabel(clause.lotId), clause.workFamily, clause.sectionLabel || SECTION_TYPES[clause.sectionType]].filter(Boolean).join(" · ");

/** Type de section déduit du titre le plus proche au-dessus du curseur (« 1.1 GÉNÉRALITÉS », « Mise en œuvre »…). Vide si rien de reconnaissable. */
export function sectionFromHeading(text) {
  const plain = String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/generalit|objet|consistance|etendue/.test(plain)) return "generalites";
  if (/materiau|fourniture|produit|composant/.test(plain)) return "materiaux";
  if (/mise en oeuvre|execution|pose|realisation|preparation/.test(plain)) return "execution";
  if (/controle|essai|reception|verification/.test(plain)) return "controles";
  return "";
}

const fold = (value) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/** Réponses du questionnaire du chapitre, par identifiant de question (projet + chaque ouvrage), aplaties en textes. Le moteur métier reste la source de vérité : on ne fait que LIRE ses réponses. */
export function answersIndex(state) {
  const index = {};
  const add = (id, value) => { const list = (index[id] ||= []); (Array.isArray(value) ? value : [value]).forEach((item) => { if (String(item ?? "").trim()) list.push(String(item)); }); };
  Object.entries(state?.project || {}).forEach(([id, value]) => add(id, value));
  (state?.works || []).forEach((work) => Object.entries(work.answers || {}).forEach(([id, value]) => add(id, value)));
  return index;
}

const NEGATIVE = new Set(["non", "aucun", "aucune", "a confirmer", "sans objet", "neant"]);
/** Une clause « recommandée » l'est quand la réponse à sa question contient l'une des valeurs ; sans valeur : dès qu'une réponse utile existe. Jamais d'insertion automatique. */
export function triggerMatches(trigger, index) {
  if (!trigger?.questionId) return null;
  const answers = (index[trigger.questionId] || []).map(fold).filter(Boolean);
  const wanted = (trigger.values || []).map(fold).filter(Boolean);
  const hit = wanted.length ? answers.find((answer) => wanted.some((value) => answer.includes(value))) : answers.find((answer) => !NEGATIVE.has(answer));
  return hit === undefined ? null : hit;
}
