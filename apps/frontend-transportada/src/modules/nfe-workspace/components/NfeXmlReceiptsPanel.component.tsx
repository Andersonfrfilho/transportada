/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { formatNfeImportMoment } from '../shared/nfeImportMoment.service'
import { type NfeXmlReceipt } from '../shared/nfeXmlReceipts.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeXmlReceiptsPanelProps = Readonly<{
  failed: boolean
  loading: boolean
  receipts: readonly NfeXmlReceipt[] | undefined
}>

const STATUS_TONE: Readonly<Record<NfeXmlReceipt['status'], string | undefined>> = {
  failed: styles.badgeDanger,
  imported: styles.badgeReady,
  pending: styles.badgeActive,
  processing: styles.badgeActive,
  rejected: styles.badgeWarning,
}

export function NfeXmlReceiptsPanel({ failed, loading, receipts }: NfeXmlReceiptsPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const items = receipts ?? []

  return (
    <section className={styles.dataPanel} aria-labelledby="nfe-xml-receipts-title">
      <div className={styles.panelHeading}>
        <div className={styles.panelHeadingRow}>
          <h2 id="nfe-xml-receipts-title">{t('xmlReceipts.title')}</h2>
          <span className={styles.countBadge}>
            {t('xmlReceipts.count', { count: items.length })}
          </span>
        </div>
        <p>{t('xmlReceipts.subtitle')}</p>
      </div>
      <div className={styles.scrollList}>
        {failed && <p className={styles.cardError}>{t('xmlReceipts.error')}</p>}
        {!failed && loading && (
          <SkeletonGroup label={t('xmlReceipts.loading')}>
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="50%" />
          </SkeletonGroup>
        )}
        {!failed && !loading && items.length === 0 && (
          <p className={styles.emptyState}>{t('xmlReceipts.empty')}</p>
        )}
        {items.map((receipt, index) => {
          const reason = receipt.rejectReason ?? receipt.lastErrorCode
          return (
            <article
              className={index % 2 === 0 ? styles.importCard : styles.importCardAlt}
              key={receipt.id}
            >
              <header className={styles.cardHeader}>
                <div className={styles.cardIdentity}>
                  <span>
                    {t(`xmlReceipts.channel.${receipt.channel}`)} · {receipt.sender}
                  </span>
                  <span className={styles.secondaryText}>
                    <time dateTime={receipt.createdAt}>
                      {formatNfeImportMoment(receipt.createdAt)}
                    </time>
                    {receipt.filesCount > 0 &&
                      ` · ${t('xmlReceipts.files', { count: receipt.filesCount })}`}
                  </span>
                </div>
                <span className={`${styles.badge} ${STATUS_TONE[receipt.status] ?? ''}`}>
                  {t(`xmlReceipts.status.${receipt.status}`)}
                </span>
              </header>
              {reason !== null && receipt.status !== 'imported' && (
                <p className={styles.cardError} role="status">
                  {t(`xmlReceipts.reason.${reason}`, {
                    defaultValue: t('xmlReceipts.reason.unknown'),
                  })}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
