import { describe, expect, it } from 'vitest';
import { textHtml } from '../src/index.js';

describe('web addresses in text', () => {
  it('are links that open in the browser, the full stop after them left out', () => {
    expect(textHtml('Zdroj: https://example.org/a_b/c.pdf.')).toBe('Zdroj: <a href="https://example.org/a_b/c.pdf" target="_blank" rel="noopener">https://example.org/a_b/c.pdf</a>.');
  });

  it('may have a text of their own, as in Markdown, and leave the names around them typeset', () => {
    const html = textHtml('Podle [skript ČVUT](https://www.fs.cvut.cz/x.pdf), kde σ_max je napětí.');
    expect(html).toContain('<a href="https://www.fs.cvut.cz/x.pdf" target="_blank" rel="noopener">skript ČVUT</a>');
    expect(html).toContain('<math');
  });
});
