export const TOKEN = "{{réponse}}";
const escapeRe = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Phrase obtenue pour une valeur : une valeur « Capitalisée » s'écrit en minuscule au milieu d'une phrase (comme dans le lot généré). */
export const fillTemplate = (template, value) => {
  const text = String(value ?? "");
  const soft = /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
  return String(template).split(TOKEN).reduce((out, part, index) => (index === 0 ? part : out + (/(^|[.!?]\s*)$/.test(out) ? text : soft) + part), "");
};

/** Règle actuelle sous forme de gabarit : la valeur de la réponse, repérée dans la phrase du lot, devient {{réponse}}. */
export const deriveTemplate = (sentence, value) => {
  const clean = String(sentence || "").replace(/^\s*[-•–]\s*/, "");
  const parts = String(Array.isArray(value) ? value.join(" ; ") : value || "").split(";").map((item) => item.trim()).filter((item) => item.length >= 2).sort((a, b) => b.length - a.length);
  for (const part of parts) {
    const pattern = new RegExp(escapeRe(part), "i");
    if (pattern.test(clean)) return clean.replace(pattern, TOKEN);
  }
  return clean;
};

/** La phrase rendue pour une valeur, en parties : { text, filled } — « filled » est la réponse injectée à la place de {{réponse}}. */
export const fillParts = (template, value) => {
  const text = String(value ?? "");
  const soft = /^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
  const parts = [];
  let before = "";
  String(template).split(TOKEN).forEach((chunk, index) => {
    if (index) {
      const injected = /(^|[.!?]\s*)$/.test(before) ? text : soft;
      parts.push({ text: before, filled: false }, { text: injected, filled: true });
      before = "";
    }
    before += chunk;
  });
  parts.push({ text: before, filled: false });
  return parts.filter((part) => part.text !== "");
};
