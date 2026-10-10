/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.3b (ADR-0101 decisão 5), contra Postgres real: o protocolo `AAMMDD-XXXX` é do banco.
 * O INSERT antigo (sem citar a coluna) recebe um protocolo com a data de `created_at` em
 * America/Sao_Paulo; a colisão é sorteada de novo até a sexta tentativa; o valor é único por empresa e
 * imutável; o backfill dá formato e unicidade às linhas que já existiam; o rollback e a reaplicação fecham.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { CONVERSATION_PROTOCOL_PATTERN } from '../../src/shared/occurrence-conversation-subject.constant.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_conversation_protocol'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const IMMUTABLE_VIOLATION = '55000'
const PROTOCOL_CHECK = 'occurrence_conversations_protocol_check'
const PROTOCOL_UNIQUE = 'occurrence_conversations_company_protocol_unique'
const FORMAT = new RegExp(CONVERSATION_PROTOCOL_PATTERN, 'u')
const SAO_PAULO_NIGHT = '2026-10-10T02:30:00Z'
const SAME_DAY = '2026-10-10T15:00:00Z'
const OTHER_DAY = '2026-10-11T15:00:00Z'

export type ConversationProtocolProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly userId: string
}

type InsertOptions = { readonly createdAt?: string; readonly protocol?: string }

async function insertConversation(
  database: SQL,
  probe: { readonly companyId: string; readonly userId: string },
  options: InsertOptions = {},
): Promise<string> {
  const createdAt = options.createdAt ?? new Date().toISOString()
  const rows = (
    options.protocol === undefined
      ? await database`
          insert into occurrence_conversations
            (company_id, occurrence_kind, occurrence_id, participant, driver_user_id, created_at)
          values (${probe.companyId}, 'document', ${crypto.randomUUID()}, 'driver', ${probe.userId}, ${createdAt}::timestamptz)
          returning protocol`
      : await database`
          insert into occurrence_conversations
            (company_id, occurrence_kind, occurrence_id, participant, driver_user_id, created_at, protocol)
          values (${probe.companyId}, 'document', ${crypto.randomUUID()}, 'driver', ${probe.userId}, ${createdAt}::timestamptz, ${options.protocol})
          returning protocol`
  ) as { protocol: string }[]
  const [row] = rows
  if (row === undefined) throw new Error('conversation was not created')
  return row.protocol
}

async function runSql(database: SQL, statement: string): Promise<Error | undefined> {
  const reserved = await database.reserve()
  try {
    await reserved.unsafe(statement)
    return undefined
  } catch (error) {
    await reserved.unsafe('ROLLBACK')
    return error as Error
  } finally {
    reserved.release()
  }
}

async function readBackfillBlock(directory: string): Promise<string> {
  const text = await Bun.file(join(migrationsDirectory.pathname, directory, 'migration.sql')).text()
  const start = text.indexOf('DO $$')
  const end = text.indexOf('$$;', start + 5)
  if (start < 0 || end < 0) throw new Error('backfill block is required')
  return text.slice(start, end + 2)
}

async function assertBackfill(probe: ConversationProtocolProbe, directory: string) {
  const { companyId, database, userId } = probe
  const block = await readBackfillBlock(directory)
  const reserved = await database.reserve()
  try {
    await reserved.unsafe('BEGIN')
    await reserved.unsafe(`
      ALTER TABLE occurrence_conversations DISABLE TRIGGER occurrence_conversations_assign_protocol_trigger;
      ALTER TABLE occurrence_conversations DISABLE TRIGGER occurrence_conversations_protocol_immutable_trigger;
      ALTER TABLE occurrence_conversations DROP CONSTRAINT ${PROTOCOL_CHECK};
      ALTER TABLE occurrence_conversations DROP CONSTRAINT ${PROTOCOL_UNIQUE};
    `)
    const days = [SAO_PAULO_NIGHT, SAO_PAULO_NIGHT, SAME_DAY, OTHER_DAY]
    const ids: string[] = []
    for (const createdAt of days) {
      const [inserted] = (await reserved`
        insert into occurrence_conversations
          (company_id, occurrence_kind, occurrence_id, participant, driver_user_id, created_at, protocol)
        values (${companyId}, 'document', ${crypto.randomUUID()}, 'driver', ${userId}, ${createdAt}::timestamptz, '')
        returning id`) as { id: string }[]
      if (inserted === undefined) throw new Error('conversation was not created')
      ids.push(inserted.id)
    }
    await reserved.unsafe(block)
    const rows = (await reserved`
      select protocol, to_char(created_at at time zone 'America/Sao_Paulo', 'YYMMDD') as day
      from occurrence_conversations where id = any(${reserved.array(ids, 'uuid')})`) as {
      day: string
      protocol: string
    }[]
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.protocol).toMatch(FORMAT)
      expect(row.protocol.startsWith(`${row.day}-`)).toBe(true)
    }
    expect(new Set(rows.map((row) => row.protocol)).size).toBe(4)
    expect(rows.map((row) => row.day).toSorted()).toEqual(['261009', '261009', '261010', '261011'])
    await reserved.unsafe(`
      ALTER TABLE occurrence_conversations ADD CONSTRAINT ${PROTOCOL_CHECK} CHECK (protocol ~ '${CONVERSATION_PROTOCOL_PATTERN}');
      ALTER TABLE occurrence_conversations ADD CONSTRAINT ${PROTOCOL_UNIQUE} UNIQUE (company_id, protocol);
    `)
  } finally {
    await reserved.unsafe('ROLLBACK')
    reserved.release()
  }
}

async function assertInsertWithoutProtocol(probe: ConversationProtocolProbe) {
  const protocol = await insertConversation(probe.database, probe, { createdAt: SAO_PAULO_NIGHT })
  expect(protocol).toMatch(FORMAT)
  expect(protocol.startsWith('261009-')).toBe(true)

  const [sameInstantUtc] = (await probe.database`
    select to_char(${SAO_PAULO_NIGHT}::timestamptz at time zone 'UTC', 'YYMMDD') as day`) as {
    day: string
  }[]
  expect(sameInstantUtc?.day).toBe('261010')
}

async function assertForcedCollision(probe: ConversationProtocolProbe) {
  const reserved = await probe.database.reserve()
  try {
    await reserved`select setseed(0.42)`
    const first = await insertConversation(reserved, probe, { createdAt: SAME_DAY })
    await reserved`select setseed(0.42)`
    const second = await insertConversation(reserved, probe, { createdAt: SAME_DAY })
    expect(second).toMatch(FORMAT)
    expect(second).not.toBe(first)
    expect(second.slice(0, 7)).toBe(first.slice(0, 7))
  } finally {
    reserved.release()
  }
}

async function readSuffixes(reserved: SQL, seed: number): Promise<string[]> {
  await reserved`select setseed(${seed})`
  const suffixes: string[] = []
  for (let index = 0; index < 6; index += 1) {
    const [row] = (await reserved`select conversation_protocol_suffix() as suffix`) as {
      suffix: string
    }[]
    if (row === undefined) throw new Error('suffix was not generated')
    suffixes.push(row.suffix)
  }
  return suffixes
}

async function assertExhaustionAndCompanies(probe: ConversationProtocolProbe) {
  const { database } = probe
  const otherCompanyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${otherCompanyId}, 'active')`
  const reserved = await database.reserve()
  try {
    const seed = 0.7
    const suffixes = await readSuffixes(reserved, seed)
    expect(new Set(suffixes).size).toBe(6)
    const protocols = suffixes.map((suffix) => `261012-${suffix}`)
    for (const protocol of protocols.slice(0, 5)) {
      await insertConversation(reserved, probe, { createdAt: SAME_DAY, protocol })
    }

    await reserved`select setseed(${seed})`
    const sixthDraw = await insertConversation(reserved, probe, {
      createdAt: '2026-10-12T15:00:00Z',
    })
    expect(sixthDraw).toBe(`261012-${suffixes[5]}`)

    await reserved`select setseed(${seed})`
    await expectQueryToFail(
      insertConversation(reserved, probe, { createdAt: '2026-10-12T15:00:00Z' }),
      UNIQUE_VIOLATION,
      PROTOCOL_UNIQUE,
    )

    await insertConversation(
      reserved,
      { companyId: otherCompanyId, userId: probe.userId },
      {
        createdAt: SAME_DAY,
        protocol: protocols[0] ?? '',
      },
    )
    await reserved`select setseed(${seed})`
    const independent = await insertConversation(
      reserved,
      { companyId: otherCompanyId, userId: probe.userId },
      {
        createdAt: '2026-10-12T15:00:00Z',
      },
    )
    expect(independent).toBe(`261012-${suffixes[1]}`)
  } finally {
    reserved.release()
  }
  return otherCompanyId
}

async function assertImmutabilityAndCheck(probe: ConversationProtocolProbe) {
  const { companyId, database, userId } = probe
  const otherUserId = crypto.randomUUID()
  await database`insert into identity_users (id, status) values (${otherUserId}, 'active')`
  const protocol = await insertConversation(database, probe, { createdAt: SAME_DAY })
  await expectQueryToFail(
    database`update occurrence_conversations set protocol = '261012-ZZZZ'
      where company_id = ${companyId} and protocol = ${protocol}`,
    IMMUTABLE_VIOLATION,
  )
  await database`update occurrence_conversations set protocol = ${protocol}
    where company_id = ${companyId} and protocol = ${protocol}`
  await database`update occurrence_conversations set driver_user_id = ${otherUserId}
    where company_id = ${companyId} and protocol = ${protocol}`
  const [kept] = (await database`
    select protocol, driver_user_id from occurrence_conversations
    where company_id = ${companyId} and protocol = ${protocol}`) as {
    driver_user_id: string
    protocol: string
  }[]
  expect(kept).toEqual({ driver_user_id: otherUserId, protocol })
  await database`update occurrence_conversations set driver_user_id = ${userId}
    where company_id = ${companyId} and protocol = ${protocol}`
  await database`delete from occurrence_conversations where company_id = ${companyId} and protocol = ${protocol}`
  await database`delete from identity_users where id = ${otherUserId}`

  for (const malformed of [
    '261010-abcd',
    '261010-0ABC',
    '261010-1ABC',
    '261010-OABC',
    '261010-IABC',
    '261010-LABC',
    '261010-ABC',
    '61010-ABCD',
    '261010-ABCDE',
    '261010ABCD',
    ' 261010-ABCD',
  ]) {
    await expectQueryToFail(
      insertConversation(database, probe, { protocol: malformed }),
      CHECK_VIOLATION,
      PROTOCOL_CHECK,
    )
  }
}

async function countProtocolObjects(database: SQL): Promise<number> {
  const [row] = await database<{ count: number }[]>`
    select (
      (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'occurrence_conversations' and column_name = 'protocol')
      + (select count(*) from pg_proc where proname in
        ('conversation_protocol_suffix', 'assign_occurrence_conversation_protocol', 'reject_occurrence_conversation_protocol_change'))
      + (select count(*) from pg_trigger where tgname in
        ('occurrence_conversations_assign_protocol_trigger', 'occurrence_conversations_protocol_immutable_trigger'))
      + (select count(*) from pg_constraint where conname in (${PROTOCOL_CHECK}, ${PROTOCOL_UNIQUE}))
    )::int as count`
  return row?.count ?? 0
}

async function assertRollbackAndReapply(probe: ConversationProtocolProbe, directory: string) {
  const { companyId, connectionString, database } = probe
  expect(await countProtocolObjects(database)).toBe(8)

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(await runSql(database, rollback)).toBeUndefined()
  expect(await countProtocolObjects(database)).toBe(0)
  const [journal] = (await database`
    select count(*)::int as count from drizzle.__drizzle_migrations where name = ${directory}`) as {
    count: number
  }[]
  expect(journal?.count).toBe(0)
  const [rows] = (await database`
    select count(*)::int as count from occurrence_conversations where company_id = ${companyId}`) as {
    count: number
  }[]
  expect(rows?.count).toBeGreaterThan(0)

  await runDatabaseMigrations({ connectionString })
  expect(await countProtocolObjects(database)).toBe(8)
  const backfilled = (await database`
    select protocol from occurrence_conversations where company_id = ${companyId}`) as {
    protocol: string
  }[]
  expect(backfilled.length).toBe(rows?.count ?? -1)
  for (const row of backfilled) expect(row.protocol).toMatch(FORMAT)
  expect(new Set(backfilled.map((row) => row.protocol)).size).toBe(backfilled.length)
}

export async function assertConversationProtocol(probe: ConversationProtocolProbe): Promise<void> {
  const { companyId, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('conversation_protocol migration is required')

  await assertBackfill(probe, directory)
  await assertInsertWithoutProtocol(probe)
  await assertForcedCollision(probe)
  const otherCompanyId = await assertExhaustionAndCompanies(probe)
  await assertImmutabilityAndCheck(probe)
  await assertRollbackAndReapply(probe, directory)

  await database`delete from occurrence_conversations where company_id in (${companyId}, ${otherCompanyId})`
  await database`delete from companies where id = ${otherCompanyId}`
}
