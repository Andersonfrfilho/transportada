/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { SearchableSelect } from '@/components/ui/searchable-select'

import { useExpenseMutations, useExpenseSubtypes } from '../hooks/useExpenses.hook'
import styles from '../styles/expenses.module.css'

type ExpenseSubtypeFieldProps = Readonly<{
  categoryId: string
  onChange: (subtypeId: string) => void
  value: string
}>

/** Spec 331: o tipo da categoria (qual cartão); digitar e Enter cadastra e já seleciona. */
export function ExpenseSubtypeField({ categoryId, onChange, value }: ExpenseSubtypeFieldProps) {
  const { t } = useTranslation('expenses')
  const { createSubtype } = useExpenseMutations()
  const subtypes = useExpenseSubtypes()
  const options = [
    { label: t('subtype.none'), value: '' },
    ...(subtypes.data ?? [])
      .filter((subtype) => subtype.categoryId === categoryId && subtype.active)
      .map((subtype) => ({ label: subtype.name, value: subtype.id })),
  ]

  async function create(name: string): Promise<void> {
    try {
      const created = await createSubtype.mutateAsync({ categoryId, name })
      onChange(created.id)
    } catch {
      /* o erro fica em `createSubtype.error` e aparece abaixo */
    }
  }

  return (
    <div className={styles.field}>
      <span>{t('subtype.label')}</span>
      <SearchableSelect
        ariaLabel={t('subtype.label')}
        creatable={{ createLabel: (name) => t('subtype.create', { name }), onCreate: create }}
        emptyLabel={t('subtype.empty')}
        onChange={onChange}
        options={options}
        placeholder={t('subtype.placeholder')}
        searchPlaceholder={t('subtype.search')}
        value={value}
      />
      <p className={styles.hint}>{t('subtype.hint')}</p>
      {createSubtype.error === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${createSubtype.error.message}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}
    </div>
  )
}
