/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
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
  { field: 'rntrc', maximum: 20, required: true },
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
  onChange: (input: Readonly<{ field: TextField; value: string }>) => void
  onTaxRegimeChange: (value: Profile['taxRegime']) => void
  profile: Profile
}>

function ProfileTextField(
  props: Readonly<{
    definition: FieldDefinition
    onChange: CompanyProfileFieldsProps['onChange']
    value: string
  }>,
) {
  const { t } = useTranslation('companySettings')
  const { field, inputMode, maximum, required } = props.definition
  return (
    <label>
      <span>{t(field)}</span>
      <input
        inputMode={inputMode ?? 'text'}
        maxLength={maximum}
        required={required}
        type={inputMode === 'email' ? 'email' : 'text'}
        value={props.value}
        onChange={(event) => props.onChange({ field, value: event.target.value })}
      />
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
  return (
    <label>
      <span>{t('taxRegime')}</span>
      <select
        required
        value={props.value}
        onChange={(event) => {
          const value = event.target.value
          if (value === '1' || value === '2' || value === '3') props.onChange(value)
        }}
      >
        <option value="1">{t('taxRegime1')}</option>
        <option value="2">{t('taxRegime2')}</option>
        <option value="3">{t('taxRegime3')}</option>
      </select>
    </label>
  )
}

export function CompanyProfileFields({
  disabled,
  onChange,
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
            definition={definition}
            key={definition.field}
            onChange={onChange}
            value={profile[definition.field]}
          />
        ))}
        <TaxRegimeField onChange={onTaxRegimeChange} value={profile.taxRegime} />
      </div>
    </fieldset>
  )
}
