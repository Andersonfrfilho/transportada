/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'

type CteSettingsFieldsProps = Readonly<{
  cte: CompanySettingsUpdate['cte']
  disabled: boolean
  onChange: (cte: CompanySettingsUpdate['cte']) => void
}>

function EnvironmentField(
  props: Readonly<{
    cte: CompanySettingsUpdate['cte']
    onChange: CteSettingsFieldsProps['onChange']
  }>,
) {
  const { t } = useTranslation('companySettings')
  const options: readonly Readonly<{
    label: string
    value: CompanySettingsUpdate['cte']['environment']
  }>[] = [
    { label: t('homologation'), value: 'homologation' },
    { label: t('production'), value: 'production' },
  ]
  return (
    <div className={styles.taxRegimeField}>
      <span>{t('environment')}</span>
      <div className={styles.environmentOptions} role="radiogroup" aria-label={t('environment')}>
        {options.map((option) => (
          <button
            aria-checked={props.cte.environment === option.value}
            className={
              props.cte.environment === option.value
                ? `${styles.environmentOption} ${styles.environmentOptionSelected}`
                : styles.environmentOption
            }
            key={option.value}
            role="radio"
            type="button"
            onClick={() => props.onChange({ ...props.cte, environment: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DecimalField(
  props: Readonly<{
    field: 'nextNumber' | 'series'
    onChange: (value: string) => void
    value: string
  }>,
) {
  const { t } = useTranslation('companySettings')
  return (
    <label>
      <span>{t(props.field)}</span>
      <input
        inputMode="numeric"
        maxLength={19}
        required
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  )
}

export function CteSettingsFields({ cte, disabled, onChange }: CteSettingsFieldsProps) {
  const { t } = useTranslation('companySettings')
  return (
    <fieldset className={styles.fieldGroup} disabled={disabled}>
      <legend>{t('cteLegend')}</legend>
      <div className={styles.fieldGrid}>
        <EnvironmentField cte={cte} onChange={onChange} />
        <DecimalField
          field="series"
          onChange={(series) => onChange({ ...cte, series })}
          value={cte.series}
        />
        <DecimalField
          field="nextNumber"
          onChange={(nextNumber) => onChange({ ...cte, nextNumber })}
          value={cte.nextNumber}
        />
      </div>
    </fieldset>
  )
}
