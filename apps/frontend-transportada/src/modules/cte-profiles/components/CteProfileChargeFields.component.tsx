/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { ProfileFormState } from '../shared/cteProfilesForm.service'
import styles from '../styles/cteProfiles.module.css'
import { ProfileField } from './ProfileField.component'

type CteProfileChargeFieldsProps = Readonly<{
  onChange: (patch: Partial<ProfileFormState>) => void
  state: ProfileFormState
}>

export function CteProfileChargeFields({ onChange, state }: CteProfileChargeFieldsProps) {
  const { t } = useTranslation('cteProfiles')
  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('chargeLegend')}</legend>
      <div className={styles.fieldGrid}>
        <ProfileField
          inputMode="decimal"
          label={t('percentage')}
          maxLength={10}
          value={state.percentage}
          onChange={(percentage) => onChange({ percentage })}
        />
        <ProfileField
          label={t('chargeComponentLabel')}
          value={state.chargeComponentLabel}
          onChange={(chargeComponentLabel) => onChange({ chargeComponentLabel })}
        />
        <ProfileField
          inputMode="decimal"
          label={t('minimumAmount')}
          maxLength={20}
          value={state.minimumAmount}
          onChange={(minimumAmount) => onChange({ minimumAmount })}
        />
        <ProfileField
          inputMode="decimal"
          label={t('maximumAmount')}
          maxLength={20}
          value={state.maximumAmount}
          onChange={(maximumAmount) => onChange({ maximumAmount })}
        />
        <ProfileField
          label={t('validFrom')}
          type="date"
          value={state.validFrom}
          onChange={(validFrom) => onChange({ validFrom })}
        />
        <ProfileField
          label={t('validUntil')}
          type="date"
          value={state.validUntil}
          onChange={(validUntil) => onChange({ validUntil })}
        />
      </div>
      <p className={styles.hint}>{t('percentageHint')}</p>
    </fieldset>
  )
}
