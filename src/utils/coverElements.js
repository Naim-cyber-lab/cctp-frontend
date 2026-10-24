const linesOf = (item) =>
  String(item?.text || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

const horizontalOverlap = (a, b) =>
  Math.max(
    0,
    Math.min(Number(a.x) + Number(a.width), Number(b.x) + Number(b.width)) -
      Math.max(Number(a.x), Number(b.x)),
  );

/**
 * Un « cadre » est un décor de taille modeste (encadré rouge d'un titre, filet, cartouche…) : on peut le sélectionner et le
 * supprimer comme un texte. Les grands fonds (colonne grisée, page colorée) restent intouchables : cliquer dessus doit
 * continuer à créer une zone de texte.
 */
export const isCoverFrame = (item) =>
  item?.type === "shape" &&
  (Number(item.width) * Number(item.height)) / 10000 < 0.15 &&
  Number(item.height) < 60;

/**
 * Supprime plusieurs éléments d'un coup (un tableau entier, un bloc sélectionné à la souris…) : l'ensemble est traité comme UN
 * bloc, dont la hauteur est libérée pour faire remonter ce qui se trouve dessous dans la même colonne.
 */
export function removeCoverElementsAndReflow(elements = [], ids = [], gap = 0.8) {
  const wanted = new Set(ids);
  const group = elements.filter((item) => wanted.has(item.id));
  if (!group.length) return elements;
  const top = Math.min(...group.map((item) => Number(item.y) || 0));
  const bottom = Math.max(...group.map((item) => (Number(item.y) || 0) + (Number(item.height) || 0)));
  const left = Math.min(...group.map((item) => Number(item.x) || 0));
  const right = Math.max(...group.map((item) => (Number(item.x) || 0) + (Number(item.width) || 0)));
  const anchor = { x: left, width: right - left, y: top, height: bottom - top };
  const amount = anchor.height + gap;
  return elements
    .filter((item) => !wanted.has(item.id))
    .map((item) => {
      if (!participatesInFlow(item) || Number(item.y) + 0.15 < bottom || !sharesFlowColumn(anchor, item)) return item;
      return { ...item, y: Number(Math.max(top, Number(item.y) - amount).toFixed(3)), flowAdjusted: true };
    });
}

/** Éléments sélectionnables qui touchent le rectangle (en % de la page) : texte, image, cadres et traits — jamais les grands fonds. */
export function coverElementsInRect(elements = [], rect) {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return elements
    .filter((item) => item.type === "text" || item.type === "image" || isCoverFrame(item))
    .filter((item) => {
      const x = Number(item.x) || 0;
      const y = Number(item.y) || 0;
      return x < right && x + (Number(item.width) || 0) > rect.x && y < bottom && y + (Number(item.height) || 0) > rect.y;
    })
    .map((item) => item.id);
}

/** Cadre ou trait dont le BORD est sous le pointeur (tolérance en % de la page) ; l'intérieur d'un cadre reste libre pour écrire. */
export function coverShapeAt(elements = [], x, y, tolX = 0.8, tolY = 0.6) {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const item = elements[index];
    if (!isCoverFrame(item)) continue;
    const left = Number(item.x) || 0;
    const top = Number(item.y) || 0;
    const width = Number(item.width) || 0;
    const height = Number(item.height) || 0;
    const insideOuter = x >= left - tolX && x <= left + width + tolX && y >= top - tolY && y <= top + height + tolY;
    if (!insideOuter) continue;
    const insideInner = x > left + tolX && x < left + width - tolX && y > top + tolY && y < top + height - tolY;
    if (!insideInner) return item;
  }
  return null;
}

/**
 * Retourne tous les cadres/traits reliés au cadre choisi. Les cellules d'un
 * tableau PDF sont souvent importées comme plusieurs rectangles voisins : un
 * clic doit permettre de manipuler le tableau entier, pas une bordure isolée.
 */
export function connectedCoverShapes(elements = [], id, tolerance = 0.55) {
  const shapes = elements.filter(isCoverFrame);
  const start = shapes.find((item) => item.id === id);
  if (!start) return [];
  const touches = (a, b) => {
    const ax1 = Number(a.x) || 0;
    const ay1 = Number(a.y) || 0;
    const ax2 = ax1 + (Number(a.width) || 0);
    const ay2 = ay1 + (Number(a.height) || 0);
    const bx1 = Number(b.x) || 0;
    const by1 = Number(b.y) || 0;
    const bx2 = bx1 + (Number(b.width) || 0);
    const by2 = by1 + (Number(b.height) || 0);
    return ax1 <= bx2 + tolerance && ax2 + tolerance >= bx1 && ay1 <= by2 + tolerance && ay2 + tolerance >= by1;
  };
  const found = new Set([start.id]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    shapes.forEach((shape) => {
      if (!found.has(shape.id) && touches(current, shape)) {
        found.add(shape.id);
        queue.push(shape);
      }
    });
  }
  return [...found];
}

const participatesInFlow = (item) =>
  item?.type === "text" || item?.type === "image";

const sharesFlowColumn = (anchor, item) => {
  const overlap = horizontalOverlap(anchor, item);
  const sharedWidth = Math.max(
    1,
    Math.min(Number(anchor.width) || 1, Number(item.width) || 1),
  );
  return overlap / sharedWidth >= 0.2;
};

/**
 * Reproduit le comportement d'un traitement de texte sur une page de garde
 * reconstruite : retirer un bloc libère sa hauteur et fait remonter les blocs
 * suivants de la même colonne. Les décors de fond et les colonnes voisines ne
 * sont jamais déplacés.
 */
export function removeCoverElementAndReflow(elements = [], id, gap = 0.8) {
  const anchor = elements.find((item) => item.id === id);
  if (!anchor) return elements;
  const amount = Math.max(0, Number(anchor.height) || 0) + gap;
  const anchorBottom = Number(anchor.y) + Math.max(0, Number(anchor.height) || 0);
  return elements
    .filter((item) => item.id !== id)
    .map((item) => {
      if (
        !participatesInFlow(item) ||
        Number(item.y) + 0.15 < anchorBottom ||
        !sharesFlowColumn(anchor, item)
      )
        return item;
      return {
        ...item,
        y: Number(Math.max(Number(anchor.y), Number(item.y) - amount).toFixed(3)),
        flowAdjusted: true,
      };
    });
}

export function resizeCoverTextAndReflow(
  elements = [],
  id,
  nextHeight,
  nextText,
) {
  const anchor = elements.find((item) => item.id === id);
  if (!anchor) return elements;
  const oldHeight = Math.max(1, Number(anchor.height) || 1);
  const height = Math.max(1, Math.min(90, Number(nextHeight) || oldHeight));
  const delta = height - oldHeight;
  const oldBottom = Number(anchor.y) + oldHeight;
  return elements.map((item) => {
    if (item.id === id) return { ...item, text: nextText, height };
    if (
      Math.abs(delta) < 0.05 ||
      !participatesInFlow(item) ||
      Number(item.y) + 0.15 < oldBottom ||
      !sharesFlowColumn(anchor, item)
    )
      return item;
    return {
      ...item,
      y: Number(Math.max(0, Math.min(99, Number(item.y) + delta)).toFixed(3)),
      flowAdjusted: true,
    };
  });
}
const visibleTextHeight = (item) =>
  Math.max(
    Number(item.height) || 0,
    (linesOf(item).length * Math.max(6, Number(item.fontSizePt) || 10) * 1.48) /
      8.42,
  );
const resolveTextCollisions = (elements) => {
  const result = elements.map((item) => ({ ...item }));
  const texts = result
    .filter((item) => item.type === "text" && !item.tableCell)
    .sort((a, b) => Number(a.y) - Number(b.y));
  texts.forEach((item, index) => {
    if (item.manualLayout) return;
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = texts[previousIndex];
      const overlap = horizontalOverlap(previous, item);
      const shared = Math.min(
        Number(previous.width) || 1,
        Number(item.width) || 1,
      );
      const previousCenter =
        Number(previous.x) + (Number(previous.width) || 0) / 2;
      const itemCenter = Number(item.x) + (Number(item.width) || 0) / 2;
      const sameCenteredColumn =
        Math.abs(previousCenter - itemCenter) < Math.max(4, shared * 0.45);
      if (overlap / shared < (sameCenteredColumn ? 0.08 : 0.38)) continue;
      const previousBottom = Number(previous.y) + visibleTextHeight(previous);
      const actualTop = Number(item.y);
      if (actualTop >= previousBottom + 0.35 || actualTop < Number(previous.y))
        continue;
      const shift = previousBottom + 0.7 - actualTop;
      item.y = Number(Math.min(98, actualTop + shift).toFixed(3));
      item.collisionAdjusted = true;
    }
  });
  return result;
};

export function createBlankCoverElements({
  title = "",
  subtitle = "",
  contacts = "",
  label = "CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES",
  logos = [],
} = {}) {
  const text = (
    id,
    value,
    x,
    y,
    width,
    height,
    fontSizePt,
    bold = false,
    align = "left",
    color = "#1b2f29",
  ) => ({
    id,
    type: "text",
    text: value,
    x,
    y,
    width,
    height,
    fontFamily: "Arial",
    fontSizePt,
    bold,
    italic: false,
    align,
    color,
    userCreated: true,
    manualLayout: true,
  });
  const images = (logos || [])
    .filter((item) => item?.src)
    .map((item, index) => ({
      id: item.id || `blank-logo-${index}`,
      type: "image",
      src: item.src,
      name: item.name || "Logo",
      x: Number.isFinite(Number(item.x)) ? Number(item.x) : 10,
      y: Number.isFinite(Number(item.y)) ? Number(item.y) : 10 + index * 13,
      width: Number(item.width) || 24,
      height: Math.max(7, (Number(item.width) || 24) * 0.42),
      manualLayout: true,
    }));
  return [
    {
      id: "blank-sidebar",
      type: "shape",
      x: 0,
      y: 0,
      width: 32,
      height: 100,
      fill: "#eef0ec",
      stroke: "#eef0ec",
      strokeWidth: 0,
      manualLayout: true,
    },
    text("blank-label", label, 39, 12, 52, 5, 9, true, "left", "#315f51"),
    text("blank-title", title || "Titre du CCTP", 39, 23, 52, 13, 24, true),
    text(
      "blank-subtitle",
      subtitle || "Sous-titre ou adresse de l’opération",
      39,
      42,
      52,
      8,
      12,
      false,
    ),
    text(
      "blank-contacts",
      contacts || "Coordonnées et intervenants du projet",
      6,
      60,
      22,
      24,
      9,
      false,
    ),
    ...images,
  ];
}

export function normalizeCoverElements(elements = []) {
  const source = elements
    .map((item) => ({ ...item }))
    .filter((item) => {
      if (item.type !== "shape" || !/^#[0-9a-f]{6}$/i.test(item.fill || ""))
        return true;
      const value = item.fill.slice(1);
      const channels = [0, 2, 4].map((index) =>
        parseInt(value.slice(index, index + 2), 16),
      );
      const grayscale = Math.max(...channels) - Math.min(...channels) < 10;
      const area = (Number(item.width) * Number(item.height)) / 10000;
      return !(
        grayscale &&
        area > 0.01 &&
        area < 0.15 &&
        Number(item.width) < 55 &&
        Number(item.height) < 40
      );
    })
    .map((item) => {
      if (
        item.manualLayout ||
        item.type !== "text" ||
        item.tableCell ||
        item.align === "center"
      )
        return item;
      const text = String(item.text || "").trim();
      if (
        Number(item.x) > 30 &&
        Number(item.width) > 20 &&
        text.length > 5 &&
        text.toUpperCase() === text
      )
        return { ...item, align: "center" };
      return item;
    });
  const header = source.find((item) => {
    if (item.type !== "text") return false;
    const lines = linesOf(item).map((value) => value.toLowerCase());
    return lines.slice(0, 3).join("|") === "date|indice|phase";
  });
  if (!header) return resolveTextCollisions(source);
  const headerLines = linesOf(header);
  const embeddedValues =
    headerLines.length >= 6 ? headerLines.slice(3, 6) : null;
  const values = embeddedValues
    ? null
    : source.find((item) => {
        if (item === header || item.type !== "text") return false;
        const lines = linesOf(item);
        return (
          lines.length >= 3 &&
          Number(item.y) >= Number(header.y) &&
          Number(item.y) - Number(header.y) < 18 &&
          Math.abs(Number(item.x) - Number(header.x)) < 20
        );
      });
  if (!embeddedValues && !values) return resolveTextCollisions(source);
  const valueGeometry = values || header;
  const left = Math.min(Number(header.x), Number(valueGeometry.x));
  const right = Math.max(
    Number(header.x) + Number(header.width),
    Number(valueGeometry.x) + Number(valueGeometry.width),
  );
  const totalWidth = right - left;
  const cellWidth = totalWidth / 3;
  const repaired = source.filter((item) => item !== header && item !== values);
  [
    { item: header, lines: headerLines.slice(0, 3) },
    {
      item: valueGeometry,
      lines: embeddedValues || linesOf(values).slice(0, 3),
    },
  ].forEach(({ item: row, lines: rowLines }, rowIndex) => {
    rowLines.forEach((text, columnIndex) =>
      repaired.push({
        ...row,
        id: `${row.id}-row-${rowIndex}-cell-${columnIndex}`,
        text,
        x: Number((left + columnIndex * cellWidth).toFixed(3)),
        y:
          rowIndex === 0
            ? Number(header.y)
            : Number(
                (embeddedValues
                  ? Number(header.y) + Math.max(Number(header.height) / 2, 1.7)
                  : Number(valueGeometry.y)
                ).toFixed(3),
              ),
        width: Number(cellWidth.toFixed(3)),
        height: Math.max(
          Number(row.height) / (embeddedValues ? 2 : 1) || 1.3,
          1.7,
        ),
        align: "center",
        tableCell: true,
        repairedTable: true,
        bold: rowIndex === 0 ? false : row.bold,
      }),
    );
  });
  return resolveTextCollisions(repaired);
}
