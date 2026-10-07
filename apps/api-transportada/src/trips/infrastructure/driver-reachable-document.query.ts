/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { alias } from 'drizzle-orm/pg-core'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import {
  EMITTER_PARTICIPANT_ROLE,
  RECIPIENT_PARTICIPANT_ROLE,
} from '../domain/delivery-event.constant.js'
import type { FieldTripTarget } from '../application/field-trip-target.types.js'
import { PROOF_REACHABLE_TRIP_STATUSES } from './drizzle-delivery-proof.repository.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** O papel do destinatário e do emitente em `nfe_participants` — os mesmos literais do snapshot. */
const RECIPIENT_ROLE = RECIPIENT_PARTICIPANT_ROLE
const EMITTER_ROLE = EMITTER_PARTICIPANT_ROLE
const emitterParticipants = alias(nfeParticipants, 'reachable_document_emitter')

/**
 * Spec 079: a nota que **este motorista** está levando agora — ou, pelo escritório (spec 156), a
 * nota da viagem que ele resolveu.
 *
 * ⚠️ O recorte é o mesmo de `findReachableDocumentIds`: o alvo (`fieldTripTargetCondition`), viagem
 * em estado ativo e **só as vivas** — nota liberada (`released_at`) não está mais na viagem, mesmo
 * que a viagem continue ativa (spec 156 T8b.1). Nota de outra viagem, de viagem que já fechou, ou já
 * liberada desta mesma viagem, responde `null`, e o caso de uso a trata como inalcançável. É a
 * consulta que estreita o `trip.report` da empresa inteira para a carga que ele tem nas mãos; a
 * permissão sozinha não estreita nada.
 *
 * Spec 246 (RF6, D-b): devolve também o contratante (emitente cadastrado) e o CNPJ do destinatário
 * **da nota** — é com eles que a exceção do tipo é resolvida no registro, nunca com o corpo do pedido.
 *
 * ⚠️ `findDeliveryEventId` (`drizzle-delivery-proof.repository.ts`) **não** filtra `released_at` —
 * ela busca o evento de uma entrega que já aconteceu, e o comprovante continua válido mesmo que a
 * nota seja liberada depois. Os dois têm o mesmo alvo e o mesmo recorte de viagem ativa, mas não o
 * mesmo recorte de `released_at`; o comentário anterior os igualava por engano.
 */
export async function findDriverReachableDocument(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  },
): Promise<null | {
  readonly contractorId: null | string
  readonly recipientTaxId: null | string
  readonly tripId: string
}> {
  const [row] = await queryable
    .select({
      contractorId: contractors.id,
      recipientTaxId: nfeParticipants.taxId,
      tripId: tripDocuments.tripId,
    })
    .from(tripDocuments)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .leftJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, RECIPIENT_ROLE),
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
        eq(tripDocuments.id, input.documentId),
        isNull(tripDocuments.releasedAt),
        fieldTripTargetCondition(input.target),
        inArray(trips.status, [...PROOF_REACHABLE_TRIP_STATUSES]),
      ),
    )
    .limit(1)

  return row === undefined
    ? null
    : {
        contractorId: row.contractorId,
        recipientTaxId: row.recipientTaxId,
        tripId: row.tripId,
      }
}
