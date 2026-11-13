/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Icon } from '@/components/ui/icon'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { useExpenseMutations } from '../hooks/useExpenses.hook'
import type { ExpenseOccurrenceListItem } from '../shared/expenses.types'
import {
  formatCivilDate,
  maskMoney,
  parseMoney,
  resolveOccurrencePayeeKey,
  todayCivilDate,
  toTypedMoney,
} from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'
import { ExpenseDialogShell } from './ExpenseDialogShell.component'
import { useCalendarLabels } from './useCalendarLabels.hook'

type ExpenseSettleDialogProps = Readonly<{
  occurrence: ExpenseOccurrenceListItem
  onClose: () => void
}>

/** Baixa manual (RF3): valor pago, data e observação; a diferença para o previsto fica na lista. */
export function ExpenseSettleDialog({ occurrence, onClose }: ExpenseSettleDialogProps) {
  const { t } = useTranslation('expenses')
  const calendar = useCalendarLabels()
  const { settleOccurrence } = useExpenseMutations()
  const [amount, setAmount] = useState(toTypedMoney(occurrence.expectedAmount))
  const [paidAt, setPaidAt] = useState(todayCivilDate())
  const [note, setNote] = useState('')
  const parsedAmount = parseMoney(amount)
  const isReady = parsedAmount !== null && paidAt !== ''
  const payeeKey = resolveOccurrencePayeeKey(occurrence)
  const payee =
    occurrence.payeeDriverName === null || payeeKey === null
      ? ''
      : ` · ${occurrence.payeeDriverName} (${t(`payee.${payeeKey}`)})`

  async function confirm(): Promise<void> {
    if (parsedAmount === null) return
    try {
      await settleOccurrence.mutateAsync({
        id: occurrence.id,
        paidAmount: parsedAmount,
        paidAt,
        ...(note.trim() === '' ? {} : { settlementNote: note.trim() }),
      })
      onClose()
    } catch {
      /* o erro fica em `settleOccurrence.error` e aparece abaixo */
    }
  }

  return (
    <ExpenseDialogShell
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            {t('dialog.cancel')}
          </Button>
          <Button
            disabled={!isReady || settleOccurrence.isPending}
            onClick={() => void confirm()}
            type="button"
          >
            <Icon name="save" />
            {settleOccurrence.isPending ? t('settle.sending') : t('settle.confirm')}
          </Button>
        </>
      }
      hint={t('settle.summary', {
        amount: formatAmount(occurrence.expectedAmount),
        due: formatCivilDate(occurrence.dueDate),
        name: `${occurrence.expenseName}${payee}`,
      })}
      onClose={onClose}
      title={t('settle.title')}
      titleId="expense-settle-title"
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span>{t('settle.amount')}</span>
          <input
            inputMode="decimal"
            onChange={(event) => setAmount(maskMoney(event.target.value))}
            value={amount}
          />
        </label>
        <div className={styles.field}>
          <span>{t('settle.paidAt')}</span>
          <DatePicker
            {...calendar}
            ariaLabel={t('settle.paidAt')}
            onChange={setPaidAt}
            value={paidAt}
          />
        </div>
        <label className={styles.field}>
          <span>{t('settle.note')}</span>
          <input
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('settle.notePlaceholder')}
            value={note}
          />
        </label>
      </div>
      {settleOccurrence.error === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${settleOccurrence.error.message}`, {
            defaultValue: t('errors.REQUEST_FAILED'),
          })}
        </p>
      )}
    </ExpenseDialogShell>
  )
}
