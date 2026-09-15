/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 H1: a coerência da trilha fiscal é o banco que garante — origem/ator, protocolo só com
 * `cStat`, máquina D4 e idempotência D7. Evento antigo, com as nove colunas nulas, continua válido.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const EVENT_HISTORY_MIGRATION_SUFFIX = '_nfe_event_history'
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const ACCESS_KEY = '35260711222333000181550010000000011000000013'
const ZERO_SHA256 = '0'.repeat(64)
const INDEX_NAME = 'nfe_document_status_changes_company_document_changed_id_idx'
const INDEX_DEFINITION = `CREATE INDEX ${INDEX_NAME} ON public.nfe_document_status_changes USING btree (company_id, document_id, changed_at DESC, id DESC)`
const HISTORY_COLUMNS = [
  'actor_user_id',
  'correction_text',
  'document_status_after',
  'document_status_before',
  'import_id',
  'origin',
  'protocol',
  'requested_by_user_id',
  'status_code',
]

export type NfeEventHistoryProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
  fixture: IdentityFixture
}>

type EventRow = Readonly<{
  eventType?: string
  statusCode?: string
  protocol?: string
  correctionText?: string
  importId?: string
  origin?: string
  actorUserId?: string
  requestedByUserId?: string
  before?: string
  after?: string
}>

type ChangeRow = Readonly<{ before: string; after: string; cause: string; eventId?: string }>

export async function assertNfeEventHistory(probe: NfeEventHistoryProbe): Promise<void> {
  const { database, fixture } = probe
  const directory = probe.directories.find((name) => name.endsWith(EVENT_HISTORY_MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('NF-e event history migration is required')

  const { companyId, userId } = fixture
  const xmlObjectId = await insertStoredObject(database, companyId)
  const importId = await insertImport(database, { companyId, userId })
  const documentId = crypto.randomUUID()
  await database`
    insert into nfe_documents (
      id, company_id, access_key, model, number, series, issued_at, operation_nature, operation_type,
      status, source, total_value, products_value, authorization_protocol,
      xml_object_id, xml_sha256, import_id, created_by_user_id
    ) values (
      ${documentId}, ${companyId}, ${ACCESS_KEY}, '55', '1', '1', now(), 'venda', '1',
      'authorized', 'upload', '10.00', '10.00', '135260000000001',
      ${xmlObjectId}, ${ZERO_SHA256}, ${importId}, ${userId}
    )
  `
  let sequence = 0
  const insertEvent = (row: EventRow): Promise<string> => {
    sequence += 1
    return insertNfeEvent(database, { companyId, row, sequence, xmlObjectId })
  }

  await insertEvent({})
  await insertEvent({ origin: 'manual', actorUserId: userId, importId, statusCode: '135' })
  const cancelEventId = await insertEvent({
    eventType: '110111',
    origin: 'automatic',
    requestedByUserId: userId,
    importId,
    statusCode: '135',
    protocol: '135260000000002',
    before: 'authorized',
    after: 'cancelled',
  })

  const refusals: ReadonlyArray<readonly [EventRow, string]> = [
    [{ origin: 'manual', importId }, 'nfe_events_origin_actor_check'],
    [{ origin: 'automatic', actorUserId: userId, importId }, 'nfe_events_origin_actor_check'],
    [{ origin: 'manual', actorUserId: userId }, 'nfe_events_origin_import_check'],
    [{ protocol: '135260000000002' }, 'nfe_events_protocol_check'],
    [{ eventType: '110111', correctionText: 'Corrige volume' }, 'nfe_events_correction_text_check'],
    [{ before: 'lost', after: 'lost' }, 'nfe_events_document_status_check'],
    [{ before: 'authorized' }, 'nfe_events_document_status_pair_check'],
    [{ before: 'authorized', after: 'denied' }, 'nfe_events_document_status_transition_check'],
    [{ before: 'cancelled', after: 'authorized' }, 'nfe_events_document_status_transition_check'],
  ]
  for (const [row, constraint] of refusals) {
    await expectQueryToFail(insertEvent(row), CHECK_VIOLATION, constraint)
  }

  const otherCompanyId = crypto.randomUUID()
  await database`insert into companies (id, status) values (${otherCompanyId}, 'active')`
  await database`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${crypto.randomUUID()}, ${userId}, ${otherCompanyId}, 'active')
  `
  const otherImportId = await insertImport(database, { companyId: otherCompanyId, userId })
  await expectQueryToFail(
    insertEvent({ origin: 'automatic', importId: otherImportId }),
    FOREIGN_KEY_VIOLATION,
    'nfe_events_company_import_fk',
  )

  const insertChange = (row: ChangeRow): Promise<unknown> => database`
    insert into nfe_document_status_changes (
      company_id, document_id, status_before, status_after, cause, event_id
    ) values (
      ${companyId}, ${documentId}, ${row.before}, ${row.after}, ${row.cause}, ${row.eventId ?? null}
    )
  `
  const transitionCheck = 'nfe_document_status_changes_transition_check'
  await expectQueryToFail(
    insertChange({ before: 'authorized', after: 'denied', cause: 'event', eventId: cancelEventId }),
    CHECK_VIOLATION,
    transitionCheck,
  )
  await expectQueryToFail(
    insertChange({
      before: 'cancelled',
      after: 'authorized',
      cause: 'event',
      eventId: cancelEventId,
    }),
    CHECK_VIOLATION,
    transitionCheck,
  )
  await expectQueryToFail(
    insertChange({ before: 'unsigned', after: 'denied', cause: 'summary', eventId: cancelEventId }),
    CHECK_VIOLATION,
    'nfe_document_status_changes_event_presence_check',
  )
  await insertChange({
    before: 'authorized',
    after: 'cancelled',
    cause: 'event',
    eventId: cancelEventId,
  })
  await expectQueryToFail(
    insertChange({ before: 'authorized', after: 'cancelled', cause: 'summary' }),
    UNIQUE_VIOLATION,
    'nfe_document_status_changes_document_target_unique',
  )

  expect(await readIndexDefinition(database)).toBe(INDEX_DEFINITION)
  const plan = await readChangesPlan(database)
  expect(plan).toMatch(new RegExp(`Index (Only )?Scan using ${INDEX_NAME}`))
  expect(plan).not.toContain('Sort')

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
  expect(await readHistoryShape(database)).toEqual({ table: null, columns: [] })
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readHistoryShape(database)).toEqual({
    table: 'nfe_document_status_changes',
    columns: HISTORY_COLUMNS,
  })
  expect(await readIndexDefinition(database)).toBe(INDEX_DEFINITION)
}

async function insertNfeEvent(
  database: SQL,
  input: Readonly<{ companyId: string; row: EventRow; sequence: number; xmlObjectId: string }>,
): Promise<string> {
  const { companyId, row, sequence, xmlObjectId } = input
  const id = crypto.randomUUID()
  await database`
    insert into nfe_events (
      id, company_id, target_access_key, event_type, event_sequence, occurred_at, xml_object_id,
      status_code, protocol, correction_text, import_id, origin, actor_user_id,
      requested_by_user_id, document_status_before, document_status_after
    ) values (
      ${id}, ${companyId}, ${ACCESS_KEY}, ${row.eventType ?? '110110'}, ${sequence}, now(),
      ${xmlObjectId}, ${row.statusCode ?? null}, ${row.protocol ?? null},
      ${row.correctionText ?? null}, ${row.importId ?? null}, ${row.origin ?? null},
      ${row.actorUserId ?? null}, ${row.requestedByUserId ?? null}, ${row.before ?? null},
      ${row.after ?? null}
    )
  `
  return id
}

async function insertStoredObject(database: SQL, companyId: string): Promise<string> {
  const id = crypto.randomUUID()
  await database`
    insert into stored_objects (
      id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose
    ) values (
      ${id}, ${companyId}, 's3', 'fiscal', ${`nfe/${id}.xml`}, 'application/xml', 1024,
      ${ZERO_SHA256}, 'final', 'nfe_document'
    )
  `
  return id
}

async function insertImport(
  database: SQL,
  input: Readonly<{ companyId: string; userId: string }>,
): Promise<string> {
  const id = crypto.randomUUID()
  await database`
    insert into nfe_imports (
      id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
      request_fingerprint, status
    ) values (
      ${id}, ${input.companyId}, 'upload', ${input.userId}, ${`correlation-${id}`},
      ${`idempotency-${id}`}, ${`fingerprint-${id}`}, 'completed'
    )
  `
  return id
}

async function readIndexDefinition(database: SQL): Promise<string | null> {
  const [row] = await database<Array<{ readonly indexdef: string }>>`
    select indexdef from pg_indexes where indexname = ${INDEX_NAME}
  `
  return row?.indexdef ?? null
}

async function readHistoryShape(
  database: SQL,
): Promise<{ readonly table: string | null; readonly columns: readonly string[] }> {
  const [table] = await database<Array<{ readonly name: string | null }>>`
    select to_regclass('public.nfe_document_status_changes')::text as name
  `
  const columns = await database<Array<{ readonly column_name: string }>>`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'nfe_events'
      and column_name in ${database(HISTORY_COLUMNS)}
    order by column_name
  `
  return { table: table?.name ?? null, columns: columns.map((column) => column.column_name) }
}

/** Tabela vazia faz o planejador preferir varredura sequencial; desligá-la mostra o que o índice serve. */
async function readChangesPlan(database: SQL): Promise<string> {
  return database.begin(async (transaction) => {
    await transaction`set local enable_seqscan = off`
    const rows = await transaction<Array<{ readonly 'QUERY PLAN': string }>>`
      explain
      select id, changed_at from nfe_document_status_changes
      where company_id = ${crypto.randomUUID()}::uuid
        and document_id = ${crypto.randomUUID()}::uuid
        and cause <> 'event'
        and (changed_at, id) < (now(), ${crypto.randomUUID()}::uuid)
      order by changed_at desc, id desc
      limit 26
    `
    return rows.map((row) => row['QUERY PLAN']).join('\n')
  })
}
