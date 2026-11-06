// Consignes de style dites dans la conversation (« centre les titres », « titres en rouge », « mets le texte en italique », « tout en police 12 »).
// Interprétées par des règles (aucun modèle) : cible × propriétés ; elles ne changent jamais un mot du texte, seulement son apparence.
import { headingDepth } from "./autoFormat";

const fold = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const COLORS = { rouge: "#c62828", bleu: "#1565c0", "bleu fonce": "#0d2a6b", "bleu clair": "#4fa3e0", vert: "#2e7d32", "vert fonce": "#1b5e20", noir: "#000000", gris: "#616161", orange: "#ef6c00", jaune: "#f9a825", violet: "#6a1b9a", marron: "#6d4c41", rose: "#d81b60", blanc: "#ffffff", bordeaux: "#7b1e2b" };

const TARGETS = [
  ["subtitles", /\bsous[-\s]?titres?\b/],
  ["titles", /\b(titres?|intitules?|titrage)\b/],
  ["all", /\b(tout|tous|toute|toutes)\b.*\b(lot|chapitre|document|texte|ensemble|page)\b|\b(le|ce|cet)\s+(lot|chapitre|document)\b|\bl'ensemble\b|\bpartout\b/],
  ["body", /\b(texte|paragraphes?|corps|contenu|description)\b/],
];
const PROP_WORDS = /\b(couleur|rouge|bleu|vert|noir|gris|orange|jaune|violet|marron|rose|blanc|bordeaux|gras|italique|souligne\w*|barre\w*|alinea\w*|retrait\w*|taille|police|centre\w*|aligne\w*|justifi\w*|plus grand\w*|plus petit\w*|agrandi\w*|reduis|reduire|diminue\w*|\d+\s*(pt|px|points?))\b/;
const STYLE_VERB = /\b(change\w*|met|mets|mettre|mettez|passe\w*|rends|rendre|applique\w*|colorie\w*|enleve\w*|retire\w*|supprime\w*|annule\w*|remets?|souligne\w*|centre\w*|aligne\w*|justifi\w*|agrandi\w*|reduis|diminue\w*|augmente\w*)\b/;

/** Mots qui font soupçonner une consigne d'apparence : le modèle local tranche (consigne ou non) ; sans eux, aucune interprétation n'est demandée. */
export const STYLE_LEXICON = /(couleur|rouge|bleu|vert|noir|gris|orange|jaune|violet|marron|rose|bordeaux|gras|italique|soulign|alin[ée]a|retrait|saut|ligne vide|ligne blanche|taille|police|centr|align|justifi|droite|gauche|titre|paragraphe|texte courant|plus grand|plus petit|agrandi|ressort|sobre|lisible|comme avant|remet|idem|pareil|fonc|clair|annul)/i;

const COLOR_WORDS = "rouge|bleu|vert|noir|gris|orange|jaune|violet|rose|bordeaux|marron|gras|italique";
// début d'une consigne portant sur UN PASSAGE : « souligne : <texte> », « mets en gras « <texte> » », « passe en rouge <texte> »
const PASSAGE_HEAD = new RegExp(`^\\s*(?:souligne\\w*|surligne\\w*|colorie\\w*|(?:mets?|met|mettre|mettez|passe\\w*)\\s+(?:(?:le|la|ce|cet|cette)\\s+(?:passage|texte|paragraphe|phrase|extrait)\\s+(?:suivant\\s+)?)?en\\s+(?:${COLOR_WORDS})|(?:enleve\\w*|retire\\w*|supprime\\w*)\\s+(?:le\\s+)?(?:gras|soulignement|italique)\\s+(?:de|du|sur))(?:\\s+(?:le|la|ce|cet|cette)\\s+(?:passage|texte|paragraphe|phrase|extrait)(?:\\s+suivant)?)?`);

/** « souligne : Mode de prescription : Le présent article… » : retourne { head, passage } quand la consigne désigne un passage du texte par son contenu, sinon null.
 *  Le contenu du passage n'est JAMAIS lu comme une consigne (il peut contenir « l'ensemble », « texte »…, et ne doit pas viser tout le lot). */
function extractPassage(text) {
  const raw = String(text || "").trim();
  const found = fold(raw).match(PASSAGE_HEAD);   // fold conserve la longueur : l'indice vaut aussi pour le texte d'origine
  if (!found) return null;
  const head = raw.slice(0, found[0].length).trim();
  let rest = raw.slice(found[0].length);
  const delimited = /^\s*[:：]|^\s*[«"“]/.test(rest);
  rest = rest.replace(/^\s*[:：]?\s*/, "").replace(/^[«"“]\s*/, "").replace(/\s*[»"”]\s*$/, "").trim();
  const words = rest.split(/\s+/).filter(Boolean).length;
  const targetLike = TARGETS.some(([, pattern]) => pattern.test(fold(rest.split(/\s+/).slice(0, 5).join(" "))));
  if (delimited ? words < 4 || (words <= 6 && targetLike) : words < 10 || targetLike) return null;
  return { head, passage: rest };
}

/** Retourne null si ce n'est pas une consigne de style ; sinon { target, props, recognized } (recognized : au moins une propriété comprise).
 *  Une consigne sur un passage donne { target: "passage", passage, props, recognized }. */
export function parseStyleCommand(text, previousTarget = null) {
  const own = extractPassage(text);
  if (own) {
    const base = parseStyleCommand(`${own.head} le texte`);
    return base?.recognized ? { target: "passage", passage: own.passage, props: base.props, recognized: true } : null;
  }
  const t = fold(text);
  // « retire les sauts de ligne » : suppression des paragraphes vides, sur tout le chapitre (ajouter des lignes vides n'est pas géré)
  if (/\b(sauts?\s+de\s+lignes?|lignes?\s+(vides?|blanches?)|paragraphes?\s+vides?)\b/.test(t)) {
    return /\b(enleve\w*|retire\w*|supprime\w*|efface\w*|sans)\b/.test(t) ? { target: "all", props: { compact: true }, recognized: true } : null;
  }
  if (previousTarget && previousTarget !== "passage" && t.split(/\s+/).length <= 8 && !TARGETS.some(([, pattern]) => pattern.test(t))) {
    // suivi de conversation (« en bleu », « et en gras », « plus grand ») : même cible que la consigne de style précédente
    const followUp = parseStyleCommand(`${text} ${{ headings: "titres", titles: "titres", subtitles: "sous-titres", body: "texte", all: "tout le lot" }[previousTarget]}`);
    return followUp?.recognized ? followUp : null;
  }
  // « titres et sous-titres » = tous les titres ; « sous-titres » seul = niveaux 1.1 et au-delà
  const withoutSub = t.replace(/\bsous[-\s]?titres?\b/g, " ");
  const wantsIndent = /\b(alinea\w*|retrait\w*)\b/.test(t);
  // l'alinéa concerne les paragraphes : sans cible dite, c'est le texte (jamais les titres)
  const target = TARGETS[1][1].test(withoutSub) ? "headings" : TARGETS[0][1].test(t) ? "subtitles" : (TARGETS.slice(2).find(([, pattern]) => pattern.test(t)) || [])[0] || (wantsIndent ? "body" : undefined);
  if (!target || !(PROP_WORDS.test(t) || STYLE_VERB.test(t))) return null;
  // une phrase de rédaction (« précise que les titres… », « ajoute… ») n'est pas une consigne de style
  if (/\b(ajoute\w*|precise\w*|redige\w*|reformule\w*|complete\w*|remplace\w*|question|pourquoi|comment|quel\w*|norme|dtu)\b/.test(t) && !/\b(couleur|gras|italique|souligne|police|taille|centre|aligne|justifi)/.test(t)) return null;
  const reset = /\b(enleve\w*|retire\w*|supprime\w*|annule\w*|remets?|sans)\b/.test(t);
  const props = {};
  const colorKey = Object.keys(COLORS).sort((a, b) => b.length - a.length).find((name) => new RegExp(`\\b${name}\\b`).test(t));
  if (colorKey && !/\bfond\b/.test(t)) props.color = reset && /\bcouleur\b/.test(t) ? "" : COLORS[colorKey];
  else if (reset && /\bcouleur\b/.test(t)) props.color = "";
  if (/\bgras\b/.test(t)) props.bold = !reset;
  if (/\bitalique\b/.test(t)) props.italic = !reset;
  if (/\bsouligne\w*/.test(t)) props.underline = !reset;
  if (wantsIndent) props.indent = !reset;
  // « plus centrés », « pas centrés », « je les vois toujours centrés » : le centrage est refusé (à droite si dit, sinon à gauche)
  const notCentered = /\b(plus|pas|non|sans|toujours|encore)\s+(les\s+|le\s+)?(\w+\s+)?centr\w*/.test(t);
  if (/\bdroite\b/.test(t)) props.align = "right";
  else if (/\bgauche\b/.test(t)) props.align = "left";
  else if (/\bjustifi\w*/.test(t)) props.align = "justify";
  else if (notCentered) props.align = "left";
  else if (/\bcentre\w*/.test(t)) props.align = "center";
  const size = t.match(/\b(\d{1,2}(?:[.,]\d)?)\s*(pt|px|points?)?\b/);
  if (/\b(taille|police)\b/.test(t) && size) props.size = { value: parseFloat(size[1].replace(",", ".")), unit: /pt|point/.test(size[2] || "") ? "pt" : "px" };
  else if (/\b(plus grand\w*|agrandi\w*|augmente\w*)\b/.test(t)) props.sizeDelta = 2;
  else if (/\b(plus petit\w*|reduis|reduire|diminue\w*)\b/.test(t)) props.sizeDelta = -2;
  return { target, props, recognized: Object.keys(props).length > 0 };
}

const isUpperTitle = (text) => text.length < 80 && text === text.toUpperCase() && /[A-ZÉÈÀ]{3}/.test(text);
/** Niveaux RELATIFS au document : le niveau principal est le plus haut niveau numéroté présent (« 1.1 GÉNÉRALITÉS » est un titre, « 1.1.1 » un sous-titre), pas un niveau absolu. */
export const docMinDepth = (root) => {
  const depths = [...root.children].map((block) => headingDepth((block.innerText || "").trim())).filter(Boolean);
  return depths.length ? Math.min(...depths) : 1;
};
export const blockKind = (text, minDepth = 1) => {
  const depth = headingDepth(text);
  if ((depth && depth <= minDepth) || (!depth && isUpperTitle(text))) return "title";
  if (depth > minDepth) return "subtitle";
  return "body";
};
const wanted = { titles: ["title"], subtitles: ["subtitle"], headings: ["title", "subtitle"], body: ["body"], all: ["title", "subtitle", "body"] };
const ORDER = ["all", "headings", "body", "titles", "subtitles"]; // le général d'abord, le précis ensuite (« juste les titres… mais les sous-titres… »)

/** Applique une commande aux blocs affichés. Retourne le nombre de blocs modifiés. */
export function applyStyleCommand(root, command, minDepth = docMinDepth(root)) {
  return applyStyleCommandDetailed(root, command, minDepth).count;
}

/** Écrit les propriétés de la commande sur un élément (bloc ou passage) ; `reference` donne la taille de départ d'un agrandissement. */
function paint(element, props, reference = element) {
  const s = element.style;
  if ("color" in props) s.color = props.color;
  if ("bold" in props) s.fontWeight = props.bold ? "700" : "400";
  if ("italic" in props) s.fontStyle = props.italic ? "italic" : "normal";
  if ("underline" in props) s.textDecoration = props.underline ? "underline" : "none";
  if ("indent" in props) s.textIndent = props.indent ? "1.25cm" : "";
  if ("align" in props) s.textAlign = props.align === "left" ? "" : props.align;
  if (props.size) s.fontSize = `${props.size.value}${props.size.unit}`;
  if (props.sizeDelta) s.fontSize = `${Math.max(8, Math.round(parseFloat(getComputedStyle(reference).fontSize) + props.sizeDelta))}px`;
}

/** Un caractère ramené à une forme comparable : sans accent, minuscule, apostrophes droites (les copier-coller changent ’ et espaces insécables). */
const comparable = (char) => fold(char).replace(/[’‘`]/g, "'");
/** Texte d'un bloc en forme comparable (espaces regroupés) et, pour chaque caractère, sa position réelle (nœud de texte, décalage). */
function comparableMap(block) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let flat = "";
  const positions = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.nodeValue || "";
    for (let index = 0; index < raw.length; index += 1) {
      const char = comparable(raw[index]);
      if (!char) continue;
      if (/\s/.test(char)) {
        if (!flat || flat.endsWith(" ")) continue;
        flat += " ";
      } else flat += char;
      positions.push([node, index]);
    }
  }
  return { flat, positions };
}
const comparableText = (text) => [...String(text || "")].map(comparable).join("").replace(/\s+/g, " ").trim();

/** Applique la commande au seul passage cité (première occurrence de chaque bloc qui le contient) : le texte lui-même n'est jamais modifié, seulement enveloppé d'un <span> de style. */
function applyPassage(root, command) {
  const needle = comparableText(command.passage);
  let count = 0;
  const blocks = [];
  if (needle.length < 8) return { count, blocks };
  [...root.children].forEach((block) => {
    const { flat, positions } = comparableMap(block);
    const at = flat.indexOf(needle);
    if (at < 0) return;
    const [startNode, startOffset] = positions[at];
    const [endNode, endOffset] = positions[at + needle.length - 1];
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset + 1);
    const span = document.createElement("span");
    span.setAttribute("data-style-passage", "1");
    paint(span, command.props, block);
    span.appendChild(range.extractContents());
    range.insertNode(span);
    count += 1;
    blocks.push(block);
  });
  return { count, blocks };
}

/** Comme applyStyleCommand, mais retourne aussi les blocs touchés (pour « Voir la modification ») : { count, blocks }. */
export function applyStyleCommandDetailed(root, command, minDepth = docMinDepth(root)) {
  if (command.target === "passage") return applyPassage(root, command);
  const { target, props } = command;
  let count = 0;
  const blocks = [];
  [...root.children].forEach((block) => {
    const text = (block.innerText || "").trim();
    if (!text || !wanted[target].includes(blockKind(text, minDepth))) return;
    paint(block, props);
    count += 1;
    blocks.push(block);
  });
  return { count, blocks };
}

/** Supprime les blocs vides (lignes blanches) ; un bloc qui contient une image, un tableau ou un trait n'est jamais retiré. Retourne le nombre de blocs retirés. */
function removeBlankBlocks(root) {
  let count = 0;
  [...root.children].forEach((block) => {
    if ((block.innerText || "").trim() || block.querySelector("img, table, hr, svg, canvas")) return;
    block.remove();
    count += 1;
  });
  return count;
}

/** Applique plusieurs commandes (une par cible) ; retourne [{ command, count }] dans l'ordre d'application. */
export function applyStyleCommands(root, commands) {
  // suppression des lignes vides d'abord : les autres commandes ne comptent alors que les blocs restants
  const results = commands.filter((command) => command.props?.compact).map((command) => ({ command, count: removeBlankBlocks(root), blocks: [] }));
  const minDepth = docMinDepth(root);
  const styles = commands.filter((command) => !command.props?.compact && Object.keys(command.props || {}).length);
  return [...results, ...[...styles].sort((a, b) => ORDER.indexOf(a.target) - ORDER.indexOf(b.target)).map((command) => ({ command, ...applyStyleCommandDetailed(root, command, minDepth) }))];
}

const TARGET_LABEL = { titles: "titre", subtitles: "sous-titre", headings: "titre", body: "paragraphe", all: "bloc", passage: "passage" };
const PASSAGE_NOT_FOUND = "Je n'ai pas retrouvé ce passage dans le chapitre affiché : je n'ai rien modifié. Citez-le tel qu'il apparaît (au moins une phrase entière) ou donnez-en le début.";
const bitsOf = (props) => {
  const bits = [];
  if ("color" in props) bits.push(props.color ? `en ${Object.keys(COLORS).find((name) => COLORS[name] === props.color)}` : "couleur d'origine");
  if ("bold" in props) bits.push(props.bold ? "en gras" : "sans gras");
  if ("italic" in props) bits.push(props.italic ? "en italique" : "sans italique");
  if ("underline" in props) bits.push(props.underline ? "soulignés" : "sans soulignement");
  if ("indent" in props) bits.push(props.indent ? "avec alinéa" : "sans alinéa");
  if ("align" in props) bits.push({ center: "centrés", left: "alignés à gauche", right: "alignés à droite", justify: "justifiés" }[props.align]);
  if (props.size) bits.push(`en taille ${props.size.value} ${props.size.unit}`);
  if (props.sizeDelta) bits.push(props.sizeDelta > 0 ? "agrandis" : "réduits");
  return bits;
};
const REMOVALS = { bold: "le gras", italic: "l'italique", underline: "le soulignement" };
const partOf = ({ command, count }) => {
  const keys = Object.keys(command.props);
  if (count && keys.length && keys.every((key) => key in REMOVALS && command.props[key] === false)) {
    // retrait pur (« enlève le gras ») : « le gras a été supprimé sur 268 blocs »
    const what = keys.map((key) => REMOVALS[key]);
    const list = what.length > 1 ? `${what.slice(0, -1).join(", ")} et ${what[what.length - 1]}` : what[0];
    return `${list} ${what.length > 1 ? "ont été supprimés" : "a été supprimé"} sur ${count} bloc${count > 1 ? "s" : ""}`;
  }
  if (command.props.compact) return `${count} ligne${count > 1 ? "s" : ""} vide${count > 1 ? "s" : ""} supprimée${count > 1 ? "s" : ""}`;
  const label = TARGET_LABEL[command.target];
  if (command.target === "passage" && count) return `${count} passage${count > 1 ? "s" : ""} ${bitsOf(command.props).map((bit) => (count === 1 ? bit.replace(/(és|is)$/, (ending) => ending.slice(0, -1)) : bit)).join(", ")}`;
  return count ? `${count} ${label}${count > 1 ? "s" : ""} ${bitsOf(command.props).join(", ")}` :`aucun ${label} trouvé pour « ${bitsOf(command.props).join(", ")} »`;
};
/** Réponse fidèle à ce qui a été réellement appliqué (une partie par commande, y compris celles qui n'ont touché aucun bloc). */
export function describeStyles(results) {
  const done = results.filter((item) => item.count);
  const missed = results.filter((item) => !item.count);
  if (!done.length && results[0].command.target === "passage") return PASSAGE_NOT_FOUND;
  if (!done.length && results[0].command.props.compact) return "Rien à faire : je n'ai trouvé aucune ligne vide à supprimer dans ce chapitre.";
  if (!done.length) return `La modification n'a pas pu être appliquée : je n'ai trouvé aucun ${TARGET_LABEL[results[0].command.target]} à modifier dans ce chapitre (titres numérotés 1.1, 1.2.3… ou en majuscules).`;
  return `Fait : ${done.map(partOf).join(" ; ")}.${missed.length ? ` Non appliqué : ${missed.map(partOf).join(" ; ")}.` : ""} Le texte n'a pas changé.`;
}
export const describeStyle = (command, count) => describeStyles([{ command, count }]);

export const STYLE_HELP = "Je sais modifier l'apparence (sans toucher au texte) : couleur (« titres en rouge »), gras, italique, souligné, alinéa (« mets un alinéa au texte »), suppression des lignes vides (« retire les sauts de ligne »), taille (« texte en 12 pt », « titres plus grands »), alignement (« centre les titres », « justifie le texte »), sur les titres, les sous-titres, le texte ou tout le lot. Pour retirer un style : « enlève le gras des titres ».";

/** Consigne à PLUSIEURS ordres (« juste les titres au centre mais les sous-titres à gauche », « titres en bleu et texte en gris ») : les règles de secours ne savent pas l'exécuter fidèlement. */
export const isCompoundStyle = (text) => {
  const t = fold(text);
  if (/\b(mais|sauf|puis|ensuite|juste|seulement|uniquement|par contre|alors que)\b/.test(t)) return true;
  // « titres et sous-titres » désigne UNE cible (tous les titres) ; sinon deux cibles différentes citées = deux ordres
  const rest = t.replace(/\b(titres?\s+et\s+sous[-\s]?titres?|sous[-\s]?titres?\s+et\s+titres?)\b/g, " ");
  const subtitles = /\bsous[-\s]?titres?\b/.test(rest);
  const titles = /\btitres?\b/.test(rest.replace(/\bsous[-\s]?titres?\b/g, " "));
  const body = /\b(texte|paragraphes?|corps)\b/.test(rest);
  return [subtitles, titles, body].filter(Boolean).length >= 2;
};

const LAYOUT_ACTION = /\b(mets?|mettre|mettez|change\w*|retire\w*|enleve\w*|supprime\w*|ajoute\w*|augmente\w*|reduis|diminue\w*|passe\w*|applique\w*|fais|faire|modifie\w*|regle\w*|laisse\w*|insere\w*|rends|decale\w*|espace\w*)\b/;
const LAYOUT_WORDS = /\b(interlignes?|espacements?|marges?|sauts?\s+de\s+pages?|sauts?\s+de\s+lignes?|lignes?\s+(vides?|blanches?)|en-?tetes?|pieds?\s+de\s+pages?|numerotation\s+des\s+pages|numeros?\s+de\s+pages?|bordures?|encadr\w*|surlign\w*|majuscules?|minuscules?|colonnes?|orientation|paysage|portrait|tabulations?|indentation|filigranes?)\b/;
const QUESTION = /\?|^\s*(quel\w*|comment|pourquoi|combien|est-ce|que|qu'|ou|quand)\b/;

/** Demande de MISE EN PAGE hors de ce que l'éditeur sait faire (interligne, marges, en-tête…) : à refuser honnêtement plutôt que d'aller chercher une « réponse » dans le corpus fabricants. */
export const isUnsupportedLayout = (text) => {
  const t = fold(text);
  return !QUESTION.test(t) && LAYOUT_ACTION.test(t) && LAYOUT_WORDS.test(t);
};

export const UNSUPPORTED_LAYOUT = "Je ne sais pas encore faire cette mise en page, et je n'ai rien modifié. " + STYLE_HELP;

export const MODEL_DOWN = "La modification n'a pas pu être appliquée : cette consigne contient plusieurs ordres et je ne peux pas la traiter pour le moment. Rien n'a été modifié. Réessayez dans un instant, ou donnez un seul ordre à la fois (par exemple « centre les titres »).";

/** Voie rapide (aucun appel au modèle) : une phrase courte, autonome (cible dite), à un seul ordre, sans reproche, renvoi au contexte ni comparatif. Tout le reste va au modèle. */
export const isEvidentStyle = (text, parsed) => {
  if (!parsed?.recognized) return false;
  if (parsed.passage) return true;   // consigne sur un passage cité : les règles la comprennent exactement, aucun appel au modèle (qui ne peut que se tromper de cible)
  const t = fold(text);
  if (t.split(/\s+/).length > 10 || isCompoundStyle(text)) return false;
  if (/\b(plus|pas|non|toujours|encore|remet\w*|annul\w*|comme|aussi|idem|pareil|moins|au lieu|sauf|avant|fonc\w*|clair\w*|enleve\w*|retire\w*|supprime\w*)\b/.test(t)) return false;
  return TARGETS.some(([, pattern]) => pattern.test(t));
};
