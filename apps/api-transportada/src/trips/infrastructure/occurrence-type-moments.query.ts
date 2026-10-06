/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.1b: leitura e escrita do conjunto de momentos de um tipo de ocorrência, sempre pela
 * empresa do contexto. A leitura é em lote — uma consulta para N tipos, nunca uma por tipo.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { companyOccurrenceTypeMoments } from '../../database/occurrence-type-moment.schema.js'
import type { OccurrenceMoment } from '../../shared/trip-occurrence.constant.js'
import {
  resolveOccurrenceTypeMoments,
  type OccurrenceStageAndFlow,
} from '../domain/occurrence-moment.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type ReadOccurrenceTypeMomentsParams = {
  readonly companyId: string
  readonly occurrenceTypeIds: readonly string[]
}

export type ReplaceOccurrenceTypeMomentsParams = {
  readonly companyId: string
  readonly moments: readonly OccurrenceMoment[]
  readonly occurrenceTypeId: string
}

/** O gravado, por tipo; tipo sem linha fica fora do mapa (a leitura tolerante decide). */
export async function readOccurrenceTypeMoments(
  queryable: TripQueryable,
  params: ReadOccurrenceTypeMomentsParams,
): Promise<ReadonlyMap<string, readonly OccurrenceMoment[]>> {
  if (params.occurrenceTypeIds.length === 0) return new Map()

  const rows = await queryable
    .select({
      moment: companyOccurrenceTypeMoments.moment,
      occurrenceTypeId: companyOccurrenceTypeMoments.occurrenceTypeId,
    })
    .from(companyOccurrenceTypeMoments)
    .where(
      and(
        eq(companyOccurrenceTypeMoments.companyId, params.companyId),
        inArray(companyOccurrenceTypeMoments.occurrenceTypeId, [...params.occurrenceTypeIds]),
      ),
    )
    .orderBy(asc(companyOccurrenceTypeMoments.occurrenceTypeId))

  const byType = new Map<string, OccurrenceMoment[]>()
  for (const row of rows) {
    const moments = byType.get(row.occurrenceTypeId) ?? []
    moments.push(row.moment)
    byType.set(row.occurrenceTypeId, moments)
  }
  return byType
}

export type WithOccurrenceTypeMomentsParams<TRecord> = {
  readonly companyId: string
  readonly records: readonly TRecord[]
}

/**
 * Os tipos lidos, cada um com o conjunto resolvido pela leitura tolerante — o gravado, ou os
 * derivados de `stage`/`flow` para tipo sem linha. Uma consulta para a lista inteira.
 */
export async function withOccurrenceTypeMoments<
  TRecord extends OccurrenceStageAndFlow & { readonly id: string },
>(
  queryable: TripQueryable,
  params: WithOccurrenceTypeMomentsParams<TRecord>,
): Promise<readonly (TRecord & { readonly moments: readonly OccurrenceMoment[] })[]> {
  const byType = await readOccurrenceTypeMoments(queryable, {
    companyId: params.companyId,
    occurrenceTypeIds: params.records.map((record) => record.id),
  })
  return params.records.map((record) => ({
    ...record,
    moments: resolveOccurrenceTypeMoments({ ...record, moments: byType.get(record.id) }),
  }))
}

/** Substituição total, como o `PUT` de exceções: o conjunto enviado é o que passa a valer. */
export async function replaceOccurrenceTypeMoments(
  queryable: TripQueryable,
  params: ReplaceOccurrenceTypeMomentsParams,
): Promise<void> {
  await queryable
    .delete(companyOccurrenceTypeMoments)
    .where(
      and(
        eq(companyOccurrenceTypeMoments.companyId, params.companyId),
        eq(companyOccurrenceTypeMoments.occurrenceTypeId, params.occurrenceTypeId),
      ),
    )
  if (params.moments.length === 0) return

  await queryable.insert(companyOccurrenceTypeMoments).values(
    params.moments.map((moment) => ({
      companyId: params.companyId,
      moment,
      occurrenceTypeId: params.occurrenceTypeId,
    })),
  )
}
