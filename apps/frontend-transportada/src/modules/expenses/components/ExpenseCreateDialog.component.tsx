/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import { useExpenseMutations } from '../hooks/useExpenses.hook'
import {
  EXPENSE_KINDS,
  EXPENSE_RECURRENCES,
  type CreateExpenseInput,
  type ExpenseCategory,
  type ExpenseKind,
  type ExpenseRecurrence,
} from '../shared/expenses.types'
import {
  EMPTY_CREATE_FORM,
  maskMoney,
  parseMoney,
  recurrenceNeedsDueDay,
  validateCreateForm,
} from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'
import { ExpenseDialogShell } from './ExpenseDialogShell.component'
import { useCalendarLabels } from './useCalendarLabels.hook'

type ExpenseCreateDialogProps = Readonly<{
  categories: readonly ExpenseCategory[]
  driverOptions: readonly SelectOption[]
  onClose: () => void
  vehicleOptions: readonly SelectOption[]
}>

function buildInput(fields: typeof EMPTY_CREATE_FORM): CreateExpenseInput | null {
  const expectedAmount = parseMoney(fields.amount)
  if (expectedAmount === null) return null
  return {
    categoryId: fields.categoryId,
    expectedAmount,
    kind: fields.kind,
    name: fields.name.trim(),
    ...(fields.payeeDriverId === '' ? {} : { payeeDriverId: fields.payeeDriverId }),
    ...(fields.vehicleId === '' ? {} : { vehicleId: fields.vehicleId }),
    ...(fields.kind === 'variable'
      ? { dueDate: fields.dueDate }
      : {
          recurrence: fields.recurrence,
          ...(recurrenceNeedsDueDay(fields.recurrence) ? { dueDay: Number(fields.dueDay) } : {}),
        }),
  }
}

/** "Nova conta" (RF8): fixa (recorrente) ou variável, com motorista só na categoria que o exige. */
export function ExpenseCreateDialog({
  categories,
  driverOptions,
  onClose,
  vehicleOptions,
}: ExpenseCreateDialogProps) {
  const { t } = useTranslation('expenses')
  const calendar = useCalendarLabels()
  const { createExpense } = useExpenseMutations()
  const [fields, setFields] = useState(EMPTY_CREATE_FORM)
  const [showIssues, setShowIssues] = useState(false)
  const category = categories.find((candidate) => candidate.id === fields.categoryId)
  const requiresDriver = category?.requiresDriver ?? false
  const issues = validateCreateForm(fields, { requiresDriver })

  function patch(changes: Partial<typeof EMPTY_CREATE_FORM>): void {
    setFields((current) => ({ ...current, ...changes }))
  }

  async function save(): Promise<void> {
    setShowIssues(true)
    const input = buildInput(fields)
    if (issues.length > 0 || input === null) return
    try {
      await createExpense.mutateAsync(input)
      onClose()
    } catch {
      /* o erro fica em `createExpense.error` e aparece abaixo */
    }
  }

  return (
    <ExpenseDialogShell
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            {t('dialog.cancel')}
          </Button>
          <Button disabled={createExpense.isPending} onClick={() => void save()} type="button">
            <Icon name="save" />
            {createExpense.isPending ? t('create.saving') : t('create.save')}
          </Button>
        </>
      }
      onClose={onClose}
      title={t('create.title')}
      titleId="expense-create-title"
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span>{t('create.name')}</span>
          <input
            aria-invalid={showIssues && issues.includes('name')}
            maxLength={120}
            onChange={(event) => patch({ name: event.target.value })}
            value={fields.name}
          />
        </label>
        <div className={styles.field}>
          <span>{t('create.kind')}</span>
          <Select
            ariaLabel={t('create.kind')}
            onChange={(value) => patch({ kind: value as ExpenseKind })}
            options={EXPENSE_KINDS.map((kind) => ({
              label: t(`create.kindOption.${kind}`),
              value: kind,
            }))}
            value={fields.kind}
          />
        </div>
        <div className={styles.field}>
          <span>{t('create.category')}</span>
          <Select
            ariaLabel={t('create.category')}
            onChange={(value) => patch({ categoryId: value, payeeDriverId: '' })}
            options={categories
              .filter((candidate) => candidate.active)
              .map((candidate) => ({ label: candidate.name, value: candidate.id }))}
            placeholder={t('create.categoryPlaceholder')}
            value={fields.categoryId}
          />
        </div>
        <label className={styles.field}>
          <span>{t('create.amount')}</span>
          <input
            aria-invalid={showIssues && issues.includes('amount')}
            inputMode="decimal"
            onChange={(event) => patch({ amount: maskMoney(event.target.value) })}
            placeholder={t('create.amountPlaceholder')}
            value={fields.amount}
          />
        </label>
        {requiresDriver ? (
          <div className={styles.field}>
            <span>{t('create.payee')}</span>
            <Select
              ariaLabel={t('create.payee')}
              onChange={(value) => patch({ payeeDriverId: value })}
              options={driverOptions}
              placeholder={t('create.payeePlaceholder')}
              value={fields.payeeDriverId}
            />
          </div>
        ) : null}
        {fields.kind === 'fixed' ? (
          <>
            <div className={styles.field}>
              <span>{t('create.recurrence')}</span>
              <Select
                ariaLabel={t('create.recurrence')}
                onChange={(value) => patch({ recurrence: value as ExpenseRecurrence })}
                options={EXPENSE_RECURRENCES.map((recurrence) => ({
                  label: t(`recurrence.${recurrence}`),
                  value: recurrence,
                }))}
                value={fields.recurrence}
              />
            </div>
            {recurrenceNeedsDueDay(fields.recurrence) ? (
              <label className={styles.field}>
                <span>{t('create.dueDay')}</span>
                <input
                  aria-invalid={showIssues && issues.includes('dueDay')}
                  inputMode="numeric"
                  maxLength={2}
                  onChange={(event) => patch({ dueDay: event.target.value.replace(/\D/g, '') })}
                  value={fields.dueDay}
                />
              </label>
            ) : (
              <p className={styles.hint}>{t('create.fortnightlyHint')}</p>
            )}
          </>
        ) : (
          <div className={styles.field}>
            <span>{t('create.dueDate')}</span>
            <DatePicker
              {...calendar}
              ariaLabel={t('create.dueDate')}
              onChange={(value) => patch({ dueDate: value })}
              value={fields.dueDate}
            />
          </div>
        )}
        <div className={styles.field}>
          <span>{t('create.vehicle')}</span>
          <Select
            ariaLabel={t('create.vehicle')}
            clearable
            onChange={(value) => patch({ vehicleId: value })}
            options={vehicleOptions}
            placeholder={t('create.vehiclePlaceholder')}
            value={fields.vehicleId}
          />
        </div>
      </div>
      {showIssues && issues.length > 0 ? (
        <p className={styles.error} role="alert">
          {t('create.issues', {
            fields: issues.map((issue) => t(`create.issue.${issue}`)).join(', '),
          })}
        </p>
      ) : null}
      {createExpense.error === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${createExpense.error.message}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}
    </ExpenseDialogShell>
  )
}
