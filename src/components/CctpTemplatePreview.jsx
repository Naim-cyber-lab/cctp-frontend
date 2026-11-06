import { useMemo } from "react";

const PAGE_WIDTH_PX = 420;                    // largeur d'affichage de la page A4 (210 mm)
const PX_PER_MM = PAGE_WIDTH_PX / 210;
const PX_PER_PT = PAGE_WIDTH_PX / 595.28;     // 1 pt = 1/72 pouce ; A4 = 595,28 pt de large

/** Variables d'en-tête / pied de page : l'interface affiche des libellés métier, jamais les jetons techniques. */
export const TEMPLATE_VARIABLES = [["{{projet}}", "Nom du projet", "Projet exemple"], ["{{agence}}", "Agence", "Votre agence"], ["{{date}}", "Date", new Date().toLocaleDateString("fr-FR")]];

export function sampleText(text) {
  return TEMPLATE_VARIABLES.reduce((acc, [token, , sample]) => acc.split(token).join(sample), String(text || ""));
}

/** Marges prédéfinies (mm) : « normales » est la valeur par défaut de Calepin. */
export const MARGIN_PRESETS = { normal: { label: "Marges normales", values: { top: 20, right: 18, bottom: 20, left: 18 } }, compact: { label: "Marges compactes", values: { top: 12, right: 12, bottom: 12, left: 12 } }, large: { label: "Marges larges", values: { top: 25, right: 25, bottom: 25, left: 25 } } };

export function marginPresetOf(margins = {}) {
  const found = Object.entries(MARGIN_PRESETS).find(([, preset]) => ["top", "right", "bottom", "left"].every((side) => Number(margins[side]) === preset.values[side]));
  return found ? found[0] : "custom";
}

/** Aperçu en direct d'une page du CCTP : chaque réglage (police, taille, interligne, marges, titres, en-tête, pied de page, couleur d'accent) s'y voit immédiatement, sans enregistrer. */
export function CctpTemplatePreview({ page = {} }) {
  const margins = page.marginsMm || {};
  const headings = useMemo(() => page.headingStyles || [], [page.headingStyles]);
  const accent = page.colors?.accent || "#315f51";
  const body = (page.bodySizePt || 10.5) * PX_PER_PT;
  const heading = (index, fallbackPt) => ({ fontSize: (headings[index]?.sizePt || fallbackPt) * PX_PER_PT, fontWeight: headings[index]?.bold === false ? 400 : 700, textAlign: headings[index]?.align || "left", color: accent, margin: `${body * 0.9}px 0 ${body * 0.3}px` });
  const small = { fontSize: Math.max(5, 8 * PX_PER_PT), color: page.colors?.muted || "#6d7e78" };
  return <figure className="cctp-template-preview" data-template-live-preview aria-label="Aperçu en direct de la page" style={{ margin: 0 }}>
    <div style={{ width: PAGE_WIDTH_PX, height: Math.round(297 * PX_PER_MM), maxWidth: "100%", background: "#fff", border: "1px solid #d8dee4", boxShadow: "0 1px 6px rgba(0,0,0,.12)", position: "relative", overflow: "hidden", fontFamily: page.fontFamily || "Arial", color: page.colors?.text || "#172b26", boxSizing: "border-box" }}>
      {page.header?.enabled !== false && <div data-template-live-header style={{ ...small, position: "absolute", top: (margins.top ?? 20) * PX_PER_MM * 0.35, left: (margins.left ?? 18) * PX_PER_MM, right: (margins.right ?? 18) * PX_PER_MM, display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${accent}`, paddingBottom: 2 }}>
        <span>{sampleText(page.header?.text)}</span>{page.header?.showLogo !== false && <span style={{ border: `1px solid ${accent}`, padding: "0 4px", color: accent }}>Logo</span>}</div>}
      <div data-template-live-body style={{ position: "absolute", top: (margins.top ?? 20) * PX_PER_MM, bottom: (margins.bottom ?? 20) * PX_PER_MM, left: (margins.left ?? 18) * PX_PER_MM, right: (margins.right ?? 18) * PX_PER_MM, fontSize: body, lineHeight: page.lineSpacing || 1.15, overflow: "hidden" }}>
        <div style={heading(0, 15)}>LOT 06 — PLÂTRERIE – ISOLATION</div>
        <div style={heading(1, 13)}>8.1 Généralités</div>
        <p style={{ margin: 0 }}>Le présent lot comprend la fourniture et la pose des cloisons, doublages et plafonds décrits ci-après, conformément aux plans et aux règles de l’art.</p>
        <div style={heading(2, 11.5)}>8.1.1 Objet et étendue des prestations</div>
        <p style={{ margin: 0 }}>L’entreprise titulaire du présent lot devra assurer l’ensemble des prestations nécessaires à la réalisation complète des ouvrages.</p>
        <div style={heading(3, 11)}>Cloison sur ossature</div>
        <p style={{ margin: 0 }}>Les parements sont vissés sur l’ossature métallique avec joints décalés ; les jonctions sont traitées selon le niveau de finition demandé.</p>
      </div>
      {page.footer?.enabled !== false && <div data-template-live-footer style={{ ...small, position: "absolute", bottom: (margins.bottom ?? 20) * PX_PER_MM * 0.35, left: (margins.left ?? 18) * PX_PER_MM, right: (margins.right ?? 18) * PX_PER_MM, display: "flex", justifyContent: "space-between", borderTop: `1px solid ${accent}`, paddingTop: 2 }}>
        <span>{sampleText(page.footer?.text)}</span>{page.footer?.pageNumbers !== false && <span data-template-live-page-number>Page 1</span>}</div>}
    </div>
    <figcaption className="muted" style={{ fontSize: 12, marginTop: 4 }}>Aperçu indicatif : la mise en page finale suit ces réglages.</figcaption>
  </figure>;
}
