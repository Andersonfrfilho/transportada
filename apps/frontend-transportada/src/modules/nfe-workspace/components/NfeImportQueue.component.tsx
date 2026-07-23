/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { NfeImportSummary } from '../shared/nfeWorkspaceClient.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeImportQueueProps = Readonly<{
  readonly canImport: boolean
  readonly imports: readonly NfeImportSummary[]
  readonly onReprocess: (id: string) => void
  readonly reprocessPending: boolean
}>

export function NfeImportQueue({
  canImport,
  imports,
  onReprocess,
  reprocessPending,
}: NfeImportQueueProps) {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <section className={styles.dataPanel} aria-labelledby="nfe-imports-title">
      <div className={styles.panelHeading}>
        <h2 id="nfe-imports-title">{t('imports.title')}</h2>
        <p>{t('imports.subtitle')}</p>
      </div>
      <div className={styles.importList}>
        {imports.length === 0 && <p className={styles.emptyState}>{t('imports.empty')}</p>}
        {imports.map((item) => (
          <article className={styles.importRow} key={item.id}>
            <div>
              <strong>{item.id.slice(0, 8)}</strong>
              <p>
                {t(`status.${item.status}`)} · {item.processedCount}/{item.receivedCount}
              </p>
            </div>
            <dl className={styles.importMetrics}>
              <div>
                <dt>{t('imports.imported')}</dt>
                <dd>{item.importedCount}</dd>
              </div>
              <div>
                <dt>{t('imports.invalid')}</dt>
                <dd>{item.invalidCount}</dd>
              </div>
              <div>
                <dt>{t('imports.failed')}</dt>
                <dd>{item.failedCount}</dd>
              </div>
            </dl>
            {canImport && (
              <button
                className={styles.ghostAction}
                disabled={reprocessPending}
                onClick={() => onReprocess(item.id)}
                type="button"
              >
                {t('imports.reprocess')}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
