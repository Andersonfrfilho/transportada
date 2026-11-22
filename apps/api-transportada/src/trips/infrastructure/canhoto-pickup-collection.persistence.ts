/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T4 (D4b, D5, RF6, CA04): a coleta de canhoto se fecha pelo canhoto da nota de origem.
 *
 * A foto que o motorista da viagem da coleta tira **é o canhoto da entrega de origem** (o comprovante `photo` do evento de
 * entrega da nota): é ele que a contratante, os relatórios e a conferência (220/222) já leem, e é por isso que a rotina
 * do worker o casa sem mudança — o comprovante está na viagem de origem, e a nota está entre as notas dela. A coleta não
 * tem comprovante próprio.
 *
 * Quem decide é a conferência do canhoto (escritor único `reviewCanhotoProof`): aprovado, a coleta aberta vira `collected`
 * e a ocorrência recebe `resolved` do `system` com a coleta como causa; reprovado, a coleta volta a `scheduled` (ou
 * `pending`, se a viagem dela já acabou) e a ocorrência resolvida recebe `reopened` do `system`. Tudo na transação da
 * conferência.
 *
 * Ordem das travas (ADR-0068 §2, a mesma da T3): viagem da coleta `FOR NO KEY UPDATE`, depois a coleta `FOR UPDATE`,
 * depois a ocorrência `FOR NO KEY UPDATE` (a ordem da 266). Nada aqui toca `trip_documents` (D3, CA03).
 */
import { and, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or } from 'drizzle-orm'

import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import {
  tripCanhotoPickups,
  tripDocuments,
  tripDrivers,
  TRIP_TERMINAL_STATUSES,
  trips,
  type TripDeliveryProofCanhotoReview,
  type TripStatus,
} from '../../database/trip.schema.js'
import {
  CANHOTO_PICKUP_OPEN_STATUSES,
  type CanhotoPickupStatus,
} from '../../shared/canhoto-pickup.constant.js'
import { isTripOpenForCanhotoPickup } from '../domain/canhoto-pickup.policy.js'
import {
  closePickupOnlyStop,
  collectOpenPickup,
  insertSystemResolutionEvent,
  lockOccurrence,
  lockPickupInOrder,
  readLatestResolutionKind,
  type CanhotoPickupSettlement,
} from './canhoto-pickup-settle.support.js'
import type { FieldAuthorship } from '../application/field-trip-target.types.js'
import { DrizzleDriverFieldReportTransaction } from './drizzle-driver-field-report.repository.js'
import type { TripDatabase, TripQueryable, TripTransaction } from './trip-queryable.type.js'

async function readTripStatus(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripStatus | undefined> {
  const [row] = await queryable
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  return row?.status
}

/**
 * Reprovado: a coleta que o canhoto fechou (`collected`) ou cuja foto esperava a conferência volta a esperar o canhoto —
 * `scheduled` na mesma viagem se ela segue aberta, senão `pending` para o escritório encaixar de novo. A ocorrência
 * resolvida reabre. Outra coleta já aberta na mesma entrega (uma ocorrência nova) impede reabrir a antiga: a nova vale.
 */
async function reopenPickup(
  queryable: TripQueryable,
  input: { readonly at: Date; readonly companyId: string; readonly documentId: string },
): Promise<CanhotoPickupSettlement> {
  const [candidate] = await queryable
    .select({ id: tripCanhotoPickups.id })
    .from(tripCanhotoPickups)
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.originTripDocumentId, input.documentId),
        or(
          eq(tripCanhotoPickups.status, 'collected'),
          and(
            eq(tripCanhotoPickups.status, 'scheduled'),
            isNotNull(tripCanhotoPickups.photoSentAt),
          ),
        ),
      ),
    )
    .orderBy(desc(tripCanhotoPickups.updatedAt), desc(tripCanhotoPickups.id))
    .limit(1)
  if (candidate === undefined) return { kind: 'none' }

  const pickup = await lockPickupInOrder(queryable, {
    companyId: input.companyId,
    pickupId: candidate.id,
  })
  if (pickup === null) return { kind: 'none' }
  const waitingReview = pickup.status === 'scheduled' && pickup.photoSentAt !== null
  if (pickup.status !== 'collected' && !waitingReview) return { kind: 'none' }

  if (pickup.status === 'collected') {
    const [otherOpen] = await queryable
      .select({ id: tripCanhotoPickups.id })
      .from(tripCanhotoPickups)
      .where(
        and(
          eq(tripCanhotoPickups.companyId, input.companyId),
          eq(tripCanhotoPickups.originTripDocumentId, input.documentId),
          inArray(tripCanhotoPickups.status, [...CANHOTO_PICKUP_OPEN_STATUSES]),
        ),
      )
      .limit(1)
    if (otherOpen !== undefined) return { kind: 'none' }
  }

  const tripStatus =
    pickup.pickupTripId === null
      ? undefined
      : await readTripStatus(queryable, {
          companyId: input.companyId,
          tripId: pickup.pickupTripId,
        })
  const staysScheduled = tripStatus !== undefined && isTripOpenForCanhotoPickup(tripStatus)
  const status: CanhotoPickupStatus = staysScheduled ? 'scheduled' : 'pending'
  await queryable
    .update(tripCanhotoPickups)
    .set({
      collectedAt: null,
      photoSentAt: null,
      status,
      updatedAt: input.at,
      ...(staysScheduled ? {} : { pickupStopId: null, pickupTripId: null }),
    })
    .where(
      and(eq(tripCanhotoPickups.companyId, input.companyId), eq(tripCanhotoPickups.id, pickup.id)),
    )

  const occurrence = await lockOccurrence(queryable, {
    companyId: input.companyId,
    occurrenceId: pickup.occurrenceId,
  })
  if (occurrence === undefined || occurrence.cancelled) {
    return { kind: 'reopened', pickupId: pickup.id, reopenedOccurrence: false, status }
  }
  const latest = await readLatestResolutionKind(queryable, {
    companyId: input.companyId,
    occurrenceId: pickup.occurrenceId,
  })
  if (latest !== 'resolved') {
    return { kind: 'reopened', pickupId: pickup.id, reopenedOccurrence: false, status }
  }
  await insertSystemResolutionEvent(queryable, {
    companyId: input.companyId,
    kind: 'reopened',
    occurrenceId: pickup.occurrenceId,
    pickupId: pickup.id,
  })
  return { kind: 'reopened', pickupId: pickup.id, reopenedOccurrence: true, status }
}

/**
 * Chamado pela conferência do canhoto, na transação dela, depois de gravar o veredito do canhoto da nota `documentId`
 * (o vínculo de origem). `pending` (leitura sem casamento) não mexe na coleta.
 */
export async function settleCanhotoPickupOnReview(
  queryable: TripQueryable,
  input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
    readonly review: TripDeliveryProofCanhotoReview
  },
): Promise<CanhotoPickupSettlement> {
  if (input.review === 'approved') return collectOpenPickup(queryable, input)
  if (input.review === 'rejected') return reopenPickup(queryable, input)
  return { kind: 'none' }
}

/** A coleta encaixada numa viagem do motorista, do jeito que a foto dela precisa. */
export type { CanhotoPickupSettlement }

export type DriverCanhotoPickup = {
  readonly id: string
  readonly originTripDocumentId: string
  readonly originTripId: string
  readonly pickupStopId: null | string
  readonly pickupTripId: string
}

/**
 * Spec 321 T4 (D4b): a coleta `scheduled` numa viagem em que o motorista está na tripulação. É o recorte BOLA da rota
 * da foto: o id da coleta vem do cliente, e coleta de outra empresa, de viagem alheia, não encaixada ou já fechada
 * responde como inexistente. A viagem pode já ter concluído: a coleta cuja foto foi enviada continua encaixada nela.
 */
export async function findDriverCanhotoPickup(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly driverId: string; readonly pickupId: string },
): Promise<DriverCanhotoPickup | null> {
  const [row] = await queryable
    .select({
      id: tripCanhotoPickups.id,
      originTripDocumentId: tripCanhotoPickups.originTripDocumentId,
      originTripId: tripDocuments.tripId,
      pickupStopId: tripCanhotoPickups.pickupStopId,
      pickupTripId: tripCanhotoPickups.pickupTripId,
    })
    .from(tripCanhotoPickups)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripCanhotoPickups.companyId),
        eq(tripDocuments.id, tripCanhotoPickups.originTripDocumentId),
      ),
    )
    .innerJoin(
      tripDrivers,
      and(
        eq(tripDrivers.companyId, tripCanhotoPickups.companyId),
        eq(tripDrivers.tripId, tripCanhotoPickups.pickupTripId),
        eq(tripDrivers.driverId, input.driverId),
      ),
    )
    .innerJoin(
      trips,
      and(
        eq(trips.companyId, tripCanhotoPickups.companyId),
        eq(trips.id, tripCanhotoPickups.pickupTripId),
      ),
    )
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.id, input.pickupId),
        eq(tripCanhotoPickups.status, 'scheduled'),
        ne(trips.status, 'cancelled'),
      ),
    )
    .limit(1)
  if (row === undefined || row.pickupTripId === null) return null
  return { ...row, pickupTripId: row.pickupTripId }
}

/**
 * Depois que a foto virou o canhoto da nota de origem: marca a coleta (`photo_sent_at`, uma vez), fecha a parada só de
 * coleta e, se ela era a última aberta, conclui a viagem pelo mesmo escritor das paradas (`completeTripIfSettled`, que
 * grava `trip_status_events`). A coleta com foto não volta a `pending` com o fim da viagem. Idempotente: o reenvio da
 * mesma foto chega aqui de novo e não muda nada.
 */
export async function recordCanhotoPickupPhotoSent(
  database: TripDatabase,
  input: {
    readonly actorUserId: string
    readonly at: Date
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly pickupId: string
  },
): Promise<{ readonly stopClosed: boolean; readonly tripCompleted: boolean }> {
  return database.transaction(async (transaction: TripTransaction) => {
    const pickup = await lockPickupInOrder(transaction, input)
    if (pickup === null || pickup.pickupTripId === null) {
      return { stopClosed: false, tripCompleted: false }
    }
    if (pickup.status === 'scheduled' && pickup.photoSentAt === null) {
      await transaction
        .update(tripCanhotoPickups)
        .set({ photoSentAt: input.at, updatedAt: input.at })
        .where(
          and(
            eq(tripCanhotoPickups.companyId, input.companyId),
            eq(tripCanhotoPickups.id, pickup.id),
          ),
        )
    }
    const stopClosed =
      pickup.pickupStopId === null
        ? false
        : await closePickupOnlyStop(transaction, {
            at: input.at,
            companyId: input.companyId,
            pickupId: pickup.id,
            stopId: pickup.pickupStopId,
          })
    const tripCompleted = stopClosed
      ? await new DrizzleDriverFieldReportTransaction(transaction, '').completeTripIfSettled({
          actorUserId: input.actorUserId,
          at: input.at,
          authorship: input.authorship,
          companyId: input.companyId,
          tripId: pickup.pickupTripId,
        })
      : false
    return { stopClosed, tripCompleted }
  })
}

/** O que o bot precisa para oferecer a coleta como "nota aberta" do motorista (D4b). */
export type DriverScheduledCanhotoPickup = {
  readonly city: string | undefined
  readonly documentNumber: string
  readonly originTripDocumentId: string
  readonly pickupId: string
  readonly pickupStopId: null | string
  readonly recipientName: string | undefined
}

/**
 * Spec 321 T4 (D4b): as coletas `scheduled` ainda sem foto nas viagens não finalizadas em que o motorista está na
 * tripulação — o conjunto novo que o casamento do canhoto do bot considera, além das notas abertas da viagem. Uma
 * consulta só, com a empresa em toda junção.
 */
export async function listDriverScheduledCanhotoPickups(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly driverId: string },
): Promise<readonly DriverScheduledCanhotoPickup[]> {
  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      documentNumber: nfeDocuments.number,
      originTripDocumentId: tripCanhotoPickups.originTripDocumentId,
      pickupId: tripCanhotoPickups.id,
      pickupStopId: tripCanhotoPickups.pickupStopId,
      recipientLegalName: nfeParticipants.legalName,
      recipientTradeName: nfeParticipants.tradeName,
    })
    .from(tripCanhotoPickups)
    .innerJoin(
      tripDrivers,
      and(
        eq(tripDrivers.companyId, tripCanhotoPickups.companyId),
        eq(tripDrivers.tripId, tripCanhotoPickups.pickupTripId),
        eq(tripDrivers.driverId, input.driverId),
      ),
    )
    .innerJoin(
      trips,
      and(
        eq(trips.companyId, tripCanhotoPickups.companyId),
        eq(trips.id, tripCanhotoPickups.pickupTripId),
      ),
    )
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripCanhotoPickups.companyId),
        eq(tripDocuments.id, tripCanhotoPickups.originTripDocumentId),
      ),
    )
    .innerJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, nfeDocuments.companyId),
        eq(nfeParticipants.documentId, nfeDocuments.id),
        eq(nfeParticipants.role, 'recipient'),
      ),
    )
    .leftJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(tripCanhotoPickups.companyId, input.companyId),
        eq(tripCanhotoPickups.status, 'scheduled'),
        isNull(tripCanhotoPickups.photoSentAt),
        notInArray(trips.status, [...TRIP_TERMINAL_STATUSES]),
      ),
    )
    .orderBy(tripCanhotoPickups.createdAt, tripCanhotoPickups.id)
  return rows.map((row) => ({
    city: row.city ?? undefined,
    documentNumber: row.documentNumber,
    originTripDocumentId: row.originTripDocumentId,
    pickupId: row.pickupId,
    pickupStopId: row.pickupStopId,
    recipientName: (row.recipientTradeName ?? row.recipientLegalName)?.trim() || undefined,
  }))
}

/** Spec 321 T4: as portas da coleta para o caso de uso da foto (app e WhatsApp) e para o bot. */
export function createDrizzleCanhotoPickupCollection(database: TripDatabase) {
  return {
    findDriverPickup: (input: {
      readonly companyId: string
      readonly driverId: string
      readonly pickupId: string
    }) => findDriverCanhotoPickup(database, input),
    listScheduled: (input: { readonly companyId: string; readonly driverId: string }) =>
      listDriverScheduledCanhotoPickups(database, input),
    recordPhotoSent: (input: Parameters<typeof recordCanhotoPickupPhotoSent>[1]) =>
      recordCanhotoPickupPhotoSent(database, input),
  }
}
