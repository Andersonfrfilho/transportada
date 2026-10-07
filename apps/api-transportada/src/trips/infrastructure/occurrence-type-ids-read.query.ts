/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3-api: os ids dos tipos da empresa, ativos e aposentados, numa consulta só. É a lista
 * de tipos que a leitura em lote das exceções agrupa — a tela filtra por ativo, a API não.
 */
import { asc, eq } from 'drizzle-orm'

import { companyOccurrenceTypes } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function listOccurrenceTypeIds(
  queryable: TripQueryable,
  input: { readonly companyId: string },
): Promise<readonly string[]> {
  const rows = await queryable
    .select({ id: companyOccurrenceTypes.id })
    .from(companyOccurrenceTypes)
    .where(eq(companyOccurrenceTypes.companyId, input.companyId))
    .orderBy(asc(companyOccurrenceTypes.stage), asc(companyOccurrenceTypes.name))
  return rows.map((row) => row.id)
}
