/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T302: `contractor_mail_messages.body_html` guarda o HTML que a API montou para o e-mail de
 * saída. Só `outbound` o tem, com teto de 512 KiB. O rollback tira a coluna e o registro no journal.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const BODY_HTML_MIGRATION_SUFFIX = '_contractor_mail_body_html'
const CHECK_VIOLATION = '23514'
const DIRECTION_CONSTRAINT = 'contractor_mail_messages_body_html_direction_check'
const SIZE_CONSTRAINT = 'contractor_mail_messages_body_html_size_check'
const MAX_BODY_HTML_BYTES = 524_288

export type ContractorMailBodyHtmlProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
  fixture: IdentityFixture
}>

type MessageProbe = Readonly<{
  bodyHtml: string | null
  companyId: string
  direction: 'inbound' | 'outbound'
  threadId: string
}>

export async function assertContractorMailBodyHtml(
  probe: ContractorMailBodyHtmlProbe,
): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(BODY_HTML_MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('contractor mail body_html migration is required')

  const { companyId } = probe.fixture
  const threadId = await insertThread(database, companyId)
  const base = { companyId, threadId }
  expect(await readColumnNullability(database)).toBe('YES')

  const withoutHtml = await insertMessage(database, {
    ...base,
    bodyHtml: null,
    direction: 'outbound',
  })
  const withHtml = await insertMessage(database, {
    ...base,
    bodyHtml: 'a'.repeat(MAX_BODY_HTML_BYTES),
    direction: 'outbound',
  })
  await expectQueryToFail(
    insertMessage(database, { ...base, bodyHtml: '<p>resposta</p>', direction: 'inbound' }),
    CHECK_VIOLATION,
    DIRECTION_CONSTRAINT,
  )
  // "é" ocupa dois bytes: o teto é de bytes, não de caracteres
  await expectQueryToFail(
    insertMessage(database, {
      ...base,
      bodyHtml: 'é'.repeat(MAX_BODY_HTML_BYTES / 2 + 1),
      direction: 'outbound',
    }),
    CHECK_VIOLATION,
    SIZE_CONSTRAINT,
  )

  await database`delete from contractor_mail_messages where id in ${database([withoutHtml, withHtml])}`
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
  expect(await readColumnNullability(database)).toBeNull()
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readColumnNullability(database)).toBe('YES')
  await database`delete from contractor_mail_threads where id = ${threadId}`
}

async function readColumnNullability(database: SQL): Promise<string | null> {
  const [row] = await database<Array<{ readonly isNullable: string }>>`
    select is_nullable as "isNullable" from information_schema.columns
    where table_name = 'contractor_mail_messages' and column_name = 'body_html'
  `
  return row?.isNullable ?? null
}

async function insertThread(database: SQL, companyId: string): Promise<string> {
  const id = crypto.randomUUID()
  const replyTokenHash = crypto.randomUUID().replaceAll('-', '').padEnd(64, '0')
  await database`
    insert into contractor_mail_threads
      (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash, status)
    values (${id}, ${companyId}, null, 'setup_test', ${companyId}, ${replyTokenHash}, 'open')
  `
  return id
}

async function insertMessage(database: SQL, message: MessageProbe): Promise<string> {
  const id = crypto.randomUUID()
  const deliveryStatus = message.direction === 'outbound' ? 'queued' : null
  await database`
    insert into contractor_mail_messages
      (id, company_id, thread_id, direction, from_address, subject, to_addresses, body_text,
       body_html, delivery_status)
    values (${id}, ${message.companyId}, ${message.threadId}, ${message.direction},
            'ocorrencias@example.com.br', 'Assunto', ${'{contato@example.com.br}'}::text[],
            'Corpo', ${message.bodyHtml}, ${deliveryStatus})
  `
  return id
}
