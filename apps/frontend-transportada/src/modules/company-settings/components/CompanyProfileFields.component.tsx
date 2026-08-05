/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import { profileFieldId } from '../shared/companySettingsFormValidation.service'
import {
  formatDigitGroups,
  stripStateRegistrationMask,
} from '../shared/companySettingsMask.service'
import styles from '../styles/companySettings.module.css'

type Profile = CompanySettingsUpdate['profile']
type TextField = Exclude<keyof Profile, 'taxRegime'>
type FieldDefinition = Readonly<{
  field: TextField
  inputMode?: 'email' | 'numeric' | 'text'
  maximum: number
  required?: boolean
}>

const PROFILE_FIELDS: readonly FieldDefinition[] = [
  { field: 'legalName', maximum: 200, required: true },
  { field: 'tradeName', maximum: 200 },
  { field: 'cnpj', inputMode: 'numeric', maximum: 14, required: true },
  { field: 'stateRegistration', maximum: 20 },
  { field: 'municipalRegistration', maximum: 20 },
  { field: 'rntrc', inputMode: 'numeric', maximum: 8, required: true },
  { field: 'street', maximum: 200, required: true },
  { field: 'number', maximum: 20, required: true },
  { field: 'complement', maximum: 100 },
  { field: 'district', maximum: 100, required: true },
  { field: 'city', maximum: 100, required: true },
  { field: 'state', maximum: 2, required: true },
  { field: 'postalCode', inputMode: 'numeric', maximum: 8, required: true },
  { field: 'cityIbgeCode', inputMode: 'numeric', maximum: 7, required: true },
  { field: 'phone', maximum: 20 },
  { field: 'email', inputMode: 'email', maximum: 254 },
]

type CompanyProfileFieldsProps = Readonly<{
  disabled: boolean
  invalidFields?: ReadonlySet<TextField>
  lookupPending: boolean
  lookupStatus: 'error' | 'idle' | 'success'
  onChange: (input: Readonly<{ field: TextField; value: string }>) => void
  onLookupCnpj: () => void
  onTaxRegimeChange: (value: Profile['taxRegime']) => void
  profile: Profile
}>

function ProfileTextField(
  props: Readonly<{
    disabled: boolean
    definition: FieldDefinition
    invalid: boolean
    lookupPending?: boolean | undefined
    lookupStatus?: CompanyProfileFieldsProps['lookupStatus'] | undefined
    onChange: CompanyProfileFieldsProps['onChange']
    onLookupCnpj?: CompanyProfileFieldsProps['onLookupCnpj'] | undefined
    value: string
  }>,
) {
  const { t } = useTranslation('companySettings')
  const { field, inputMode, maximum, required } = props.definition
  const normalizeValue = (value: string) => {
    if (inputMode === 'numeric') return value.replace(/\D/g, '').slice(0, maximum)
    if (field === 'stateRegistration') return stripStateRegistrationMask(value).slice(0, maximum)
    return value
  }
  const formatDisplayValue = (value: string) => {
    if (field === 'cnpj') return formatCnpj(value)
    if (field === 'postalCode') return formatPostalCode(value)
    if (field === 'stateRegistration') return formatDigitGroups(value)
    return value
  }
  const errorId = `${profileFieldId(field)}-error`
  // O maxLength conta o texto exibido, e a máscara de IE acrescenta um ponto a cada três dígitos.
  const displayMaxLength =
    field === 'stateRegistration' ? formatDigitGroups('0'.repeat(maximum)).length : maximum
  const input = (
    <input
      aria-describedby={props.invalid ? errorId : undefined}
      aria-invalid={props.invalid}
      id={profileFieldId(field)}
      inputMode={inputMode ?? 'text'}
      maxLength={inputMode === 'numeric' ? undefined : displayMaxLength}
      required={required}
      type={inputMode === 'email' ? 'email' : 'text'}
      value={formatDisplayValue(props.value)}
      onChange={(event) => props.onChange({ field, value: normalizeValue(event.target.value) })}
    />
  )
  // O anúncio dos erros é do resumo no topo: uma live region por vez, não uma por campo inválido.
  const errorMessage = props.invalid ? (
    <span className={styles.fieldError} id={errorId}>
      {t('validationRequiredField', { field: t(field) })}
    </span>
  ) : null
  if (field !== 'cnpj') {
    return (
      <label>
        <span>{t(field)}</span>
        {input}
        {errorMessage}
      </label>
    )
  }
  return (
    <label>
      <span>{t(field)}</span>
      <div className={styles.lookupField}>
        {input}
        <button
          className={styles.lookupAction}
          disabled={props.disabled || props.lookupPending}
          type="button"
          onClick={() => props.onLookupCnpj?.()}
          aria-label={t(props.lookupPending ? 'lookupLoading' : 'lookupAction')}
          title={t(props.lookupPending ? 'lookupLoading' : 'lookupAction')}
        >
          <Icon name="search" />
        </button>
      </div>
      {errorMessage}
      {props.lookupStatus !== 'idle' && (
        <span className={styles.fieldHint}>
          {t(props.lookupStatus === 'error' ? 'lookupError' : 'lookupSuccess')}
        </span>
      )}
    </label>
  )
}

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.replace(/^(\d{5})(\d)/, '$1-$2')
}

function TaxRegimeField(
  props: Readonly<{
    onChange: (value: Profile['taxRegime']) => void
    value: Profile['taxRegime']
  }>,
) {
  const { t } = useTranslation('companySettings')
  const options: readonly Readonly<{ label: string; value: Profile['taxRegime'] }>[] = [
    { label: t('taxRegime1'), value: '1' },
    { label: t('taxRegime2'), value: '2' },
    { label: t('taxRegime3'), value: '3' },
  ]
  return (
    <div className={styles.taxRegimeField}>
      <span>{t('taxRegime')}</span>
      <div className={styles.taxRegimeOptions} role="radiogroup" aria-label={t('taxRegime')}>
        {options.map((option) => (
          <button
            aria-checked={props.value === option.value}
            className={
              props.value === option.value
                ? `${styles.taxRegimeOption} ${styles.taxRegimeOptionSelected}`
                : styles.taxRegimeOption
            }
            key={option.value}
            role="radio"
            type="button"
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CompanyProfileFields({
  disabled,
  invalidFields,
  lookupPending,
  lookupStatus,
  onChange,
  onLookupCnpj,
  onTaxRegimeChange,
  profile,
}: CompanyProfileFieldsProps) {
  const { t } = useTranslation('companySettings')
  return (
    <fieldset className={styles.fieldGroup} disabled={disabled}>
      <legend>{t('profileLegend')}</legend>
      <div className={styles.fieldGrid}>
        {PROFILE_FIELDS.map((definition) => (
          <ProfileTextField
            disabled={disabled}
            definition={definition}
            invalid={invalidFields?.has(definition.field) ?? false}
            key={definition.field}
            lookupPending={definition.field === 'cnpj' ? lookupPending : undefined}
            lookupStatus={definition.field === 'cnpj' ? lookupStatus : undefined}
            onChange={onChange}
            onLookupCnpj={definition.field === 'cnpj' ? onLookupCnpj : undefined}
            value={profile[definition.field]}
          />
        ))}
        <TaxRegimeField onChange={onTaxRegimeChange} value={profile.taxRegime} />
      </div>
    </fieldset>
  )
}
