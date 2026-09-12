/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { CTE_PROFILE_OUTPUT_DOCUMENT } from '../shared/cteProfiles.types'
import {
  type NfseProfileOption,
  type ProfileFormState,
  showsCteFiscalFields,
} from '../shared/cteProfilesForm.service'
import styles from '../styles/cteProfiles.module.css'
import { ProfileSelectField } from './ProfileField.component'

type CteProfileOutputFieldsProps = Readonly<{
  nfseProfiles: readonly NfseProfileOption[]
  onChange: (patch: Partial<ProfileFormState>) => void
  state: ProfileFormState
}>

export function CteProfileOutputFields({
  nfseProfiles,
  onChange,
  state,
}: CteProfileOutputFieldsProps) {
  const { t } = useTranslation('cteProfiles')
  const isNfse = !showsCteFiscalFields(state.outputDocument)

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('outputLegend')}</legend>
      <div className={styles.fieldGrid}>
        <ProfileSelectField
          label={t('outputDocument')}
          optionLabelKey="outputDocumentOption"
          options={CTE_PROFILE_OUTPUT_DOCUMENT}
          value={state.outputDocument}
          onChange={(outputDocument) => onChange({ outputDocument })}
        />
        {isNfse ? (
          <label>
            <span>{t('nfseEmissionProfile')}</span>
            <Select
              ariaLabel={t('nfseEmissionProfile')}
              emptyLabel={t('nfseEmissionProfileEmpty')}
              options={nfseProfiles}
              placeholder={t('nfseEmissionProfilePlaceholder')}
              value={state.nfseEmissionProfileId ?? ''}
              onChange={(nfseEmissionProfileId) => onChange({ nfseEmissionProfileId })}
            />
          </label>
        ) : null}
      </div>
      {isNfse ? <p className={styles.hint}>{t('nfseOutputHint')}</p> : null}
    </fieldset>
  )
}
