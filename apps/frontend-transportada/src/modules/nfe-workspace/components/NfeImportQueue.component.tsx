/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

import { Icon } from '@/components/ui/icon'

import type { NfeImportSummary } from '../shared/nfeWorkspaceClient.service'
import { formatNfeImportMoment } from '../shared/nfeImportMoment.service'
import styles from '../styles/nfeWorkspace.module.css'
import { CopyButton } from './CopyButton.component'

type NfeImportQueueProps = Readonly<{
  readonly canImport: boolean
  readonly filterActions?: ReactNode
  readonly hasMore: boolean
  readonly imports: readonly NfeImportSummary[]
  readonly loadingMore: boolean
  readonly onLoadMore: () => void
  readonly onReprocess: (id: string) => void
  readonly reprocessError: boolean
  readonly reprocessPending: boolean
  readonly reprocessSuccess: boolean
  readonly reprocessTargetId: string | null
}>

function isReprocessable(item: NfeImportSummary): boolean {
  return (item.status === 'failed' || item.status === 'partially_processed') && item.failedCount > 0
}

const STATUS_TONE: Readonly<Record<NfeImportSummary['status'], string | undefined>> = {
  cancelled: styles.badgeMuted,
  completed: styles.badgeReady,
  failed: styles.badgeDanger,
  partially_processed: styles.badgeWarning,
  pending: styles.badgeMuted,
  processing: styles.badgeActive,
  queued: styles.badgeActive,
}

export function NfeImportQueue({
  canImport,
  filterActions,
  hasMore,
  imports,
  loadingMore,
  onLoadMore,
  onReprocess,
  reprocessError,
  reprocessPending,
  reprocessSuccess,
  reprocessTargetId,
}: NfeImportQueueProps) {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <section className={styles.dataPanel} aria-labelledby="nfe-imports-title">
      <div className={styles.panelHeading}>
        <div className={styles.panelHeadingRow}>
          <h2 id="nfe-imports-title">{t('imports.title')}</h2>
          <span className={styles.countBadge}>{t('imports.count', { count: imports.length })}</span>
        </div>
        <p>{t('imports.subtitle')}</p>
      </div>
      {filterActions}
      <div className={styles.scrollList}>
        {imports.length === 0 && <p className={styles.emptyState}>{t('imports.empty')}</p>}
        {imports.map((item, index) => {
          const eligible = isReprocessable(item)
          const targeted = reprocessTargetId === item.id
          const pending = targeted && reprocessPending
          return (
            <article
              className={index % 2 === 0 ? styles.importCard : styles.importCardAlt}
              key={item.id}
            >
              <header className={styles.cardHeader}>
                <div className={styles.cardIdentity}>
                  <div className={styles.cardCodeRow}>
                    <code className={styles.cardCode}>{item.id.slice(0, 8)}</code>
                    <CopyButton label={t('imports.copyId')} value={item.id} />
                  </div>
                  <span className={styles.secondaryText}>
                    {t(`filters.${item.source}`)} · {item.processedCount}/{item.receivedCount}
                  </span>
                  <span className={styles.secondaryText}>
                    {t('imports.executedAt')}{' '}
                    <time dateTime={item.createdAt}>{formatNfeImportMoment(item.createdAt)}</time>
                  </span>
                </div>
                <span className={`${styles.badge} ${STATUS_TONE[item.status] ?? ''}`}>
                  {t(`status.${item.status}`)}
                </span>
              </header>
              <dl className={styles.importMetrics}>
                <div>
                  <dt>{t('imports.imported')}</dt>
                  <dd>{item.importedCount}</dd>
                </div>
                <div>
                  <dt>{t('imports.duplicated')}</dt>
                  <dd>{item.duplicatedCount}</dd>
                </div>
                <div>
                  <dt>{t('imports.invalid')}</dt>
                  <dd>{item.invalidCount}</dd>
                </div>
                <div>
                  <dt>{t('imports.rejected')}</dt>
                  <dd>{item.rejectedCount}</dd>
                </div>
                <div>
                  <dt>{t('imports.failed')}</dt>
                  <dd className={item.failedCount > 0 ? styles.metricDanger : undefined}>
                    {item.failedCount}
                  </dd>
                </div>
              </dl>
              {item.terminalError !== null && (
                <p className={styles.cardError} role="status">
                  {item.terminalError.message}
                </p>
              )}
              {canImport && (
                <div className={styles.cardActions}>
                  <button
                    className={styles.secondaryAction}
                    disabled={!eligible || pending}
                    onClick={() => onReprocess(item.id)}
                    title={eligible ? undefined : t('imports.reprocessDisabledHint')}
                    type="button"
                  >
                    <Icon name="refresh" />
                    {pending ? t('imports.reprocessPending') : t('imports.reprocess')}
                  </button>
                  {!eligible && (
                    <span className={styles.secondaryText}>{t('imports.reprocessNotAllowed')}</span>
                  )}
                  {targeted && reprocessSuccess && (
                    <span className={styles.feedbackSuccess} role="status">
                      {t('imports.reprocessSuccess')}
                    </span>
                  )}
                  {targeted && reprocessError && (
                    <span className={styles.feedbackError} role="alert">
                      {t('imports.reprocessError')}
                    </span>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {hasMore && (
        <button
          className={styles.ghostAction}
          disabled={loadingMore}
          onClick={onLoadMore}
          type="button"
        >
          <Icon name="chevron-down" />
          {loadingMore ? t('common.loadingMore') : t('common.loadMore')}
        </button>
      )}
    </section>
  )
}
