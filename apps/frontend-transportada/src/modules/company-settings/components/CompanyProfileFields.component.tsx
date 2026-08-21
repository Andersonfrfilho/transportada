/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import { useProfilePostalCodeLookup } from '../hooks/useProfilePostalCodeLookup.hook'
import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import {
  describeCompanySettingsFieldError,
  profileFieldId,
  type CompanySettingsFieldError,
} from '../shared/companySettingsFormValidation.service'
import {
  formatCnpj,
  formatDigitGroups,
  formatPostalCode,
  stripNonDigits,
  stripStateRegistrationMask,
} from '../shared/companySettingsMask.service'
import styles from '../styles/companySettings.module.css'

type Profile = CompanySettingsUpdate['profile']
type TextField = Exclude<keyof Profile, 'taxRegime'>
type FieldDefinition = Readonly<{
  field: TextField
  inputMode?: 'email' | 'numeric' | 'text'
  maximum: number
  /** Campo cujo valor guardado difere do exibido — a máscara é maior, e o `maxLength` cortaria nela. */
  normalize?: 'digits' | 'taxId'
  required?: boolean
}>

const PROFILE_FIELDS: readonly FieldDefinition[] = [
  { field: 'legalName', maximum: 200, required: true },
  { field: 'tradeName', maximum: 200 },
  // Teclado de texto: o CNPJ alfanumérico tem letra na base, e o numérico não as oferece.
  { field: 'cnpj', maximum: 14, normalize: 'taxId', required: true },
  { field: 'stateRegistration', maximum: 20 },
  { field: 'municipalRegistration', maximum: 20 },
  { field: 'rntrc', inputMode: 'numeric', maximum: 9, normalize: 'digits', required: true },
  { field: 'street', maximum: 200, required: true },
  { field: 'number', maximum: 20, required: true },
  { field: 'complement', maximum: 100 },
  { field: 'district', maximum: 100, required: true },
  { field: 'city', maximum: 100, required: true },
  { field: 'state', maximum: 2, required: true },
  { field: 'postalCode', inputMode: 'numeric', maximum: 8, normalize: 'digits', required: true },
  { field: 'cityIbgeCode', inputMode: 'numeric', maximum: 7, normalize: 'digits', required: true },
  { field: 'phone', maximum: 20 },
  { field: 'email', inputMode: 'email', maximum: 254 },
]

type CompanyProfileFieldsProps = Readonly<{
  disabled: boolean
  errors?: readonly CompanySettingsFieldError[]
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
    error: CompanySettingsFieldError | undefined
    lookupPending?: boolean | undefined
    onChange: CompanyProfileFieldsProps['onChange']
    onLookupCnpj?: CompanyProfileFieldsProps['onLookupCnpj'] | undefined
    statusKey?: null | string | undefined
    value: string
  }>,
) {
  const { t } = useTranslation('companySettings')
  const { field, inputMode, maximum, normalize, required } = props.definition
  const invalid = props.error !== undefined
  // Cortar o excedente aqui gravava um documento fiscal errado sem o usuário ver: a validação acusa.
  const normalizeValue = (value: string) => {
    if (normalize === 'taxId') return normalizeTaxId(value)
    if (normalize === 'digits') return stripNonDigits(value)
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
      aria-describedby={invalid ? errorId : undefined}
      aria-invalid={invalid}
      id={profileFieldId(field)}
      inputMode={inputMode ?? 'text'}
      maxLength={normalize === undefined ? displayMaxLength : undefined}
      required={required}
      type={inputMode === 'email' ? 'email' : 'text'}
      value={formatDisplayValue(props.value)}
      onChange={(event) => props.onChange({ field, value: normalizeValue(event.target.value) })}
    />
  )
  // O anúncio dos erros é do resumo no topo: uma live region por vez, não uma por campo inválido.
  const errorMessage =
    props.error === undefined ? null : (
      <span className={styles.fieldError} id={errorId}>
        {describeCompanySettingsFieldError({ error: props.error, translate: t })}
      </span>
    )
  const statusMessage =
    props.statusKey === undefined || props.statusKey === null ? null : (
      <span className={styles.fieldHint}>{t(props.statusKey)}</span>
    )
  if (field !== 'cnpj') {
    return (
      <label>
        <span>{t(field)}</span>
        {input}
        {errorMessage}
        {statusMessage}
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
      {statusMessage}
    </label>
  )
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
  errors,
  lookupPending,
  lookupStatus,
  onChange,
  onLookupCnpj,
  onTaxRegimeChange,
  profile,
}: CompanyProfileFieldsProps) {
  const { t } = useTranslation('companySettings')
  const postalCode = useProfilePostalCodeLookup({ onChange })
  const errorByField = new Map((errors ?? []).map((error) => [error.field, error]))
  const cnpjStatusKey = () => {
    if (lookupStatus === 'idle') return null
    return lookupStatus === 'error' ? 'lookupError' : 'lookupSuccess'
  }
  const statusKeyOf = (field: TextField): null | string | undefined => {
    if (field === 'cnpj') return cnpjStatusKey()
    if (field === 'postalCode') return postalCode.statusKey
    return undefined
  }
  const changePostalCode: CompanyProfileFieldsProps['onChange'] = (input) => {
    postalCode.changePostalCode(input.value)
  }
  return (
    <fieldset className={styles.fieldGroup} disabled={disabled}>
      <legend>{t('profileLegend')}</legend>
      <div className={styles.fieldGrid}>
        {PROFILE_FIELDS.map((definition) => (
          <ProfileTextField
            disabled={disabled}
            definition={definition}
            error={errorByField.get(definition.field)}
            key={definition.field}
            lookupPending={definition.field === 'cnpj' ? lookupPending : undefined}
            onChange={definition.field === 'postalCode' ? changePostalCode : onChange}
            onLookupCnpj={definition.field === 'cnpj' ? onLookupCnpj : undefined}
            statusKey={statusKeyOf(definition.field)}
            value={profile[definition.field]}
          />
        ))}
        <TaxRegimeField onChange={onTaxRegimeChange} value={profile.taxRegime} />
      </div>
    </fieldset>
  )
}
