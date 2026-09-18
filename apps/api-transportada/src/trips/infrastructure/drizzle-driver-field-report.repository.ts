/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'

import { storedObjects } from '../../database/storage.schema.js'
import {
  tripDeliveryProofs,
  tripDispatchSnapshots,
  tripDocuments,
  tripFieldReports,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
  trips,
  type TripDeliveryProofKind,
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
import type { FieldAuthorship, FieldTripTarget } from '../application/field-trip-target.types.js'
import { TRIP_ON_ROAD_STATUSES } from '../domain/trip-state.policy.js'
import { buildProofUpsertSet } from './drizzle-delivery-proof.repository.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'
import { recordTripStatusChange } from './trip-status-event.persistence.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** As duas fases em que a viagem está na rua. Fora delas o motorista não tem o que reportar. */
/** Reportar acontece na rua, e a rua inclui o trajeto iniciado (ADR-0058). */
const ACTIVE_TRIP_STATUSES = TRIP_ON_ROAD_STATUSES

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

export class DrizzleDriverFieldReportTransaction implements DriverFieldReportTransactionPort {
  public constructor(private readonly transaction: Transaction) {}

  /**
   * ADR-0045 §5: a reserva é o próprio `insert` no unique. O reenvio concorrente fica **bloqueado
   * nele** até esta transação confirmar, e só então lê o resultado — em vez de os dois lerem "não
   * existe" e executarem o efeito duas vezes.
   */
  public async claim(input: {
    readonly actorUserId: string
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<FieldReportClaim> {
    const inserted = await this.transaction
      .insert(tripFieldReports)
      .values({
        actorUserId: input.actorUserId,
        channel: input.authorship.channel,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
        operation: input.operation,
      })
      .onConflictDoNothing({
        target: [tripFieldReports.companyId, tripFieldReports.idempotencyKey],
      })
      .returning({ id: tripFieldReports.id })

    if (inserted.length > 0) {
      return {
        actorUserId: input.actorUserId,
        claimed: true,
        operation: input.operation,
        resultId: null,
      }
    }

    const [existing] = await this.transaction
      .select({
        actorUserId: tripFieldReports.actorUserId,
        operation: tripFieldReports.operation,
        resultId: tripFieldReports.resultId,
      })
      .from(tripFieldReports)
      .where(
        and(
          eq(tripFieldReports.companyId, input.companyId),
          eq(tripFieldReports.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)

    return {
      actorUserId: existing?.actorUserId ?? input.actorUserId,
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
    readonly stopId: string
    readonly target: FieldTripTarget
  }): Promise<DriverStopReference | null> {
    const [record] = await this.transaction
      .select({
        arrivedAt: tripStops.arrivedAt,
        /** Spec 109 D3: o previsto desta parada — o atraso da chegada é medido contra ele. */
        estimatedArrivalAt: tripStops.estimatedArrivalAt,
        tripId: tripStops.tripId,
        tripStatus: trips.status,
      })
      .from(tripStops)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripStops.companyId), eq(trips.id, tripStops.tripId)),
      )
      .where(
        and(
          eq(tripStops.companyId, input.companyId),
          eq(tripStops.id, input.stopId),
          fieldTripTargetCondition(input.target),
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
    readonly target: FieldTripTarget
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
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.id, input.documentId),
          fieldTripTargetCondition(input.target),
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

  /** ADR-0067 §3: `null` quando a viagem nunca foi despachada — um único snapshot por viagem. */
  public async findDispatchedAt(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<Date | null> {
    const [record] = await this.transaction
      .select({ dispatchedAt: tripDispatchSnapshots.dispatchedAt })
      .from(tripDispatchSnapshots)
      .where(
        and(
          eq(tripDispatchSnapshots.companyId, input.companyId),
          eq(tripDispatchSnapshots.tripId, input.tripId),
        ),
      )
      .limit(1)

    return record?.dispatchedAt ?? null
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

  /**
   * Spec 109 D3: desloca as paradas que **ainda não aconteceram**.
   *
   * ⚠️ O recorte é `arrived_at is null` e não a sequência: o motorista pula parada e volta, e pela
   * sequência a saltada ficaria com a hora de antes do atraso para sempre. A parada que acabou de
   * ser marcada já tem `arrived_at`, então ela fica de fora por construção — e é o certo: o real
   * dela é a hora da chegada, não uma previsão corrigida.
   */
  public async shiftPendingStops(input: {
    readonly at: Date
    readonly companyId: string
    readonly shiftMilliseconds: number
    readonly tripId: string
  }): Promise<void> {
    await this.transaction
      .update(tripStops)
      .set({
        estimatedArrivalAt: sql`${tripStops.estimatedArrivalAt} + make_interval(secs => ${input.shiftMilliseconds / 1_000})`,
        updatedAt: input.at,
      })
      .where(
        and(
          eq(tripStops.companyId, input.companyId),
          eq(tripStops.tripId, input.tripId),
          isNull(tripStops.arrivedAt),
          isNotNull(tripStops.estimatedArrivalAt),
        ),
      )

    /** A hora envelhece a partir daqui: o carimbo é renovado junto (spec 107 D3). */
    await this.transaction
      .update(trips)
      .set({ estimatedArrivalFrozenAt: input.at })
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
  }

  public async markTripInTransit(input: {
    readonly actorUserId: string
    readonly at: Date
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean> {
    const updated = await this.transaction
      .update(trips)
      .set({ status: 'in_transit', updatedAt: new Date() })
      .where(
        and(
          eq(trips.companyId, input.companyId),
          eq(trips.id, input.tripId),
          eq(trips.status, 'dispatched'),
        ),
      )
      .returning({ id: trips.id })

    if (updated.length === 0) return false

    await recordTripStatusChange(this.transaction, {
      actorUserId: input.actorUserId,
      channel: input.authorship.channel,
      companyId: input.companyId,
      fromStatus: 'dispatched',
      occurredAt: input.at,
      onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
      toStatus: 'in_transit',
      tripId: input.tripId,
    })

    return true
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

  /**
   * Spec 056 D1: a última parada fecha a viagem sozinha. Ninguém no escritório aperta nada.
   *
   * ADR-0068 §2: a trava (`FOR NO KEY UPDATE`) vem imediatamente antes do `UPDATE trips`, depois de
   * `completeStopIfSettled` já ter fechado a parada nesta mesma transação — nunca no início dela.
   */
  public async completeTripIfSettled(input: {
    readonly actorUserId: string
    readonly at: Date
    readonly authorship: FieldAuthorship
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

    const [tripRow] = await this.transaction
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .for('no key update')
      .limit(1)
    if (tripRow === undefined) return false
    if (!(ACTIVE_TRIP_STATUSES as readonly TripStatus[]).includes(tripRow.status)) return false

    const completed = await this.transaction
      .update(trips)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(
        and(
          eq(trips.companyId, input.companyId),
          eq(trips.id, input.tripId),
          eq(trips.status, tripRow.status),
          sql`not exists ${openStops}`,
        ),
      )
      .returning({ id: trips.id })

    if (completed.length === 0) return false

    await recordTripStatusChange(this.transaction, {
      actorUserId: input.actorUserId,
      channel: input.authorship.channel,
      companyId: input.companyId,
      fromStatus: tripRow.status,
      occurredAt: input.at,
      onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
      toStatus: 'completed',
      tripId: input.tripId,
    })

    return true
  }

  public async recordEvent(input: Parameters<DriverFieldReportTransactionPort['recordEvent']>[0]) {
    const [event] = await this.transaction
      .insert(tripStopEvents)
      .values({
        accuracyMeters: input.location?.accuracyMeters ?? null,
        actorUserId: input.actorUserId,
        capturedAt: input.location === null ? null : new Date(input.location.capturedAt),
        channel: input.authorship.channel,
        companyId: input.companyId,
        ...(input.occurredAt === undefined ? {} : { createdAt: input.occurredAt }),
        kind: input.kind,
        latitude: input.location?.latitude ?? null,
        longitude: input.location?.longitude ?? null,
        onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
        ...(input.recordedAt === undefined ? {} : { recordedAt: input.recordedAt }),
        stopId: input.stopId,
        tripDocumentId: input.documentId,
      })
      .returning({ id: tripStopEvents.id })

    if (event === undefined) throw new Error('TRIP_STOP_EVENT_NOT_RECORDED')

    return event
  }

  /**
   * Spec 156 T6: mesma escrita de `DrizzleDeliveryProofRepository.saveProof`, mas sem abrir
   * transação própria — o chamador já está dentro da transação da entrega, e é isso que faz
   * "entrega + comprovante" serem atômicos para o escritório.
   */
  public async saveDeliveryProofWithinTransaction(
    input: Parameters<DriverFieldReportTransactionPort['saveDeliveryProofWithinTransaction']>[0],
  ): Promise<{ readonly id: string }> {
    await this.transaction.insert(storedObjects).values({
      bucket: 'fiscal',
      companyId: input.companyId,
      id: input.objectId,
      mimeType: input.mimeType,
      objectKey: input.objectKey,
      provider: 's3',
      purpose: 'delivery_proof',
      sha256: input.sha256,
      sizeBytes: BigInt(input.sizeBytes),
      status: 'final',
    })

    const [proof] = await this.transaction
      .insert(tripDeliveryProofs)
      .values({
        actorUserId: input.actorUserId,
        attachmentKey: input.attachmentKey,
        channel: input.authorship.channel,
        companyId: input.companyId,
        id: input.id,
        kind: input.kind,
        objectId: input.objectId,
        onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
        receiverDocumentEnvelope: input.receiverDocumentEnvelope,
        receiverDocumentMasked: input.receiverDocumentMasked,
        receiverName: input.receiverName,
        stopEventId: input.eventId,
      })
      .onConflictDoUpdate({
        set: buildProofUpsertSet(input),
        target: [
          tripDeliveryProofs.companyId,
          tripDeliveryProofs.stopEventId,
          tripDeliveryProofs.kind,
        ],
      })
      .returning({ id: tripDeliveryProofs.id })

    if (proof === undefined) throw new Error('TRIP_DELIVERY_PROOF_NOT_SAVED')

    return proof
  }

  public async findProofIdByAttachmentKeyWithinTransaction(input: {
    readonly attachmentKey: string
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<string | null> {
    const [record] = await this.transaction
      .select({ id: tripDeliveryProofs.id })
      .from(tripDeliveryProofs)
      .where(
        and(
          eq(tripDeliveryProofs.companyId, input.companyId),
          eq(tripDeliveryProofs.stopEventId, input.eventId),
          eq(tripDeliveryProofs.kind, input.kind),
          eq(tripDeliveryProofs.attachmentKey, input.attachmentKey),
        ),
      )
      .limit(1)

    return record?.id ?? null
  }

  public async recordOccurrence(
    input: Parameters<DriverFieldReportTransactionPort['recordOccurrence']>[0],
  ) {
    const [occurrence] = await this.transaction
      .insert(tripStopOccurrences)
      .values({
        actorUserId: input.actorUserId,
        attachmentObjectId: input.attachmentObjectId,
        channel: input.authorship.channel,
        companyId: input.companyId,
        description: input.description,
        kind: input.kind,
        onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
        reportedDistanceMeters: input.distanceMeters,
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
