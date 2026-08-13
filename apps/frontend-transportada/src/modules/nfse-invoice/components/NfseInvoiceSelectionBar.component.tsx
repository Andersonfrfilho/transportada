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
        <button className={styles.builderAction} onClick={table.clearSelection} type="button">
          <Icon name="close" />
          <span>{t('table.clearSelection')}</span>
        </button>
      </div>
    </div>
  )
}
