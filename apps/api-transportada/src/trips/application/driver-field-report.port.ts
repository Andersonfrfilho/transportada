/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopEventKind, TripStopOccurrenceKind } from '../../database/trip.schema.js'

/** A posição que o aparelho conseguiu ler. `null` inteiro quando ele não conseguiu ler nenhuma. */
export type ReportedLocation = {
  readonly accuracyMeters: string | null
  readonly capturedAt: string
  readonly latitude: string
  readonly longitude: string
}

export type DriverStopReference = {
  readonly arrivedAt: Date | null
  readonly tripId: string
  readonly tripStatus: string
}

export type DriverDocumentReference = {
  readonly separationStatus: string
  readonly stopId: string | null
  readonly tripId: string
}

export type FieldReportClaim = {
  /** `true` quando esta transação é a primeira a usar a chave — e portanto quem executa o efeito. */
  readonly claimed: boolean
  readonly operation: string
  readonly resultId: string | null
}

/**
 * Tudo aqui roda **dentro de uma transação**. É o que faz a idempotência valer: a reserva da chave é
 * um `insert` com unique, e o reenvio concorrente fica bloqueado nele até o primeiro confirmar — em
 * vez de os dois lerem "não existe" e executarem o efeito duas vezes.
 */
export type DriverFieldReportTransactionPort = {
  claim(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<FieldReportClaim>
  settle(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly resultId: string
  }): Promise<void>

  findStopForDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly stopId: string
  }): Promise<DriverStopReference | null>
  findDocumentForDriver(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }): Promise<DriverDocumentReference | null>

  markStopArrived(input: {
    readonly at: Date
    readonly companyId: string
    readonly stopId: string
  }): Promise<void>
  markTripInTransit(input: { readonly companyId: string; readonly tripId: string }): Promise<void>
  markDocumentDelivered(input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
  }): Promise<void>
  markDocumentReturned(input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
    readonly reason: string
  }): Promise<void>
  /** Fecha a parada quando nenhuma nota dela está mais pendente. Devolve se fechou. */
  completeStopIfSettled(input: {
    readonly at: Date
    readonly companyId: string
    readonly stopId: string
  }): Promise<boolean>
  /** Fecha a viagem quando a última parada fechou (spec 056 D1). Devolve se fechou. */
  completeTripIfSettled(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean>

  recordEvent(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string | null
    readonly kind: TripStopEventKind
    readonly location: ReportedLocation | null
    readonly stopId: string
  }): Promise<{ readonly id: string }>
  recordOccurrence(input: {
    readonly actorUserId: string
    readonly attachmentObjectId: string | null
    readonly companyId: string
    readonly description: string
    readonly documentId: string | null
    readonly kind: TripStopOccurrenceKind
    readonly stopId: string
  }): Promise<{ readonly id: string }>
  findEventById(input: {
    readonly companyId: string
    readonly eventId: string
  }): Promise<{ readonly id: string } | null>
  findOccurrenceById(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<{ readonly id: string } | null>
}

export type DriverFieldReportUnitOfWork = {
  execute<TResult>(
    operation: (transaction: DriverFieldReportTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
