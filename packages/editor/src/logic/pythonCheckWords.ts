/** The words of the report of checks in Python (pythonReport), in the user's language; the model reads them too. */
import { t, type Catalog } from '@kalketa/i18n';
import type { CheckWords } from '@kalketa/ai';

export function pythonCheckWords(catalog: Catalog, ask = t(catalog, 'check.ask')): CheckWords {
  return {
    title: t(catalog, 'check.title'),
    quantity: t(catalog, 'python.name'),
    difference: t(catalog, 'python.difference'),
    states: { agree: t(catalog, 'python.state.agree'), differ: t(catalog, 'python.state.differ'), missing: t(catalog, 'python.state.missing'), units: t(catalog, 'python.state.units'), unit: t(catalog, 'python.state.unit') },
    failed: t(catalog, 'python.failed'),
    declined: t(catalog, 'check.declined'),
    none: t(catalog, 'python.noResults'),
    output: t(catalog, 'check.output'),
    ask,
    timeout: t(catalog, 'check.timeout'),
    missing: t(catalog, 'check.missing'),
    capped: t(catalog, 'check.capped'),
    postponed: t(catalog, 'check.postponed'),
  };
}
