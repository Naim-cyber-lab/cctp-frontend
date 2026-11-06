const norm = (line) => String(line || "").replace(/\s+/g, " ").trim();

/** Différences ligne à ligne entre deux textes : [{type: "same" | "add" | "del", text}], les lignes inchangées isolées sont réduites (une ligne de contexte de chaque côté). */
export function diffRows(before, after, context = 1) {
  const a = String(before || "").split("\n").filter((line) => line.trim());
  const b = String(after || "").split("\n").filter((line) => line.trim());
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i][j] = norm(a[i]) === norm(b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const rows = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (norm(a[i]) === norm(b[j])) { rows.push({ type: "same", text: b[j] }); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) { rows.push({ type: "del", text: a[i] }); i += 1; }
    else { rows.push({ type: "add", text: b[j] }); j += 1; }
  }
  for (; i < a.length; i += 1) rows.push({ type: "del", text: a[i] });
  for (; j < b.length; j += 1) rows.push({ type: "add", text: b[j] });
  const keep = rows.map((row, index) => row.type !== "same" || rows.slice(Math.max(0, index - context), index + context + 1).some((near) => near.type !== "same"));
  const out = [];
  rows.forEach((row, index) => {
    if (keep[index]) out.push(row);
    else if (out.length && out[out.length - 1].type !== "gap") out.push({ type: "gap", text: "…" });
  });
  return out;
}
