import sanitizeHtml from "sanitize-html";

/**
 * Render-time sanitisation for comment HTML. The database keeps the source
 * markup verbatim; this only governs what the browser is allowed to execute.
 * Allowlist covers what Spectora's editor produces: paragraphs, emphasis,
 * lists, links, line breaks.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "a", "span", "div", "h1", "h2", "h3", "h4", "blockquote", "sub", "sup"],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    span: ["style"],
    div: ["style"],
    p: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
  allowedStyles: {
    "*": {
      "font-weight": [/^bold$/, /^\d{3}$/],
      "font-style": [/^italic$/],
      "text-decoration": [/^underline$/, /^line-through$/],
    },
  },
};

export function renderCommentHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** True when sanitising changed something beyond whitespace - i.e. the source had markup we refused. */
export function sanitiserChangedMarkup(html: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(sanitizeHtml(html, OPTIONS)) !== norm(html);
}
