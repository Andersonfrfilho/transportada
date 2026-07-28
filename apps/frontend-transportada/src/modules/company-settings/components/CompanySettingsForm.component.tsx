/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  CompanyProfileLookup,
  CompanySettingsUpdate,
} from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'
import {
  CTE_RETRY_DEFAULT_BACKOFF_SECONDS,
  CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
  EMPTY_MDFE_DEFAULTS,
} from '../shared/companySettings.constant'
import { CompanyProfileFields } from './CompanyProfileFields.component'
import { CteRetryFields } from './CteRetryFields.component'
import { CteSettingsFields } from './CteSettingsFields.component'
import { MdfeDefaultsFields } from './MdfeDefaultsFields.component'

type CompanySettingsFormProps = Readonly<{
  disabled: boolean
  initialValue: CompanySettingsUpdate | undefined
  onLookupProfile: (cnpj: string) => Promise<CompanyProfileLookup | null>
  onSave: (input: CompanySettingsUpdate) => void
}>

function fallbackSettings(): CompanySettingsUpdate {
  return {
    cte: { environment: 'homologation', nextNumber: '1', series: '1' },
    cteRetry: {
      backoffSeconds: [...CTE_RETRY_DEFAULT_BACKOFF_SECONDS],
      maxAttempts: CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
    },
    expectedVersion: null,
    mdfe: { ...EMPTY_MDFE_DEFAULTS },
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

export function CompanySettingsForm({
  disabled,
  initialValue,
  onLookupProfile,
  onSave,
}: CompanySettingsFormProps) {
  const { t } = useTranslation('companySettings')
  const [settings, setSettings] = useState<CompanySettingsUpdate>(initialValue ?? fallbackSettings)
  const [lookupPending, setLookupPending] = useState(false)
  const [lookupStatus, setLookupStatus] = useState<'error' | 'idle' | 'success'>('idle')
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
    if (input.field === 'cnpj') setLookupStatus('idle')
  }
  const applyLookup = (profile: CompanyProfileLookup) => {
    setSettings((current) => ({
      ...current,
      profile: {
        ...current.profile,
        city: profile.city || current.profile.city,
        cityIbgeCode: profile.cityIbgeCode || current.profile.cityIbgeCode,
        cnpj: profile.cnpj || current.profile.cnpj,
        complement: profile.complement || current.profile.complement,
        district: profile.district || current.profile.district,
        email: profile.email || current.profile.email,
        legalName: profile.legalName || current.profile.legalName,
        number: profile.number || current.profile.number,
        phone: profile.phone || current.profile.phone,
        postalCode: profile.postalCode || current.profile.postalCode,
        state: profile.state || current.profile.state,
        stateRegistration: profile.stateRegistration || current.profile.stateRegistration,
        street: profile.street || current.profile.street,
        tradeName: profile.tradeName || current.profile.tradeName,
      },
    }))
  }
  const lookupProfile = async () => {
    setLookupPending(true)
    setLookupStatus('idle')
    try {
      const profile = await onLookupProfile(settings.profile.cnpj.replace(/\D/g, ''))
      if (profile === null) {
        setLookupStatus('error')
        return
      }
      applyLookup(profile)
      setLookupStatus('success')
    } catch {
      setLookupStatus('error')
    } finally {
      setLookupPending(false)
    }
  }
  return (
    <form className={styles.settingsForm} onSubmit={onSubmit}>
      <CompanyProfileFields
        disabled={disabled}
        lookupPending={lookupPending}
        lookupStatus={lookupStatus}
        onChange={updateProfile}
        onLookupCnpj={() => void lookupProfile()}
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
      <CteRetryFields
        cteRetry={settings.cteRetry}
        disabled={disabled}
        onChange={(cteRetry) => setSettings({ ...settings, cteRetry })}
      />
      <MdfeDefaultsFields
        disabled={disabled}
        mdfe={settings.mdfe}
        onChange={(mdfe) => setSettings({ ...settings, mdfe })}
      />
      <button className={styles.primaryAction} disabled={disabled} type="submit">
        {t('save')}
      </button>
    </form>
  )
}
