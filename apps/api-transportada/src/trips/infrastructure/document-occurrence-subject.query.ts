/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b): de quem é a nota de uma ocorrência já registrada — o contratante (emitente
 * cadastrado) e o CNPJ do destinatário —, para resolver as exceções do tipo no servidor. Sem o recorte
 * de alcance do motorista (`findDriverReachableDocument`): a correção e o detalhe do escritório leem
 * ocorrência antiga, de viagem fechada ou de nota liberada.
 */
import { alias } from 'drizzle-orm/pg-core'
import { and, eq, inArray } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import { nfeParticipants, nfeProducts } from '../../database/nfe.schema.js'
import { tripDocuments } from '../../database/trip.schema.js'
import {
  EMITTER_PARTICIPANT_ROLE,
  RECIPIENT_PARTICIPANT_ROLE,
} from '../domain/delivery-event.constant.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'
import type { TripQueryable } from './trip-queryable.type.js'

const emitterParticipants = alias(nfeParticipants, 'occurrence_subject_emitter')

export type DocumentOccurrenceSubject = {
  readonly contractorId: null | string
  readonly recipientTaxId: null | string
}

export async function findDocumentOccurrenceSubject(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    /** Spec 270: o galpão confere que a nota é da viagem do pedido, não só da empresa. */
    readonly tripId?: string | undefined
  },
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
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        ...(input.tripId === undefined ? [] : [eq(tripDocuments.tripId, input.tripId)]),
      ),
    )
    .limit(1)

  return row === undefined
    ? null
    : { contractorId: row.contractorId, recipientTaxId: row.recipientTaxId }
}

/**
 * Spec 270 (D5): a contratante de cada nota pedida, numa consulta só. Nota que não é da empresa fica
 * fora do mapa (o chamador responde 404); nota sem contratante cadastrada fica com `null`.
 */
export async function findDocumentContractorIds(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentIds: readonly string[] },
): Promise<ReadonlyMap<string, null | string>> {
  if (input.documentIds.length === 0) return new Map()
  const rows = await queryable
    .select({ contractorId: contractors.id, documentId: tripDocuments.id })
    .from(tripDocuments)
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
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.id, [...input.documentIds]),
      ),
    )
  return new Map(rows.map((row) => [row.documentId, row.contractorId]))
}

/**
 * Spec 270 (D4/D5): o que as listas de rua passam ao filtro de escopo — a contratante de cada nota
 * pedida, na ordem do pedido; sem nota, `[null]` (só o tipo `all`). Nota fora da empresa é 404.
 */
export async function readNoteContractorIds(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly documentIds: readonly string[] },
): Promise<readonly (null | string)[]> {
  if (input.documentIds.length === 0) return [null]
  const contractorsByDocument = await findDocumentContractorIds(queryable, input)
  return input.documentIds.map((documentId) => {
    const contractorId = contractorsByDocument.get(documentId)
    if (contractorId === undefined) throw new TripDocumentNotFoundError()
    return contractorId
  })
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
