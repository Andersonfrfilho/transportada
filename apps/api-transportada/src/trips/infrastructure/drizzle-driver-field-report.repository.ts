/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'

import { inList } from '../../database/schema-check.constant.js'
import { timestamptzParameter } from '../../database/sql-timestamptz-parameter.support.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  companyOccurrenceTypes,
  TRIP_DELIVERY_PROOF_CARGO_KIND,
  tripDeliveryProofs,
  tripDispatchSnapshots,
  tripDocumentOccurrences,
  tripDocuments,
  tripFieldReports,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
  trips,
  type TripDeliveryProofKind,
  type TripDocumentSeparationStatus,
  type TripStatus,
  type TripStopEventKind,
} from '../../database/trip.schema.js'
import type {
  DriverDocumentReference,
  DriverFieldReportTransactionPort,
  DriverFieldReportUnitOfWork,
  DriverStopReference,
  FieldReportClaim,
} from '../application/driver-field-report.port.js'
import type { FieldAuthorship, FieldTripTarget } from '../application/field-trip-target.types.js'
import type { TripOccurrence } from '../application/register-trip-occurrence.use-case.js'
import type { TripFieldOfficeAuditInput } from '../application/trip-field-office-audit.port.js'
import { saveTripOccurrence } from './delivery-proof-read.support.js'
import {
  DELIVERED_DOCUMENT_STATUS,
  DELIVERED_EVENT_KIND,
  RETURNED_DOCUMENT_STATUS,
} from '../domain/delivery-event.constant.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import {
  deriveTripStatus,
  tallyTripDocuments,
  TRIP_DISPATCHED_STATUSES,
  TRIP_ON_ROAD_STATUSES,
} from '../domain/trip-state.policy.js'
import { buildProofUpsertSet } from './drizzle-delivery-proof.repository.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'
import { insertTripFieldOfficeAudit } from './trip-field-office-audit.persistence.js'
import { recordTripStatusChange } from './trip-status-event.persistence.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Reportar acontece na rua, e a rua inclui o trajeto iniciado (ADR-0058). */
const FIELD_REPORTABLE_TRIP_STATUSES = TRIP_ON_ROAD_STATUSES

/** ADR-0058 §3: o único passo que a baixa de uma nota deriva — concluir é pelas paradas. */
const TRIP_ON_DELIVERY_ROUTE_STATUS = 'on_delivery_route' satisfies TripStatus

/** Nota entregue ou devolvida saiu do eixo do campo — é o que faz a parada poder fechar. */
const SETTLED_DOCUMENT_STATUSES = [DELIVERED_DOCUMENT_STATUS, RETURNED_DOCUMENT_STATUS] as const

export class DrizzleDriverFieldReportUnitOfWork implements DriverFieldReportUnitOfWork {
  public constructor(
    private readonly database: Database,
    private readonly bucket: string,
  ) {}

  public execute<TResult>(
    operation: (transaction: DriverFieldReportTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleDriverFieldReportTransaction(transaction, this.bucket)),
    )
  }
}

export class DrizzleDriverFieldReportTransaction implements DriverFieldReportTransactionPort {
  public constructor(
    private readonly transaction: Transaction,
    private readonly bucket: string,
  ) {}

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
          inArray(trips.status, [...FIELD_REPORTABLE_TRIP_STATUSES]),
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

  /** ADR-0067 §3, spec 156 T15 M9: o despacho congelado, ou a criação da viagem sem ele. */
  public async findInformedTimeWindowStart(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<Date | null> {
    const [record] = await this.transaction
      .select({ createdAt: trips.createdAt, dispatchedAt: tripDispatchSnapshots.dispatchedAt })
      .from(trips)
      .leftJoin(
        tripDispatchSnapshots,
        and(
          eq(tripDispatchSnapshots.companyId, trips.companyId),
          eq(tripDispatchSnapshots.tripId, trips.id),
        ),
      )
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)

    if (record === undefined) return null
    return record.dispatchedAt ?? record.createdAt
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
   *
   * Spec 156 T15 M3: a hora é a da última nota que **aconteceu**, não a da última digitada — a baixa
   * retroativa do escritório chega fora de ordem. C1: sem chegada registrada, o canal `office`
   * preenche `arrived_at` com a primeira hora da parada (o CHECK exige chegada antes de fechar).
   */
  public async completeStopIfSettled(input: {
    readonly at: Date
    readonly companyId: string
    readonly fillMissingArrival: boolean
    readonly stopId: string
  }): Promise<boolean> {
    const stopDocuments = and(
      eq(tripDocuments.companyId, input.companyId),
      eq(tripDocuments.stopId, input.stopId),
      isNull(tripDocuments.releasedAt),
    )
    const pending = this.transaction
      .select({ id: tripDocuments.id })
      .from(tripDocuments)
      .where(
        and(
          stopDocuments,
          notInArray(tripDocuments.separationStatus, [...SETTLED_DOCUMENT_STATUSES]),
        ),
      )
    const lastSettledAt = this.transaction
      .select({
        at: sql`max(greatest(${tripDocuments.deliveredAt}, ${tripDocuments.returnedAt}))`,
      })
      .from(tripDocuments)
      .where(stopDocuments)
    const firstSettledAt = this.transaction
      .select({ at: sql`min(least(${tripDocuments.deliveredAt}, ${tripDocuments.returnedAt}))` })
      .from(tripDocuments)
      .where(stopDocuments)

    const completed = await this.transaction
      .update(tripStops)
      .set({
        ...(input.fillMissingArrival
          ? {
              arrivedAt: sql`coalesce(${tripStops.arrivedAt}, (${firstSettledAt}), ${timestamptzParameter(input.at)})`,
            }
          : {}),
        completedAt: sql`coalesce((${lastSettledAt}), ${timestamptzParameter(input.at)})`,
        updatedAt: input.at,
      })
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
    if (!(FIELD_REPORTABLE_TRIP_STATUSES as readonly TripStatus[]).includes(tripRow.status))
      return false

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

    /** Spec 156 T15 M3: a viagem fecha na hora em que a última parada fechou, não na digitação. */
    const [lastStop] = await this.transaction
      .select({
        completedAt: sql<Date | null>`max(${tripStops.completedAt})`.mapWith(tripStops.completedAt),
      })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

    await recordTripStatusChange(this.transaction, {
      actorUserId: input.actorUserId,
      channel: input.authorship.channel,
      companyId: input.companyId,
      fromStatus: tripRow.status,
      occurredAt: lastStop?.completedAt ?? input.at,
      onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
      toStatus: 'completed',
      tripId: input.tripId,
    })

    return true
  }

  /**
   * A trava (`FOR NO KEY UPDATE`) vem antes da leitura das notas, como em `recalculateTripStatus`
   * (`drizzle-trip-document.repository.ts`): a decisão depende do tally que ainda vai ser lido. A
   * ordem "notas → viagem" continua: a nota já foi gravada nesta transação.
   */
  public async advanceTripFromSettledDocuments(input: {
    readonly actorUserId: string
    readonly at: Date
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [tripRow] = await this.transaction
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .for('no key update')
      .limit(1)
    if (tripRow === undefined) return false

    const documentRows = await this.transaction
      .select({ status: tripDocuments.separationStatus })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.tripId, input.tripId),
          isNull(tripDocuments.releasedAt),
        ),
      )
    const nextStatus = deriveTripStatus({
      tally: tallyTripDocuments(documentRows.map((row) => row.status)),
      tripStatus: tripRow.status,
    })
    if (nextStatus !== TRIP_ON_DELIVERY_ROUTE_STATUS) return false

    await this.transaction
      .update(trips)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    await recordTripStatusChange(this.transaction, {
      actorUserId: input.actorUserId,
      channel: input.authorship.channel,
      companyId: input.companyId,
      fromStatus: tripRow.status,
      occurredAt: input.at,
      onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
      toStatus: nextStatus,
      tripId: input.tripId,
    })

    return true
  }

  public async recordOfficeAudit(input: TripFieldOfficeAuditInput): Promise<void> {
    await insertTripFieldOfficeAudit(this.transaction, input)
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
        reportedByDriverId: input.reportedByDriverId ?? null,
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
      bucket: this.bucket,
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
        accuracyMeters: input.accuracyMeters,
        actorUserId: input.actorUserId,
        attachmentKey: input.attachmentKey,
        capturedAt: input.capturedAt,
        channel: input.authorship.channel,
        companyId: input.companyId,
        id: input.id,
        kind: input.kind,
        latitude: input.latitude,
        longitude: input.longitude,
        objectId: input.objectId,
        onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
        punctuality: input.punctuality,
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
        /**
   * Repete o predicado do índice parcial (spec 182): sem ele o Postgres não acha o árbitro. Literal,
   * não parâmetro — com `$1` a inferência do índice falha do mesmo jeito.
   */
        targetWhere: sql`${tripDeliveryProofs.kind} <> ${sql.raw(inList([TRIP_DELIVERY_PROOF_CARGO_KIND]))}`,
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

  public async countProofsForEvent(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<number> {
    const [record] = await this.transaction
      .select({ total: sql<number>`count(*)::int` })
      .from(tripDeliveryProofs)
      .where(
        and(
          eq(tripDeliveryProofs.companyId, input.companyId),
          eq(tripDeliveryProofs.stopEventId, input.eventId),
          eq(tripDeliveryProofs.kind, input.kind),
        ),
      )

    return record?.total ?? 0
  }

  public async findProofExistsForEvent(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<boolean> {
    const [record] = await this.transaction
      .select({ id: tripDeliveryProofs.id })
      .from(tripDeliveryProofs)
      .where(
        and(
          eq(tripDeliveryProofs.companyId, input.companyId),
          eq(tripDeliveryProofs.stopEventId, input.eventId),
          eq(tripDeliveryProofs.kind, input.kind),
        ),
      )
      .limit(1)

    return record !== undefined
  }

  public async findDeliveryEventForProof(input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  }): Promise<{ readonly id: string } | null> {
    const [record] = await this.transaction
      .select({ id: tripStopEvents.id })
      .from(tripStopEvents)
      .innerJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, tripStopEvents.companyId),
          eq(tripDocuments.id, tripStopEvents.tripDocumentId),
        ),
      )
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .where(
        and(
          eq(tripStopEvents.companyId, input.companyId),
          eq(tripStopEvents.tripDocumentId, input.documentId),
          eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
          fieldTripTargetCondition(input.target),
          isNull(tripDocuments.releasedAt),
          inArray(trips.status, [...TRIP_DISPATCHED_STATUSES]),
        ),
      )
      .orderBy(desc(tripStopEvents.createdAt), desc(tripStopEvents.id))
      .limit(1)

    return record ?? null
  }

  public async findProofForEvent(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<{ readonly channel: TripFieldChannel; readonly objectId: string } | null> {
    const [record] = await this.transaction
      .select({ channel: tripDeliveryProofs.channel, objectId: tripDeliveryProofs.objectId })
      .from(tripDeliveryProofs)
      .where(
        and(
          eq(tripDeliveryProofs.companyId, input.companyId),
          eq(tripDeliveryProofs.stopEventId, input.eventId),
          eq(tripDeliveryProofs.kind, input.kind),
        ),
      )
      .limit(1)

    return record ?? null
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

  /** Mesmo desempate da nota do motorista e do snapshot: `created_at` e depois `id`. */
  public async findLatestEventForDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly kind: TripStopEventKind
  }) {
    const [event] = await this.transaction
      .select({ id: tripStopEvents.id })
      .from(tripStopEvents)
      .where(
        and(
          eq(tripStopEvents.companyId, input.companyId),
          eq(tripStopEvents.tripDocumentId, input.documentId),
          eq(tripStopEvents.kind, input.kind),
        ),
      )
      .orderBy(desc(tripStopEvents.createdAt), desc(tripStopEvents.id))
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

  /** Spec 179 T200: a mesma escrita que o galpão usa (`saveTripOccurrence`), dentro desta transação. */
  public async saveDocumentOccurrence(input: {
    readonly actorUserId: string
    readonly attachmentObjectId: string | null
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly stage: 'delivery'
    readonly tripId: string
    readonly typeName: string
  }): Promise<null | TripOccurrence> {
    return saveTripOccurrence(this.transaction, {
      actorUserId: input.actorUserId,
      attachmentObjectId: input.attachmentObjectId,
      authorship: input.authorship,
      companyId: input.companyId,
      documentId: input.documentId,
      note: input.note,
      occurrenceTypeId: input.occurrenceTypeId,
      productCode: input.productCode,
      stage: input.stage,
      tripId: input.tripId,
      typeName: input.typeName,
    })
  }

  public async findDocumentOccurrenceById(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | TripOccurrence> {
    const [occurrence] = await this.transaction
      .select({
        createdAt: tripDocumentOccurrences.createdAt,
        id: tripDocumentOccurrences.id,
        note: tripDocumentOccurrences.note,
        occurrenceTypeId: tripDocumentOccurrences.occurrenceTypeId,
        productCode: tripDocumentOccurrences.productCode,
        stage: tripDocumentOccurrences.stage,
        typeName: companyOccurrenceTypes.name,
      })
      .from(tripDocumentOccurrences)
      .innerJoin(
        companyOccurrenceTypes,
        and(
          eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
          eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
        ),
      )
      .where(
        and(
          eq(tripDocumentOccurrences.companyId, input.companyId),
          eq(tripDocumentOccurrences.id, input.occurrenceId),
        ),
      )
      .limit(1)
    if (occurrence === undefined) return null

    return {
      createdAt: occurrence.createdAt.toISOString(),
      id: occurrence.id,
      note: occurrence.note,
      occurrenceTypeId: occurrence.occurrenceTypeId,
      productCode: occurrence.productCode,
      stage: occurrence.stage,
      typeName: occurrence.typeName,
    }
  }
}
