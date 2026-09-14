/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 (D12): a nota da fila aparece também no conjunto normal da montagem. Ao entrar numa
 * viagem por **qualquer** caminho — vínculo, lote, bipe, aceite de proposta —, a entrada da fila
 * fecha como `relinked`, na mesma transação do vínculo.
 */
import { sql } from 'drizzle-orm'

import type { TripTransaction } from './trip-queryable.type.js'

/** Toda entrada pendente cuja nota tem vínculo vivo nesta viagem. */
export async function closePendingReviewsOnLink(
  transaction: TripTransaction,
  params: { readonly companyId: string; readonly tripId: string },
): Promise<void> {
  await transaction.execute(sql`
    update trip_document_reviews as review
    set status = 'relinked',
        resolved_at = now(),
        updated_at = now(),
        resolution_trip_id = link.trip_id,
        resolution_trip_document_id = link.id
    from trip_documents as link
    where review.company_id = ${params.companyId}
      and review.status = 'pending'
      and link.company_id = review.company_id
      and link.nfe_document_id = review.nfe_document_id
      and link.trip_id = ${params.tripId}
      and link.released_at is null
  `)
}

/** A mesma regra para um vínculo que nasce já solto (o aceite que vincula e solta, T7). */
export async function closePendingReviewOfDocument(
  transaction: TripTransaction,
  params: {
    readonly companyId: string
    readonly nfeDocumentId: string
    readonly tripDocumentId: string
    readonly tripId: string
  },
): Promise<void> {
  await transaction.execute(sql`
    update trip_document_reviews
    set status = 'relinked',
        resolved_at = now(),
        updated_at = now(),
        resolution_trip_id = ${params.tripId},
        resolution_trip_document_id = ${params.tripDocumentId}
    where company_id = ${params.companyId}
      and nfe_document_id = ${params.nfeDocumentId}
      and status = 'pending'
  `)
}
