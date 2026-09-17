/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 RNF3 — a recarga roda numa transação cuja **primeira** instrução é a trava global e não
 * bloqueante do catálogo. Global porque o recurso disputado é `toll_booths`, não a linha do extrato:
 * dois extratos diferentes intercalariam upserts. Não bloqueante porque esperar estouraria o teto de
 * 10s da requisição — quem chega depois recebe 409 na hora. `FOR UPDATE` não serve (T101).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { auditLogs, tollBoothExtracts } from '../../database/database.schema.js'
import type {
  TollBoothCatalogReloadPort,
  TollBoothCatalogReloadWork,
} from '../application/toll-booth-catalog-reload.port.js'
import {
  TOLL_BOOTH_CATALOG_RELOAD_AUDIT_ACTION,
  TOLL_BOOTH_CATALOG_RELOAD_LOCK_ID,
  TOLL_BOOTH_EXTRACT_AUDIT_TARGET_TYPE,
} from '../application/toll-booth-catalog.constant.js'
import {
  TollBoothCatalogReloadInProgressError,
  TollBoothExtractNotFoundError,
} from '../domain/toll-booth-extract.error.js'
import { createDrizzleTollBoothRepository } from './drizzle-toll-booth.repository.js'
import { matchesKey } from './drizzle-toll-booth-extract.repository.js'

const SETTINGS_MANAGE_PERMISSION = 'settings.manage'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export function createDrizzleTollBoothCatalogReloadRepository(
  database: Database,
): TollBoothCatalogReloadPort {
  return {
    runExclusive(work) {
      return database.transaction(async (transaction) => {
        const rows = await transaction.execute<{ readonly acquired: boolean }>(
          sql`select pg_try_advisory_xact_lock(${TOLL_BOOTH_CATALOG_RELOAD_LOCK_ID}) as acquired`,
        )
        if (rows[0]?.acquired !== true) throw new TollBoothCatalogReloadInProgressError()

        return work(createWork(transaction))
      })
    },
  }
}

function createWork(transaction: Transaction): TollBoothCatalogReloadWork {
  const booths = createDrizzleTollBoothRepository(transaction)

  return {
    async insertAudit(input) {
      await transaction.insert(auditLogs).values({
        action: TOLL_BOOTH_CATALOG_RELOAD_AUDIT_ACTION,
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: input.entityId,
        entityType: TOLL_BOOTH_EXTRACT_AUDIT_TARGET_TYPE,
        metadata: input.metadata,
        permission: SETTINGS_MANAGE_PERMISSION,
        targetId: input.entityId,
        targetType: TOLL_BOOTH_EXTRACT_AUDIT_TARGET_TYPE,
      })
    },
    async markReloaded(input) {
      const [row] = await transaction
        .update(tollBoothExtracts)
        .set({
          missingObjectObservedAt: null,
          reloadedAt: sql`now()`,
          reloadedBoothCount: input.reloadedBoothCount,
          reloadedByUserId: input.reloadedByUserId,
        })
        .where(matchesKey(input))
        .returning({ reloadedAt: tollBoothExtracts.reloadedAt })
      if (row?.reloadedAt === undefined || row.reloadedAt === null) {
        throw new TollBoothExtractNotFoundError()
      }
      return { reloadedAt: row.reloadedAt }
    },
    readCatalogSummary: booths.readCatalogSummary,
    saveMany: booths.saveMany,
  }
}
