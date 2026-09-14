/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: o banco é quem decide a corrida da fila — uma entrada pendente por nota, uma entrada
 * por vínculo solto, e nenhum destino sem carimbo.
 */
import { SQL } from 'bun'

import { expectQueryToFail } from './support.js'

type ReviewFixture = {
  readonly companyId: string
  readonly database: SQL
  readonly nfeDocumentId: string
  readonly tripDocumentId: string
  readonly tripId: string
  readonly userId: string
}

export async function assertTripDocumentReviewConstraints(input: ReviewFixture): Promise<void> {
  const { companyId, database, nfeDocumentId, tripDocumentId, tripId, userId } = input
  const reviewId = crypto.randomUUID()
  const layoutId = crypto.randomUUID()

  await database`
    insert into trip_document_reviews (
      id, company_id, nfe_document_id, source_trip_id, source_trip_document_id, reason, layout_id,
      input_hash, created_by
    )
    values (
      ${reviewId}, ${companyId}, ${nfeDocumentId}, ${tripId}, ${tripDocumentId}, 'bedFull',
      ${layoutId}, 'hash', ${userId}
    )
  `

  await expectQueryToFail(
    database`
      insert into trip_document_reviews (
        company_id, nfe_document_id, source_trip_id, source_trip_document_id, reason, layout_id,
        input_hash, created_by
      )
      values (${companyId}, ${nfeDocumentId}, ${tripId}, ${tripDocumentId}, 'bedFull', ${layoutId}, 'hash', ${userId})
    `,
    '23505',
    'trip_document_reviews_company_source_trip_document_unique',
  )

  const releasedLinkId = crypto.randomUUID()
  await database`
    insert into trip_documents (id, company_id, trip_id, nfe_document_id, released_at)
    values (${releasedLinkId}, ${companyId}, ${tripId}, ${nfeDocumentId}, now())
  `
  await expectQueryToFail(
    database`
      insert into trip_document_reviews (
        company_id, nfe_document_id, source_trip_id, source_trip_document_id, reason, created_by
      )
      values (${companyId}, ${nfeDocumentId}, ${tripId}, ${releasedLinkId}, 'swapped_out', ${userId})
    `,
    '23505',
    'trip_document_reviews_pending_nfe_document_unique',
  )

  await expectQueryToFail(
    database`update trip_document_reviews set status = 'moved' where id = ${reviewId}`,
    '23514',
    'trip_document_reviews_resolution_check',
  )
  await expectQueryToFail(
    database`
      update trip_document_reviews
      set status = 'swapped_in', resolved_at = now(), resolution_trip_id = ${tripId}
      where id = ${reviewId}
    `,
    '23514',
    'trip_document_reviews_swap_check',
  )
  await expectQueryToFail(
    database`
      update trip_document_reviews
      set status = 'lost', resolved_at = now(), resolution_trip_id = ${tripId}
      where id = ${reviewId}
    `,
    '23514',
    'trip_document_reviews_status_check',
  )
  await expectQueryToFail(
    database`update trip_document_reviews set layout_id = null where id = ${reviewId}`,
    '23514',
    'trip_document_reviews_layout_check',
  )

  await database`
    update trip_document_reviews
    set status = 'moved', resolved_at = now(), resolution_trip_id = ${tripId}, resolved_by = ${userId}
    where id = ${reviewId}
  `
  await database`
    insert into trip_document_reviews (
      company_id, nfe_document_id, source_trip_id, source_trip_document_id, reason, created_by
    )
    values (${companyId}, ${nfeDocumentId}, ${tripId}, ${releasedLinkId}, 'swapped_out', ${userId})
  `
}
