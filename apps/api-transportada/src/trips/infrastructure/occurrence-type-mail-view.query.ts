/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108): o bloco "E-mail à contratante" do tipo como o cadastro o lê — responsáveis em cópia e
 * destinatários escolhidos, em lote (uma leitura para N tipos, nunca uma por tipo). Nunca devolve endereço de
 * usuário da empresa: `eligible` diz se ele recebe.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { findOccurrenceWatcherUsers } from '../../contractor-mail/infrastructure/occurrence-watcher-directory.query.js'
import {
  companyOccurrenceTypeWatchers,
  companyOccurrenceWatchers,
} from '../../database/database.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type OccurrenceTypeMailWatcherView = {
  /** Vínculo ativo, `occurrences.resolve` e e-mail; falso fica marcado no editor e não recebe. */
  readonly eligible: boolean
  readonly name: string
  readonly status: 'active' | 'inactive'
  readonly userId: string
}

export async function readOccurrenceTypeMailWatchers(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly OccurrenceTypeMailWatcherView[]>> {
  if (params.occurrenceTypeIds.length === 0) return new Map()
  const rows = await queryable
    .select({
      occurrenceTypeId: companyOccurrenceTypeWatchers.occurrenceTypeId,
      status: companyOccurrenceWatchers.status,
      userId: companyOccurrenceTypeWatchers.userId,
    })
    .from(companyOccurrenceTypeWatchers)
    .innerJoin(
      companyOccurrenceWatchers,
      and(
        eq(companyOccurrenceWatchers.companyId, companyOccurrenceTypeWatchers.companyId),
        eq(companyOccurrenceWatchers.userId, companyOccurrenceTypeWatchers.userId),
      ),
    )
    .where(
      and(
        eq(companyOccurrenceTypeWatchers.companyId, params.companyId),
        inArray(companyOccurrenceTypeWatchers.occurrenceTypeId, [...params.occurrenceTypeIds]),
      ),
    )
  if (rows.length === 0) return new Map()

  const users = new Map(
    (
      await findOccurrenceWatcherUsers(queryable, {
        companyId: params.companyId,
        userIds: [...new Set(rows.map((row) => row.userId))],
      })
    ).map((user) => [user.userId, user]),
  )
  const byType = new Map<string, OccurrenceTypeMailWatcherView[]>()
  for (const row of rows) {
    const user = users.get(row.userId)
    const views = byType.get(row.occurrenceTypeId) ?? []
    views.push({
      eligible: user?.canResolve === true && user.address !== undefined,
      name: user?.name ?? '',
      status: row.status,
      userId: row.userId,
    })
    byType.set(row.occurrenceTypeId, views)
  }
  for (const views of byType.values()) {
    views.sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.userId.localeCompare(right.userId),
    )
  }
  return byType
}
