// « [À PRÉCISER] » : repérage dans le texte du chapitre et aide à la saisie. Aucune IA : le sujet est reconnu par mots-clés dans la phrase
// qui entoure le repère, et l'aide indique quoi renseigner, où le trouver et un exemple de valeur.
export const MARKER = /\[(?:[A-ZÉÈ]+ )*À PRÉCISER\]|\[CONTRADICTION À VALIDER\]/gi;

const plain = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function kindOf(marker) {
  const text = plain(marker);
  if (text.includes("contradiction")) return "CONTRADICTION";
  if (text.includes("reference")) return "REFERENCE";
  return "VALUE";
}

/** Entoure chaque repère d'un bouton cliquable (idempotent : un repère déjà entouré n'est pas retouché). */
export function decorateToSpecify(html) {
  if (!html || !/(?:PRÉCISER|VALIDER)\]/i.test(html) || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (!walker.currentNode.parentElement.closest("[data-to-specify]") && new RegExp(MARKER.source, "i").test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment();
    let last = 0;
    const text = node.nodeValue;
    for (const match of text.matchAll(new RegExp(MARKER.source, "gi"))) {
      fragment.append(text.slice(last, match.index));
      const span = doc.createElement("span");
      span.className = "to-specify";
      span.setAttribute("data-to-specify", kindOf(match[0]));
      span.setAttribute("role", "button");
      span.setAttribute("tabindex", "0");
      span.setAttribute("title", "Cliquer pour savoir comment préciser");
      span.textContent = match[0];
      fragment.append(span);
      last = match.index + match[0].length;
    }
    fragment.append(text.slice(last));
    node.replaceWith(fragment);
  }
  return root.innerHTML;
}

// Sujets reconnus : mots-clés (sans accents) → aide. `questionId` renvoie à la question du questionnaire quand elle existe.
const TOPICS = [
  { test: /acoust|decibel|\bdb\b|\bdnt|\brw\b|bruit/, topic: "Exigence acoustique", questionId: "Q-ACO03",
    what: "L'isolement acoustique demandé entre les locaux, en dB, avec l'indicateur utilisé (par exemple DnT,A ou Rw+C).",
    where: ["Programme de l'opération ou notice acoustique", "Étude du bureau d'études acoustique", "Réglementation applicable à la destination du bâtiment"], example: "DnT,A ≥ 43 dB entre bureaux et circulation" },
  { test: /feu|incendie|\bei ?\d|\brei\b|coupe/, topic: "Exigence de résistance ou de réaction au feu", questionId: "Q-FEU02",
    what: "Le classement exigé (résistance au feu EI, réaction au feu Euroclasse) et la durée, pour l'ouvrage concerné.",
    where: ["Notice de sécurité incendie", "Rapport du contrôleur technique", "Plans de recoupement et de compartimentage"], example: "EI 60 pour les parois de gaines techniques" },
  { test: /thermi|\blambda\b|resistance thermique|coefficient u/, topic: "Performance thermique", questionId: "",
    what: "La résistance thermique R (m².K/W) attendue pour l'isolant, ou la performance globale visée.",
    where: ["Étude thermique (RE2020 / RT existant)", "Programme et notice descriptive"], example: "R ≥ 3,7 m².K/W" },
  { test: /hauteur|plafond/, topic: "Hauteur de l'ouvrage", questionId: "Q-G01",
    what: "La hauteur à traiter (sous plafond ou sous dalle) et la tolérance éventuelle.",
    where: ["Coupes et plans du projet", "Relevé de l'existant"], example: "2,60 m sous plafond" },
  { test: /entraxe|montant|ossature|fourrure/, topic: "Ossature", questionId: "Q-CLO01",
    what: "Le type d'ossature, la largeur des montants (en mm) et l'entraxe retenu.",
    where: ["Avis technique ou DTA du système choisi", "Documentation du fabricant retenu"], example: "Montants M48, entraxe 600 mm" },
  { test: /epaisseur|isolant|laine|\bmm\b|plaque|parement/, topic: "Composition et épaisseurs", questionId: "Q-CLO01",
    what: "La composition de l'ouvrage : nature et nombre des plaques, isolant et épaisseurs, avec les unités.",
    where: ["Documentation du fabricant retenu", "Plans de détails ou carnet de détails", "Performances demandées (acoustique, feu, thermique)"], example: "2 plaques BA13 + laine minérale 45 mm" },
  { test: /finition|\bq[1-4]\b|joint|ponc|peinture/, topic: "Niveau de finition", questionId: "",
    what: "Le niveau de finition attendu avant peinture (Q1 à Q4) et les critères de contrôle.",
    where: ["Pièces écrites du lot peinture", "Programme ou notice descriptive"], example: "Niveau Q3 avant peinture" },
  { test: /humid|salle d eau|sanitaire|\bwc\b|hydrofug/, topic: "Locaux humides", questionId: "Q-G06",
    what: "Les locaux concernés et le traitement attendu (plaques hydrofuges, protection à l'eau).",
    where: ["Plans de repérage des locaux", "Notice descriptive"], example: "Plaques hydrofuges H1 dans les salles d'eau du R+1" },
  { test: /joint de (structure|dilatation)|dilatation/, topic: "Joint de structure", questionId: "Q-G05",
    what: "La présence et l'emplacement des joints de structure ou de dilatation du bâtiment.",
    where: ["Plans de structure du gros œuvre"], example: "Joint de dilatation à l'axe C" },
  { test: /norme|dtu|reference|nf |avis technique|cstb/, topic: "Référence normative", questionId: "",
    what: "La référence exacte du document applicable (numéro et édition) : DTU, norme NF, Avis Technique.",
    where: ["DTU 25.41 (ouvrages en plaques de plâtre) et DTU 25.42 (doublages)", "Avis Technique du système retenu"], example: "NF DTU 25.41 P1-1" },
  { test: /occup|phasage|chantier|acces|protection/, topic: "Conditions de chantier", questionId: "Q-P03",
    what: "Les contraintes de réalisation : site occupé, phasage, horaires, protections.",
    where: ["Programme de l'opération", "Plan d'installation de chantier / phasage"], example: "Travaux en site occupé, phases par niveau" },
];

const GENERIC = {
  topic: "Information manquante", questionId: "",
  what: "Une donnée nécessaire à la rédaction n'a été trouvée ni dans votre demande, ni dans vos documents, ni dans la base métier. Rien n'a été inventé.",
  where: ["Plans et pièces écrites du projet", "Documentation du fabricant retenu", "Votre bureau d'études ou le maître d'ouvrage"], example: "",
};

/** Ligne de texte qui contient le repère (c'est elle qui indique le sujet). */
export function contextOf(node) {
  const block = node.closest("div,p,li,td,h1,h2,h3") || node.parentElement;
  return (block?.innerText || node.textContent || "").trim();
}

export function guidanceFor(marker, context) {
  const kind = kindOf(marker);
  const around = plain(context.replace(new RegExp(MARKER.source, "gi"), " "));
  if (kind === "CONTRADICTION") {
    return { kind, topic: "Contradiction à valider", questionId: "", example: "",
      what: "Deux informations du projet se contredisent (par exemple « neuf » et « rénovation », ou deux valeurs différentes). L'IA ne choisit pas à votre place.",
      where: ["Comparer les documents concernés", "Demander confirmation au maître d'ouvrage ou au bureau d'études"], context: context.slice(0, 220) };
  }
  const found = TOPICS.find((topic) => topic.test.test(around)) || GENERIC;
  const reference = kind === "REFERENCE" ? { what: "La référence exacte du texte réglementaire ou normatif applicable (numéro et édition).", where: TOPICS.find((t) => t.topic === "Référence normative").where, example: "NF DTU 25.41 P1-1" } : {};
  return { kind, ...found, ...reference, context: context.slice(0, 220) };
}

/** Phrase proposée à l'assistant pour demander de l'aide sur ce repère. */
export function assistantPrompt(guidance) {
  const line = guidance.context ? ` dans « ${guidance.context.replace(/\s+/g, " ").slice(0, 160)} »` : "";
  return `Aide-moi à préciser${line} : ${guidance.topic.toLowerCase()}. Indique-moi les valeurs usuelles et ce que je dois vérifier, sans rien inventer.`;
}
