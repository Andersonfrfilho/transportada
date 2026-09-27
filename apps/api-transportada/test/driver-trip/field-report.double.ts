/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DriverDocumentReference,
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  DriverStopReference,
  FieldReportClaim,
} from '../../src/trips/application/driver-field-report.port.js'
import type { TripFieldChannel } from '../../src/trips/domain/trip-field-channel.constant.js'
import type { TripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'

export type ProofReceiverRow = {
  id: string
  receivedBy: string | null
  receivedByDetail: string | null
  receiverName: string
}

export type FieldReportState = {
  readonly calls: string[]
  readonly dispatchedAtByTripId: Map<string, Date>
  /** Spec 179 T200: a ocorrência de nota (`trip_document_occurrences`), id à parte da de parada. */
  readonly documentOccurrences: Map<string, TripOccurrence>
  readonly documents: Map<string, DriverDocumentReference>
  readonly events: Map<string, { readonly id: string }>
  /** Spec 205 RF4: `eventId` → o `lateRegistration` que a baixa gravou (ausente cai em `false`). */
  readonly eventLateRegistrations: Map<string, boolean>
  /** Spec 159 T11: `documentId:kind` → o último evento gravado daquela nota e tipo. */
  readonly latestEvents: Map<string, { readonly id: string }>
  readonly occurrences: Map<string, { readonly id: string }>
  readonly proofsByAttachmentKey: Map<string, string>
  /** ADR-0070 §1, spec 159 T6: `eventId:kind` de todo comprovante gravado — para `proofPending`. */
  readonly proofsByEventKind: Set<string>
  /** Spec 156 T15 M1: `eventId:kind` → canal e objeto do comprovante gravado. */
  readonly proofDetailsByEventKind: Map<string, { channel: TripFieldChannel; objectId: string }>
  /** Spec 184 (RF4): `eventId:kind` → quantas linhas gravadas — a foto de carga soma. */
  readonly proofCountByEventKind: Map<string, number>
  /**
   * Spec 193 D7: `eventId` → as linhas do motorista (`photo`/`signature`, `driver_app`) que o `PATCH`
   * de quem recebeu alcança. Ausente é "sem comprovante do motorista".
   */
  readonly proofReceivers: Map<string, ProofReceiverRow[]>
  readonly reports: Map<string, { actorUserId: string; operation: string; resultId: string | null }>
  readonly stops: Map<string, DriverStopReference>
  stopCompletes: boolean
  tripCompletes: boolean
  /** Spec 206 D1: `stopId` → o último `arrived` da viagem (D3), atualizado por `recordEvent`. */
  readonly arrivedAtByTripId: Map<string, Date>
  /** Spec 206 D3: `tripId` → o `tapped_at` do último `departed`, atualizado por `recordEvent`. */
  readonly departedTappedAtByTripId: Map<string, Date | null>
  /** Spec 206 D4: `stopId` → `completed_at`, que `DriverStopReference` não carrega. */
  readonly stopCompletedAt: Map<string, Date>
  /** Spec 206 D4: `stopId` → "a caminho", separado de `stops` para não mudar o tipo existente. */
  readonly stopEnRoute: Map<string, { enRouteSince: Date | null; enRouteTappedAt: Date | null }>
  /** Spec 206 D9: `stopId` → `sequence`, para o `enRouteStop.sequence` do `409`. */
  readonly stopSequence: Map<string, string>
}

export function createFieldReportState(
  overrides: Partial<FieldReportState> = {},
): FieldReportState {
  return {
    calls: [],
    dispatchedAtByTripId: new Map(),
    documentOccurrences: new Map(),
    documents: new Map(),
    events: new Map(),
    eventLateRegistrations: new Map(),
    latestEvents: new Map(),
    occurrences: new Map(),
    proofsByAttachmentKey: new Map(),
    proofsByEventKind: new Set(),
    proofDetailsByEventKind: new Map(),
    proofCountByEventKind: new Map(),
    proofReceivers: new Map(),
    reports: new Map(),
    stops: new Map(),
    stopCompletes: false,
    tripCompletes: false,
    arrivedAtByTripId: new Map(),
    departedTappedAtByTripId: new Map(),
    stopCompletedAt: new Map(),
    stopEnRoute: new Map(),
    stopSequence: new Map(),
    ...overrides,
  }
}

let identifierCounter = 0

function nextIdentifier(prefix: string): string {
  identifierCounter += 1
  return `${prefix}-${identifierCounter}`
}

/**
 * O dublê mantém a semântica que importa da transação real: a reserva da chave é atômica e a
 * segunda tentativa **não** reclama a chave. Um dublê que devolvesse `claimed: true` sempre faria o
 * teste de idempotência passar com a implementação errada.
 */
export function createFieldReportUnitOfWork(
  state: FieldReportState,
): DriverFieldReportUnitOfWork & { readonly state: FieldReportState } {
  const transaction: DriverFieldReportTransactionPort = {
    claim: async (input): Promise<FieldReportClaim> => {
      state.calls.push('claim')
      const existing = state.reports.get(input.idempotencyKey)
      if (existing !== undefined) {
        return {
          actorUserId: existing.actorUserId,
          claimed: false,
          operation: existing.operation,
          resultId: existing.resultId,
        }
      }
      state.reports.set(input.idempotencyKey, {
        actorUserId: input.actorUserId,
        operation: input.operation,
        resultId: null,
      })
      return {
        actorUserId: input.actorUserId,
        claimed: true,
        operation: input.operation,
        resultId: null,
      }
    },
    settle: async (input) => {
      state.calls.push('settle')
      const existing = state.reports.get(input.idempotencyKey)
      if (existing !== undefined) existing.resultId = input.resultId
    },
    findStopForDriver: async (input) => state.stops.get(input.stopId) ?? null,
    findDocumentForDriver: async (input) => state.documents.get(input.documentId) ?? null,
    findInformedTimeWindowStart: async (input) =>
      state.dispatchedAtByTripId.get(input.tripId) ?? null,
    /** Spec 206 D4/D7: zera "a caminho" da própria parada, e das demais quando `clearEnRoute` é `'trip'`. */
    markStopArrived: async (input) => {
      state.calls.push(`markStopArrived:${input.stopId}`)
      const stop = state.stops.get(input.stopId)
      if (stop !== undefined) state.stops.set(input.stopId, { ...stop, arrivedAt: input.at })
      state.stopEnRoute.set(input.stopId, { enRouteSince: null, enRouteTappedAt: null })
      if (input.clearEnRoute === 'trip') {
        for (const [stopId, otherStop] of state.stops) {
          if (otherStop.tripId === input.tripId) {
            state.stopEnRoute.set(stopId, { enRouteSince: null, enRouteTappedAt: null })
          }
        }
      }
    },
    /** Spec 206 D4: o dublê não modela lock real — a ordem é garantida pelo `await` sequencial do teste. */
    lockTripStops: async () => {
      state.calls.push('lockTripStops')
    },
    readDepartureDecision: async (input) => {
      const stop = state.stops.get(input.stopId)
      const enRoute = state.stopEnRoute.get(input.stopId) ?? {
        enRouteSince: null,
        enRouteTappedAt: null,
      }
      let enRouteStop: { id: string; sequence: string } | null = null
      for (const [stopId, otherStop] of state.stops) {
        if (otherStop.tripId !== input.tripId) continue
        const otherEnRoute = state.stopEnRoute.get(stopId)
        if (otherEnRoute?.enRouteSince != null) {
          enRouteStop = { id: stopId, sequence: state.stopSequence.get(stopId) ?? '1' }
          break
        }
      }

      return {
        enRouteStop,
        lastArrivedAt: state.arrivedAtByTripId.get(input.tripId) ?? null,
        lastDepartedTappedAt: state.departedTappedAtByTripId.get(input.tripId) ?? null,
        stop: {
          arrivedAt: stop?.arrivedAt ?? null,
          completedAt: state.stopCompletedAt.get(input.stopId) ?? null,
          enRouteSince: enRoute.enRouteSince,
        },
      }
    },
    markStopEnRoute: async (input) => {
      state.calls.push(`markStopEnRoute:${input.stopId}`)
      state.stopEnRoute.set(input.stopId, {
        enRouteSince: input.since,
        enRouteTappedAt: input.tappedAt,
      })
    },
    clearStopEnRoute: async (input) => {
      state.calls.push(`clearStopEnRoute:${input.stopId}`)
      state.stopEnRoute.set(input.stopId, { enRouteSince: null, enRouteTappedAt: null })
    },
    markTripOnDeliveryRoute: async (input) => {
      state.calls.push(`markTripOnDeliveryRoute:${input.tripId}`)
      return true
    },
    /** Spec 109 D3: o dublê registra o deslocamento com o tamanho dele — é o que o contrato lê. */
    shiftPendingStops: async (input) => {
      state.calls.push(`shiftPendingStops:${input.tripId}:${String(input.shiftMilliseconds)}`)
    },
    markTripInTransit: async (input) => {
      state.calls.push(`markTripInTransit:${input.tripId}`)
      return true
    },
    markDocumentDelivered: async (input) => {
      state.calls.push(`markDocumentDelivered:${input.documentId}`)
    },
    markDocumentReturned: async (input) => {
      state.calls.push(`markDocumentReturned:${input.documentId}:${input.reason}`)
    },
    completeStopIfSettled: async () => state.stopCompletes,
    completeTripIfSettled: async () => state.tripCompletes,
    recordOfficeAudit: async (input) => {
      state.calls.push(`recordOfficeAudit:${input.action}`)
    },
    advanceTripFromSettledDocuments: async (input) => {
      state.calls.push(`advanceTripFromSettledDocuments:${input.tripId}`)
      return false
    },
    recordEvent: async (input) => {
      state.calls.push(`recordEvent:${input.kind}:${input.location === null ? 'no-gps' : 'gps'}`)
      const event = { id: nextIdentifier('event') }
      state.events.set(event.id, event)
      state.eventLateRegistrations.set(event.id, input.lateRegistration ?? false)
      if (input.documentId !== null)
        state.latestEvents.set(`${input.documentId}:${input.kind}`, event)
      /** Spec 206 D3: as referências de tempo que `readDepartureDecision` compara. */
      const tripId = state.stops.get(input.stopId)?.tripId
      if (tripId !== undefined) {
        if (input.kind === 'departed') {
          state.departedTappedAtByTripId.set(tripId, input.tappedAt ?? null)
        }
        if (input.kind === 'arrived') {
          state.arrivedAtByTripId.set(tripId, input.occurredAt ?? new Date())
        }
      }
      return event
    },
    findLatestEventForDocument: async (input) =>
      state.latestEvents.get(`${input.documentId}:${input.kind}`) ?? null,
    recordOccurrence: async (input) => {
      state.calls.push(`recordOccurrence:${input.kind}`)
      const occurrence = { id: nextIdentifier('occurrence') }
      state.occurrences.set(occurrence.id, occurrence)
      return occurrence
    },
    findEventById: async (input) => state.events.get(input.eventId) ?? null,
    findOccurrenceById: async (input) => state.occurrences.get(input.occurrenceId) ?? null,
    saveDeliveryProofWithinTransaction: async (input) => {
      state.calls.push(`saveDeliveryProofWithinTransaction:${input.eventId}:${input.kind}`)
      state.proofsByEventKind.add(`${input.eventId}:${input.kind}`)
      state.proofDetailsByEventKind.set(`${input.eventId}:${input.kind}`, {
        channel: input.authorship.channel,
        objectId: input.objectId,
      })
      const countKey = `${input.eventId}:${input.kind}`
      state.proofCountByEventKind.set(
        countKey,
        (state.proofCountByEventKind.get(countKey) ?? 0) + 1,
      )
      if (input.attachmentKey.length > 0) {
        state.proofsByAttachmentKey.set(
          `${input.eventId}:${input.kind}:${input.attachmentKey}`,
          input.id,
        )
      }
      return { id: input.id }
    },
    findProofIdByAttachmentKeyWithinTransaction: async (input) =>
      state.proofsByAttachmentKey.get(`${input.eventId}:${input.kind}:${input.attachmentKey}`) ??
      null,
    countProofsForEvent: async (input) =>
      state.proofCountByEventKind.get(`${input.eventId}:${input.kind}`) ?? 0,
    findDeliveryEventForProof: async (input) =>
      state.latestEvents.get(`${input.documentId}:delivered`) ?? null,
    updateDriverProofReceiverWithinTransaction: async (input) => {
      const rows = state.proofReceivers.get(input.eventId) ?? []
      const [first] = rows
      if (first === undefined) return null
      const set: Partial<ProofReceiverRow> = {
        ...(input.receivedBy === undefined ? {} : input.receivedBy),
        ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
      }
      const changed = rows.some((row) =>
        Object.entries(set).some(
          ([column, value]) => row[column as keyof ProofReceiverRow] !== value,
        ),
      )
      for (const row of rows) Object.assign(row, set)
      return { changed, id: first.id }
    },
    findProofForEvent: async (input) =>
      state.proofDetailsByEventKind.get(`${input.eventId}:${input.kind}`) ?? null,
    findProofExistsForEvent: async (input) =>
      state.proofsByEventKind.has(`${input.eventId}:${input.kind}`),
    saveDocumentOccurrence: async (input) => {
      state.calls.push(
        `saveDocumentOccurrence:${input.documentId}:${input.attachmentObjectId ?? 'none'}`,
      )
      if (!state.documents.has(input.documentId)) return null
      const occurrence: TripOccurrence = {
        createdAt: new Date().toISOString(),
        id: nextIdentifier('document-occurrence'),
        note: input.note,
        occurrenceTypeId: input.occurrenceTypeId,
        productCode: input.productCode,
        stage: input.stage,
        typeName: input.typeName,
      }
      state.documentOccurrences.set(occurrence.id, occurrence)
      return occurrence
    },
    findDocumentOccurrenceById: async (input) =>
      state.documentOccurrences.get(input.occurrenceId) ?? null,
  }

  return { execute: (operation) => operation(transaction), state }
}
