import * as sanitizeHtml from 'sanitize-html';

/**
 * Strip all HTML from a string so the result is safe, inert plain text.
 *
 * Backend-side defence-in-depth against stored XSS: user-supplied fields
 * (bio, displayName, tip messages) are reduced to text before persistence.
 *
 * Implementation notes:
 *  - `sanitize-html` is pure Node (no jsdom / no DOM globals), so it runs
 *    correctly under the NestJS `node` Jest environment. The previous
 *    `isomorphic-dompurify` approach pulled in jsdom + an ESM-only transitive
 *    (`@exodus/bytes`) that crashed `ts-jest` at import time.
 *  - `allowedTags: []` discards every element. Script/style/textarea/option
 *    content is dropped wholesale (sanitize-html `nonTextTags` default).
 *  - The output keeps `<`/`>` HTML-encoded so the result is inert even if a
 *    downstream consumer interpolates it into raw HTML. Only harmless
 *    punctuation entities are decoded back to readable characters.
 */
export function stripHtml(input: string): string {
  if (!input) {
    return '';
  }

  const stripped = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });

  // sanitize-html encodes special chars. Decode only the safe punctuation
  // entities; leave `&lt;` / `&gt;` encoded so no active markup can survive.
  return stripped
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Strip user-generated content: removes HTML tags, Unicode bidi control
 * characters, hidden/format characters, and C0/C1 control characters.
 *
 * Removes:
 *  - HTML tags and script content (via stripHtml)
 *  - Bidirectional text override characters (U+202A–U+202E, U+2066–U+2069)
 *    that can flip display order and break perceived trust in anonymous platforms.
 *  - Hidden/format characters (U+200B zero-width space, U+200C ZWNJ,
 *    U+200D ZWJ, U+FEFF BOM, U+00AD soft hyphen)
 *  - C0 control characters (U+0000–U+001F) except tab, newline, carriage return
 *  - C1 control characters (U+0080–U+009F)
 *
 * Preserves:
 *  - All printable Unicode (including accented characters, CJK, etc.)
 *  - Emoji and emoji ZWJ sequences
 *  - Standard whitespace: tab (U+0009), newline (U+000A), carriage return (U+000D)
 *
 * @param input - Raw user content
 * @returns Sanitized plain text without HTML, bidi controls, or hidden chars
 */
export function stripUserContent(input: string): string {
  // First strip HTML
  const noHtml = stripHtml(input);

  // Remove Unicode bidi control characters
  // Remove hidden/format characters (zero-width space, zero-width non-joiner,
  //   BOM, soft hyphen); preserve ZWJ (U+200D) for emoji sequences
  // Remove C0 control characters except \t (0x09), \n (0x0A), \r (0x0D)
  // Remove C1 control characters (U+0080–U+009F)

  /* eslint-disable no-control-regex */
  const unsafe =
    /[\u202A-\u202E\u2066-\u2069]|[\u200B\u200C\uFEFF\u00AD]|[\u0000-\u0008\u000B\u000C\u000E-\u001F]|[\u0080-\u009F]/g;
  /* eslint-enable no-control-regex */
  return noHtml.replace(unsafe, '');
}
