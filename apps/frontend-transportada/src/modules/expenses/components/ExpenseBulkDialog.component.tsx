/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { useExpenseMutations } from '../hooks/useExpenses.hook'
import type { ExpenseOccurrenceListItem } from '../shared/expenses.types'
import { runBulk, type BulkRunResult } from '../shared/expensesSelection.service'
import { todayCivilDate } from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'
import { ExpenseDialogShell } from './ExpenseDialogShell.component'
import { useCalendarLabels } from './useCalendarLabels.hook'

type ExpenseBulkDialogProps = Readonly<{
  action: 'cancel' | 'settle'
  expected: string
  items: readonly ExpenseOccurrenceListItem[]
  onClose: () => void
}>

/** Spec 333: baixa ou cancelamento de várias contas de uma vez; a baixa paga o previsto de cada uma. */
export function ExpenseBulkDialog({ action, expected, items, onClose }: ExpenseBulkDialogProps) {
  const { t } = useTranslation('expenses')
  const calendar = useCalendarLabels()
  const { cancelOccurrence, settleOccurrence } = useExpenseMutations()
  const [paidAt, setPaidAt] = useState(todayCivilDate())
  const [reason, setReason] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<BulkRunResult | null>(null)
  const isSettle = action === 'settle'
  const isReady = items.length > 0 && (isSettle ? paidAt !== '' : reason.trim() !== '')

  async function confirm(): Promise<void> {
    setIsRunning(true)
    const byId = new Map(items.map((item) => [item.id, item]))
    const outcome = await runBulk(
      items.map((item) => item.id),
      (id) => {
        const item = byId.get(id)
        if (item === undefined) return Promise.reject(new Error('missing'))
        return isSettle
          ? settleOccurrence.mutateAsync({ id, paidAmount: item.expectedAmount, paidAt })
          : cancelOccurrence.mutateAsync({ id, reason: reason.trim() })
      },
    )
    setIsRunning(false)
    if (outcome.failed.length === 0) onClose()
    else setResult(outcome)
  }

  return (
    <ExpenseDialogShell
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            {result === null ? t('dialog.cancel') : t('bulk.close')}
          </Button>
          {result === null ? (
            <Button disabled={!isReady || isRunning} onClick={() => void confirm()} type="button">
              <Icon name={isSettle ? 'save' : 'close'} />
              {isRunning
                ? t('bulk.running')
                : t(isSettle ? 'bulk.confirmSettle' : 'bulk.confirmCancel', {
                    count: items.length,
                  })}
            </Button>
          ) : null}
        </>
      }
      hint={t('bulk.summary', { amount: formatAmount(expected), count: items.length })}
      onClose={onClose}
      title={t(isSettle ? 'bulk.titleSettle' : 'bulk.titleCancel')}
      titleId="expense-bulk-title"
    >
      <div className={styles.form}>
        {isSettle ? (
          <div className={styles.field}>
            <span>{t('settle.paidAt')}</span>
            <DatePicker
              {...calendar}
              ariaLabel={t('settle.paidAt')}
              onChange={setPaidAt}
              value={paidAt}
            />
          </div>
        ) : (
          <label className={styles.field}>
            <span>{t('bulk.reason')}</span>
            <input
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('bulk.reasonPlaceholder')}
              value={reason}
            />
          </label>
        )}
        <p className={styles.hint}>{t(isSettle ? 'bulk.settleHint' : 'bulk.cancelHint')}</p>
      </div>
      {result === null ? null : (
        <p className={styles.error} role="alert">
          {t('bulk.partial', { failed: result.failed.length, succeeded: result.succeeded })}
        </p>
      )}
    </ExpenseDialogShell>
  )
}
