import { describe, expect, it } from 'vitest';
import { withoutDuplicates } from '../src/logic/theoryMerge.js';

describe('the same theory in the sources and in a library', () => {
  it('goes to the model once, from the library', () => {
    const own = [
      { id: 'T1', title: '7. Prostý ohyb', text: 'Těleso je namáháno prostým ohybem.' },
      { id: 'T2', title: '7.1 Druhy nosníků', text: 'Nosníky dělíme…\n\n![Obr. 31](layers/layer3/images/obrazek-25.png)' },
      { id: 'T9', title: 'Jen ve výpočtu', text: 'Poznámka k tomuto výpočtu.' },
    ];
    const library = [
      { id: 'P:T1', title: '7. Prostý ohyb', text: 'Těleso je  namáháno prostým ohybem.' },
      { id: 'P:T2', title: '7.1 Druhy nosníků', text: 'Nosníky dělíme…\n\n![Obr. 31](images/obrazek-25.png)' },
    ];
    expect(withoutDuplicates(own, library).map((s) => s.id)).toEqual(['T9', 'P:T1', 'P:T2']);
  });
});
