import { t, type Catalog } from '@kalketa/i18n';
import type { SmathReport } from '@kalketa/import';
import { importReportParts } from '../logic/importedSmath.js';
import { Dialog } from './Dialogs.js';

/** What an import did, shown over the new sheet before the first look at it. */
export function ImportReportDialog({ catalog, report, onClose }: { catalog: Catalog; report: SmathReport; onClose(): void }) {
  const { summary, sections } = importReportParts(catalog, report);
  return (
    <Dialog title={t(catalog, 'import.report.title')} catalog={catalog} wide onClose={onClose}>
      <div className="import-report">
        {summary.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {sections.map((section) => (
          <section key={section.kind} data-import-section={section.kind}>
            <h4>{section.title}</h4>
            <ul>
              {section.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="hint">{t(catalog, 'import.report.original')}</p>
      </div>
    </Dialog>
  );
}
