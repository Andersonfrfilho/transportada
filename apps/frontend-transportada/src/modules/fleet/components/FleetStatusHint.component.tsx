/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { FleetViewStatus } from '../shared/fleetViewModel.service'
import styles from '../styles/fleet.module.css'

const HINT_KEY_BY_STATUS: Readonly<Record<FleetViewStatus, null | string>> = {
  empty: 'empty',
  error: 'error',
  forbidden: 'readOnly',
  loading: 'loading',
  ready: null,
}

export function FleetStatusHint({ status }: Readonly<{ status: FleetViewStatus }>) {
  const { t } = useTranslation('fleet')
  const hintKey = HINT_KEY_BY_STATUS[status]
  if (hintKey === null) return null

  return (
    <p className={styles.hint} role={status === 'error' ? 'alert' : 'status'}>
      {t(hintKey)}
    </p>
  )
}
