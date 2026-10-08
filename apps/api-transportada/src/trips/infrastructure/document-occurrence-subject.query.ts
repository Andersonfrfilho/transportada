/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b): de quem é a nota de uma ocorrência já registrada — o contratante (emitente
 * cadastrado) e o CNPJ do destinatário —, para resolver as exceções do tipo no servidor. Sem o recorte
 * de alcance do motorista (`findDriverReachableDocument`): a correção e o detalhe do escritório leem
 * ocorrência antiga, de viagem fechada ou de nota liberada.
 */
import { alias } from 'drizzle-orm/pg-core'
import { and, eq } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import { nfeParticipants, nfeProducts } from '../../database/nfe.schema.js'
import { tripDocuments } from '../../database/trip.schema.js'
import {
  EMITTER_PARTICIPANT_ROLE,
  RECIPIENT_PARTICIPANT_ROLE,
} from '../domain/delivery-event.constant.js'
import type { TripQueryable } from './trip-queryable.type.js'

const emitterParticipants = alias(nfeParticipants, 'occurrence_subject_emitter')

export type DocumentOccurrenceSubject = {
  readonly contractorId: null | string
  readonly recipientTaxId: null | string
}

export async function findDocumentOccurrenceSubject(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentId: string },
): Promise<DocumentOccurrenceSubject | null> {
  const [row] = await queryable
    .select({ contractorId: contractors.id, recipientTaxId: nfeParticipants.taxId })
    .from(tripDocuments)
    .leftJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
      ),
    )
    .leftJoin(
      emitterParticipants,
      and(
        eq(emitterParticipants.companyId, tripDocuments.companyId),
        eq(emitterParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(emitterParticipants.role, EMITTER_PARTICIPANT_ROLE),
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
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.documentId)),
    )
    .limit(1)

  return row === undefined
    ? null
    : { contractorId: row.contractorId, recipientTaxId: row.recipientTaxId }
}

/** Quantos produtos distintos a nota tem — a mesma conta do snapshot do motorista (um por código). */
export async function countDocumentProductCodes(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentId: string },
): Promise<number> {
  const rows = await queryable
    .select({ code: nfeProducts.code })
    .from(tripDocuments)
    .innerJoin(
      nfeProducts,
      and(
        eq(nfeProducts.companyId, tripDocuments.companyId),
        eq(nfeProducts.documentId, tripDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.documentId)),
    )
  return new Set(rows.map((row) => row.code.trim())).size
}
