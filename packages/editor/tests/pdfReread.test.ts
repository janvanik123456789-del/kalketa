import { describe, expect, it } from 'vitest';
import { applyReread, matchRun, sourcePageLabels, textRuns } from '../src/logic/pdfReread.js';

const SOURCES = [
  '## DP Sbírka (s. 36–38) {#T1}',
  '',
  'Pro statické zatížení je koeficient dynamiky namáhání K =. Mez pevnosti oceli vyčteme z jejího číselného označení, tj. <r = 340 MPa.',
  '',
  '![DP, s. 38](layers/l3/images/vzorec-s38.png)',
  '',
  '```kalk',
  'derive τ_Dov_s := τ_Ks·K_I / n',
  '```',
  '',
  'kde jsme využili souvislosti mezi mezí kluzu ve střihu a mezí kluzu v tahu.',
].join('\n');

describe('the text of the sources read again from its PDF', () => {
  it('knows the pages of its chapters', () => {
    expect(sourcePageLabels(SOURCES)).toEqual(['36', '37', '38']);
    expect(sourcePageLabels('## Úvod (s. iv)\n## Dál (s. 5)')).toEqual(['iv', '5']);
  });

  it('takes the lines of a page between cut-outs as one run, with its place', () => {
    const box = (top: number) => ({ top, bottom: top + 10, left: 50, right: 500 });
    const runs = textRuns([
      { kind: 'text', text: 'Pro statické zatížení', box: box(100) },
      { kind: 'text', text: 'je koeficient', box: box(112) },
      { kind: 'cut', box: box(130), why: 'formula' },
      { kind: 'text', text: 'kde jsme využili', box: box(160) },
    ]);
    expect(runs.map((r) => r.text)).toEqual(['Pro statické zatížení\nje koeficient', 'kde jsme využili']);
    expect(runs[0]!.box).toEqual({ top: 100, bottom: 122, left: 50, right: 500 });
  });

  it('finds the paragraph a run was, though the tidying changed it a little, and puts the new text there', () => {
    const run = 'Pro statické zatížení je koeficient dynamiky namáhání K =.\nMez pevnosti oceli vyčteme z jejího čísel-\nného označení, tj. <r = 340 MPa (viz řešení příkladu 3).';
    const match = matchRun(SOURCES, run)!;
    expect(match.old).toContain('koeficient dynamiky');
    const fixed = applyReread(SOURCES, [{ ...match, text: 'Pro statické zatížení je koeficient dynamiky namáhání K_I = 1. Mez pevnosti oceli vyčteme z jejího číselného označení, tj. σ_Pt = 340 MPa.' }]);
    expect(fixed).toContain('K_I = 1');
    expect(fixed).not.toContain('<r');
    // Everything else stays: the heading, the cut-out, the formula block and the next paragraph.
    expect(fixed).toContain('```kalk\nderive τ_Dov_s := τ_Ks·K_I / n\n```');
    expect(fixed).toContain('kde jsme využili');
    expect(matchRun(SOURCES, 'Úplně jiný text o něčem jiném.')).toBeUndefined();
  });
});
