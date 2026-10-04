/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoPreviewItemState, CargoPreviewStatus } from '../shared/cargoPreview.types'
import styles from '../styles/cargoReceiving.module.css'

type BadgeTone = 'alert' | 'neutral' | 'ready' | 'warn'

const TONE_CLASS: Readonly<Record<BadgeTone, string | undefined>> = {
  alert: styles.badgeAlert,
  neutral: undefined,
  ready: styles.badgeOn,
  warn: styles.badgeOff,
}

/**
 * "Esperando o XML" é neutro de propósito: logo depois do envio é o estado de quase toda linha (a prévia
 * chega horas antes das notas) — tom de erro aqui diria ao operador que algo quebrou quando nada quebrou.
 */
const ITEM_TONE: Readonly<Record<CargoPreviewItemState, BadgeTone>> = {
  ambiguous: 'warn',
  awaiting_xml: 'neutral',
  invalid: 'alert',
  matched: 'ready',
  suggested: 'warn',
}

const STATUS_TONE: Readonly<Record<CargoPreviewStatus, BadgeTone>> = {
  failed: 'alert',
  processing: 'neutral',
  queued: 'neutral',
  ready: 'ready',
}

function joinClasses(...names: readonly (string | undefined)[]): string {
  return names.filter((name): name is string => name !== undefined).join(' ')
}

export function CargoPreviewStatusBadge({
  status,
}: Readonly<{ status: CargoPreviewStatus }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const tone = STATUS_TONE[status]
  return (
    <span className={joinClasses(styles.badge, TONE_CLASS[tone])} data-tone={tone}>
      {t(`preview.status.${status}`)}
    </span>
  )
}

export function CargoPreviewItemStateBadge({
  state,
}: Readonly<{ state: CargoPreviewItemState }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const tone = ITEM_TONE[state]
  return (
    <span
      className={joinClasses(styles.badge, TONE_CLASS[tone])}
      data-state-badge=""
      data-tone={tone}
    >
      {t(`preview.itemState.${state}`)}
    </span>
  )
}
