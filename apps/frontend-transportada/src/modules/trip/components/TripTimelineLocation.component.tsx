/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import type { TripTimelineLocationView } from '../shared/tripTimelineDetail.service'
import styles from '../styles/tripTimeline.module.css'

type TripTimelineLocationProps = Readonly<{ view: TripTimelineLocationView }>

/**
 * ADR-0081 §6.1: só desenha a view que `resolveTimelineLocationView` decidiu. É botão, e não
 * `title`, para o tooltip abrir no foco de teclado; o nome acessível carrega o texto inteiro porque
 * a descrição do `Tooltip` mora no invólucro, não no botão.
 */
export function TripTimelineLocation({ view }: TripTimelineLocationProps) {
  return (
    <Tooltip label={view.tooltip}>
      <button
        aria-label={`${view.label}: ${view.tooltip}`}
        data-tone={view.tone}
        className={cn(styles.locationButton, view.tone === 'problem' && styles.locationProblem)}
        type="button"
      >
        <Icon name={view.icon} size="sm" />
      </button>
    </Tooltip>
  )
}
