/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { AMOUNT_DISPLAY_SCALE, maskTypedAmount } from '@/modules/shared/decimalAmount.service'

import type { CrewSettings } from '../shared/crewSettings.validation'
import { toHelperDailyRateBody, toHelperDailyRateDraft } from '../shared/crewSettingsForm.service'
import styles from '../styles/fleet.module.css'

export type DriverCrewSettingsPanelProps = Readonly<{
  canManage: boolean
  errorCode?: string
  isSaving: boolean
  loading: boolean
  onEdit?: () => void
  onRetry?: () => void
  onSave: (helperDailyRate: null | string) => void
  saved: boolean
  settings: CrewSettings | undefined
}>

const RATE_FIELD_ID = 'crew-helper-daily-rate'

function CrewSettingsSkeleton() {
  const { t } = useTranslation('fleet')
  return (
    <SkeletonGroup label={t('crewSettings.title')}>
      <Skeleton height="var(--field-height)" width="100%" />
    </SkeletonGroup>
  )
}

function CrewSettingsForm(
  props: Readonly<{
    canManage: boolean
    isSaving: boolean
    onEdit?: () => void
    onSave: (helperDailyRate: null | string) => void
    settings: CrewSettings
  }>,
) {
  const { t } = useTranslation('fleet')
  const [draft, setDraft] = useState(toHelperDailyRateDraft(props.settings.helperDailyRate))

  function handleSave() {
    props.onSave(toHelperDailyRateBody(draft))
  }

  return (
    <div className={styles.fuelPriceForm}>
      <label htmlFor={RATE_FIELD_ID}>{t('crewSettings.label')}</label>
      <span className={styles.moneyField}>
        <span aria-hidden="true" className={styles.moneyPrefix}>
          {t('currencyPrefix')}
        </span>
        <input
          disabled={!props.canManage || props.isSaving}
          id={RATE_FIELD_ID}
          inputMode="numeric"
          type="text"
          value={draft}
          onChange={(event) => {
            props.onEdit?.()
            setDraft(maskTypedAmount({ scale: AMOUNT_DISPLAY_SCALE, value: event.target.value }))
          }}
        />
      </span>
      <small className={styles.fieldHint}>{t('crewSettings.hint')}</small>
      {props.canManage ? (
        <div className={styles.fuelPriceActions}>
          <button
            className={styles.primaryAction}
            disabled={props.isSaving}
            type="button"
            onClick={handleSave}
          >
            <Icon name="save" />
            {t('crewSettings.save')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function DriverCrewSettingsPanel(props: DriverCrewSettingsPanelProps) {
  const { t } = useTranslation('fleet')
  return (
    <section className={styles.panel} aria-labelledby="crew-settings-title">
      <h2 id="crew-settings-title">{t('crewSettings.title')}</h2>
      {props.loading ? (
        <CrewSettingsSkeleton />
      ) : props.settings === undefined ? (
        <>
          <p className={styles.fuelPriceStatusError} role="alert">
            {t('crewSettings.loadError')}
          </p>
          {props.onRetry === undefined ? null : (
            <div className={styles.fuelPriceActions}>
              <button className={styles.primaryAction} type="button" onClick={props.onRetry}>
                <Icon name="refresh" />
                {t('crewSettings.retry')}
              </button>
            </div>
          )}
        </>
      ) : (
        <CrewSettingsForm
          key={props.settings.helperDailyRate ?? 'crew-rate-unset'}
          canManage={props.canManage}
          isSaving={props.isSaving}
          {...(props.onEdit === undefined ? {} : { onEdit: props.onEdit })}
          settings={props.settings}
          onSave={props.onSave}
        />
      )}
      {props.saved ? (
        <p className={styles.fuelPriceStatusSuccess} role="status">
          {t('crewSettings.saved')}
        </p>
      ) : null}
      {props.errorCode === undefined ? null : (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('crewSettings.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
