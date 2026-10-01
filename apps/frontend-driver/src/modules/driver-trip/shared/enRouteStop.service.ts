/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip, DriverTripStop } from './driverTrip.types'
import { withSentTappedReports, type TappedStopReport } from './documentActivity.service'
import type { EventQueueItemView } from './eventQueueView.service'

/**
 * Pedido do usuário (26/09, spec 206): "o botão de iniciar rota deveria ficar dentro de cada item da
 * rota e se houver uma nao pode iniciar a outra". Só uma parada por vez fica "a caminho" — este
 * módulo resolve QUAL, e se cada parada pode ou não iniciar a própria rota, sempre local e na hora,
 * sem esperar o servidor (spec 206 D6/D9).
 */

/**
 * Spec 206 D9: parte do snapshot (a parada com `enRouteSince`) e aplica por cima os itens **não
 * recusados** da fila, na ordem de `createdAt` (`queuedAt` na view) — a mesma regra que já existe
 * para `isStopArrivalRecorded`, só que aqui há também o que ZERA o "a caminho": chegada, cancelamento
 * e a parada cujas notas pendentes foram todas resolvidas na fila (fecho equivalente ao "Registrar
 * entrega depois" sem sinal).
 */
export function resolveEnRouteStopId(input: {
  readonly stops: readonly DriverTripStop[]
  readonly queueView: readonly EventQueueItemView[]
  readonly sentReportKeys?: ReadonlySet<string>
  readonly tappedReports?: readonly TappedStopReport[]
}): string | undefined {
  let enRouteStopId = input.stops.find(
    (stop) => stop.enRouteSince !== null && stop.enRouteSince !== undefined,
  )?.id

  const orderedQueue = [...withSentTappedReports(input)].sort((a, b) =>
    a.queuedAt.localeCompare(b.queuedAt),
  )

  for (const item of orderedQueue) {
    if (item.status.state === 'rejected') continue
    if (item.kind === 'depart' && item.stopId !== undefined) {
      enRouteStopId = item.stopId
      continue
    }
    if (item.kind === 'arrive') {
      enRouteStopId = undefined
      continue
    }
    if (item.kind === 'cancelDeparture' && item.stopId !== undefined) {
      if (item.stopId === enRouteStopId) enRouteStopId = undefined
      continue
    }
    if (
      (item.kind === 'deliver' || item.kind === 'return') &&
      item.documentId !== undefined &&
      enRouteStopId !== undefined
    ) {
      const enRouteStop = input.stops.find((stop) => stop.id === enRouteStopId)
      if (enRouteStop === undefined) continue
      const pendingDocumentIds = new Set(
        enRouteStop.documents
          .filter((document) => !['delivered', 'returned'].includes(document.separationStatus))
          .map((document) => document.id),
      )
      if (pendingDocumentIds.size === 0) continue
      const settledInQueue = new Set(
        orderedQueue
          .filter(
            (queued) =>
              queued.status.state !== 'rejected' &&
              (queued.kind === 'deliver' || queued.kind === 'return') &&
              queued.documentId !== undefined,
          )
          .map((queued) => queued.documentId as string),
      )
      const allSettled = [...pendingDocumentIds].every((documentId) =>
        settledInQueue.has(documentId),
      )
      if (allSettled) enRouteStopId = undefined
    }
  }

  return enRouteStopId
}

export type StartRouteBlock =
  | Readonly<{ enabled: true }>
  | Readonly<{ blockingStopId: string; enabled: false; reason: 'other_stop_en_route' }>

/**
 * Spec 206 D6/D9 (Revisão 2): devolve o bloqueio, nunca um booleano — o cartão precisa do
 * `blockingStopId` para nomear o número e montar o atalho "Ir para a parada N". Sempre local e
 * imediato: funciona sem sinal, e o `409 TRIP_HAS_STOP_EN_ROUTE` do servidor é só para o que a tela
 * não viu (outro aparelho, item de fila antigo).
 */
export function canStartRouteAtStop(input: {
  readonly enRouteStopId: string | undefined
  readonly stopId: string
}): StartRouteBlock {
  if (input.enRouteStopId === undefined || input.enRouteStopId === input.stopId) {
    return { enabled: true }
  }
  return { blockingStopId: input.enRouteStopId, enabled: false, reason: 'other_stop_en_route' }
}

/**
 * Spec 206 D6: "Cheguei" só aparece na parada a caminho — ou em QUALQUER parada na API antiga
 * (`isLegacyEnRouteTracking`, D17), onde o conceito de "a caminho" nem existe. Chegada já registrada
 * sempre conta, para não fazer o botão sumir de uma parada que já tem `arrivedAt`.
 */
export function canReportArrival(input: {
  readonly enRouteStopId: string | undefined
  readonly isLegacyEnRouteTracking: boolean
  readonly stop: DriverTripStop
}): boolean {
  if (input.stop.arrivedAt !== null) return true
  if (input.isLegacyEnRouteTracking) return true
  return input.enRouteStopId === input.stop.id
}

/** Spec 206 D5/D10: a viagem entra em rota no primeiro `depart` aceito — só decorativo na tela. */
export function isTripOnDeliveryRoute(trip: DriverTrip): boolean {
  return trip.status === 'on_delivery_route'
}
