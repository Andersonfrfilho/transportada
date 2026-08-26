/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'

import {
  tripDocuments,
  tripDrivers,
  tripFieldReports,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
  trips,
  type TripDocumentSeparationStatus,
  type TripStatus,
} from '../../database/trip.schema.js'
import type {
  DriverDocumentReference,
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  DriverStopReference,
  FieldReportClaim,
} from '../application/driver-field-report.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** As duas fases em que a viagem está na rua. Fora delas o motorista não tem o que reportar. */
const ACTIVE_TRIP_STATUSES = ['dispatched', 'in_transit'] as const

/** Nota entregue ou devolvida saiu do eixo do campo — é o que faz a parada poder fechar. */
const SETTLED_DOCUMENT_STATUSES = ['delivered', 'returned'] as const

export class DrizzleDriverFieldReportUnitOfWork implements DriverFieldReportUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: DriverFieldReportTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleDriverFieldReportTransaction(transaction)),
    )
  }
}

class DrizzleDriverFieldReportTransaction implements DriverFieldReportTransactionPort {
  public constructor(private readonly transaction: Transaction) {}

  /**
   * ADR-0045 §5: a reserva é o próprio `insert` no unique. O reenvio concorrente fica **bloqueado
   * nele** até esta transação confirmar, e só então lê o resultado — em vez de os dois lerem "não
   * existe" e executarem o efeito duas vezes.
   */
  public async claim(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<FieldReportClaim> {
    const inserted = await this.transaction
      .insert(tripFieldReports)
      .values({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: input.operation,
      })
      .onConflictDoNothing({ target: [tripFieldReports.companyId, tripFieldReports.idempotencyKey] })
      .returning({ id: tripFieldReports.id })

    if (inserted.length > 0) {
      return { claimed: true, operation: input.operation, resultId: null }
    }

    const [existing] = await this.transaction
      .select({ operation: tripFieldReports.operation, resultId: tripFieldReports.resultId })
      .from(tripFieldReports)
      .where(
        and(
          eq(tripFieldReports.companyId, input.companyId),
          eq(tripFieldReports.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)

    return {
      claimed: false,
      operation: existing?.operation ?? input.operation,
      resultId: existing?.resultId ?? null,
    }
  }

  public async settle(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly resultId: string
  }): Promise<void> {
    await this.transaction
      .update(tripFieldReports)
      .set({ resultId: input.resultId })
      .where(
        and(
          eq(tripFieldReports.companyId, input.companyId),
          eq(tripFieldReports.idempotencyKey, input.idempotencyKey),
        ),
      )
  }

  public async findStopForDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly stopId: string
  }): Promise<DriverStopReference | null> {
    const [record] = await this.transaction
      .select({
        arrivedAt: tripStops.arrivedAt,
        tripId: tripStops.tripId,
        tripStatus: trips.status,
      })
      .from(tripStops)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripStops.companyId), eq(trips.id, tripStops.tripId)),
      )
      .innerJoin(
        tripDrivers,
        and(eq(tripDrivers.companyId, trips.companyId), eq(tripDrivers.tripId, trips.id)),
      )
      .where(
        and(
          eq(tripStops.companyId, input.companyId),
          eq(tripStops.id, input.stopId),
          eq(tripDrivers.driverId, input.driverId),
          inArray(trips.status, [...ACTIVE_TRIP_STATUSES]),
        ),
      )
      .limit(1)

    return record ?? null
  }

  /**
   * Aqui o filtro de viagem ativa **não** entra: viagem cancelada com o motorista na rua precisa
   * chegar ao caso de uso para ser recusada com o motivo, e não sumir como "nota inexistente".
   */
  public async findDocumentForDriver(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  }): Promise<DriverDocumentReference | null> {
    const [record] = await this.transaction
      .select({
        separationStatus: tripDocuments.separationStatus,
        stopId: tripDocuments.stopId,
        tripId: tripDocuments.tripId,
        tripStatus: trips.status,
      })
      .from(tripDocuments)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .innerJoin(
        tripDrivers,
        and(eq(tripDrivers.companyId, trips.companyId), eq(tripDrivers.tripId, trips.id)),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.id, input.documentId),
          eq(tripDrivers.driverId, input.driverId),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .limit(1)

    if (record === undefined) return null

    return {
      separationStatus: record.separationStatus as TripDocumentSeparationStatus,
      stopId: record.stopId,
      tripId: record.tripId,
      tripStatus: record.tripStatus as TripStatus,
    }
  }

  public async markStopArrived(input: {
    readonly at: Date
    readonly companyId: string
    readonly stopId: string
  }): Promise<void> {
    await this.transaction
      .update(tripStops)
      .set({ arrivedAt: input.at, updatedAt: input.at })
      .where(
        and(
          eq(tripStops.companyId, input.companyId),
          eq(tripStops.id, input.stopId),
          isNull(tripStops.arrivedAt),
        ),
      )
  }

  public async markTripInTransit(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<void> {
    await this.transaction
      .update(trips)
      .set({ status: 'in_transit', updatedAt: new Date() })
      .where(
        and(
          eq(trips.companyId, input.companyId),
          eq(trips.id, input.tripId),
          eq(trips.status, 'dispatched'),
        ),
      )
  }

  public async markDocumentDelivered(input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
  }): Promise<void> {
    await this.transaction
      .update(tripDocuments)
      .set({ deliveredAt: input.at, separationStatus: 'delivered', updatedAt: input.at })
      .where(
        and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.documentId)),
      )
  }

  public async markDocumentReturned(input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
    readonly reason: string
  }): Promise<void> {
    await this.transaction
      .update(tripDocuments)
      .set({
        returnReason: input.reason,
        returnedAt: input.at,
        separationStatus: 'returned',
        updatedAt: input.at,
      })
      .where(
        and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.documentId)),
      )
  }

  /**
   * A parada fecha quando nenhuma nota dela está mais pendente — entregue ou devolvida dá no mesmo
   * para a parada. `completed_at is null` no filtro é o que torna a operação repetível: a segunda
   * chamada não devolve `true` de novo, e a tela não anuncia duas vezes que a parada fechou.
   */
  public async completeStopIfSettled(input: {
    readonly at: Date
    readonly companyId: string
    readonly stopId: string
  }): Promise<boolean> {
    const pending = this.transaction
      .select({ id: tripDocuments.id })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.stopId, input.stopId),
          isNull(tripDocuments.releasedAt),
          notInArray(tripDocuments.separationStatus, [...SETTLED_DOCUMENT_STATUSES]),
        ),
      )

    const completed = await this.transaction
      .update(tripStops)
      .set({ completedAt: input.at, updatedAt: input.at })
      .where(
        and(
          eq(tripStops.companyId, input.companyId),
          eq(tripStops.id, input.stopId),
          isNull(tripStops.completedAt),
          sql`not exists ${pending}`,
        ),
      )
      .returning({ id: tripStops.id })

    return completed.length > 0
  }

  /** Spec 056 D1: a última parada fecha a viagem sozinha. Ninguém no escritório aperta nada. */
  public async completeTripIfSettled(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean> {
    const openStops = this.transaction
      .select({ id: tripStops.id })
      .from(tripStops)
      .where(
        and(
          eq(tripStops.companyId, input.companyId),
          eq(tripStops.tripId, input.tripId),
          isNull(tripStops.completedAt),
        ),
      )

    const completed = await this.transaction
      .update(trips)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(
        and(
          eq(trips.companyId, input.companyId),
          eq(trips.id, input.tripId),
          inArray(trips.status, [...ACTIVE_TRIP_STATUSES]),
          sql`not exists ${openStops}`,
        ),
      )
      .returning({ id: trips.id })

    return completed.length > 0
  }

  public async recordEvent(input: Parameters<DriverFieldReportTransactionPort['recordEvent']>[0]) {
    const [event] = await this.transaction
      .insert(tripStopEvents)
      .values({
        accuracyMeters: input.location?.accuracyMeters ?? null,
        actorUserId: input.actorUserId,
        capturedAt:
          input.location === null ? null : new Date(input.location.capturedAt),
        companyId: input.companyId,
        kind: input.kind,
        latitude: input.location?.latitude ?? null,
        longitude: input.location?.longitude ?? null,
        stopId: input.stopId,
        tripDocumentId: input.documentId,
      })
      .returning({ id: tripStopEvents.id })

    if (event === undefined) throw new Error('TRIP_STOP_EVENT_NOT_RECORDED')

    return event
  }

  public async recordOccurrence(
    input: Parameters<DriverFieldReportTransactionPort['recordOccurrence']>[0],
  ) {
    const [occurrence] = await this.transaction
      .insert(tripStopOccurrences)
      .values({
        actorUserId: input.actorUserId,
        attachmentObjectId: input.attachmentObjectId,
        companyId: input.companyId,
        description: input.description,
        kind: input.kind,
        stopId: input.stopId,
        tripDocumentId: input.documentId,
      })
      .returning({ id: tripStopOccurrences.id })

    if (occurrence === undefined) throw new Error('TRIP_STOP_OCCURRENCE_NOT_RECORDED')

    return occurrence
  }

  public async findEventById(input: { readonly companyId: string; readonly eventId: string }) {
    const [event] = await this.transaction
      .select({ id: tripStopEvents.id })
      .from(tripStopEvents)
      .where(
        and(eq(tripStopEvents.companyId, input.companyId), eq(tripStopEvents.id, input.eventId)),
      )
      .limit(1)

    return event ?? null
  }

  public async findOccurrenceById(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }) {
    const [occurrence] = await this.transaction
      .select({ id: tripStopOccurrences.id })
      .from(tripStopOccurrences)
      .where(
        and(
          eq(tripStopOccurrences.companyId, input.companyId),
          eq(tripStopOccurrences.id, input.occurrenceId),
        ),
      )
      .limit(1)

    return occurrence ?? null
  }
}
