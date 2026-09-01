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
  aboutBody: string
  aboutTitle: string
  appBody: string
  appItems: string
  appTitle: string
  brandName: string
  contactBody: string
  contactEmail: string
  contactPhone: string
  contactTitle: string
  ctaSubtitle: string
  ctaTitle: string
  heroSubtitle: string
  requirementsItems: string
  requirementsTitle: string
  servicesItems: string
  servicesTitle: string
}>

const EMPTY_FORM: FormState = {
  accentColor: '',
  aboutBody: '',
  aboutTitle: '',
  appBody: '',
  appItems: '',
  appTitle: '',
  brandName: '',
  contactBody: '',
  contactEmail: '',
  contactPhone: '',
  contactTitle: '',
  ctaSubtitle: '',
  ctaTitle: '',
  heroSubtitle: '',
  requirementsItems: '',
  requirementsTitle: '',
  servicesItems: '',
  servicesTitle: '',
}

/** Uma linha por item — é a edição de lista mais simples que não exige componente novo. */
function itemsToLines(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string').join('\n')
    : ''
}

function linesToItems(value: string): readonly string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function fromResponse(data: LandingSettingsResponse): FormState {
  if (data === null) return EMPTY_FORM
  const sections = data.sections
  const section = (key: string): Record<string, unknown> => {
    const value = sections[key]
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  }
  const text = (key: string, field: string): string => {
    const value = section(key)[field]
    return typeof value === 'string' ? value : ''
  }

  return {
    accentColor: data.accentColor ?? '',
    aboutBody: text('about', 'body'),
    aboutTitle: text('about', 'title'),
    appBody: text('app', 'body'),
    appItems: itemsToLines(section('app').items),
    appTitle: text('app', 'title'),
    brandName: data.brandName ?? '',
    contactBody: text('contact', 'body'),
    contactEmail: data.contactEmail ?? '',
    contactPhone: data.contactPhone ?? '',
    contactTitle: text('contact', 'title'),
    ctaSubtitle: text('cta', 'subtitle'),
    ctaTitle: text('cta', 'title'),
    heroSubtitle: text('hero', 'subtitle'),
    requirementsItems: itemsToLines(section('requirements').items),
    requirementsTitle: text('requirements', 'title'),
    servicesItems: itemsToLines(section('services').items),
    servicesTitle: text('services', 'title'),
  }
}

function toSections(form: FormState): Readonly<Record<string, unknown>> {
  return {
    about: { body: form.aboutBody, title: form.aboutTitle },
    app: { body: form.appBody, items: linesToItems(form.appItems), title: form.appTitle },
    contact: { body: form.contactBody, title: form.contactTitle },
    cta: { subtitle: form.ctaSubtitle, title: form.ctaTitle },
    hero: { subtitle: form.heroSubtitle },
    requirements: { items: linesToItems(form.requirementsItems), title: form.requirementsTitle },
    services: { items: linesToItems(form.servicesItems), title: form.servicesTitle },
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
        <fieldset>
          <legend>{t('landing.brandLegend')}</legend>
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
        </fieldset>

        <fieldset>
          <legend>{t('landing.heroLegend')}</legend>
          <label>
            {t('landing.heroSubtitleLabel')}
            <input
              disabled={disabled}
              type="text"
              value={form.heroSubtitle}
              onChange={(event) => updateField('heroSubtitle', event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('landing.aboutLegend')}</legend>
          <label>
            {t('landing.aboutTitleLabel')}
            <input
              disabled={disabled}
              type="text"
              value={form.aboutTitle}
              onChange={(event) => updateField('aboutTitle', event.target.value)}
            />
          </label>
          <label>
            {t('landing.aboutBodyLabel')}
            <textarea
              disabled={disabled}
              value={form.aboutBody}
              onChange={(event) => updateField('aboutBody', event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('landing.servicesLegend')}</legend>
          <label>
            {t('landing.servicesTitleLabel')}
            <input
              disabled={disabled}
              type="text"
              value={form.servicesTitle}
              onChange={(event) => updateField('servicesTitle', event.target.value)}
            />
          </label>
          <label>
            {t('landing.servicesItemsLabel')}
            <textarea
              disabled={disabled}
              placeholder={t('landing.itemsPlaceholder')}
              value={form.servicesItems}
              onChange={(event) => updateField('servicesItems', event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('landing.requirementsLegend')}</legend>
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
            {t('landing.requirementsItemsLabel')}
            <textarea
              disabled={disabled}
              placeholder={t('landing.itemsPlaceholder')}
              value={form.requirementsItems}
              onChange={(event) => updateField('requirementsItems', event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('landing.appLegend')}</legend>
          <label>
            {t('landing.appTitleLabel')}
            <input
              disabled={disabled}
              type="text"
              value={form.appTitle}
              onChange={(event) => updateField('appTitle', event.target.value)}
            />
          </label>
          <label>
            {t('landing.appBodyLabel')}
            <textarea
              disabled={disabled}
              value={form.appBody}
              onChange={(event) => updateField('appBody', event.target.value)}
            />
          </label>
          <label>
            {t('landing.appItemsLabel')}
            <textarea
              disabled={disabled}
              placeholder={t('landing.itemsPlaceholder')}
              value={form.appItems}
              onChange={(event) => updateField('appItems', event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('landing.contactLegend')}</legend>
          <label>
            {t('landing.contactTitleLabel')}
            <input
              disabled={disabled}
              type="text"
              value={form.contactTitle}
              onChange={(event) => updateField('contactTitle', event.target.value)}
            />
          </label>
          <label>
            {t('landing.contactBodyLabel')}
            <textarea
              disabled={disabled}
              value={form.contactBody}
              onChange={(event) => updateField('contactBody', event.target.value)}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t('landing.ctaLegend')}</legend>
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
        </fieldset>

        <button disabled={disabled} type="submit">
          {disabled ? t('landing.saving') : t('landing.saveButton')}
        </button>
        {saveState === 'success' && <p role="status">{t('landing.saved')}</p>}
        {saveState === 'error' && <p role="alert">{t('landing.saveError')}</p>}
      </form>
    </section>
  )
}
