/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isDepartureTapStale, resolveDepartureTappedAt } from '../domain/departure-order.policy.js'
import { resolveEtaShiftMilliseconds } from '../domain/eta-anchor.policy.js'
import {
  assertInformedTimeWithinWindow,
  FIELD_INFORMED_TIME,
} from '../domain/field-delivery-timing.policy.js'
import { resolveRecordedEventClock } from '../domain/occurred-at.policy.js'
import { TripHasStopEnRouteError, TripStopNotReachableError } from '../domain/trip.error.js'
import { toFieldTripTarget } from './field-trip-target.types.js'
import type {
  ApplyStopArrivalParams,
  ApplyStopDepartureParams,
  PerformStopArrivalParams,
  PerformStopDepartureParams,
  StopDepartureStepResult,
} from './stop-event-steps.types.js'
import { assertStopInOrder } from './stop-order-guard.service.js'
import { buildOfficeAuditEntry } from './trip-field-office-audit.port.js'

const DISPATCHED_STATUS = 'dispatched'

export async function performStopDeparture(
  params: PerformStopDepartureParams,
): Promise<StopDepartureStepResult> {
  const { input, transaction } = params
  const stop = await transaction.findStopForDriver({
    companyId: input.companyId,
    stopId: input.stopId,
    target: toFieldTripTarget(input),
  })
  if (stop === null) throw new TripStopNotReachableError()

  // ADR-0068 §2 (D4): as paradas da viagem, travadas antes de qualquer decisão.
  await transaction.lockTripStops({ companyId: input.companyId, tripId: stop.tripId })

  const decision = await transaction.readDepartureDecision({
    companyId: input.companyId,
    stopId: input.stopId,
    tripId: stop.tripId,
  })

  // D2, ordem das decisões — 1) já a caminho, chegada ou concluída: no-op.
  if (
    decision.stop.enRouteSince !== null ||
    decision.stop.arrivedAt !== null ||
    decision.stop.completedAt !== null
  ) {
    return { changed: false, id: null }
  }

  const dispatchedAt = await transaction.findInformedTimeWindowStart({
    companyId: input.companyId,
    tripId: stop.tripId,
  })
  const resolvedTappedAt = resolveDepartureTappedAt({
    dispatchedAt,
    now: input.now,
    tappedAt: input.tappedAt,
  })

  // D2 — 2) tappedAt velho, mesmo com outra parada a caminho (a ordem importa).
  if (
    isDepartureTapStale({
      lastArrivedAt: decision.lastArrivedAt,
      lastDepartedTappedAt: decision.lastDepartedTappedAt,
      resolvedTappedAt,
    })
  ) {
    return { changed: false, id: null }
  }

  // D2/D4 — 3) só agora a recusa: outra parada da viagem está a caminho.
  if (decision.enRouteStop !== null) {
    throw new TripHasStopEnRouteError({
      enRouteStopId: decision.enRouteStop.id,
      enRouteStopSequence: decision.enRouteStop.sequence,
    })
  }

  await assertStopInOrder({
    authorship: params.authorship.channel,
    companyId: input.companyId,
    confirmOutOfOrder: input.confirmOutOfOrder,
    requestedEvent: 'departed',
    requestedStopId: input.stopId,
    transaction,
    tripId: stop.tripId,
  })

  return applyStopDeparture({ ...params, resolvedTappedAt, tripId: stop.tripId })
}

export async function applyStopDeparture(
  params: ApplyStopDepartureParams,
): Promise<StopDepartureStepResult> {
  const { authorship, input, resolvedTappedAt, transaction, tripId } = params
  await transaction.markStopEnRoute({
    companyId: input.companyId,
    since: input.now,
    stopId: input.stopId,
    tappedAt: resolvedTappedAt,
  })
  // D5: só transiciona se a viagem ainda não estava na rua (dispatched/in_transit).
  await transaction.markTripOnDeliveryRoute({
    actorUserId: input.actorUserId,
    at: input.now,
    authorship,
    companyId: input.companyId,
    tripId,
  })

  const event = await transaction.recordEvent({
    actorUserId: input.actorUserId,
    authorship,
    companyId: input.companyId,
    documentId: null,
    kind: 'departed',
    location: input.location,
    occurredAt: input.now,
    stopId: input.stopId,
    tappedAt: resolvedTappedAt,
  })
  await transaction.onStopEvent({
    channel: authorship.channel,
    companyId: input.companyId,
    kind: 'departed',
    occurredAt: input.now,
    target: { stopId: input.stopId },
  })

  return { changed: true, id: event.id }
}

export async function performStopArrival(
  params: PerformStopArrivalParams,
): Promise<{ readonly id: string }> {
  const { input, transaction } = params
  const stop = await transaction.findStopForDriver({
    companyId: input.companyId,
    stopId: input.stopId,
    target: toFieldTripTarget(input),
  })
  if (stop === null) throw new TripStopNotReachableError()

  const isOffice = input.target !== undefined
  if (isOffice) await assertArrivalWithinWindow({ ...params, isOffice, stop })

  return applyStopArrival({ ...params, isOffice, stop })
}

export async function applyStopArrival(
  params: ApplyStopArrivalParams,
): Promise<{ readonly id: string }> {
  const { authorship, input, isOffice, recordedTogether, stop, transaction } = params

  // Chegar de novo na mesma parada não reescreve a hora: a primeira é a que aconteceu.
  if (stop.arrivedAt === null) {
    /**
     * Spec 206 D7 (M4): a chegada zera "a caminho" de toda a viagem no canal do motorista —
     * quem chegou não está mais a caminho de outra parada. A baixa do escritório é
     * retroativa e não diz onde ele está agora: zera só a própria parada.
     */
    await transaction.markStopArrived({
      at: input.now,
      clearEnRoute: isOffice ? 'stop' : 'trip',
      companyId: input.companyId,
      stopId: input.stopId,
      tripId: stop.tripId,
    })
    /**
     * Spec 156 T15 A1: a baixa retroativa do escritório não é chegada ao vivo — deslocar as
     * paradas pendentes pela diferença entre o plano e a hora digitada dias depois inventaria
     * um atraso que ninguém viveu.
     */
    if (!isOffice && recordedTogether === undefined) {
      await shiftPendingStopsByDelay({ ...params, isOffice, stop })
    }
  }
  if (stop.tripStatus === DISPATCHED_STATUS) {
    await transaction.markTripInTransit({
      actorUserId: input.actorUserId,
      at: input.now,
      authorship,
      companyId: input.companyId,
      tripId: stop.tripId,
    })
  }

  const audit = buildOfficeAuditEntry({
    actorUserId: input.actorUserId,
    audit: input.officeAudit,
    companyId: input.companyId,
    details: { stopId: input.stopId },
    locator: input,
  })
  if (audit !== undefined) await transaction.recordOfficeAudit(audit)

  const event = await transaction.recordEvent({
    actorUserId: input.actorUserId,
    authorship,
    companyId: input.companyId,
    documentId: null,
    kind: 'arrived',
    location: input.location,
    ...(isOffice
      ? { occurredAt: input.now, recordedAt: input.recordedAt ?? new Date() }
      : (recordedTogether?.clock ??
        resolveRecordedEventClock({
          clockOffsetMs: input.clockOffsetMs,
          hasLocation: input.location !== null,
          receivedAt: input.now,
          tappedAt: input.tappedAt,
        }))),
    ...(recordedTogether === undefined ? {} : { recordedTogether: true }),
    stopId: input.stopId,
  })
  if (stop.arrivedAt === null) {
    await transaction.onStopEvent({
      channel: authorship.channel,
      companyId: input.companyId,
      kind: 'arrived',
      occurredAt: input.now,
      recordedTogether: recordedTogether !== undefined,
      target: { stopId: input.stopId },
    })
  }
  return event
}

/** ADR-0067 §3, spec 156 T15 A1: a mesma janela de "Entregue em", com os códigos da chegada. */
async function assertArrivalWithinWindow(params: ApplyStopArrivalParams): Promise<void> {
  assertInformedTimeWithinWindow({
    informedAt: params.input.now,
    kind: FIELD_INFORMED_TIME.arrived,
    now: params.input.recordedAt ?? new Date(),
    windowStart: await params.transaction.findInformedTimeWindowStart({
      companyId: params.input.companyId,
      tripId: params.stop.tripId,
    }),
  })
}

/**
 * Spec 109 D3: **a entrega que demorou empurra o resto do dia.** O atraso é medido contra o que o
 * plano dizia para esta parada, e as paradas que ainda não aconteceram andam junto.
 *
 * ⚠️ Chamada só dentro do `arrivedAt === null`, e é o que impede o deslocamento duplo: o segundo
 * "cheguei" da mesma parada não é chegada nova, é a rede do armazém tentando de novo.
 */
async function shiftPendingStopsByDelay(params: ApplyStopArrivalParams): Promise<void> {
  const shiftMilliseconds = resolveEtaShiftMilliseconds({
    plannedAt: params.stop.estimatedArrivalAt,
    reportedAt: params.input.now,
  })
  if (shiftMilliseconds === 0) return

  await params.transaction.shiftPendingStops({
    at: params.input.now,
    companyId: params.input.companyId,
    shiftMilliseconds,
    tripId: params.stop.tripId,
  })
}
