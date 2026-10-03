import { describe, expect, it } from 'vitest';
import { notesHtml } from '../src/index.js';

describe('notes Markdown, as models write it', () => {
  it('shows `code` as written, without marks inside it', () => {
    expect(notesHtml('Hodnota `w = 23 mm` a `**ne**`, **tučně**.')).toBe('<p>Hodnota <code>w = 23 mm</code> a <code>**ne**</code>, <strong>tučně</strong>.</p>');
  });

  it('keeps a code block as written, escaped', () => {
    const fence = '`'.repeat(3);
    expect(notesHtml(`${fence}text\n8 | profil := pick(Profily_IPE, "IPE 220")\n<b>x</b>\n${fence}`)).toBe(
      '<pre class="code"><code>8 | profil := pick(Profily_IPE, &quot;IPE 220&quot;)\n&lt;b&gt;x&lt;/b&gt;</code></pre>',
    );
  });

  it('indents a second level of bullets', () => {
    expect(notesHtml('- IPE 200\n  - ř. 13\n- IPE 220')).toBe('<ul><li>IPE 200</li><li class="sub">ř. 13</li><li>IPE 220</li></ul>');
  });
});
