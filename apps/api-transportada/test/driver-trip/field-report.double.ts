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

export type FieldReportState = {
  readonly calls: string[]
  readonly dispatchedAtByTripId: Map<string, Date>
  /** Spec 179 T200: a ocorrência de nota (`trip_document_occurrences`), id à parte da de parada. */
  readonly documentOccurrences: Map<string, TripOccurrence>
  readonly documents: Map<string, DriverDocumentReference>
  readonly events: Map<string, { readonly id: string }>
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
  readonly reports: Map<string, { actorUserId: string; operation: string; resultId: string | null }>
  readonly stops: Map<string, DriverStopReference>
  stopCompletes: boolean
  tripCompletes: boolean
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
    latestEvents: new Map(),
    occurrences: new Map(),
    proofsByAttachmentKey: new Map(),
    proofsByEventKind: new Set(),
    proofDetailsByEventKind: new Map(),
    proofCountByEventKind: new Map(),
    reports: new Map(),
    stops: new Map(),
    stopCompletes: false,
    tripCompletes: false,
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
    markStopArrived: async (input) => {
      state.calls.push(`markStopArrived:${input.stopId}`)
      const stop = state.stops.get(input.stopId)
      if (stop !== undefined) state.stops.set(input.stopId, { ...stop, arrivedAt: input.at })
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
      if (input.documentId !== null)
        state.latestEvents.set(`${input.documentId}:${input.kind}`, event)
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
