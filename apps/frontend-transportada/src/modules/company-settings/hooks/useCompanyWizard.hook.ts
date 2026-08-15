/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { normalizeTaxId } from '@/modules/shared/taxId.service'

import { createDefaultCompanySettings } from '../shared/companySettings.constant'
import { mergeProfileLookup } from '../shared/companySettingsProfile.service'
import { toWizardSettingsUpdate } from '../shared/companySettingsWizard.service'
import type { useCompanySettings } from './useCompanySettings.hook'

type Profile = ReturnType<typeof createDefaultCompanySettings>['profile']
type ProfileFieldInput = Readonly<{
  field: Exclude<keyof Profile, 'taxRegime'>
  value: string
}>

export type CompanyWizardController = Readonly<{
  feedbackKey: 'saveError' | 'saved' | null
  isSaving: boolean
  lookupPending: boolean
  lookupStatus: 'error' | 'idle' | 'success'
  onChange: (input: ProfileFieldInput) => void
  onLookupCnpj: () => void
  onTaxRegimeChange: (value: Profile['taxRegime']) => void
  profile: Profile
  submit: () => void
}>

type WizardSettings = Pick<
  ReturnType<typeof useCompanySettings>,
  'lookupMutation' | 'settingsMutation'
>

export function useCompanyWizard(settings: WizardSettings): CompanyWizardController {
  const [profile, setProfile] = useState<Profile>(() => createDefaultCompanySettings().profile)
  const [lookupStatus, setLookupStatus] = useState<'error' | 'idle' | 'success'>('idle')
  const [feedbackKey, setFeedbackKey] = useState<'saveError' | 'saved' | null>(null)

  function onChange(input: ProfileFieldInput): void {
    setFeedbackKey(null)
    if (input.field === 'cnpj') setLookupStatus('idle')
    setProfile((current) => ({ ...current, [input.field]: input.value }))
  }

  function onTaxRegimeChange(value: Profile['taxRegime']): void {
    setFeedbackKey(null)
    setProfile((current) => ({ ...current, taxRegime: value }))
  }

  function onLookupCnpj(): void {
    setLookupStatus('idle')
    settings.lookupMutation.mutate(normalizeTaxId(profile.cnpj), {
      onError: () => setLookupStatus('error'),
      onSuccess: (found) => {
        if (found === null) {
          setLookupStatus('error')
          return
        }
        setProfile((current) => mergeProfileLookup(current, found))
        setLookupStatus('success')
      },
    })
  }

  function submit(): void {
    setFeedbackKey(null)
    settings.settingsMutation.mutate(toWizardSettingsUpdate(profile), {
      onError: () => setFeedbackKey('saveError'),
      onSuccess: () => setFeedbackKey('saved'),
    })
  }

  return {
    feedbackKey,
    isSaving: settings.settingsMutation.isPending,
    lookupPending: settings.lookupMutation.isPending,
    lookupStatus,
    onChange,
    onLookupCnpj,
    onTaxRegimeChange,
    profile,
    submit,
  }
}
