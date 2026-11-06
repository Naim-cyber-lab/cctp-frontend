const asValues = (value) => (Array.isArray(value) ? value : String(value ?? "").split(" ; ")).map((item) => String(item).trim()).filter(Boolean);
const fold = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const render = (template, value) => String(template || "").replaceAll("{{réponse}}", String(value ?? "")).trim();

/** Textes contractuels déterministes définis dans le Studio questionnaire. */
export function generatedPrescriptions(answers, questions) {
  const byId = Object.fromEntries((questions || []).map((question) => [question.id, question]));
  const lines = [];
  Object.entries(answers || {}).forEach(([questionId, raw]) => {
    const question = byId[questionId]; const generation = question?.generation;
    if (!generation) return;
    const mapping = generation.byAnswer || {};
    const normalized = Object.fromEntries(Object.entries(mapping).map(([key, value]) => [fold(key), value]));
    const values = asValues(raw);
    const rendered = values.map((value) => render(normalized[fold(value)] || generation.default, value)).filter(Boolean);
    if (rendered.length) lines.push(...rendered.map((text) => `###PRESCRIPTION ${questionId} — ${question.label} : ${text}`));
  });
  return lines;
}
