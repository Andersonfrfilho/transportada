/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (ADR-0094 §10): o perfil guarda o hash do token e as duas listas (o token sem as
 * listas é recusado, e o hash é único por empresa); a prévia aceita `source = 'email'` só sem quem
 * enviou; o registro do e-mail é append-only e idempotente por mensagem; o rollback recusa enquanto
 * houver prévia por e-mail, e sem ela tira tudo e a migration volta.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_cargo_preview_email_intake'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const APPEND_ONLY = '55000'
const TOKEN_HASH = 'a'.repeat(64)

export type CargoPreviewEmailIntakeProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

async function runRollback(database: SQL, rollback: string): Promise<Error | undefined> {
  const reserved = await database.reserve()
  try {
    await reserved.unsafe(rollback)
    return undefined
  } catch (error) {
    await reserved.unsafe('ROLLBACK')
    return error as Error
  } finally {
    reserved.release()
  }
}

async function countIntakeObjects(database: SQL): Promise<number> {
  const [row] = await database<{ count: number }[]>`
    select (
      (select count(*) from information_schema.tables where table_name = 'cargo_preview_email_intakes') +
      (select count(*) from information_schema.columns
        where table_name = 'contractor_receiving_profiles' and column_name = 'preview_inbound_token_hash')
    )::int as count
  `
  return row?.count ?? 0
}

async function insertContractor(probe: CargoPreviewEmailIntakeProbe, taxId: string) {
  const id = crypto.randomUUID()
  await probe.database`
    insert into contractors (id, company_id, tax_id) values (${id}, ${probe.companyId}, ${taxId})
  `
  return id
}

async function assertProfileRules(probe: CargoPreviewEmailIntakeProbe, contractorIds: string[]) {
  const { database } = probe
  const [first, second] = contractorIds as [string, string]
  const setProfile = (
    contractorId: string,
    token: string | null,
    list: (string | null)[] | null,
  ) => {
    const literal =
      list === null
        ? null
        : `{${list.map((entry) => (entry === null ? 'NULL' : `"${entry}"`)).join(',')}}`
    return database`
      insert into contractor_receiving_profiles
        (company_id, contractor_id, preview_inbound_token_hash, preview_forwarder_allowlist, preview_sender_allowlist)
      values (${probe.companyId}, ${contractorId}, ${token}, ${literal}::text[], ${literal}::text[])
      on conflict (company_id, contractor_id) do update set
        preview_inbound_token_hash = excluded.preview_inbound_token_hash,
        preview_forwarder_allowlist = excluded.preview_forwarder_allowlist,
        preview_sender_allowlist = excluded.preview_sender_allowlist
    `
  }
  const inboundRule = 'contractor_receiving_profiles_preview_inbound_allowlists_check'
  await expectQueryToFail(setProfile(first, TOKEN_HASH, null), CHECK_VIOLATION, inboundRule)
  await expectQueryToFail(setProfile(first, 'xyz', ['a@b.com']), CHECK_VIOLATION)
  await expectQueryToFail(setProfile(first, null, []), CHECK_VIOLATION)
  await expectQueryToFail(setProfile(first, null, ['a b@x.com']), CHECK_VIOLATION)
  await expectQueryToFail(setProfile(first, null, ['<a@x.com>']), CHECK_VIOLATION)
  const allowlistRule = 'contractor_receiving_profiles_preview_forwarder_allowlist_check'
  await expectQueryToFail(setProfile(first, null, ['']), CHECK_VIOLATION, allowlistRule)
  await expectQueryToFail(setProfile(first, null, ['ab']), CHECK_VIOLATION, allowlistRule)
  await expectQueryToFail(setProfile(first, null, ['a@x.com', null]), CHECK_VIOLATION, allowlistRule)
  await expectQueryToFail(setProfile(first, null, [null]), CHECK_VIOLATION, allowlistRule)
  await expectQueryToFail(setProfile(first, null, ['a@x.com', '']), CHECK_VIOLATION, allowlistRule)
  await expectQueryToFail(setProfile(first, null, ['abc|def@x.com']), CHECK_VIOLATION, allowlistRule)
  await expectQueryToFail(
    setProfile(first, null, [`${'a'.repeat(250)}@x.com`]),
    CHECK_VIOLATION,
    allowlistRule,
  )
  await expectQueryToFail(
    setProfile(first, null, Array.from({ length: 21 }, (_, index) => `a${index}@x.com`)),
    CHECK_VIOLATION,
    allowlistRule,
  )
  await setProfile(first, null, [`${'a'.repeat(250)}.com`.slice(0, 254)])
  await setProfile(first, TOKEN_HASH, ['a@x.com', 'contratante.com.br'])
  await expectQueryToFail(
    setProfile(second, TOKEN_HASH, ['a@x.com']),
    UNIQUE_VIOLATION,
    'contractor_receiving_profiles_company_inbound_token_unique',
  )
  await setProfile(second, null, null)
}

/** A janela de e-mails por contratante (T4.7a) lê `recorded_at`, o relógio do banco, e não `received_at`. */
async function assertRateWindowIndex(database: SQL) {
  const rows = await database<{ indexdef: string; indexname: string }[]>`
    select indexname, indexdef from pg_indexes where tablename = 'cargo_preview_email_intakes'
  `
  const names = rows.map((row) => row.indexname)
  expect(names).toContain('cargo_preview_email_intakes_company_contractor_recorded_idx')
  expect(names).not.toContain('cargo_preview_email_intakes_company_contractor_received_idx')
  const index = rows.find((row) => row.indexname.endsWith('_recorded_idx'))
  expect(index?.indexdef).toContain('(company_id, contractor_id, recorded_at DESC)')
}

async function insertPreview(
  probe: CargoPreviewEmailIntakeProbe,
  input: { contractorId: string; source: string; uploader: string | null; key: string },
) {
  const [row] = await probe.database<{ id: string }[]>`
    insert into cargo_previews
      (company_id, contractor_id, source, received_at, file_name, file_sha256, file_object_id,
       file_size_bytes, idempotency_key, request_fingerprint, uploaded_by_user_id)
    values (${probe.companyId}, ${input.contractorId}, ${input.source}, now(), 'f.xlsx',
       ${input.key.padEnd(64, '0')}, ${crypto.randomUUID()}, 10, ${`key-${input.key}`.padEnd(20, '-')},
       ${'b'.repeat(64)}, ${input.uploader})
    returning id
  `
  return row?.id ?? ''
}

async function assertPreviewAndIntakeRules(
  probe: CargoPreviewEmailIntakeProbe,
  contractorId: string,
) {
  const { database } = probe
  const rule = 'cargo_previews_uploader_check'
  await expectQueryToFail(
    insertPreview(probe, { contractorId, key: 'c1', source: 'upload', uploader: null }),
    CHECK_VIOLATION,
    rule,
  )
  await expectQueryToFail(
    insertPreview(probe, { contractorId, key: 'c2', source: 'email', uploader: probe.userId }),
    CHECK_VIOLATION,
    rule,
  )
  await expectQueryToFail(
    insertPreview(probe, { contractorId, key: 'c3', source: 'sms', uploader: null }),
    CHECK_VIOLATION,
    'cargo_previews_source_check',
  )
  await insertPreview(probe, { contractorId, key: 'c4', source: 'upload', uploader: probe.userId })
  const previewId = await insertPreview(probe, {
    contractorId,
    key: 'c5',
    source: 'email',
    uploader: null,
  })

  const insertIntake = (
    outcome: string,
    reason: string | null,
    preview: string | null,
    id: string,
  ) =>
    database`
      insert into cargo_preview_email_intakes
        (company_id, provider_email_id, contractor_id, outcome, reason_code, preview_id, received_at)
      values (${probe.companyId}, ${id}, ${contractorId}, ${outcome}, ${reason}, ${preview}, now())
    `
  const shape = 'cargo_preview_email_intakes_shape_check'
  await expectQueryToFail(insertIntake('accepted', null, null, 'e0'), CHECK_VIOLATION, shape)
  await expectQueryToFail(insertIntake('rejected', null, null, 'e0'), CHECK_VIOLATION, shape)
  await expectQueryToFail(
    insertIntake('accepted', 'ATTACHMENT_MISSING', previewId, 'e0'),
    CHECK_VIOLATION,
    shape,
  )
  await expectQueryToFail(
    insertIntake('rejected', 'NOT_A_CODE', null, 'e0'),
    CHECK_VIOLATION,
    'cargo_preview_email_intakes_reason_code_check',
  )
  await insertIntake('accepted', null, previewId, 'e1')
  await insertIntake('rejected', 'FORWARDER_NOT_ALLOWED', null, 'e2')
  await insertIntake('rejected', 'RATE_LIMITED', null, 'e3')
  await insertIntake('rejected', 'FORWARDER_DKIM_UNVERIFIABLE', null, 'e4')
  await expectQueryToFail(
    insertIntake('rejected', 'FORWARDER_NOT_ALLOWED', null, 'e2'),
    UNIQUE_VIOLATION,
    'cargo_preview_email_intakes_company_provider_email_unique',
  )
  await expectQueryToFail(
    database`update cargo_preview_email_intakes set is_replay = true where provider_email_id = 'e1'`,
    APPEND_ONLY,
  )
  await expectQueryToFail(
    database`delete from cargo_preview_email_intakes where provider_email_id = 'e2'`,
    APPEND_ONLY,
  )
}

export async function assertCargoPreviewEmailIntake(
  probe: CargoPreviewEmailIntakeProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('cargo_preview_email_intake is required')
  const contractorIds = [
    await insertContractor(probe, '40290856000161'),
    await insertContractor(probe, '40290856000242'),
  ]
  await assertProfileRules(probe, contractorIds)
  await assertRateWindowIndex(database)
  await assertPreviewAndIntakeRules(probe, contractorIds[0] ?? '')

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect((await runRollback(database, rollback))?.message).toContain('email previews')
  expect(await countIntakeObjects(database)).toBe(2)

  const doomed = await database<{ id: string }[]>`
    select id from cargo_previews where source = 'email' and company_id = ${probe.companyId}
  `
  await database.unsafe('ALTER TABLE cargo_preview_email_intakes DISABLE TRIGGER USER')
  await database`delete from cargo_preview_email_intakes where company_id = ${probe.companyId}`
  await database`delete from cargo_previews where id in ${database(doomed.map((row) => row.id))}`
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await countIntakeObjects(database)).toBe(0)
  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await countIntakeObjects(database)).toBe(2)
}
