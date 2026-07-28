/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { CTE_PROFILE_GROUPING_MODE, CTE_PROFILE_MATCH_MODE } from '../shared/cteProfiles.types'
import type { ProfileFormState } from '../shared/cteProfilesForm.service'
import styles from '../styles/cteProfiles.module.css'
import { ProfileField, ProfileSelectField } from './ProfileField.component'

type CteProfileIdentityFieldsProps = Readonly<{
  onChange: (patch: Partial<ProfileFormState>) => void
  state: ProfileFormState
}>

export function CteProfileIdentityFields({ onChange, state }: CteProfileIdentityFieldsProps) {
  const { t } = useTranslation('cteProfiles')
  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('identificationLegend')}</legend>
      <div className={styles.fieldGrid}>
        <ProfileField
          label={t('name')}
          value={state.name}
          onChange={(name) => onChange({ name })}
        />
        <ProfileField
          inputMode="numeric"
          label={t('priority')}
          maxLength={4}
          value={state.priority}
          onChange={(priority) => onChange({ priority })}
        />
        <ProfileSelectField
          label={t('matchMode')}
          optionLabelKey="matchModeOption"
          options={CTE_PROFILE_MATCH_MODE}
          value={state.matchMode}
          onChange={(matchMode) => onChange({ matchMode })}
        />
        <ProfileSelectField
          label={t('groupingMode')}
          optionLabelKey="groupingModeOption"
          options={CTE_PROFILE_GROUPING_MODE}
          value={state.groupingMode}
          onChange={(groupingMode) => onChange({ groupingMode })}
        />
      </div>
    </fieldset>
  )
}
