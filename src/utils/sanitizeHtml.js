// Nettoyage du HTML d'un CCTP écrit par quelqu'un d'autre avant de l'afficher : liste blanche de balises, aucun script,
// aucun gestionnaire d'événement (onclick…), aucun lien « javascript: », images limitées à data:/https.
const ALLOWED = new Set(["div", "p", "span", "br", "b", "strong", "i", "em", "u", "s", "sub", "sup", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr", "img", "a"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button", "textarea", "select", "svg", "math", "base", "noscript", "template"]);
const SAFE_URL = /^(https?:|mailto:|#|data:image\/(png|jpe?g|gif|webp);base64,)/i;

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
  const clean = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) { child.remove(); continue; }
      const tag = child.tagName.toLowerCase();
      if (DROP_WITH_CONTENT.has(tag)) { child.remove(); continue; }
      clean(child);
      if (!ALLOWED.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        const keep = (tag === "a" && name === "href") || (tag === "img" && (name === "src" || name === "alt")) || ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan"));
        if (!keep) child.removeAttribute(attribute.name);
        else if ((name === "href" || name === "src") && !SAFE_URL.test(attribute.value.trim())) child.removeAttribute(attribute.name);
      }
      if (tag === "a") { child.setAttribute("target", "_blank"); child.setAttribute("rel", "noopener noreferrer"); }
      if (tag === "img" && !child.getAttribute("src")) child.remove();
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}
