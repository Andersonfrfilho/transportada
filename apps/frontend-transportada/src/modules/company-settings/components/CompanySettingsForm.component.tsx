/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type {
  CompanyProfileLookup,
  CompanySettingsUpdate,
} from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'
import { createDefaultCompanySettings } from '../shared/companySettings.constant'
import { validateCompanySettings } from '../shared/companySettingsFormValidation.service'
import { normalizeCompanySettingsMasks } from '../shared/companySettingsMask.service'
import { mergeProfileLookup } from '../shared/companySettingsProfile.service'
import { BillingDefaultsFields } from './BillingDefaultsFields.component'
import { CompanyProfileFields } from './CompanyProfileFields.component'
import { CompanySettingsErrorSummary } from './CompanySettingsErrorSummary.component'
import { CteRetryFields } from './CteRetryFields.component'
import { CteSettingsFields } from './CteSettingsFields.component'
import { MdfeDefaultsFields } from './MdfeDefaultsFields.component'

type CompanySettingsFormProps = Readonly<{
  disabled: boolean
  initialValue: CompanySettingsUpdate | undefined
  onLookupProfile: (cnpj: string) => Promise<CompanyProfileLookup | null>
  onSave: (input: CompanySettingsUpdate) => void
}>

export function CompanySettingsForm({
  disabled,
  initialValue,
  onLookupProfile,
  onSave,
}: CompanySettingsFormProps) {
  const { t } = useTranslation('companySettings')
  const [settings, setSettings] = useState<CompanySettingsUpdate>(
    initialValue ?? createDefaultCompanySettings,
  )
  const [lookupPending, setLookupPending] = useState(false)
  const [lookupStatus, setLookupStatus] = useState<'error' | 'idle' | 'success'>('idle')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const errors = submitAttempted ? validateCompanySettings(settings) : []
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitAttempted(true)
    if (validateCompanySettings(settings).length > 0) return
    onSave(normalizeCompanySettingsMasks(settings))
  }
  const invalidFields = new Set(errors.map((error) => error.field))
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
      profile: mergeProfileLookup(current.profile, profile),
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
      <CompanySettingsErrorSummary errors={errors} />
      <CompanyProfileFields
        disabled={disabled}
        invalidFields={invalidFields}
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
      <BillingDefaultsFields
        billing={settings.billing}
        disabled={disabled}
        onChange={(billing) => setSettings({ ...settings, billing })}
      />
      <button className={styles.primaryAction} disabled={disabled} type="submit">
        <Icon name="save" />
        {t('save')}
      </button>
    </form>
  )
}
