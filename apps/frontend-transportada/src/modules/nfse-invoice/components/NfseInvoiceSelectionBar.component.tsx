/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { NfseInvoiceTableController } from '../hooks/useNfseInvoiceTable.hook'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceSelectionBarProps = Readonly<{
  table: NfseInvoiceTableController
}>

export function NfseInvoiceSelectionBar({
  table,
}: NfseInvoiceSelectionBarProps): JSX.Element | null {
  const { t } = useTranslation('nfseInvoice')

  if (table.selectionCount === 0) return null

  return (
    <div className={styles.bulkBar}>
      <dl className={styles.selectionTotals}>
        <div>
          <dt>{t('table.selected')}</dt>
          <dd>{table.selectionCount}</dd>
        </div>
        <div>
          <dt>{t('table.selectionTotal')}</dt>
          <dd>{formatAmount(table.selectionTotal)}</dd>
        </div>
      </dl>
      <div className={styles.bulkActions}>
        {table.bulkExport.isAllowed && (
          <button
            className={styles.builderAction}
            disabled={table.bulkExport.isPending}
            onClick={table.bulkExport.download}
            type="button"
          >
            <Icon name="download" />
            <span>{t('bulkExport.action')}</span>
          </button>
        )}
        {table.bulkExport.failure !== null && (
          <p className={styles.bulkFeedback} role="status">
            {t(`bulkExport.${table.bulkExport.failure}`)}
          </p>
        )}
        {table.bulkReissue.isAllowed && (
          <button
            className={styles.builderAction}
            onClick={table.bulkReissue.open}
            type="button"
          >
            <Icon name="refresh" />
            <span>{t('bulkReissue.action')}</span>
          </button>
        )}
        {table.bulkDiscard.isAllowed && (
          <button
            className={styles.builderAction}
            onClick={table.bulkDiscard.open}
            type="button"
          >
            <Icon name="remove" />
            <span>{t('bulkDiscard.action')}</span>
          </button>
        )}
        {table.bulkCancel.isAllowed && (
          <button className={styles.builderAction} onClick={table.bulkCancel.open} type="button">
            <Icon name="trash" />
            <span>{t('bulkCancel.action')}</span>
          </button>
        )}
        <button className={styles.builderAction} onClick={table.clearSelection} type="button">
          <Icon name="close" />
          <span>{t('table.clearSelection')}</span>
        </button>
      </div>
    </div>
  )
}
