const fold = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const DEFINITION = /\b(qu est[- ]?ce|c est quoi|que signifie|definition|difference entre)\b/;
const EXPLICIT_CHANGE = /\b(ajoute|impose|mets|passe|remplace|modifie|change|supprime|applique|reformule|redige)\w*\b/;
const WHY = /\b(pourquoi|d ou vient|origine|provenance)\b/;

/**
 * Suggestions du chat CCTP : registre ferme, 0 a 3 entrees. Une explication
 * generale n'est jamais transformee implicitement en prescription projet.
 */
export function chapterSuggestionLabels(message, nextPrompt, { hasSelection = false } = {}) {
  const text = fold(message);
  if (DEFINITION.test(text) && !EXPLICIT_CHANGE.test(text)) return [];
  const suggestions = [];
  if (EXPLICIT_CHANGE.test(text) && hasSelection) suggestions.push("Appliquer au passage sélectionné");
  if (WHY.test(text) && hasSelection) suggestions.push("Voir ce passage dans le CCTP");
  const next = String(nextPrompt || "").trim();
  if (next && !/transformer (?:cette )?réponse en clause/i.test(next) && !/utiliser cette réponse|^appliquer$/i.test(next)) suggestions.push(next);
  return [...new Set(suggestions)].slice(0, 3);
}
