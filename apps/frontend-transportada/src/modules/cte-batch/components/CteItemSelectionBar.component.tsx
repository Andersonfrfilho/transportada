/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { CteItemTableController } from '../hooks/useCteItemTable.hook'
import { resolveCteBatchSubmissionReasonKey } from '../shared/cteBatchSubmissionQueue.service'
import styles from '../styles/cteBatch.module.css'

type CteItemSelectionBarProps = Readonly<{
  table: CteItemTableController
}>

export function CteItemSelectionBar({ table }: CteItemSelectionBarProps) {
  const { t } = useTranslation('cteBatch')

  if (table.selection.count === 0) return null

  return (
    <div className={styles.bulkBar}>
      <p className={styles.counter}>
        {t('cteItems.selectedCount', { count: table.selection.count })}
      </p>
      <dl className={styles.selectionTotals}>
        <div>
          <dt>{t('cteItems.baseSelected')}</dt>
          <dd>{formatAmount(table.selection.baseAmount)}</dd>
        </div>
        <div>
          <dt>{t('cteItems.totalSelected')}</dt>
          <dd>{formatAmount(table.selection.totalAmount)}</dd>
        </div>
      </dl>
      <div className={styles.bulkActions}>
        <Button
          disabled={!table.canTransmit || table.isTransmitting}
          onClick={() => table.transmitSelection(table.transmitGroups)}
          size="sm"
          type="button"
        >
          <Icon name="upload" />
          {t('cteItems.transmitSelection', { count: table.transmitGroups.length })}
        </Button>
        <Button disabled={!table.canBill} onClick={table.startBilling} size="sm" type="button">
          <Icon name="invoice" />
          {t('cteItems.billSelection', { count: table.billingSelection.billable.length })}
        </Button>
        <Button
          disabled={!table.canExportSelection || table.isExporting}
          onClick={() => table.exportSelection()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="export" />
          {table.isExporting
            ? t('cteItems.export.pending')
            : t('cteItems.exportSelection', { count: table.selection.count })}
        </Button>
        <Button onClick={table.clearSelection} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('selection.clear')}
        </Button>
      </div>
      {table.billingSelection.blocked.length === 0 ? null : (
        <p className={styles.hint}>
          {t('cteItems.billBlocked', { count: table.billingSelection.blocked.length })}
        </p>
      )}
      {table.exportErrorKey === null ? null : (
        <p className={styles.hint} role="alert">
          {t(table.exportErrorKey)}
        </p>
      )}
      {table.transmitErrorCode === undefined ? null : (
        <p className={styles.hint} role="alert">
          {t(resolveCteBatchSubmissionReasonKey(table.transmitErrorCode), {
            code: table.transmitErrorCode,
          })}
        </p>
      )}
    </div>
  )
}
