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
  return (
    <label>
      <span>{t('environment')}</span>
      <select
        value={props.cte.environment}
        onChange={(event) => {
          const environment = event.target.value
          if (environment === 'homologation' || environment === 'production')
            props.onChange({ ...props.cte, environment })
        }}
      >
        <option value="homologation">{t('homologation')}</option>
        <option value="production">{t('production')}</option>
      </select>
    </label>
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
