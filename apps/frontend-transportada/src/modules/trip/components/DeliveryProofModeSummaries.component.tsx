/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { PANEL_MODE_FIELDS } from '../shared/deliveryProofPanelFields.constant'
import type { DeliveryProofFieldSettings } from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

type DeliveryProofModeSummariesProps = Readonly<{
  settings: DeliveryProofFieldSettings
}>

export function DeliveryProofModeSummaries({ settings }: DeliveryProofModeSummariesProps) {
  const { t } = useTranslation('trip')

  return PANEL_MODE_FIELDS.map((field) => (
    <span className={styles.hint} key={field}>
      {t(`deliveryProofSettings.fields.${field}`)}:{' '}
      {t(`deliveryProofSettings.modes.${settings[field]}`)}
      {field === 'cargo' && settings.cargo === 'required'
        ? ` (${t('deliveryProofSettings.cargoMinimumCount.summary', { minimum: settings.cargoMinimumCount })})`
        : ''}
    </span>
  ))
}
