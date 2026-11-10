/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (Etapa 2): as escritas e leituras da cobrança no recebimento, sempre dentro da transação do registro da
 * parada (a mesma do `trip_field_reports`). Tudo filtra por `company_id` do contexto; nada vem do corpo além de ids
 * que já passaram pela política.
 *
 * - `listStopChargeDocuments`: as notas vivas da parada, com cliente (destinatário → `delivery_clients`) e
 *   contratante (emitente → `contractors`) resolvidos pela mesma junção de `findChargeParties` (spec 060/164).
 * - `recordReceivingCharges`: `delivery_charges` `receiving_charge`/`recorded`/`occurrence` + as notas da linha
 *   agrupada. `ON CONFLICT DO NOTHING` nos índices únicos parciais (E6): o reenvio não duplica.
 * - `recordStopOccurrencePhotos`: uma linha por vaga; o unique `(empresa, ocorrência, vaga)` segura o reenvio.
 * - `flagReceivingChargeClients`: E7, a primeira marca grava a origem; a repetida só atualiza a data.
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  contractors,
  deliveryChargeDocuments,
  deliveryCharges,
  deliveryClients,
  type DeliveryChargeStatus,
} from '../../database/delivery-client.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import {
  companyOccurrenceTypePhotoSlots,
  tripDocuments,
  tripStopOccurrencePhotos,
} from '../../database/trip.schema.js'
import type {
  ReceivingChargeLine,
  ReceivingChargeStopDocument,
} from '../domain/receiving-charge.policy.js'
import type {
  StopOccurrencePhotoSlot,
  StopOccurrenceSlotPhoto,
} from '../domain/stop-occurrence-photo-slots.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

const RECIPIENT_ROLE = 'recipient'
const EMITTER_ROLE = 'emitter'
const RECEIVING_CHARGE_TYPE = 'receiving_charge'
const RECEIVING_CHARGE_ORIGIN = 'occurrence'
const RECEIVING_CHARGE_STATUS = 'recorded' satisfies DeliveryChargeStatus

const emitterParticipants = alias(nfeParticipants, 'receiving_charge_emitter_participants')

/** E1: as vagas do tipo, na ordem em que o app as mostra. */
export async function listOccurrenceTypePhotoSlots(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<readonly StopOccurrencePhotoSlot[]> {
  return queryable
    .select({
      label: companyOccurrenceTypePhotoSlots.label,
      position: companyOccurrenceTypePhotoSlots.position,
      required: companyOccurrenceTypePhotoSlots.required,
      slotKey: companyOccurrenceTypePhotoSlots.slotKey,
    })
    .from(companyOccurrenceTypePhotoSlots)
    .where(
      and(
        eq(companyOccurrenceTypePhotoSlots.companyId, input.companyId),
        eq(companyOccurrenceTypePhotoSlots.occurrenceTypeId, input.occurrenceTypeId),
      ),
    )
    .orderBy(
      asc(companyOccurrenceTypePhotoSlots.position),
      asc(companyOccurrenceTypePhotoSlots.slotKey),
    )
}

export async function listStopChargeDocuments(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly stopId: string },
): Promise<readonly ReceivingChargeStopDocument[]> {
  return queryable
    .select({
      contractorId: contractors.id,
      deliveryClientId: deliveryClients.id,
      documentId: tripDocuments.id,
      tripId: tripDocuments.tripId,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, RECIPIENT_ROLE),
      ),
    )
    .leftJoin(
      deliveryClients,
      and(
        eq(deliveryClients.companyId, nfeParticipants.companyId),
        eq(deliveryClients.taxId, nfeParticipants.taxId),
      ),
    )
    .leftJoin(
      emitterParticipants,
      and(
        eq(emitterParticipants.companyId, tripDocuments.companyId),
        eq(emitterParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(emitterParticipants.role, EMITTER_ROLE),
      ),
    )
    .leftJoin(
      contractors,
      and(
        eq(contractors.companyId, emitterParticipants.companyId),
        eq(contractors.taxId, emitterParticipants.taxId),
      ),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.stopId, input.stopId),
        isNull(tripDocuments.releasedAt),
      ),
    )
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))
}

export async function recordStopOccurrencePhotos(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly photos: readonly StopOccurrenceSlotPhoto[]
    readonly stopOccurrenceId: string
  },
): Promise<void> {
  if (input.photos.length === 0) return
  await queryable
    .insert(tripStopOccurrencePhotos)
    .values(
      input.photos.map((photo) => ({
        companyId: input.companyId,
        objectId: photo.objectId,
        position: photo.position,
        slotKey: photo.slotKey,
        stopOccurrenceId: input.stopOccurrenceId,
      })),
    )
    .onConflictDoNothing({
      target: [
        tripStopOccurrencePhotos.companyId,
        tripStopOccurrencePhotos.stopOccurrenceId,
        tripStopOccurrencePhotos.slotKey,
      ],
    })
}

export async function recordReceivingCharges(
  queryable: TripQueryable,
  input: {
    readonly actorUserId: string
    readonly chargedOn: string
    readonly companyId: string
    readonly lines: readonly ReceivingChargeLine[]
    readonly proofObjectId: null | string
    readonly stopOccurrenceId: string
  },
): Promise<void> {
  for (const line of input.lines) {
    const values = {
      amount: line.amount,
      chargedOn: input.chargedOn,
      chargeType: RECEIVING_CHARGE_TYPE,
      companyId: input.companyId,
      contractorId: line.contractorId,
      deliveryClientId: line.deliveryClientId,
      groupedDocuments: line.grouped,
      origin: RECEIVING_CHARGE_ORIGIN,
      proofObjectId: input.proofObjectId,
      recordedByUserId: input.actorUserId,
      status: RECEIVING_CHARGE_STATUS,
      stopOccurrenceId: input.stopOccurrenceId,
      tripDocumentId: line.tripDocumentId,
      tripId: line.tripId,
    } as const
    const [inserted] = line.grouped
      ? await queryable
          .insert(deliveryCharges)
          .values(values)
          .onConflictDoNothing({
            target: [deliveryCharges.companyId, deliveryCharges.stopOccurrenceId],
            where: sql`${deliveryCharges.stopOccurrenceId} is not null and ${deliveryCharges.groupedDocuments}`,
          })
          .returning({ id: deliveryCharges.id })
      : await queryable
          .insert(deliveryCharges)
          .values(values)
          .onConflictDoNothing({
            target: [
              deliveryCharges.companyId,
              deliveryCharges.stopOccurrenceId,
              deliveryCharges.tripDocumentId,
            ],
            where: sql`${deliveryCharges.stopOccurrenceId} is not null and ${deliveryCharges.tripDocumentId} is not null`,
          })
          .returning({ id: deliveryCharges.id })

    if (inserted !== undefined && line.grouped) {
      await queryable
        .insert(deliveryChargeDocuments)
        .values(
          line.documentIds.map((tripDocumentId) => ({
            chargeId: inserted.id,
            companyId: input.companyId,
            tripDocumentId,
          })),
        )
        .onConflictDoNothing()
    }
  }
}

export async function flagReceivingChargeClients(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly deliveryClientIds: readonly string[]
    readonly stopOccurrenceId: string
  },
): Promise<void> {
  const ids = [...new Set(input.deliveryClientIds)]
  if (ids.length === 0) return
  await queryable
    .update(deliveryClients)
    .set({
      receivingChargeFlaggedAt: sql`now()`,
      receivingChargeSourceStopOccurrenceId: sql`coalesce(${deliveryClients.receivingChargeSourceStopOccurrenceId}, ${input.stopOccurrenceId}::uuid)`,
    })
    .where(and(eq(deliveryClients.companyId, input.companyId), inArray(deliveryClients.id, ids)))
}
