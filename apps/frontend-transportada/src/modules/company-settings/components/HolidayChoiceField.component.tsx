/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select, type SelectOption } from '@/components/ui/select'

import { useHolidayFieldIds } from '../hooks/useHolidayFieldIds.hook'
import type {
  HolidayField as HolidayFieldName,
  HolidayIssue,
} from '../shared/businessCalendarForm.validation'

import { HolidayField } from './HolidayField.component'

type HolidayChoiceFieldProps = Readonly<{
  ariaLabel: string
  disabled?: boolean
  field: HolidayFieldName
  issue: HolidayIssue | undefined
  label: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder: string
  value: string
}>

/** Lista fechada do formulário (UF, tipo, recorrência, mês): o `Select` do design system, nunca o nativo. */
export function HolidayChoiceField({
  ariaLabel,
  disabled = false,
  field,
  issue,
  label,
  onChange,
  options,
  placeholder,
  value,
}: HolidayChoiceFieldProps) {
  const { t } = useTranslation('businessCalendar')
  const ids = useHolidayFieldIds()

  return (
    <HolidayField field={field} ids={ids} issue={issue} label={label}>
      <Select
        ariaLabel={ariaLabel}
        disabled={disabled}
        emptyLabel={t('form.emptyOptions')}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={t('form.searchPlaceholder')}
        value={value}
      />
    </HolidayField>
  )
}
