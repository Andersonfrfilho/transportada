/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T5.1 (D11), contra Postgres real: o `CHECK` de `company_quick_replies.audience` aceita
 * `driver_reply` e continua recusando o resto; o rollback recusa enquanto houver linha `driver_reply`,
 * restaura o `CHECK` antigo sem ela e fecha o journal; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_quick_reply_driver_audience'
const CHECK_VIOLATION = '23514'
const AUDIENCE_CHECK = 'company_quick_replies_audience_check'
const ROLLBACK_REFUSAL = 'respostas do motorista existem'

export type QuickReplyDriverAudienceProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
}

function insertReply(probe: QuickReplyDriverAudienceProbe, audience: string) {
  return probe.database`
    insert into company_quick_replies (company_id, audience, body_text, position)
    values (${probe.companyId}, ${audience}, 'Cheguei ao destino', 0)
    returning id`
}

async function runRollback(database: SQL, statement: string): Promise<Error | undefined> {
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

async function countJournal(database: SQL, directory: string): Promise<number> {
  const [row] = (await database`
    select count(*)::int as count from drizzle.__drizzle_migrations where name = ${directory}`) as {
    count: number
  }[]
  return row?.count ?? -1
}

export async function assertQuickReplyDriverAudience(
  probe: QuickReplyDriverAudienceProbe,
): Promise<void> {
  const { companyId, connectionString, database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('quick_reply_driver_audience migration is required')

  for (const audience of ['contractor', 'driver', 'driver_reply']) {
    expect(await insertReply(probe, audience)).toHaveLength(1)
  }
  await expectQueryToFail(insertReply(probe, 'supplier'), CHECK_VIOLATION, AUDIENCE_CHECK)
  await expectQueryToFail(insertReply(probe, 'Driver_Reply'), CHECK_VIOLATION, AUDIENCE_CHECK)

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect((await runRollback(database, rollback))?.message).toContain(ROLLBACK_REFUSAL)
  expect(await countJournal(database, directory)).toBe(1)
  expect(await insertReply(probe, 'driver_reply')).toHaveLength(1)

  await database`delete from company_quick_replies where company_id = ${companyId} and audience = 'driver_reply'`
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await countJournal(database, directory)).toBe(0)
  await expectQueryToFail(insertReply(probe, 'driver_reply'), CHECK_VIOLATION, AUDIENCE_CHECK)
  const kept = (await database`
    select audience from company_quick_replies where company_id = ${companyId} order by audience`) as {
    audience: string
  }[]
  expect(kept.map((row) => row.audience)).toEqual(['contractor', 'driver'])

  await runDatabaseMigrations({ connectionString })
  expect(await countJournal(database, directory)).toBe(1)
  expect(await insertReply(probe, 'driver_reply')).toHaveLength(1)

  await database`delete from company_quick_replies where company_id = ${companyId}`
}
