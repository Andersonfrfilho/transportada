/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

type FleetFieldProps = Readonly<{
  inputMode?: 'numeric' | 'text'
  label: string
  maxLength?: number
  onChange: (value: string) => void
  value: string
}>

type FleetSelectFieldProps<TValue extends string> = Readonly<{
  label: string
  onChange: (value: TValue) => void
  optionLabelKey: string
  options: readonly TValue[]
  value: TValue
}>

export function FleetField({
  inputMode = 'text',
  label,
  maxLength = 120,
  onChange,
  value,
}: FleetFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        inputMode={inputMode}
        maxLength={maxLength}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function FleetSelectField<TValue extends string>({
  label,
  onChange,
  optionLabelKey,
  options,
  value,
}: FleetSelectFieldProps<TValue>) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as TValue)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${optionLabelKey}.${option}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
