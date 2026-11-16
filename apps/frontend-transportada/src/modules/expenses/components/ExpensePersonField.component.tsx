/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { SearchableSelect } from '@/components/ui/searchable-select'
import type { SelectOption } from '@/components/ui/select'

import {
  COMPANY_OWN_PERSON_NAME,
  fromPersonFieldValue,
  PERSON_NAME_VALUE_PREFIX,
  toPersonFieldValue,
} from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'

type ExpensePersonFieldProps = Readonly<{
  choice: string
  hint?: string
  includeCompany?: boolean
  label: string
  name: string
  onChange: (changes: { choice: string; name: string }) => void
  options: readonly SelectOption[]
  placeholder: string
}>

/**
 * Spec 332: um campo só para a pessoa — escolhe do cadastro (ficha da frota ou usuário) ou digita um nome e aperta
 * Enter. Com `includeCompany`, "A própria empresa" é uma das opções (conta que é da empresa, não de uma pessoa).
 */
export function ExpensePersonField({
  choice,
  hint,
  includeCompany = false,
  label,
  name,
  onChange,
  options,
  placeholder,
}: ExpensePersonFieldProps) {
  const { t } = useTranslation('expenses')
  const value = toPersonFieldValue({ choice, name })
  const typedName = fromPersonFieldValue(value).name
  const extra = [
    ...(includeCompany
      ? [
          {
            label: t('person.company'),
            value: `${PERSON_NAME_VALUE_PREFIX}${COMPANY_OWN_PERSON_NAME}`,
          },
        ]
      : []),
    ...(typedName !== '' && !(includeCompany && typedName === COMPANY_OWN_PERSON_NAME)
      ? [{ label: typedName, value }]
      : []),
  ]
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <SearchableSelect
        ariaLabel={label}
        creatable={{
          createLabel: (text) => t('person.create', { name: text }),
          onCreate: (text) => onChange({ choice: '', name: text }),
        }}
        emptyLabel={t('person.empty')}
        onChange={(next) => onChange(fromPersonFieldValue(next))}
        options={[{ label: t('person.none'), value: '' }, ...extra, ...options]}
        placeholder={placeholder}
        searchPlaceholder={t('person.search')}
        value={value}
      />
      {hint === undefined ? null : <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
