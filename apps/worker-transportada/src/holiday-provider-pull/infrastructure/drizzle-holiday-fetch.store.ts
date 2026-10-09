/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O adaptador Drizzle da busca. O cache é GLOBAL (sem `company_id`, ADR-0100 §3): a mesma cidade nunca
 * é paga duas vezes. Cada resposta boa grava as entradas, marca o que o fornecedor deixou de listar e
 * fecha o par numa transação só.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, gte, isNull, lte, notInArray, sql } from 'drizzle-orm'

import { holidayProviderEntries } from '../../database/holiday-provider.schema.js'
import type {
  HolidayFetchStore,
  SaveFetchSuccessParams,
} from '../application/holiday-fetch.port.js'
import { buildSuccessRecord } from '../domain/holiday-fetch-record.policy.js'
import type { FetchPair } from '../domain/holiday-fetch.types.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../domain/holiday-provider.constant.js'

import { upsertFetchRecords } from './drizzle-holiday-fetch-record.writer.js'
import {
  buildClaimBudgetQuery,
  buildDuePairsQuery,
  buildEnsureStatePairQuery,
  buildReadStatePairQuery,
} from './holiday-fetch.query.js'

export type HolidayFetchDatabase = ReturnType<typeof createDrizzleProvider>['db']

type Executor = Pick<HolidayFetchDatabase, 'insert' | 'update'>

type PairRow = {
  readonly attempts: number
  readonly ibge_code: string
  readonly scope: FetchPair['scope']
  readonly year: number
}

async function upsertEntries(executor: Executor, params: SaveFetchSuccessParams): Promise<void> {
  if (params.entries.length === 0) return

  await executor
    .insert(holidayProviderEntries)
    .values(
      params.entries.map((entry) => ({
        externalId: entry.externalId,
        holidayOn: entry.date,
        ibgeCode: entry.ibgeCode,
        isBanking: entry.isBanking,
        lastSeenAt: params.now,
        name: entry.name,
        providerType: entry.providerType,
        scope: entry.scope,
      })),
    )
    .onConflictDoUpdate({
      set: {
        externalId: sql`excluded.external_id`,
        isBanking: sql`excluded.is_banking`,
        lastSeenAt: sql`excluded.last_seen_at`,
        name: sql`excluded.name`,
        providerType: sql`excluded.provider_type`,
        // Se a data voltou a ser listada, o marcador de "o fornecedor removeu" sai.
        removedAt: sql`null`,
      },
      target: [
        holidayProviderEntries.scope,
        holidayProviderEntries.ibgeCode,
        holidayProviderEntries.holidayOn,
      ],
    })
}

/**
 * A data que o fornecedor deixou de listar ganha `removed_at`; a linha da empresa fica (ADR-0100 §4).
 * Só o escopo do próprio par, e só se a resposta listou alguma data dele: uma lista vazia por defeito
 * do fornecedor não pode marcar o ano inteiro como removido.
 */
async function markRemovedEntries(
  executor: Executor,
  params: SaveFetchSuccessParams,
): Promise<void> {
  const { pair } = params
  const listed = params.entries
    .filter((entry) => entry.scope === pair.scope && entry.ibgeCode === pair.ibgeCode)
    .map((entry) => entry.date)
  if (listed.length === 0) return

  await executor
    .update(holidayProviderEntries)
    .set({ removedAt: params.now })
    .where(
      and(
        eq(holidayProviderEntries.scope, pair.scope),
        eq(holidayProviderEntries.ibgeCode, pair.ibgeCode),
        gte(holidayProviderEntries.holidayOn, `${pair.year}-01-01`),
        lte(holidayProviderEntries.holidayOn, `${pair.year}-12-31`),
        isNull(holidayProviderEntries.removedAt),
        notInArray(holidayProviderEntries.holidayOn, listed),
      ),
    )
}

async function saveSuccess(
  database: HolidayFetchDatabase,
  params: SaveFetchSuccessParams,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await upsertEntries(transaction, params)
    await markRemovedEntries(transaction, params)

    const closed = [buildSuccessRecord(params)]
    if (params.stateCovered !== undefined) {
      const { stateCode, year } = params.stateCovered
      const pair = { attempts: 0, ibgeCode: stateCode, scope: HOLIDAY_PROVIDER_SCOPE.STATE, year }
      closed.push(
        buildSuccessRecord({ nextAttemptAt: params.nextAttemptAt, now: params.now, pair }),
      )
    }
    await upsertFetchRecords(transaction, closed)
  })
}

async function readStatePair(
  database: HolidayFetchDatabase,
  params: { readonly now: Date; readonly stateCode: string; readonly year: number },
): Promise<FetchPair | undefined> {
  await database.execute(buildEnsureStatePairQuery(params))
  const rows = await database.execute<{ attempts: number; is_due: boolean }>(
    buildReadStatePairQuery(params),
  )
  const [row] = [...rows]
  if (row === undefined || !row.is_due) return undefined

  return {
    attempts: Number(row.attempts),
    ibgeCode: params.stateCode,
    scope: HOLIDAY_PROVIDER_SCOPE.STATE,
    year: params.year,
  }
}

export function createDrizzleHolidayFetchStore(database: HolidayFetchDatabase): HolidayFetchStore {
  return {
    async claimBudget(input) {
      const rows = await database.execute(buildClaimBudgetQuery(input))
      return [...rows].length > 0
    },

    ensureStatePair: (params) => readStatePair(database, params),

    async listDuePairs(input) {
      const rows = await database.execute<PairRow>(buildDuePairsQuery(input))
      return [...rows].map((row) => ({
        attempts: Number(row.attempts),
        ibgeCode: row.ibge_code,
        scope: row.scope,
        year: Number(row.year),
      }))
    },

    recordFetches: (records) => upsertFetchRecords(database, records),

    saveSuccess: (params) => saveSuccess(database, params),
  }
}
