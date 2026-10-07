/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T4.7): o que a ocorrência gravou e o modelo de e-mail imprime — número do documento do
 * cliente, valor pago, o formato da linha de item do tipo e as linhas de item. Duas consultas, uma
 * por ocorrência registrada; nunca em laço.
 */
import { and, asc, eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
} from '../../database/trip.schema.js'
import type { StoredOccurrenceLine } from '../domain/occurrence-template-lines.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type StoredOccurrenceTemplateSource = {
  readonly declaredAmount: null | string
  readonly emailItemLineTemplate: string
  readonly lines: readonly StoredOccurrenceLine[]
  readonly referenceNumber: null | string
}

export async function readStoredOccurrenceTemplateSource(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<StoredOccurrenceTemplateSource | null> {
  const [[occurrence], lines] = await Promise.all([
    queryable
      .select({
        declaredAmount: tripDocumentOccurrences.declaredAmount,
        emailItemLineTemplate: companyOccurrenceTypes.emailItemLineTemplate,
        referenceNumber: tripDocumentOccurrences.referenceNumber,
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
      .limit(1),
    queryable
      .select({
        declaredAmount: tripDocumentOccurrenceProducts.declaredAmount,
        position: tripDocumentOccurrenceProducts.position,
        productCode: tripDocumentOccurrenceProducts.productCode,
        quantity: tripDocumentOccurrenceProducts.quantity,
        quantityUnit: tripDocumentOccurrenceProducts.quantityUnit,
        unitValue: tripDocumentOccurrenceProducts.unitValue,
      })
      .from(tripDocumentOccurrenceProducts)
      .where(
        and(
          eq(tripDocumentOccurrenceProducts.companyId, input.companyId),
          eq(tripDocumentOccurrenceProducts.occurrenceId, input.occurrenceId),
        ),
      )
      .orderBy(asc(tripDocumentOccurrenceProducts.position)),
  ])
  if (occurrence === undefined) return null

  return { ...occurrence, lines }
}
