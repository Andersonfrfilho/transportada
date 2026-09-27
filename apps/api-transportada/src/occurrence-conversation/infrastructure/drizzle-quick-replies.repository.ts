/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12): as respostas rápidas no Postgres. Toda leitura e escrita filtra pela empresa
 * do contexto — o id sozinho nunca alcança a linha de outra empresa. A reordenação trava as linhas
 * do público antes de conferir o conjunto, para duas telas reordenando juntas não gravarem uma
 * mistura das duas.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, count, eq, sql } from 'drizzle-orm'

import { companyQuickReplies } from '../../database/database.schema.js'
import type {
  QuickRepliesTransactionPort,
  QuickRepliesUnitOfWorkPort,
} from '../application/quick-replies.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const RECORD = {
  active: companyQuickReplies.active,
  audience: companyQuickReplies.audience,
  bodyText: companyQuickReplies.bodyText,
  id: companyQuickReplies.id,
  position: companyQuickReplies.position,
}

function createTransactionPort(transaction: Transaction): QuickRepliesTransactionPort {
  return {
    async countByAudience({ audience, companyId }) {
      const [row] = await transaction
        .select({ total: count() })
        .from(companyQuickReplies)
        .where(
          and(
            eq(companyQuickReplies.companyId, companyId),
            eq(companyQuickReplies.audience, audience),
          ),
        )
      return row?.total ?? 0
    },

    async insert(input) {
      const [row] = await transaction
        .insert(companyQuickReplies)
        .values({
          audience: input.audience,
          bodyText: input.bodyText,
          companyId: input.companyId,
          position: input.position,
        })
        .returning(RECORD)
      if (row === undefined) throw new Error('quick reply was not inserted')
      return row
    },

    async list({ activeOnly, audience, companyId }) {
      return transaction
        .select(RECORD)
        .from(companyQuickReplies)
        .where(
          and(
            eq(companyQuickReplies.companyId, companyId),
            ...(audience === null ? [] : [eq(companyQuickReplies.audience, audience)]),
            ...(activeOnly ? [eq(companyQuickReplies.active, true)] : []),
          ),
        )
        .orderBy(
          asc(companyQuickReplies.audience),
          asc(companyQuickReplies.position),
          asc(companyQuickReplies.createdAt),
        )
    },

    async lockAudience({ audience, companyId }) {
      return transaction
        .select(RECORD)
        .from(companyQuickReplies)
        .where(
          and(
            eq(companyQuickReplies.companyId, companyId),
            eq(companyQuickReplies.audience, audience),
          ),
        )
        .orderBy(asc(companyQuickReplies.position))
        .for('update')
    },

    async setPositions({ companyId, positions }) {
      for (const { id, position } of positions) {
        await transaction
          .update(companyQuickReplies)
          .set({ position, updatedAt: sql`now()` })
          .where(and(eq(companyQuickReplies.companyId, companyId), eq(companyQuickReplies.id, id)))
      }
    },

    async update(input) {
      const [row] = await transaction
        .update(companyQuickReplies)
        .set({
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.bodyText === undefined ? {} : { bodyText: input.bodyText }),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(companyQuickReplies.companyId, input.companyId),
            eq(companyQuickReplies.id, input.id),
          ),
        )
        .returning(RECORD)
      return row ?? null
    },
  }
}

export function createDrizzleQuickRepliesUnitOfWork(
  database: Database,
): QuickRepliesUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}
