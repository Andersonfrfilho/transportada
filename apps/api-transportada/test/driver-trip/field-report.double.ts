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

export type FieldReportState = {
  readonly calls: string[]
  readonly documents: Map<string, DriverDocumentReference>
  readonly events: Map<string, { readonly id: string }>
  readonly occurrences: Map<string, { readonly id: string }>
  readonly reports: Map<string, { operation: string; resultId: string | null }>
  readonly stops: Map<string, DriverStopReference>
  stopCompletes: boolean
  tripCompletes: boolean
}

export function createFieldReportState(
  overrides: Partial<FieldReportState> = {},
): FieldReportState {
  return {
    calls: [],
    documents: new Map(),
    events: new Map(),
    occurrences: new Map(),
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
        return { claimed: false, operation: existing.operation, resultId: existing.resultId }
      }
      state.reports.set(input.idempotencyKey, { operation: input.operation, resultId: null })
      return { claimed: true, operation: input.operation, resultId: null }
    },
    settle: async (input) => {
      state.calls.push('settle')
      const existing = state.reports.get(input.idempotencyKey)
      if (existing !== undefined) existing.resultId = input.resultId
    },
    findStopForDriver: async (input) => state.stops.get(input.stopId) ?? null,
    findDocumentForDriver: async (input) => state.documents.get(input.documentId) ?? null,
    markStopArrived: async (input) => {
      state.calls.push(`markStopArrived:${input.stopId}`)
      const stop = state.stops.get(input.stopId)
      if (stop !== undefined) state.stops.set(input.stopId, { ...stop, arrivedAt: input.at })
    },
    markTripInTransit: async (input) => {
      state.calls.push(`markTripInTransit:${input.tripId}`)
    },
    markDocumentDelivered: async (input) => {
      state.calls.push(`markDocumentDelivered:${input.documentId}`)
    },
    markDocumentReturned: async (input) => {
      state.calls.push(`markDocumentReturned:${input.documentId}:${input.reason}`)
    },
    completeStopIfSettled: async () => state.stopCompletes,
    completeTripIfSettled: async () => state.tripCompletes,
    recordEvent: async (input) => {
      state.calls.push(`recordEvent:${input.kind}:${input.location === null ? 'no-gps' : 'gps'}`)
      const event = { id: nextIdentifier('event') }
      state.events.set(event.id, event)
      return event
    },
    recordOccurrence: async (input) => {
      state.calls.push(`recordOccurrence:${input.kind}`)
      const occurrence = { id: nextIdentifier('occurrence') }
      state.occurrences.set(occurrence.id, occurrence)
      return occurrence
    },
    findEventById: async (input) => state.events.get(input.eventId) ?? null,
    findOccurrenceById: async (input) => state.occurrences.get(input.occurrenceId) ?? null,
  }

  return { execute: (operation) => operation(transaction), state }
}
