// Bold + font-size cascade for numbered headings ("2" / "2.3" / "2.3.10"), reusing the same
// numbering convention used elsewhere in the app (sommaire, comparaison de lots) to detect
// heading depth: the number of dot-separated segments is the nesting level.
export const DEFAULT_HEADING_STYLES = [
  { sizePt: 15, bold: true, centered: false, align: 'left' },
  { sizePt: 13, bold: true, centered: false, align: 'left' },
  { sizePt: 11.5, bold: true, centered: false, align: 'left' },
  { sizePt: 11, bold: true, centered: false, align: 'left' },
];

/** Alignement d'un niveau de titre : « align » (gauche / centre / droite / justifié), à défaut l'ancien réglage « centered ». */
export const headingAlign = (style) => (['left', 'center', 'right', 'justify'].includes(style?.align) ? style.align : style?.centered ? 'center' : 'left');

export const headingDepth = text => {
  const match = text.match(/^(\d+[a-zA-Z]?(?:\.\d+[a-zA-Z]?)*)[\s.\-–—:]+\S/);
  return match ? Math.min(match[1].split('.').length, DEFAULT_HEADING_STYLES.length) : 0;
};

export const autoFormatBody = (body, headingStyles = DEFAULT_HEADING_STYLES) => {
  [...body.children].forEach(node => {
    const depth = headingDepth((node.innerText || '').trim());
    if (depth) {
      const style = headingStyles[depth - 1] || DEFAULT_HEADING_STYLES[depth - 1];
      node.style.fontWeight = style.bold ? '700' : '400';
      node.style.fontSize = `${style.sizePt}pt`;
      node.style.textAlign = headingAlign(style) === 'left' ? '' : headingAlign(style);
      node.style.marginTop = depth === 1 ? '20px' : depth === 2 ? '14px' : '9px';
    } else {
      node.style.fontWeight = '';
      node.style.fontSize = '';
      node.style.textAlign = '';
      node.style.marginTop = '';
    }
  });
};
