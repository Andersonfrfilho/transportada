/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 057 P1 e spec 156 T6/T15: os passos da baixa de uma nota, na ordem em que
 * `document-outcome.service.ts` os encadeia dentro da transação.
 */
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'
import {
  DELIVERED_DOCUMENT_STATUS,
  DELIVERED_EVENT_KIND,
  RETURNED_DOCUMENT_STATUS,
} from '../domain/delivery-event.constant.js'
import {
  assertInformedTimeWithinWindow,
  FIELD_INFORMED_TIME,
} from '../domain/field-delivery-timing.policy.js'
import {
  TripDocumentAlreadySettledError,
  TripDocumentNotReachableError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import { checkTripDocumentTransition } from '../domain/trip-state.policy.js'
import { toFieldTripTarget } from './field-trip-target.types.js'
import type { OutcomeContext, ReachableDocument } from './report-document-outcome.types.js'
import { buildOfficeAuditEntry } from './trip-field-office-audit.port.js'

/**
 * Confirmação enfileirada de uma nota que o escritório desvinculou. O código é estável e a tela
 * mostra o conflito: sumir com o toque do motorista é pior do que recusá-lo com o motivo à vista.
 */
export async function findReachableDocument(context: OutcomeContext): Promise<ReachableDocument> {
  const { input } = context.params
  const document = await context.transaction.findDocumentForDriver({
    companyId: input.companyId,
    documentId: input.documentId,
    target: toFieldTripTarget(input),
  })
  if (document === null || document.stopId === null) throw new TripDocumentNotReachableError()

  return { ...document, stopId: document.stopId }
}

/**
 * ADR-0067 §2 (emenda): o escritório não herda o no-op do motorista — dias depois, uma segunda baixa
 * sobre a mesma nota seria uma entrega fantasma na linha do tempo. O caso real ("falta só o
 * canhoto") é `field-proof`, que não passa por aqui.
 */
function isSettledDocumentStatus(status: TripDocumentSeparationStatus): boolean {
  return status === DELIVERED_DOCUMENT_STATUS || status === RETURNED_DOCUMENT_STATUS
}

/**
 * Spec 156 T15 M6: no canal `office`, nota já fechada — entregue **ou** devolvida — é 409 antes de
 * qualquer outra conferência. ADR-0067 §3: só o escritório manda "quando aconteceu"; a janela é
 * contra o relógio do servidor e contra o despacho congelado da viagem (ou a criação, M9).
 */
export async function assertOfficeOutcomeAllowed(input: {
  readonly context: OutcomeContext
  readonly document: ReachableDocument
}): Promise<void> {
  const { context, document } = input
  if (!context.isOffice) return
  if (isSettledDocumentStatus(document.separationStatus)) {
    throw new TripDocumentAlreadySettledError()
  }

  const report = context.params.input
  assertInformedTimeWithinWindow({
    informedAt: report.now,
    kind:
      context.params.kind === DELIVERED_EVENT_KIND
        ? FIELD_INFORMED_TIME.delivered
        : FIELD_INFORMED_TIME.returned,
    now: report.recordedAt ?? new Date(),
    windowStart: await context.transaction.findInformedTimeWindowStart({
      companyId: report.companyId,
      tripId: document.tripId,
    }),
  })
}

/**
 * Quem decide se a transição vale é a política da 056, não uma segunda lista aqui. Ela põe o no-op
 * idempotente **antes** do estado da viagem de propósito: a fila offline drena muito depois do
 * toque, e uma entrega que funcionou voltaria como 409 para o motorista que fez tudo certo.
 *
 * Spec 159 T11: o no-op devolve o evento que já existe. Gravar outro fazia o reenvio virar o
 * "último" `delivered` da nota — sem foto — e esconder a foto do evento verdadeiro.
 */
export async function settleAndRecordEvent(input: {
  readonly context: OutcomeContext
  readonly document: ReachableDocument
}): Promise<{ readonly alreadySettled: boolean; readonly eventId: string }> {
  const { context, document } = input
  const { action, input: report, kind, settle } = context.params
  const transition = checkTripDocumentTransition({
    action,
    documentStatus: document.separationStatus,
    tripStatus: document.tripStatus,
  })
  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  const alreadySettled = transition.outcome === 'unchanged'

  if (!alreadySettled) await settle(context.transaction, report.documentId)
  const existingEvent = alreadySettled
    ? await context.transaction.findLatestEventForDocument({
        companyId: report.companyId,
        documentId: report.documentId,
        kind,
      })
    : null
  const event = existingEvent ?? (await recordOutcomeEvent({ context, document }))

  return { alreadySettled, eventId: event.id }
}

function recordOutcomeEvent(input: {
  readonly context: OutcomeContext
  readonly document: ReachableDocument
}): Promise<{ readonly id: string }> {
  const { context, document } = input
  const report = context.params.input

  return context.transaction.recordEvent({
    actorUserId: report.actorUserId,
    authorship: context.authorship,
    companyId: report.companyId,
    documentId: report.documentId,
    kind: context.params.kind,
    lateRegistration: report.lateRegistration ?? false,
    location: report.location,
    ...(context.isOffice
      ? { occurredAt: report.now, recordedAt: report.recordedAt ?? new Date() }
      : {}),
    ...(report.driverId === undefined ? {} : { reportedByDriverId: report.driverId }),
    stopId: document.stopId,
  })
}

/**
 * A última nota da parada fecha a parada, e a última parada fecha a viagem (spec 056 D1). A chegada
 * que ninguém tocou é preenchida em todo canal (C1 da spec 156 para o escritório; spec 205 para o
 * motorista, cujo "Registrar entrega depois" existe justamente para quem não tocou "Cheguei"). ADR-0058 §3, spec 156 T15 M4: a nota que
 * fechou e não concluiu a viagem a adianta para `on_delivery_route`.
 */
export async function closeStopAndTrip(input: {
  readonly alreadySettled: boolean
  readonly context: OutcomeContext
  readonly document: ReachableDocument
}): Promise<{ readonly stopCompleted: boolean; readonly tripCompleted: boolean }> {
  const { context, document } = input
  const report = context.params.input
  const tripChange = {
    actorUserId: report.actorUserId,
    at: report.now,
    authorship: context.authorship,
    companyId: report.companyId,
    tripId: document.tripId,
  }

  const stopCompleted = await context.transaction.completeStopIfSettled({
    at: report.now,
    companyId: report.companyId,
    stopId: document.stopId,
  })
  const tripCompleted = stopCompleted
    ? await context.transaction.completeTripIfSettled(tripChange)
    : false
  if (!input.alreadySettled && !tripCompleted) {
    await context.transaction.advanceTripFromSettledDocuments(tripChange)
  }

  return { stopCompleted, tripCompleted }
}

export async function recordOutcomeAudit(input: {
  readonly context: OutcomeContext
  readonly document: ReachableDocument
}): Promise<void> {
  const report = input.context.params.input
  const audit = buildOfficeAuditEntry({
    actorUserId: report.actorUserId,
    audit: report.officeAudit,
    companyId: report.companyId,
    details: { documentId: report.documentId, stopId: input.document.stopId },
    locator: report,
  })
  if (audit !== undefined) await input.context.transaction.recordOfficeAudit(audit)
}
