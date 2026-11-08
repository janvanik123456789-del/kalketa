import { describe, expect, it } from 'vitest';
import { catalogText, estimateTokens, parseLookups, withoutLookups } from '@kalketa/ai';
import { catalogFor } from '@kalketa/i18n';
import { catalogItems, lookupAnswer } from '../src/logic/aiCatalog.js';
import { FORMULA_LIBRARY } from '../src/formulaLibrary.js';
import { samples, sampleSource } from '../src/samples.js';

const cs = catalogFor('cs');

describe('what the model may look up', () => {
  it('reads what an answer asks for, each once, known kinds only', () => {
    const answer = 'Podívám se na vzor.\n\n```lookup\nformula normalove-napeti\nsample R1-nosnik\nformula normalove-napeti\ntable Profily\n```\n';
    expect(parseLookups(answer)).toEqual([
      { kind: 'formula', id: 'normalove-napeti' },
      { kind: 'sample', id: 'R1-nosnik' },
    ]);
    expect(withoutLookups(answer)).toBe('Podívám se na vzor.');
  });

  it('lists every formula and sample by id and title, small enough to send with every question', () => {
    const items = catalogItems(FORMULA_LIBRARY, samples('cs'), cs);
    const text = catalogText(items);
    expect(items.filter((i) => i.kind === 'formula').length).toBe(FORMULA_LIBRARY.length);
    expect(text).toContain('- normalove-napeti: ');
    expect(text).toContain('- R1-nosnik: ');
    expect(text).toContain('```lookup');
    expect(estimateTokens(text)).toBeLessThan(6000);
  });

  it('answers with the formula and the sample asked for, and says what it does not know', () => {
    const answer = lookupAnswer(
      [
        { kind: 'formula', id: 'normalove-napeti' },
        { kind: 'sample', id: 'R1-nosnik' },
        { kind: 'sample', id: 'R999-nic' },
      ],
      {
        formula: (id) => FORMULA_LIBRARY.find((e) => e.id === id),
        sample: (id) => {
          const s = samples('cs').find((x) => x.id === id);
          const source = s && sampleSource(id, 'cs');
          return s && source ? { title: s.title, source } : undefined;
        },
      },
      cs,
    );
    expect(answer.found).toBe(2);
    expect(answer.text.split('\n\n')[0]).toBe('**Kalketa poslala modelu k přečtení:** vzorec normalove-napeti, vzor R1-nosnik');
    expect(answer.text).toContain('σ ==');
    expect(answer.text).toContain('Zdroj:');
    expect(answer.text).toContain('V katalogu není: sample R999-nic');
  });
});
