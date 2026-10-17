/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D10): os responsáveis em cópia do e-mail à contratante escolhidos no tipo. Só entra quem está
 * na lista da empresa (267), e a FK composta com `CASCADE` tira do tipo quem sai dela. Roda na transação da
 * gravação do tipo, com o tipo já travado.
 */
import { and, eq, inArray } from 'drizzle-orm'

import {
  companyOccurrenceTypeWatchers,
  companyOccurrenceWatchers,
} from '../../database/database.schema.js'
import { OCCURRENCE_WATCHER_MAX_ACTIVE } from '../../contractor-mail/domain/occurrence-watcher.constant.js'
import {
  OccurrenceTypeWatcherInactiveError,
  OccurrenceTypeWatcherLimitError,
  OccurrenceTypeWatcherNotFoundError,
} from '../domain/occurrence-type-mail.error.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function readOccurrenceTypeWatcherUserIds(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<readonly string[]> {
  const rows = await queryable
    .select({ userId: companyOccurrenceTypeWatchers.userId })
    .from(companyOccurrenceTypeWatchers)
    .where(
      and(
        eq(companyOccurrenceTypeWatchers.companyId, params.companyId),
        eq(companyOccurrenceTypeWatchers.occurrenceTypeId, params.occurrenceTypeId),
      ),
    )
  return rows.map((row) => row.userId).toSorted()
}

/**
 * Substituição total da escolha. 404 para quem não está na lista da empresa (ou é de outra empresa); 400 para o
 * excesso e para o responsável **novo** inativo — o já escolhido continua, marcado, e não recebe.
 */
export async function replaceOccurrenceTypeMailWatchers(
  transaction: TripQueryable,
  params: {
    readonly actorUserId: string
    readonly companyId: string
    readonly occurrenceTypeId: string
    readonly userIds: readonly string[]
  },
): Promise<void> {
  const { companyId, occurrenceTypeId } = params
  const userIds = [...new Set(params.userIds)]
  if (userIds.length > OCCURRENCE_WATCHER_MAX_ACTIVE) throw new OccurrenceTypeWatcherLimitError()

  const current = new Set(await readOccurrenceTypeWatcherUserIds(transaction, params))
  if (userIds.length > 0) {
    const listed = await transaction
      .select({
        status: companyOccurrenceWatchers.status,
        userId: companyOccurrenceWatchers.userId,
      })
      .from(companyOccurrenceWatchers)
      .where(
        and(
          eq(companyOccurrenceWatchers.companyId, companyId),
          inArray(companyOccurrenceWatchers.userId, userIds),
        ),
      )
      .for('key share')
    if (listed.length !== userIds.length) throw new OccurrenceTypeWatcherNotFoundError()
    if (listed.some((row) => row.status !== 'active' && !current.has(row.userId))) {
      throw new OccurrenceTypeWatcherInactiveError()
    }
  }

  const removed = [...current].filter((userId) => !userIds.includes(userId))
  if (removed.length > 0) {
    await transaction
      .delete(companyOccurrenceTypeWatchers)
      .where(
        and(
          eq(companyOccurrenceTypeWatchers.companyId, companyId),
          eq(companyOccurrenceTypeWatchers.occurrenceTypeId, occurrenceTypeId),
          inArray(companyOccurrenceTypeWatchers.userId, removed),
        ),
      )
  }
  const added = userIds.filter((userId) => !current.has(userId))
  if (added.length > 0) {
    await transaction.insert(companyOccurrenceTypeWatchers).values(
      added.map((userId) => ({
        companyId,
        createdByUserId: params.actorUserId,
        occurrenceTypeId,
        userId,
      })),
    )
  }
}
