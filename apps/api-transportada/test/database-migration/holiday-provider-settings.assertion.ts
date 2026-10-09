/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  BUDGET_MAX,
  BUDGET_MIN,
  COLUMN_NAMES,
  CONSTRAINT_NAMES,
  FERIADOS_API_PROVIDER,
  MIGRATION_SUFFIX,
  TABLE_NAME,
} from './holiday-provider-settings.constant.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const ENVELOPE = JSON.stringify({
  algorithm: 'A256GCM',
  ciphertext: 'c3ludGhldGljLWNpcGhlcnRleHQ',
  keyId: 'test-v1',
  nonce: 'c3ludGhldGljLW5vbmNl',
  version: 1,
})

export type HolidayProviderSettingsProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
}>

/**
 * Spec 262 T2.1 (CA1): a tabela existe com as dez colunas e os seis nomes explícitos; a CHECK da chave recusa
 * dica sem envelope, envelope sem dica, dica de 3 e de 5 caracteres, dica com espaço e envelope que não é objeto;
 * o orçamento fica em 1 a 1.000.000; só há uma linha por fornecedor; e o rollback tira só a tabela e a linha
 * do journal, sem recusar, e a migration volta a subir.
 */
export async function assertHolidayProviderSettings(
  probe: HolidayProviderSettingsProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error(`${MIGRATION_SUFFIX} migration is required`)

  expect(await readColumnNames(database)).toEqual([...COLUMN_NAMES])
  expect(await readConstraintNames(database)).toEqual(Object.values(CONSTRAINT_NAMES).toSorted())
  await assertKeyConstraints(database)
  await assertBudgetVersionAndProvider(database)
  await assertRollbackAndReapply({ ...probe, directory })
}

async function readColumnNames(database: SQL): Promise<readonly string[]> {
  const rows = await database<Array<{ readonly column_name: string }>>`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = ${TABLE_NAME}
    order by ordinal_position
  `
  return rows.map((row) => row.column_name)
}

async function readConstraintNames(database: SQL): Promise<readonly string[]> {
  const rows = await database<Array<{ readonly conname: string }>>`
    select conname from pg_constraint
    where conrelid = to_regclass(${`public.${TABLE_NAME}`})
      and contype in ('c', 'p', 'u')
    order by conname
  `
  return rows.map((row) => row.conname)
}

function insertRow(
  database: SQL,
  fields: {
    readonly budget?: number
    readonly envelope?: string | null
    readonly hint?: string | null
    readonly provider?: string
    readonly tokenUpdatedAt?: string | null
    readonly version?: number
  },
): PromiseLike<unknown> {
  return database`
    insert into holiday_provider_settings
      (provider, token_envelope, token_hint, token_updated_at, monthly_request_budget, version, updated_by_user_id)
    values (
      ${fields.provider ?? FERIADOS_API_PROVIDER},
      ${fields.envelope ?? null}::text::jsonb,
      ${fields.hint ?? null},
      ${fields.tokenUpdatedAt ?? null}::timestamptz,
      ${fields.budget ?? 4500},
      ${fields.version ?? 1},
      ${crypto.randomUUID()}
    )
  `
}

async function clearRows(database: SQL): Promise<void> {
  await database`delete from holiday_provider_settings`
}

async function assertKeyConstraints(database: SQL): Promise<void> {
  const tokenCheck = CONSTRAINT_NAMES.tokenCheck
  const sealedAt = '2026-10-09T12:00:00Z'

  await insertRow(database, {})
  await clearRows(database)
  await insertRow(database, { envelope: ENVELOPE, hint: 'Z9!a', tokenUpdatedAt: sealedAt })
  await clearRows(database)

  const refused: ReadonlyArray<Parameters<typeof insertRow>[1]> = [
    { hint: 'abcd' },
    { envelope: ENVELOPE, tokenUpdatedAt: sealedAt },
    { envelope: ENVELOPE, hint: 'abcd' },
    { envelope: ENVELOPE, hint: 'abc', tokenUpdatedAt: sealedAt },
    { envelope: ENVELOPE, hint: 'abcde', tokenUpdatedAt: sealedAt },
    { envelope: ENVELOPE, hint: 'ab d', tokenUpdatedAt: sealedAt },
    { envelope: ENVELOPE, hint: 'abcé', tokenUpdatedAt: sealedAt },
    { envelope: '[]', hint: 'abcd', tokenUpdatedAt: sealedAt },
    { envelope: '"sealed"', hint: 'abcd', tokenUpdatedAt: sealedAt },
    { tokenUpdatedAt: sealedAt },
  ]
  for (const fields of refused) {
    await expectQueryToFail(insertRow(database, fields), CHECK_VIOLATION, tokenCheck)
  }
}

async function assertBudgetVersionAndProvider(database: SQL): Promise<void> {
  for (const budget of [BUDGET_MIN - 1, BUDGET_MAX + 1, -5]) {
    await expectQueryToFail(
      insertRow(database, { budget }),
      CHECK_VIOLATION,
      CONSTRAINT_NAMES.budgetCheck,
    )
  }
  await insertRow(database, { budget: BUDGET_MAX })
  await clearRows(database)
  await insertRow(database, { budget: BUDGET_MIN })
  await clearRows(database)

  await expectQueryToFail(
    insertRow(database, { version: 0 }),
    CHECK_VIOLATION,
    CONSTRAINT_NAMES.versionCheck,
  )
  await expectQueryToFail(
    insertRow(database, { provider: 'other-provider' }),
    CHECK_VIOLATION,
    CONSTRAINT_NAMES.providerCheck,
  )

  await insertRow(database, {})
  await expectQueryToFail(
    insertRow(database, {}),
    UNIQUE_VIOLATION,
    CONSTRAINT_NAMES.providerUnique,
  )
  await clearRows(database)
}

async function assertRollbackAndReapply(
  probe: HolidayProviderSettingsProbe & { readonly directory: string },
): Promise<void> {
  const { database, directory } = probe
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  // D11: com uma chave gravada o rollback ainda roda, porque a chave se reemite no fornecedor.
  await insertRow(database, {
    envelope: ENVELOPE,
    hint: 'abcd',
    tokenUpdatedAt: '2026-10-09T12:00:00Z',
  })
  await database.unsafe(rollback)
  expect(await readColumnNames(database)).toEqual([])
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readColumnNames(database)).toEqual([...COLUMN_NAMES])
  expect(await readConstraintNames(database)).toEqual(Object.values(CONSTRAINT_NAMES).toSorted())
}
