/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N2): o requisito efetivo do tipo para a ocorrência do detalhe. O contratante e o
 * destinatário são os da NOTA, lidos aqui no servidor; a resolução é a mesma da correção e do registro
 * (`resolveStoredOccurrenceRequirements`). `null` na ocorrência de parada (sem nota) e no tipo que não
 * existe mais.
 */
import { and, eq } from 'drizzle-orm'

import { tripDocumentOccurrences } from '../../database/trip.schema.js'
import { resolveStoredOccurrenceRequirements } from '../application/resolve-stored-occurrence-requirements.service.js'
import type { TripOccurrenceFeedItem } from '../application/trip-occurrence-feed.use-case.js'
import {
  buildOccurrenceDetailRequirements,
  type TripOccurrenceDetailRequirements,
} from '../domain/occurrence-detail-requirements.policy.js'
import { findOccurrenceType } from './delivery-proof-read.support.js'
import {
  countDocumentProductCodes,
  findDocumentOccurrenceSubject,
} from './document-occurrence-subject.query.js'
import { createOccurrenceTypeOverridesReader } from './occurrence-type-overrides-reader.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function findOccurrenceDetailRequirements(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly item: TripOccurrenceFeedItem },
): Promise<TripOccurrenceDetailRequirements | null> {
  if (input.item.source !== 'document') return null
  const [occurrence] = await queryable
    .select({
      occurrenceTypeId: tripDocumentOccurrences.occurrenceTypeId,
      tripDocumentId: tripDocumentOccurrences.tripDocumentId,
    })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.item.id),
      ),
    )
    .limit(1)
  if (occurrence === undefined || occurrence.tripDocumentId === null) return null

  const documentQuery = { companyId: input.companyId, documentId: occurrence.tripDocumentId }
  const [occurrenceType, subject, productCount] = await Promise.all([
    findOccurrenceType(queryable, {
      companyId: input.companyId,
      occurrenceTypeId: occurrence.occurrenceTypeId,
    }),
    findDocumentOccurrenceSubject(queryable, documentQuery),
    countDocumentProductCodes(queryable, documentQuery),
  ])
  if (occurrenceType === null || subject === null) return null

  const requirements = await resolveStoredOccurrenceRequirements({
    companyId: input.companyId,
    document: subject,
    occurrenceType,
    repository: createOccurrenceTypeOverridesReader(queryable),
  })
  return buildOccurrenceDetailRequirements({ productCount, requirements })
}
