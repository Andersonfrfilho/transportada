/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { maskTypedAmount, maskTypedMeasure } from '@/modules/shared/decimalAmount.service'

import styles from '../styles/fleet.module.css'

type FleetFieldProps = Readonly<{
  hint?: string
  inputMode?: 'numeric' | 'text'
  label: string
  maxLength?: number
  onChange: (value: string) => void
  optional?: boolean
  value: string
}>

type FleetMoneyFieldProps = Readonly<{
  label: string
  onChange: (value: string) => void
  scale: number
  value: string
  optional?: boolean
}>

type FleetMeasureFieldProps = Readonly<{
  label: string
  onChange: (value: string) => void
  optional?: boolean
  scale: number
  value: string
}>

type FleetSelectFieldProps<TValue extends string> = Readonly<{
  clearable?: boolean
  label: string
  onChange: (value: TValue) => void
  optionLabelKey: string
  options: readonly TValue[]
  placeholder?: string
  value: TValue
}>

export function FleetField({
  hint,
  inputMode = 'text',
  label,
  maxLength = 120,
  onChange,
  optional = false,
  value,
}: FleetFieldProps) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>
        {label}
        {optional ? <em className={styles.optionalMark}>{t('optionalMark')}</em> : null}
      </span>
      <input
        inputMode={inputMode}
        maxLength={maxLength}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint === undefined ? null : <small className={styles.fieldHint}>{hint}</small>}
    </label>
  )
}

/**
 * Campo de dinheiro: os dígitos entram pela direita e o milhar aparece enquanto se digita. Sem a
 * máscara `120000` e `12000` são a mesma linha de pixels, e o zero a mais só aparece no relatório.
 */
export function FleetMoneyField({
  label,
  onChange,
  optional = false,
  scale,
  value,
}: FleetMoneyFieldProps) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>
        {label}
        {optional ? <em className={styles.optionalMark}>{t('optionalMark')}</em> : null}
      </span>
      <span className={styles.moneyField}>
        <span aria-hidden="true" className={styles.moneyPrefix}>
          {t('currencyPrefix')}
        </span>
        <input
          inputMode="numeric"
          type="text"
          value={maskTypedAmount({ scale, value })}
          onChange={(event) => onChange(maskTypedAmount({ scale, value: event.target.value }))}
        />
      </span>
    </label>
  )
}

/**
 * Campo de medida: os dígitos entram pela esquerda, como se escreve peso, e o milhar aparece
 * enquanto se digita. A vírgula é do operador; o ponto que separa o milhar é sempre da máscara.
 */
export function FleetMeasureField({
  label,
  onChange,
  optional = false,
  scale,
  value,
}: FleetMeasureFieldProps) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>
        {label}
        {optional ? <em className={styles.optionalMark}>{t('optionalMark')}</em> : null}
      </span>
      <input
        inputMode="decimal"
        type="text"
        value={maskTypedMeasure({ scale, value })}
        onChange={(event) => onChange(maskTypedMeasure({ scale, value: event.target.value }))}
      />
    </label>
  )
}

export function FleetSelectField<TValue extends string>({
  clearable = false,
  label,
  onChange,
  optionLabelKey,
  options,
  placeholder,
  value,
}: FleetSelectFieldProps<TValue>) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>{label}</span>
      <Select
        ariaLabel={label}
        clearable={clearable}
        options={options.map((option) => ({
          label: t(`${optionLabelKey}.${option}`),
          value: option,
        }))}
        {...(placeholder === undefined ? {} : { placeholder })}
        value={value}
        onChange={(next) => onChange(next as TValue)}
      />
    </label>
  )
}
