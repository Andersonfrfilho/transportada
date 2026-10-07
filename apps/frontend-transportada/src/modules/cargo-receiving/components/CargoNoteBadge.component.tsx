/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoNoteBadge as CargoNoteBadgeKind } from '../shared/cargoNoteActions.service'
import styles from '../styles/cargoReceiving.module.css'

const BADGE_CLASS: Readonly<Record<Exclude<CargoNoteBadgeKind, 'none'>, string | undefined>> = {
  occurrenceOpen: styles.badgeOff,
  returned: undefined,
  toReturn: styles.badgeAlert,
}

/** O selo da nota: "Avaria aberta", "A devolver" ou "Devolvida" — sempre em texto, nunca só cor. */
export function CargoNoteBadge({
  badge,
}: Readonly<{ badge: CargoNoteBadgeKind }>): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (badge === 'none') return null
  return (
    <span
      className={[styles.badge, BADGE_CLASS[badge]].filter(Boolean).join(' ')}
      data-note-badge={badge}
    >
      {t(`occurrence.badge.${badge}`)}
    </span>
  )
}
