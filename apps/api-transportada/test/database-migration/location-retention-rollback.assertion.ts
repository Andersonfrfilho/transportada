/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239 T1.2: a configuração do expurgo da posição nasce desligada e com 90 dias, o banco recusa
 * prazo fora de 30–90 e expurgo ligado sem data de início, e o rollback recusa (em vez de apagar)
 * enquanto alguma empresa tiver decidido — e, sem linha, tira tabela e índices e sai do journal.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_location_retention_settings'
const SETTINGS_TABLE = 'company_location_retention_settings'

const COMPANY_INDEXES = [
  'trip_delivery_proofs_company_located_created_at_idx',
  'trip_document_occurrences_company_located_created_at_idx',
  'trip_status_events_company_located_recorded_at_idx',
  'trip_stop_events_company_located_created_at_idx',
  'trip_stop_occurrences_company_located_created_at_idx',
] as const

/** Os índices só por tempo vêm de migrations anteriores: o rollback desta não pode levá-los. */
const TIME_ONLY_INDEXES = [
  'trip_delivery_proofs_located_created_at_idx',
  'trip_document_occurrences_located_created_at_idx',
  'trip_status_events_located_recorded_at_idx',
  'trip_stop_events_located_created_at_idx',
  'trip_stop_occurrences_located_created_at_idx',
] as const

export type LocationRetentionRollbackProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

async function readIndexNames(database: SQL, names: readonly string[]): Promise<readonly string[]> {
  const rows = await database<{ indexname: string }[]>`
    select indexname from pg_indexes
    where schemaname = 'public' and indexname in ${database(names)}
    order by indexname
  `
  return rows.map((row) => row.indexname)
}

async function readTableExists(database: SQL): Promise<boolean> {
  const [row] = await database<{ present: boolean }[]>`
    select to_regclass(${`public.${SETTINGS_TABLE}`}) is not null as present
  `
  return row?.present ?? false
}

async function assertSettingsConstraints(probe: LocationRetentionRollbackProbe): Promise<void> {
  const { companyId, database, userId } = probe

  for (const retentionDays of [29, 91]) {
    await expectQueryToFail(
      database`
        insert into company_location_retention_settings (company_id, retention_days, updated_by_user_id)
        values (${companyId}, ${retentionDays}, ${userId})
      `,
      '23514',
      'company_location_retention_settings_retention_days_check',
    )
  }
  await expectQueryToFail(
    database`
      insert into company_location_retention_settings (company_id, purge_enabled, updated_by_user_id)
      values (${companyId}, true, ${userId})
    `,
    '23514',
    'company_location_retention_settings_effective_at_check',
  )
  await expectQueryToFail(
    database`
      insert into company_location_retention_settings (company_id, updated_by_user_id)
      values (${crypto.randomUUID()}, ${userId})
    `,
    '23503',
    'company_location_retention_settings_company_id_companies_id_fk',
  )

  const [defaults] = await database<
    { purge_enabled: boolean; retention_days: number; purge_effective_at: Date | null }[]
  >`
    insert into company_location_retention_settings (company_id, updated_by_user_id)
    values (${companyId}, ${userId})
    returning purge_enabled, retention_days, purge_effective_at
  `
  expect(defaults).toEqual({ purge_enabled: false, retention_days: 90, purge_effective_at: null })

  await expectQueryToFail(
    database`
      insert into company_location_retention_settings (company_id, updated_by_user_id)
      values (${companyId}, ${userId})
    `,
    '23505',
    'company_location_retention_settings_pkey',
  )

  await database`
    update company_location_retention_settings
    set purge_enabled = true, retention_days = 30, purge_effective_at = now() + interval '24 hours'
    where company_id = ${companyId}
  `
}

export async function assertLocationRetentionRollbackRefusesRecordedSettings(
  probe: LocationRetentionRollbackProbe,
): Promise<void> {
  const { connectionString, database, directories } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('location_retention_settings is required')

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  expect(await readIndexNames(database, COMPANY_INDEXES)).toEqual([...COMPANY_INDEXES])
  await assertSettingsConstraints(probe)

  // O script abre `BEGIN` e a recusa deixa a transação abortada: o `ROLLBACK` tem de ir pela mesma
  // conexão, e ela volta ao pool mesmo se o script passar — senão o teste trava em vez de reprovar.
  const reserved = await database.reserve()
  let refusal: Error | undefined
  try {
    await reserved.unsafe(rollback)
  } catch (error) {
    refusal = error as Error
    await reserved.unsafe('ROLLBACK')
  } finally {
    reserved.release()
  }
  expect(refusal?.message).toContain('Rollback recusado')
  expect(refusal?.message).toContain(`${SETTINGS_TABLE} tem 1 linha(s)`)

  expect(await readTableExists(database)).toBeTrue()
  const [kept] = await database<{ remaining: number }[]>`
    select count(*)::int as remaining from company_location_retention_settings
  `
  expect(kept?.remaining).toBe(1)
  expect(await readIndexNames(database, COMPANY_INDEXES)).toEqual([...COMPANY_INDEXES])
  expect(await readMigrationNames(database)).toContain(directory)

  await database`delete from company_location_retention_settings`

  const clean = await database.reserve()
  await clean.unsafe(rollback)
  clean.release()

  expect(await readTableExists(database)).toBeFalse()
  expect(await readIndexNames(database, COMPANY_INDEXES)).toEqual([])
  expect(await readIndexNames(database, TIME_ONLY_INDEXES)).toEqual([...TIME_ONLY_INDEXES])
  expect(await readMigrationNames(database)).not.toContain(directory)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await readTableExists(database)).toBeTrue()
  expect(await readIndexNames(database, COMPANY_INDEXES)).toEqual([...COMPANY_INDEXES])
}
