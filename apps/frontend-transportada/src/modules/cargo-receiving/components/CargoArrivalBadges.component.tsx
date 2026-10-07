/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoArrivalStatus } from '../shared/cargoArrival.types'
import styles from '../styles/cargoReceiving.module.css'

const STATUS_CLASS: Readonly<Record<CargoArrivalStatus, string | undefined>> = {
  closed: undefined,
  open: styles.badgeOn,
}

function joinClasses(...names: readonly (string | undefined)[]): string {
  return names.filter((name): name is string => name !== undefined).join(' ')
}

export function CargoStatusBadge({
  status,
}: Readonly<{ status: CargoArrivalStatus }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <span className={joinClasses(styles.badge, STATUS_CLASS[status])}>{t(`status.${status}`)}</span>
  )
}

/** "Vencida" é prazo passado com nota ainda por separar — a API calcula, a tela só mostra. */
export function CargoOverdueBadge(): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return <span className={joinClasses(styles.badge, styles.badgeAlert)}>{t('badge.overdue')}</span>
}

export function CargoLiveTripBadge(): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return <span className={joinClasses(styles.badge, styles.badgeOff)}>{t('badge.inLiveTrip')}</span>
}
