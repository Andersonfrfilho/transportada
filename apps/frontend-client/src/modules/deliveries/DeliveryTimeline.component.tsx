/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryEvents } from '@/modules/shared/portal.types'
import { DELIVERY_EVENT_LABEL } from './shared/deliveryEvents.service'

type DeliveryTimelineProps = Readonly<{ events: DeliveryEvents }>

/** Spec 340 D4: a linha do tempo da entrega, do marco mais antigo ao mais novo. */
export function DeliveryTimeline({ events }: DeliveryTimelineProps) {
  const ordered = [...events.events].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  )
  if (ordered.length === 0) return null

  return (
    <ol aria-label="Andamento da entrega" className="timeline">
      {ordered.map((event) => (
        <li className="timeline__item" key={event.kind}>
          <span className="panel__value">{DELIVERY_EVENT_LABEL[event.kind]}</span>
          <span className="panel__label">{new Date(event.occurredAt).toLocaleString('pt-BR')}</span>
        </li>
      ))}
    </ol>
  )
}
