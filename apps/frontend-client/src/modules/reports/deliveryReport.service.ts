/* Copyright (c) 2026 Ada Technology. MIT License. */
import { toDeliveryView } from '@/modules/deliveries/shared/deliveryStatus.service'
import type { Delivery, Occurrence } from '@/modules/shared/portal.types'

export type DeliverySummary = Readonly<{
  delivered: number
  inTransit: number
  late: number
  onTime: number
  openOccurrences: number
  returned: number
  total: number
  waiting: number
}>

/**
 * Spec 340 D8/D9: tudo calculado só sobre o que o portal já recebe — nenhum frete, custo ou margem.
 * "No prazo" compara a entrega com a previsão da própria nota; sem previsão não entra na conta.
 */
export function summarizeDeliveries(
  deliveries: readonly Delivery[],
  occurrences: readonly Occurrence[],
  now: Date,
): DeliverySummary {
  let delivered = 0
  let inTransit = 0
  let late = 0
  let onTime = 0
  let returned = 0
  let waiting = 0

  for (const delivery of deliveries) {
    const { stage } = toDeliveryView(delivery)
    if (stage === 'delivered') {
      delivered += 1
      if (delivery.deliveredAt !== null && delivery.estimatedArrivalAt !== null) {
        if (Date.parse(delivery.deliveredAt) <= Date.parse(delivery.estimatedArrivalAt)) onTime += 1
        else late += 1
      }
    } else if (stage === 'returned') returned += 1
    else if (stage === 'transit') {
      inTransit += 1
      if (
        delivery.estimatedArrivalAt !== null &&
        Date.parse(delivery.estimatedArrivalAt) < now.getTime()
      ) {
        late += 1
      }
    } else waiting += 1
  }

  return {
    delivered,
    inTransit,
    late,
    onTime,
    openOccurrences: occurrences.filter((occurrence) => occurrence.decidedAt === null).length,
    returned,
    total: deliveries.length,
    waiting,
  }
}

/** Entrega dentro do período, pela data de emissão da nota (`from`/`to` no formato `AAAA-MM-DD`, ambos inclusivos). */
export function filterByPeriod(
  deliveries: readonly Delivery[],
  period: { readonly from: string; readonly to: string },
): readonly Delivery[] {
  return deliveries.filter((delivery) => {
    const day = delivery.issuedAt.slice(0, 10)
    return (period.from === '' || day >= period.from) && (period.to === '' || day <= period.to)
  })
}

/** Texto que o Excel/Calc executaria como fórmula ganha uma aspa na frente (spec 340 RF4). */
export function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function deliveriesToCsv(deliveries: readonly Delivery[]): string {
  const header = [
    'Nota',
    'Série',
    'Emissão',
    'Situação',
    'Previsão',
    'Entregue em',
    'Motivo da devolução',
  ]
  const rows = deliveries.map((delivery) => [
    delivery.number,
    delivery.series,
    delivery.issuedAt.slice(0, 10),
    toDeliveryView(delivery).label,
    delivery.estimatedArrivalAt ?? '',
    delivery.deliveredAt ?? '',
    delivery.returnReason ?? '',
  ])

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}
