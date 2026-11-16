/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { useExpenseAmountHistory, useExpenseMutations } from '../hooks/useExpenses.hook'
import {
  EXPENSE_EMPLOYMENT_TYPES,
  type ExpenseOccurrenceListItem,
  type UpdateExpenseInput,
} from '../shared/expenses.types'
import {
  causedByKeys,
  currentCompetence,
  employeeKeys,
  isEmployeeCategoryName,
  isValidBillUrl,
  listCompetenceOptions,
  maskMoney,
  parseMoney,
  toTypedMoney,
} from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'
import { ExpenseFieldLabel } from './ExpenseFieldLabel.component'
import { ExpenseDialogShell } from './ExpenseDialogShell.component'
import { ExpensePersonField } from './ExpensePersonField.component'
import { ExpenseSubtypeField } from './ExpenseSubtypeField.component'
import { ExpenseEmployeeFields } from './ExpenseEmployeeFields.component'

type ExpenseEditDialogProps = Readonly<{
  occurrence: ExpenseOccurrenceListItem
  onClose: () => void
  peopleOptions: readonly SelectOption[]
}>

function initialEmployee(occurrence: ExpenseOccurrenceListItem): string {
  if (occurrence.employeeDriverId) return `driver:${occurrence.employeeDriverId}`
  if (occurrence.employeeUserId) return `user:${occurrence.employeeUserId}`
  return ''
}

function initialCausedBy(occurrence: ExpenseOccurrenceListItem): string {
  if (occurrence.causedByDriverId) return `driver:${occurrence.causedByDriverId}`
  if (occurrence.causedByUserId) return `user:${occurrence.causedByUserId}`
  return ''
}

/** Edita o que é informativo da conta (nome, quem causou, onde está); vale para a conta toda. */
export function ExpenseEditDialog({ occurrence, onClose, peopleOptions }: ExpenseEditDialogProps) {
  const { t } = useTranslation('expenses')
  const { updateExpense } = useExpenseMutations()
  const [name, setName] = useState(occurrence.expenseName)
  const [causedBy, setCausedBy] = useState(initialCausedBy(occurrence))
  const [causedByName, setCausedByName] = useState(occurrence.causedByName ?? '')
  const showEmployee =
    isEmployeeCategoryName(occurrence.categoryName) ||
    initialEmployee(occurrence) !== '' ||
    (occurrence.employeeName ?? '') !== '' ||
    (occurrence.employmentType ?? null) !== null
  const [employee, setEmployee] = useState(initialEmployee(occurrence))
  const [employeeName, setEmployeeName] = useState(occurrence.employeeName ?? '')
  const [employmentType, setEmploymentType] = useState(occurrence.employmentType ?? '')
  const [subtypeId, setSubtypeId] = useState(occurrence.subtypeId ?? '')
  const [billLocation, setBillLocation] = useState(occurrence.billLocation ?? '')
  const [billUrl, setBillUrl] = useState(occurrence.billUrl ?? '')
  const [newAmount, setNewAmount] = useState(toTypedMoney(occurrence.expectedAmount))
  const [amountMode, setAmountMode] = useState<'adjustment' | 'correction'>('correction')
  const [effectiveFrom, setEffectiveFrom] = useState(currentCompetence())
  const [showIssue, setShowIssue] = useState(false)
  const history = useExpenseAmountHistory({ expenseId: occurrence.expenseId })
  const competenceOptions = listCompetenceOptions().filter(
    (option) => option.value >= currentCompetence(),
  )
  const typedAmount = newAmount.trim() === '' ? null : parseMoney(newAmount)
  const amountInvalid = newAmount.trim() !== '' && typedAmount === null

  async function save(): Promise<void> {
    setShowIssue(true)
    if (name.trim() === '' || !isValidBillUrl(billUrl) || amountInvalid) return
    const keys = causedByKeys(causedBy)
    const typed = causedBy === '' ? causedByName.trim() : ''
    const employeeKey = employeeKeys(employee)
    const employeeTyped = employee === '' ? employeeName.trim() : ''
    const type = EXPENSE_EMPLOYMENT_TYPES.find((item) => item === employmentType) ?? null
    const changes: UpdateExpenseInput = {
      name: name.trim(),
      billLocation: billLocation.trim() === '' ? null : billLocation.trim(),
      billUrl: billUrl.trim() === '' ? null : billUrl.trim(),
      ...(typedAmount === null
        ? {}
        : amountMode === 'correction'
          ? {
              amountKind: 'correction' as const,
              correctionCompetence: occurrence.competence,
              expectedAmount: typedAmount,
            }
          : { effectiveFrom, expectedAmount: typedAmount }),
      causedByDriverId: keys.causedByDriverId ?? null,
      causedByUserId: keys.causedByUserId ?? null,
      causedByName: typed === '' ? null : typed,
      employeeDriverId: employeeKey.employeeDriverId ?? null,
      employeeUserId: employeeKey.employeeUserId ?? null,
      employeeName: employeeTyped === '' ? null : employeeTyped,
      employmentType: type,
      subtypeId: subtypeId === '' ? null : subtypeId,
    }
    try {
      await updateExpense.mutateAsync({ changes, id: occurrence.expenseId })
      onClose()
    } catch {
      /* o erro fica em `updateExpense.error` e aparece abaixo */
    }
  }

  return (
    <ExpenseDialogShell
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            {t('dialog.cancel')}
          </Button>
          <Button disabled={updateExpense.isPending} onClick={() => void save()} type="button">
            <Icon name="save" />
            {updateExpense.isPending ? t('edit.saving') : t('edit.save')}
          </Button>
        </>
      }
      onClose={onClose}
      title={t('edit.title')}
      titleId="expense-edit-title"
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span>{t('create.name')}</span>
          <input
            aria-invalid={showIssue && name.trim() === ''}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <ExpenseSubtypeField
          categoryId={occurrence.categoryId}
          onChange={setSubtypeId}
          value={subtypeId}
        />
        {showEmployee ? (
          <ExpenseEmployeeFields
            employee={employee}
            employeeName={employeeName}
            employmentType={employmentType}
            onChange={(changes) => {
              if (changes.employee !== undefined) setEmployee(changes.employee)
              if (changes.employeeName !== undefined) setEmployeeName(changes.employeeName)
              if (changes.employmentType !== undefined) setEmploymentType(changes.employmentType)
            }}
            peopleOptions={peopleOptions}
          />
        ) : null}
        <ExpensePersonField
          choice={causedBy}
          hint={t('create.causedByHint')}
          includeCompany
          label={t('create.causedBy')}
          name={causedByName}
          onChange={(person) => {
            setCausedBy(person.choice)
            setCausedByName(person.name)
          }}
          options={peopleOptions}
          placeholder={t('create.causedByPlaceholder')}
        />
        {(occurrence.billLocation ?? '') === '' ? null : (
          <label className={styles.field}>
            <span>{t('create.billLocation')}</span>
            <input
              maxLength={120}
              onChange={(event) => setBillLocation(event.target.value)}
              placeholder={t('create.billLocationPlaceholder')}
              value={billLocation}
            />
          </label>
        )}
        <label className={styles.field}>
          <span>{t('create.billUrl')}</span>
          <input
            aria-invalid={showIssue && !isValidBillUrl(billUrl)}
            inputMode="url"
            maxLength={500}
            onChange={(event) => setBillUrl(event.target.value)}
            placeholder={t('create.billUrlPlaceholder')}
            value={billUrl}
          />
        </label>
        <label className={styles.field}>
          <ExpenseFieldLabel
            hint={t(amountMode === 'correction' ? 'edit.correctionHint' : 'edit.amountHint')}
            text={t('edit.newAmount')}
          />
          <input
            aria-invalid={showIssue && amountInvalid}
            inputMode="decimal"
            onChange={(event) => setNewAmount(maskMoney(event.target.value))}
            placeholder={t('create.amountPlaceholder')}
            value={newAmount}
          />
        </label>
        <div className={styles.field}>
          <ExpenseFieldLabel hint={t('edit.hint')} text={t('edit.amountMode')} />
          <Select
            ariaLabel={t('edit.amountMode')}
            onChange={(value) =>
              setAmountMode(value === 'adjustment' ? 'adjustment' : 'correction')
            }
            options={[
              { label: t('edit.modeCorrection'), value: 'correction' },
              { label: t('edit.modeAdjustment'), value: 'adjustment' },
            ]}
            value={amountMode}
          />
        </div>
        {typedAmount === null || amountMode === 'correction' ? null : (
          <div className={styles.field}>
            <span>{t('edit.effectiveFrom')}</span>
            <Select
              ariaLabel={t('edit.effectiveFrom')}
              onChange={(value) => setEffectiveFrom(value)}
              options={competenceOptions}
              value={effectiveFrom}
            />
          </div>
        )}
        {history.data === undefined ? null : (
          <div className={styles.field}>
            <span>{t('edit.history')}</span>
            <ul>
              <li>{t('edit.historyBase', { amount: formatAmount(history.data.baseAmount) })}</li>
              {history.data.changes.map((change) => (
                <li key={change.id}>
                  {t(
                    change.kind === 'correction' ? 'edit.historyCorrection' : 'edit.historyChange',
                    {
                      competence: change.effectiveCompetence,
                      from: formatAmount(change.previousAmount),
                      to: formatAmount(change.newAmount),
                      when: change.createdAt.slice(0, 10).split('-').reverse().join('/'),
                    },
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {updateExpense.error === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${updateExpense.error.message}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}
    </ExpenseDialogShell>
  )
}
