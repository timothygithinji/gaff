/**
 * Turn portal-supplied marketing HTML into safe, readable text.
 *
 * Listing copy off the portals is raw HTML — Rightmove wraps each
 * paragraph in `<p>…</p>`, while Zoopla / OpenRent string everything
 * together with `<br>` tags (often a double `<br><br>` between
 * paragraphs and a single one for an in-paragraph line break). We never
 * feed that markup to `dangerouslySetInnerHTML`: agents type it
 * themselves and there's no guarantee a `<script>` couldn't sneak in.
 * Instead we convert it to plain text we can render as ordinary React
 * nodes — paragraph structure preserved, every tag stripped.
 */

const HTML_TAG_RE = /<[^>]+>/g;
const NBSP_RE = /&nbsp;/gi;
const POUND_RE = /&pound;/gi;
const EURO_RE = /&euro;/gi;
const AMP_RE = /&amp;/gi;
const LT_RE = /&lt;/gi;
const GT_RE = /&gt;/gi;
const QUOT_RE = /&quot;/gi;
const APOS_RE = /&#39;|&apos;/gi;
// Generic numeric character references — decimal (`&#163;`) and hex
// (`&#xA3;`) — so any entity the named map above misses still decodes.
const DEC_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-f]+);/gi;

/** A numeric code point → its character, or "" when out of the valid range. */
function fromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10_ffff) {
    return "";
  }
  // Lone surrogates aren't valid scalar values; drop them rather than throw.
  if (code >= 0xd800 && code <= 0xdfff) {
    return "";
  }
  return String.fromCodePoint(code);
}

// Block-level tags become paragraph breaks; a lone <br> is a line break,
// but two-or-more consecutive <br>s read as a paragraph break.
const BLOCK_CLOSE_RE = /<\/(?:p|div|li|ul|ol|h[1-6]|blockquote)>/gi;
const BLOCK_OPEN_RE = /<(?:p|div|li|ul|ol|h[1-6]|blockquote)\b[^>]*>/gi;
const MULTI_BR_RE = /(?:\s*<br\s*\/?>\s*){2,}/gi;
const SINGLE_BR_RE = /<br\s*\/?>/gi;

// Within a block: collapse runs of horizontal whitespace but keep the
// newlines we just introduced for single <br> line breaks.
const HORIZONTAL_WS_RE = /[^\S\n]+/g;
const PADDED_NEWLINE_RE = / *\n */g;
const PARAGRAPH_SPLIT_RE = /\n{2,}/;

function decodeEntities(input: string): string {
  return input
    .replace(DEC_ENTITY_RE, (_, dec) => fromCodePoint(Number(dec)))
    .replace(HEX_ENTITY_RE, (_, hex) => fromCodePoint(Number.parseInt(hex, 16)))
    .replace(NBSP_RE, " ")
    .replace(POUND_RE, "£")
    .replace(EURO_RE, "€")
    .replace(AMP_RE, "&")
    .replace(LT_RE, "<")
    .replace(GT_RE, ">")
    .replace(QUOT_RE, '"')
    .replace(APOS_RE, "'");
}

/**
 * Convert marketing HTML into an ordered list of clean paragraphs.
 * Each entry may still contain single `\n` line breaks (render with
 * `whitespace-pre-line`); blank/whitespace-only paragraphs are dropped.
 */
export function htmlToParagraphs(html: string): string[] {
  const withBreaks = html
    .replace(BLOCK_CLOSE_RE, "\n\n")
    .replace(BLOCK_OPEN_RE, "\n\n")
    .replace(MULTI_BR_RE, "\n\n")
    .replace(SINGLE_BR_RE, "\n");
  const text = decodeEntities(withBreaks.replace(HTML_TAG_RE, ""));
  return text
    .split(PARAGRAPH_SPLIT_RE)
    .map((block) =>
      block.replace(HORIZONTAL_WS_RE, " ").replace(PADDED_NEWLINE_RE, "\n").trim()
    )
    .filter((block) => block.length > 0);
}

/**
 * Flatten marketing HTML to a single plain-text string, paragraphs
 * joined by a blank line. Convenience over {@link htmlToParagraphs} for
 * callers that render into one `whitespace-pre-line` block.
 */
export function htmlToPlainText(html: string): string {
  return htmlToParagraphs(html).join("\n\n");
}
