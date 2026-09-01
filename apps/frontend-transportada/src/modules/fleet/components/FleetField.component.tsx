/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'
import { maskTypedAmount, maskTypedMeasure } from '@/modules/shared/decimalAmount.service'

import styles from '../styles/fleet.module.css'

type FleetFieldProps = Readonly<{
  error?: string | undefined
  fromDocument?: boolean
  hint?: string
  inputRef?: ((element: HTMLInputElement | null) => void) | undefined
  inputMode?: 'numeric' | 'text'
  label: string
  maxLength?: number
  onBlur?: () => void
  onChange: (value: string) => void
  optional?: boolean
  value: string
}>

type FleetDateFieldProps = Readonly<{
  hint?: string
  label: string
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
  fromDocument?: boolean
  label: string
  onChange: (value: TValue) => void
  optionLabelKey: string
  options: readonly TValue[]
  placeholder?: string
  triggerRef?: (element: HTMLButtonElement | null) => void
  value: TValue
}>

/**
 * A mensagem de erro é do campo, e é o próprio campo que a liga ao `input`: texto solto ao lado não
 * é anunciado pelo leitor de tela, e o operador não sabe qual dos campos únicos é o repetido.
 */
export function FleetField({
  error,
  fromDocument = false,
  hint,
  inputMode = 'text',
  inputRef,
  label,
  maxLength = 120,
  onBlur,
  onChange,
  optional = false,
  value,
}: FleetFieldProps) {
  const { t } = useTranslation('fleet')
  const errorId = error === undefined ? undefined : `${toFieldId(label)}-error`
  return (
    <label>
      <span>
        {label}
        {optional ? <em className={styles.optionalMark}>{t('optionalMark')}</em> : null}
        <DocumentOriginMark isVisible={fromDocument} />
      </span>
      <input
        aria-invalid={error === undefined ? undefined : true}
        {...(errorId === undefined ? {} : { 'aria-describedby': errorId })}
        inputMode={inputMode}
        maxLength={maxLength}
        ref={inputRef}
        type="text"
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {errorId === undefined ? null : (
        <small className={styles.fieldError} id={errorId} role="alert">
          {error}
        </small>
      )}
      {hint === undefined ? null : <small className={styles.fieldHint}>{hint}</small>}
    </label>
  )
}

/**
 * Spec 048: o que veio do documento chega marcado, e a marca some assim que o operador edita o
 * campo — a partir daí o dado é dele. É rótulo de texto, não cor: cor sozinha não é diferença que
 * todo mundo enxerga.
 */
function DocumentOriginMark({ isVisible }: Readonly<{ isVisible: boolean }>) {
  const { t } = useTranslation('documentIntake')
  if (!isVisible) return null

  return <em className={styles.documentMark}>{t('fromDocument')}</em>
}

/** O rótulo é o que distingue um campo do outro nesta tela; o id sai dele, sem acento nem espaço. */
function toFieldId(label: string): string {
  return `fleet-field-${label
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()}`
}

/**
 * Data é calendário, não campo de data nativo: o nativo muda de forma em cada navegador e
 * ignora os tokens do produto.
 */
export function FleetDateField({
  hint,
  label,
  onChange,
  optional = false,
  value,
}: FleetDateFieldProps) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>
        {label}
        {optional ? <em className={styles.optionalMark}>{t('optionalMark')}</em> : null}
      </span>
      <DatePicker
        ariaLabel={label}
        chooseYearLabel={t('dateField.chooseYear')}
        clearLabel={t('dateField.clear')}
        openCalendarLabel={t('dateField.openCalendar')}
        nextMonthLabel={t('dateField.nextMonth')}
        placeholder={t('dateField.placeholder')}
        previousMonthLabel={t('dateField.previousMonth')}
        value={value}
        onChange={onChange}
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
  fromDocument = false,
  label,
  onChange,
  optionLabelKey,
  options,
  placeholder,
  triggerRef,
  value,
}: FleetSelectFieldProps<TValue>) {
  const { t } = useTranslation('fleet')
  return (
    <label>
      <span>
        {label}
        <DocumentOriginMark isVisible={fromDocument} />
      </span>
      <Select
        ariaLabel={label}
        clearable={clearable}
        options={options.map((option) => ({
          label: t(`${optionLabelKey}.${option}`),
          value: option,
        }))}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(triggerRef === undefined ? {} : { triggerRef })}
        value={value}
        onChange={(next) => onChange(next as TValue)}
      />
    </label>
  )
}
