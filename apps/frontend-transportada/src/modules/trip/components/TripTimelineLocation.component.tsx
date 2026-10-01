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
 *
 * Spec 196: o tom de alarme — e só ele — leva o rótulo curto na tela. Tooltip não abre no dedo, e um
 * pino vermelho sem palavra nenhuma é alarme que o leitor tem de adivinhar. Os outros quatro casos
 * seguem mudos de propósito: dizer "posição registrada" em cada evento encheria a lista de ruído
 * para contar que o normal aconteceu. A frase longa continua na camada, para quem aponta ou foca.
 */
export function TripTimelineLocation({ view }: TripTimelineLocationProps) {
  const isAlarming = view.tone === 'problem'

  return (
    <Tooltip label={view.tooltip}>
      <button
        aria-label={`${view.label}: ${view.tooltip}`}
        data-tone={view.tone}
        className={cn(styles.locationButton, isAlarming && styles.locationProblem)}
        type="button"
      >
        <Icon name={view.icon} size="sm" />
        {isAlarming ? view.label : null}
      </button>
    </Tooltip>
  )
}
