/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { tripDocumentOccurrences } from '../../database/trip.schema.js'
import { formatAmountCents, parseAmountToCents } from '../domain/occurrence-amount.policy.js'
import type { TripOccurrenceDetail } from '../application/read-trip-occurrence-detail.use-case.js'
import type { TripOccurrenceFeedItem } from '../application/trip-occurrence-feed.use-case.js'
import { listOccurrenceProductLines } from './drizzle-occurrence-product.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

type RecordedValues = Pick<
  TripOccurrenceDetail,
  'declaredAmount' | 'itemValues' | 'referenceNumber'
>

const NO_RECORDED_VALUES: RecordedValues = {
  declaredAmount: null,
  itemValues: [],
  referenceNumber: null,
}

function formatStoredAmount(value: null | string): null | string {
  return value === null ? null : formatAmountCents(parseAmountToCents(value))
}

/**
 * Spec 247 (T7.2 R2): o que o registro gravou — o número do documento do cliente, o valor pago da
 * ocorrência e, por linha, o valor unitário copiado e o valor pago. Sem isso o escritório corrige às
 * cegas e a sugestão do acerto recalcularia pelo preço atual da nota em vez do copiado (D9).
 */
export async function findRecordedValues(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly item: TripOccurrenceFeedItem },
): Promise<RecordedValues> {
  if (input.item.source !== 'document') return NO_RECORDED_VALUES
  const [occurrence] = await queryable
    .select({
      declaredAmount: tripDocumentOccurrences.declaredAmount,
      referenceNumber: tripDocumentOccurrences.referenceNumber,
    })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.item.id),
      ),
    )
    .limit(1)
  if (occurrence === undefined) return NO_RECORDED_VALUES

  const lines = await listOccurrenceProductLines(queryable, {
    companyId: input.companyId,
    occurrenceId: input.item.id,
  })
  return {
    declaredAmount: formatStoredAmount(occurrence.declaredAmount),
    itemValues: lines.map((line) => ({
      declaredAmount: formatStoredAmount(line.declaredAmount),
      productCode: line.productCode,
      quantity: line.quantity,
      unitValue: line.unitValue,
    })),
    referenceNumber: occurrence.referenceNumber,
  }
}
