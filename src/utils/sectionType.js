/** Type de section déduit d'un titre de chapitre (« 1.1 GÉNÉRALITÉS », « Mise en œuvre du doublage »…). Vide si rien de reconnaissable.
 *  Règles déterministes, mises au point sur les titres de vrais chapitres Plâtrerie (voir e2e/fixtures/titres-chapitres-reels.json). Les contrôles passent avant l'exécution :
 *  « Tolérances d'exécution et contrôles géométriques » est un contrôle, pas une mise en œuvre. */
const RULES = [
  ["execution", /^supports?|implantation/], // « Supports, implantation et réception préalable » : on prépare le chantier, on ne contrôle pas l'ouvrage
  ["controles", /controle|essai|reception|verification|tolerance|\bdoe\b|dossier d.ouvrages? executes?|approbation/],
  ["generalites", /generalit|objet|consistance|etendue|caractere complet|principes? de|reference[s]? normative|cadre reglementaire|dispositions generales|introduction|diagnostic|contraintes particulieres|prescriptions? particulieres|prestations induites/],
  ["materiaux", /materiau|fourniture|produit|composant|constitution|composition|performances? minimales?|caracteristiques? techniques?|prescription technique/],
  ["execution", /mise en oeuvre|execution|\bpose\b|realisation|preparation|travaux preparatoires|support|implantation|jonction|pied d.ouvrage|interface|raccord|desolidarisation|traitement des joints|finition|coordination|etancheite a l.air|nettoyage|protection|reservation|rebouchage|reprise|livraison/],
  ["autres", /annexes?|divers/],
];

export function sectionFromHeading(text) {
  const plain = String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe");
  const title = plain.replace(/^[\s\d.)\-–•✓➢o]+/, "").trim();
  for (const [type, pattern] of RULES) if (pattern.test(title)) return type;
  return "";
}
