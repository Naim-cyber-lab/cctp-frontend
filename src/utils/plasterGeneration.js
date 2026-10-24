export function buildPlasterProposal(instruction, source = '', files = []) {
  const request = instruction.trim();
  const existing = source.trim();
  const references = files.length ? `\n\nDocuments de référence ajoutés : ${files.map(file => file.filename).join(', ')}.` : '';
  return `Objet des prestations\n\nLe présent chapitre concerne l’ensemble des ouvrages de plâtrerie, cloisons, doublages, plafonds et isolation nécessaires au parfait achèvement du lot.\n\nPrescriptions particulières\n\n${request}\n\nLe titulaire vérifiera la nature, l’état et la conformité des supports avant toute intervention. Les systèmes retenus devront être compatibles avec les locaux concernés, les ouvrages adjacents et les performances attendues.\n\nMise en œuvre et coordination\n\nSont compris toutes fournitures, ossatures, parements, isolants, renforts, accessoires, découpes, calfeutrements, raccords et sujétions nécessaires. L’entreprise coordonnera ses interventions avec les lots structure, menuiseries, électricité, plomberie et CVC.${existing ? `\n\nTexte existant pris en compte :\n${existing}` : ''}${references}`;
}

export const simulatePlasterGeneration = (instruction, source, files) => new Promise(resolve => {
  window.setTimeout(() => resolve(buildPlasterProposal(instruction, source, files)), 750);
});
