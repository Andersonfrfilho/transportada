/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { FleetViewStatus } from '../shared/fleetViewModel.service'
import styles from '../styles/fleet.module.css'

// Carregando é esqueleto e vazio é convite para agir — cada painel desenha os seus
const HINT_KEY_BY_STATUS: Readonly<Record<FleetViewStatus, null | string>> = {
  empty: null,
  error: 'error',
  forbidden: 'readOnly',
  loading: null,
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
