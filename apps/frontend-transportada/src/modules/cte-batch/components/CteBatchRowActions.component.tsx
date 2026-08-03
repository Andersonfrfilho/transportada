/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { canBillBatch } from '../shared/cteBatchBilling.service'
import type { CteBatchSummary } from '../shared/cteBatchClient.service'
import { canCancelBatch } from '../shared/cteBatchItemActions.service'
import styles from '../styles/cteBatch.module.css'

type CteBatchRowActionsProps = Readonly<{
  batch: CteBatchSummary
  isOpen: boolean
  onBill: (batches: readonly CteBatchSummary[]) => void
  onCancel: (batch: CteBatchSummary) => void
  onOpenItems: (batch: CteBatchSummary) => void
  permissions: readonly string[]
}>

export function CteBatchRowActions({
  batch,
  isOpen,
  onBill,
  onCancel,
  onOpenItems,
  permissions,
}: CteBatchRowActionsProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <div className={styles.rowActions}>
      <Button onClick={() => onOpenItems(batch)} size="sm" type="button" variant="ghost">
        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} />
        {isOpen ? t('actions.closeItems') : t('actions.openItems')}
      </Button>
      {canBillBatch({ batch, permissions }) ? (
        <Button onClick={() => onBill([batch])} size="sm" type="button" variant="secondary">
          <Icon name="invoice" />
          {t('actions.bill')}
        </Button>
      ) : null}
      {canCancelBatch({ batch, permissions }) ? (
        <Button onClick={() => onCancel(batch)} size="sm" type="button" variant="secondary">
          <Icon name="alert" />
          {t('actions.cancel')}
        </Button>
      ) : null}
    </div>
  )
}
