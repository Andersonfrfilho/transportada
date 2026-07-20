/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'
import { CompanyProfileFields } from './CompanyProfileFields.component'
import { CteSettingsFields } from './CteSettingsFields.component'

type CompanySettingsFormProps = Readonly<{
  disabled: boolean
  initialValue: CompanySettingsUpdate | undefined
  onSave: (input: CompanySettingsUpdate) => void
}>

function fallbackSettings(): CompanySettingsUpdate {
  return {
    cte: { environment: 'homologation', nextNumber: '1', series: '1' },
    expectedVersion: null,
    profile: {
      city: '',
      cityIbgeCode: '',
      cnpj: '',
      complement: '',
      district: '',
      email: '',
      legalName: '',
      municipalRegistration: '',
      number: '',
      phone: '',
      postalCode: '',
      rntrc: '',
      state: '',
      stateRegistration: '',
      street: '',
      taxRegime: '3',
      tradeName: '',
    },
  }
}

export function CompanySettingsForm({ disabled, initialValue, onSave }: CompanySettingsFormProps) {
  const { t } = useTranslation('companySettings')
  const [settings, setSettings] = useState<CompanySettingsUpdate>(initialValue ?? fallbackSettings)
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave(settings)
  }
  const updateProfile = (
    input: Readonly<{
      field: Exclude<keyof CompanySettingsUpdate['profile'], 'taxRegime'>
      value: string
    }>,
  ) => {
    setSettings({
      ...settings,
      profile: { ...settings.profile, [input.field]: input.value },
    })
  }
  return (
    <form className={styles.settingsForm} onSubmit={onSubmit}>
      <CompanyProfileFields
        disabled={disabled}
        onChange={updateProfile}
        onTaxRegimeChange={(taxRegime) =>
          setSettings({ ...settings, profile: { ...settings.profile, taxRegime } })
        }
        profile={settings.profile}
      />
      <CteSettingsFields
        cte={settings.cte}
        disabled={disabled}
        onChange={(cte) => setSettings({ ...settings, cte })}
      />
      <button className={styles.primaryAction} disabled={disabled} type="submit">
        {t('save')}
      </button>
    </form>
  )
}
