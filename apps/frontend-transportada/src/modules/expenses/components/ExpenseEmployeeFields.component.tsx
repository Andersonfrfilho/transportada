/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select, type SelectOption } from '@/components/ui/select'

import { EXPENSE_EMPLOYMENT_TYPES } from '../shared/expenses.types'
import styles from '../styles/expenses.module.css'

type ExpenseEmployeeFieldsProps = Readonly<{
  employee: string
  employeeName: string
  employmentType: string
  onChange: (changes: { employee?: string; employeeName?: string; employmentType?: string }) => void
  peopleOptions: readonly SelectOption[]
}>

/** Spec 330: quem é o funcionário (qualquer ficha da frota, qualquer usuário ativo ou um nome digitado) e o vínculo. */
export function ExpenseEmployeeFields({
  employee,
  employeeName,
  employmentType,
  onChange,
  peopleOptions,
}: ExpenseEmployeeFieldsProps) {
  const { t } = useTranslation('expenses')
  return (
    <>
      <div className={styles.field}>
        <span>{t('create.employee')}</span>
        <Select
          ariaLabel={t('create.employee')}
          clearable
          onChange={(value) => onChange({ employee: value, employeeName: '' })}
          options={peopleOptions}
          placeholder={t('create.employeePlaceholder')}
          value={employee}
        />
      </div>
      {employee === '' ? (
        <label className={styles.field}>
          <span>{t('create.employeeName')}</span>
          <input
            maxLength={120}
            onChange={(event) => onChange({ employeeName: event.target.value })}
            placeholder={t('create.employeeNamePlaceholder')}
            value={employeeName}
          />
        </label>
      ) : null}
      <div className={styles.field}>
        <span>{t('create.employmentType')}</span>
        <Select
          ariaLabel={t('create.employmentType')}
          clearable
          onChange={(value) => onChange({ employmentType: value })}
          options={EXPENSE_EMPLOYMENT_TYPES.map((type) => ({
            label: t(`employmentType.${type}`),
            value: type,
          }))}
          placeholder={t('create.employmentTypePlaceholder')}
          value={employmentType}
        />
      </div>
      <p className={styles.hint}>{t('create.employeeHint')}</p>
    </>
  )
}
