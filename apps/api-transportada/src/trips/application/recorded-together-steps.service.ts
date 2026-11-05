/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (ADR-0113): a ordem da parada é saída, chegada, baixa. Quem pede uma etapa à frente da
 * ordem da tripulação tem as anteriores marcadas junto, na mesma transação do evento pedido.
 */
import { TripStopNotReachableError } from '../domain/trip.error.js'
import { resolveRecordedEventClock } from '../domain/occurred-at.policy.js'
import type { EventClockFields, RecordedEventClock } from '../domain/occurred-at.policy.js'
import { resolveStopEventSequence } from '../domain/stop-event-sequence.policy.js'
import type { StopEventSequenceInput, StopEventStep } from '../domain/stop-event-sequence.policy.js'
import type {
  ArrivalAddressCorrectionOutcome,
  DriverFieldReportTransactionPort,
  DriverStopReference,
  ReportedLocation,
} from './driver-field-report.port.js'
import { toFieldTripTarget } from './field-trip-target.types.js'
import type { FieldAuthorship, FieldTripLocator } from './field-trip-target.types.js'
import { assertStopInOrder } from './stop-order-guard.service.js'
import { applyStopArrival, performStopArrival } from './stop-event-steps.service.js'
import type { PerformStopArrivalParams } from './stop-event-steps.types.js'

export type SkippedStepsReport = FieldTripLocator &
  EventClockFields & {
    readonly actorUserId: string
    readonly companyId: string
    readonly confirmOutOfOrder?: boolean
    readonly location: ReportedLocation | null
    readonly now: Date
  }

export type RecordSkippedStepsParams = {
  readonly authorship: FieldAuthorship
  readonly report: SkippedStepsReport
  readonly requestedEvent: StopEventSequenceInput['requestedEvent']
  readonly stop: DriverStopReference
  readonly stopId: string
  readonly transaction: DriverFieldReportTransactionPort
}

export type SequencedStopArrivalResult = {
  /** Spec 294 RF14: o que a chegada com ponto fez pelo endereço; ausente quando não houve ponto (ou no reenvio). */
  readonly addressCorrection?: ArrivalAddressCorrectionOutcome
  readonly id: string
  readonly recordedTogether: readonly StopEventStep[]
}

/**
 * A saída marcada junto só põe a viagem na rua e grava o evento: não marca a parada "a caminho" —
 * quem chegou na mesma transação nunca ficou a caminho, e o índice único não admite duas.
 */
async function recordDepartureTogether(
  params: RecordSkippedStepsParams & { readonly clock: RecordedEventClock },
): Promise<void> {
  const { authorship, clock, report, stop, stopId, transaction } = params
  await transaction.markTripOnDeliveryRoute({
    actorUserId: report.actorUserId,
    at: report.now,
    authorship,
    companyId: report.companyId,
    tripId: stop.tripId,
  })
  await transaction.recordEvent({
    actorUserId: report.actorUserId,
    authorship,
    companyId: report.companyId,
    documentId: null,
    kind: 'departed',
    location: null,
    recordedTogether: true,
    stopId,
    ...clock,
  })
}

/**
 * Trava as paradas da viagem, lê o estado sob a trava e grava as etapas que faltam antes do evento
 * pedido. A localização das etapas marcadas junto é nula: elas não disparam a correção de endereço.
 */
export async function recordSkippedSteps(params: RecordSkippedStepsParams): Promise<{
  readonly recordedTogether: readonly StopEventStep[]
  readonly stop: DriverStopReference
}> {
  const { authorship, report, requestedEvent, stop, stopId, transaction } = params
  await transaction.lockTripStops({ companyId: report.companyId, tripId: stop.tripId })
  const { stop: lockedStop } = await transaction.readDepartureDecision({
    companyId: report.companyId,
    stopId,
    tripId: stop.tripId,
  })
  await assertStopInOrder({
    authorship: authorship.channel,
    companyId: report.companyId,
    confirmOutOfOrder: report.confirmOutOfOrder,
    requestedEvent,
    requestedStopId: stopId,
    transaction,
    tripId: stop.tripId,
  })
  const steps = resolveStopEventSequence({
    authorship: authorship.channel,
    requestedEvent,
    stop: lockedStop,
  })
  const freshStop = { ...stop, arrivedAt: lockedStop.arrivedAt }
  if (steps.length === 0) return { recordedTogether: steps, stop: freshStop }

  const clock = resolveRecordedEventClock({
    clockOffsetMs: report.clockOffsetMs,
    hasLocation: report.location !== null,
    receivedAt: report.now,
    tappedAt: report.tappedAt,
  })
  if (steps.includes('departed')) await recordDepartureTogether({ ...params, clock })
  if (steps.includes('arrived')) {
    await applyStopArrival({
      authorship,
      input: { ...report, location: null, stopId },
      isOffice: false,
      recordedTogether: { clock },
      stop: freshStop,
      transaction,
    })
  }

  return { recordedTogether: steps, stop: freshStop }
}

/** Escritório: como sempre foi, sem etapa marcada junto. Motorista e ajudante: com a ordem da parada. */
export async function performSequencedStopArrival(
  params: PerformStopArrivalParams,
): Promise<SequencedStopArrivalResult> {
  const { authorship, input, transaction } = params
  if (input.target !== undefined) {
    return { ...(await performStopArrival(params)), recordedTogether: [] }
  }

  const stop = await transaction.findStopForDriver({
    companyId: input.companyId,
    stopId: input.stopId,
    target: toFieldTripTarget(input),
  })
  if (stop === null) throw new TripStopNotReachableError()

  const skipped = await recordSkippedSteps({
    authorship,
    report: input,
    requestedEvent: 'arrived',
    stop,
    stopId: input.stopId,
    transaction,
  })
  const event = await applyStopArrival({
    ...params,
    isOffice: false,
    stop: skipped.stop,
  })
  const addressCorrection =
    input.location === null
      ? undefined
      : await transaction.correctAddressFromArrival({
          actorUserId: input.actorUserId,
          companyId: input.companyId,
          eventId: event.id,
          location: input.location,
          stopId: input.stopId,
        })

  return {
    ...(addressCorrection === undefined ? {} : { addressCorrection }),
    id: event.id,
    recordedTogether: skipped.recordedTogether,
  }
}
