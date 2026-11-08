/** The words of the program's check of a proposed sheet (sheetReport), in the user's language; the model reads them too. */
import { t, type Catalog } from '@kalketa/i18n';
import type { SheetWords } from '@kalketa/ai';

export function sheetCheckWords(catalog: Catalog, ask = t(catalog, 'sheetCheck.ask')): SheetWords {
  return {
    title: t(catalog, 'sheetCheck.title'),
    problems: t(catalog, 'sheetCheck.problems'),
    numbers: t(catalog, 'sheetCheck.numbers'),
    ask,
    python: t(catalog, 'sheetCheck.python'),
    failed: t(catalog, 'sheetCheck.failed'),
    hints: {
      'E-DERIVE-STEP': t(catalog, 'sheetCheck.hint.derive'),
      'E-DERIVE-UNITS': t(catalog, 'sheetCheck.hint.derive'),
      'W-BARE-UNIT': t(catalog, 'sheetCheck.hint.bareUnit'),
      'E-UNIT-MISMATCH': t(catalog, 'sheetCheck.hint.units'),
      'E-REDEFINED': t(catalog, 'sheetCheck.hint.redefined'),
      'E-UNKNOWN-UNIT': t(catalog, 'sheetCheck.hint.unit'),
      'E-TABLE-CELL': t(catalog, 'sheetCheck.hint.table'),
    },
  };
}
