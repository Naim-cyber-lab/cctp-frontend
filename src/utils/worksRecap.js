// Tableau récapitulatif des ouvrages du questionnaire : aucune valeur n'est inventée,
// une information absente est marquée « à préciser » et renvoie à la question concernée.
export const MISSING = "à préciser";
export const RECAP_COLUMNS = ["Repère", "Désignation", "Famille", "Localisation", "Fonction", "Repérage / quantité", "Hauteur", "Acoustique", "Feu", "Thermique"];
const PREFIX = { cloison: "CLO", doublage: "DOU", plafond: "PLF", gaine: "GAI", habillage: "HAB", protection_feu: "PFI", acoustique: "ACO", combles: "COM", enduit: "END" };
const THERMAL_FAMILIES = ["doublage", "combles"];

const text = (value) => (Array.isArray(value) ? value.join(" ; ") : String(value ?? "")).trim();
const present = (value) => text(value) !== "";
const NONE = "—";

export function buildRecap(works, familyLabel) {
  const counters = {};
  return works.map((work) => {
    const a = work.answers || {};
    counters[work.family] = (counters[work.family] || 0) + 1;
    const known = (question, value) => ({ value: text(value), missing: false, question });
    const asked = (question, value) => (present(value) ? known(question, value) : { value: MISSING, missing: true, question });
    const requirement = (flagId, valueId, ...extraIds) => {
      const flag = text(a[flagId]);
      if (/^non$/i.test(flag)) return { value: NONE, missing: false, question: flagId };
      const detail = [...extraIds.map((id) => text(a[id])), text(a[valueId])].filter(Boolean).join(" · ");
      if (present(a[valueId])) return known(valueId, detail);
      if (!flag || /confirmer/i.test(flag)) return { value: MISSING, missing: true, question: flagId };
      return { value: MISSING, missing: true, question: valueId };
    };
    const thermal = present(a["Q-TH01"]) || THERMAL_FAMILIES.includes(work.family) ? requirement("Q-TH01", "Q-TH02") : { value: NONE, missing: false, question: "Q-TH01" };
    return {
      id: work.id,
      cells: [
        known("", `${PREFIX[work.family] || "OUV"}-${String(counters[work.family]).padStart(2, "0")}`),
        known("Q-W01", a["Q-W01"] || work.label),
        known("", familyLabel(work.family)),
        asked("Q-W02", a["Q-W02"]),
        asked("Q-W04", a["Q-W04"]),
        asked("Q-W03", a["Q-W03"]),
        asked("Q-G01", a["Q-G01"]),
        requirement("Q-ACO01", "Q-ACO03", "Q-ACO02"),
        requirement("Q-FEU01", "Q-FEU02"),
        thermal,
      ],
    };
  });
}

export const recapRows = (recap) => recap.map((row) => row.cells.map((cell) => cell.value));
export const recapTsv = (recap) => [RECAP_COLUMNS, ...recapRows(recap)].map((row) => row.join("\t")).join("\n");
