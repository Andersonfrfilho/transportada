/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  LandingSettingsResponse,
  LandingSettingsUpdate,
} from '../shared/landingPanelClient.service'
import styles from '../styles/companySettings.module.css'

const LANDING_APP_URL = import.meta.env.VITE_LANDING_APP_URL

type FormState = Readonly<{
  accentColor: string
  brandName: string
  contactEmail: string
  contactPhone: string
  ctaSubtitle: string
  ctaTitle: string
  heroSubtitle: string
  offerTitle: string
  requirementsTitle: string
}>

const EMPTY_FORM: FormState = {
  accentColor: '',
  brandName: '',
  contactEmail: '',
  contactPhone: '',
  ctaSubtitle: '',
  ctaTitle: '',
  heroSubtitle: '',
  offerTitle: '',
  requirementsTitle: '',
}

function fromResponse(data: LandingSettingsResponse): FormState {
  if (data === null) return EMPTY_FORM
  const sections = data.sections
  const sectionText = (key: string, field: string): string => {
    const section = sections[key]
    if (typeof section !== 'object' || section === null) return ''
    const value = (section as Record<string, unknown>)[field]
    return typeof value === 'string' ? value : ''
  }

  return {
    accentColor: data.accentColor ?? '',
    brandName: data.brandName ?? '',
    contactEmail: data.contactEmail ?? '',
    contactPhone: data.contactPhone ?? '',
    ctaSubtitle: sectionText('cta', 'subtitle'),
    ctaTitle: sectionText('cta', 'title'),
    heroSubtitle: sectionText('hero', 'subtitle'),
    offerTitle: sectionText('offer', 'title'),
    requirementsTitle: sectionText('requirements', 'title'),
  }
}

function toSections(form: FormState): Readonly<Record<string, unknown>> {
  return {
    cta: { subtitle: form.ctaSubtitle, title: form.ctaTitle },
    hero: { subtitle: form.heroSubtitle },
    offer: { title: form.offerTitle },
    requirements: { title: form.requirementsTitle },
  }
}

type LandingSettingsPanelProps = Readonly<{
  data: LandingSettingsResponse | undefined
  disabled: boolean
  onSave: (input: LandingSettingsUpdate) => void
  saveState: 'error' | 'idle' | 'success'
}>

export function LandingSettingsPanel({
  data,
  disabled,
  onSave,
  saveState,
}: LandingSettingsPanelProps) {
  const { t } = useTranslation('companySettings')
  const [form, setForm] = useState<FormState>(() => fromResponse(data ?? null))

  useEffect(() => {
    setForm(fromResponse(data ?? null))
  }, [data])

  function updateField<TField extends keyof FormState>(field: TField, value: FormState[TField]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit() {
    onSave({
      accentColor: form.accentColor === '' ? undefined : form.accentColor,
      brandName: form.brandName === '' ? undefined : form.brandName,
      contactEmail: form.contactEmail === '' ? undefined : form.contactEmail,
      contactPhone: form.contactPhone === '' ? undefined : form.contactPhone,
      sections: toSections(form),
    })
  }

  return (
    <section className={styles.settingsPanel} aria-labelledby="landing-settings-title">
      <div className={styles.sectionHeading}>
        <p className={styles.sectionKicker}>{t('landing.kicker')}</p>
        <h2 id="landing-settings-title">{t('landing.title')}</h2>
        {LANDING_APP_URL === undefined ? null : (
          <a href={LANDING_APP_URL} rel="noreferrer" target="_blank">
            {t('landing.previewLink')}
          </a>
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <label>
          {t('landing.brandNameLabel')}
          <input
            disabled={disabled}
            type="text"
            value={form.brandName}
            onChange={(event) => updateField('brandName', event.target.value)}
          />
        </label>
        <label>
          {t('landing.contactEmailLabel')}
          <input
            disabled={disabled}
            type="email"
            value={form.contactEmail}
            onChange={(event) => updateField('contactEmail', event.target.value)}
          />
        </label>
        <label>
          {t('landing.contactPhoneLabel')}
          <input
            disabled={disabled}
            type="text"
            value={form.contactPhone}
            onChange={(event) => updateField('contactPhone', event.target.value)}
          />
        </label>
        <label>
          {t('landing.accentColorLabel')}
          <input
            disabled={disabled}
            placeholder="#1a2b3c"
            type="text"
            value={form.accentColor}
            onChange={(event) => updateField('accentColor', event.target.value)}
          />
        </label>
        <label>
          {t('landing.heroSubtitleLabel')}
          <input
            disabled={disabled}
            type="text"
            value={form.heroSubtitle}
            onChange={(event) => updateField('heroSubtitle', event.target.value)}
          />
        </label>
        <label>
          {t('landing.offerTitleLabel')}
          <input
            disabled={disabled}
            type="text"
            value={form.offerTitle}
            onChange={(event) => updateField('offerTitle', event.target.value)}
          />
        </label>
        <label>
          {t('landing.requirementsTitleLabel')}
          <input
            disabled={disabled}
            type="text"
            value={form.requirementsTitle}
            onChange={(event) => updateField('requirementsTitle', event.target.value)}
          />
        </label>
        <label>
          {t('landing.ctaTitleLabel')}
          <input
            disabled={disabled}
            type="text"
            value={form.ctaTitle}
            onChange={(event) => updateField('ctaTitle', event.target.value)}
          />
        </label>
        <label>
          {t('landing.ctaSubtitleLabel')}
          <input
            disabled={disabled}
            type="text"
            value={form.ctaSubtitle}
            onChange={(event) => updateField('ctaSubtitle', event.target.value)}
          />
        </label>
        <button disabled={disabled} type="submit">
          {disabled ? t('landing.saving') : t('landing.saveButton')}
        </button>
        {saveState === 'success' && <p role="status">{t('landing.saved')}</p>}
        {saveState === 'error' && <p role="alert">{t('landing.saveError')}</p>}
      </form>
    </section>
  )
}
