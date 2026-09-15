/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149: a nota `unsigned` pode ser cancelada ou denegada pela SEFAZ e continua sem protocolo de
 * autorização. Só a `authorized` exige protocolo. O rollback volta à regra antiga.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import type { IdentityFixture } from './identity-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const PROTOCOL_PRESENCE_MIGRATION_SUFFIX = '_nfe_document_protocol_presence'
const CONSTRAINT_NAME = 'nfe_documents_authorization_protocol_presence_check'
const CHECK_VIOLATION = '23514'
const ZERO_SHA256 = '0'.repeat(64)
const RELAXED_DEFINITION = `CHECK (((status <> 'authorized'::text) OR (authorization_protocol IS NOT NULL)))`
const ORIGINAL_DEFINITION = `CHECK (((status = 'unsigned'::text) OR (authorization_protocol IS NOT NULL)))`

export type NfeDocumentProtocolPresenceProbe = Readonly<{
  connectionString: string
  database: SQL
  directories: readonly string[]
  fixture: IdentityFixture
}>

type DocumentProbe = Readonly<{
  accessKey: string
  companyId: string
  importId: string
  status: string
  userId: string
  xmlObjectId: string
}>

export async function assertNfeDocumentProtocolPresence(
  probe: NfeDocumentProtocolPresenceProbe,
): Promise<void> {
  const { database, fixture } = probe
  const directory = probe.directories.find((name) =>
    name.endsWith(PROTOCOL_PRESENCE_MIGRATION_SUFFIX),
  )
  if (directory === undefined) throw new Error('NF-e protocol presence migration is required')

  const { companyId, userId } = fixture
  const xmlObjectId = await insertStoredObject(database, companyId)
  const importId = await insertImport(database, { companyId, userId })
  const base = { companyId, importId, userId, xmlObjectId }
  expect(await readDefinition(database)).toBe(RELAXED_DEFINITION)

  await expectQueryToFail(
    insertDocumentWithoutProtocol(database, { ...base, accessKey: key(1), status: 'authorized' }),
    CHECK_VIOLATION,
    CONSTRAINT_NAME,
  )
  const accepted = ['unsigned', 'cancelled', 'denied'] as const
  const ids = await Promise.all(
    accepted.map((status, index) =>
      insertDocumentWithoutProtocol(database, { ...base, accessKey: key(index + 2), status }),
    ),
  )
  expect(ids).toHaveLength(accepted.length)

  // O rollback falha com nota cancelada/denegada sem protocolo; limpa antes de provar o caminho de volta
  await database`delete from nfe_documents where id in ${database(ids)}`
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  await database.unsafe(rollback)
  expect(await readDefinition(database)).toBe(ORIGINAL_DEFINITION)
  const journal = await database<Array<{ readonly name: string }>>`
    select name from drizzle.__drizzle_migrations where name = ${directory}
  `
  expect(journal).toEqual([])

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await readDefinition(database)).toBe(RELAXED_DEFINITION)
}

/** Série 002: não colide com a chave da série 001 que a assertion da H1 grava na mesma empresa. */
function key(ordinal: number): string {
  return `3526071122233300018155002000000${String(ordinal).padStart(3, '0')}1000000013`
}

async function insertDocumentWithoutProtocol(
  database: SQL,
  document: DocumentProbe,
): Promise<string> {
  const id = crypto.randomUUID()
  await database`
    insert into nfe_documents (
      id, company_id, access_key, model, number, series, issued_at, operation_nature, operation_type,
      status, source, total_value, products_value, authorization_protocol,
      xml_object_id, xml_sha256, import_id, created_by_user_id
    ) values (
      ${id}, ${document.companyId}, ${document.accessKey}, '55', '1', '1', now(), 'venda', '1',
      ${document.status}, 'upload', '10.00', '10.00', null,
      ${document.xmlObjectId}, ${ZERO_SHA256}, ${document.importId}, ${document.userId}
    )
  `
  return id
}

async function readDefinition(database: SQL): Promise<string | null> {
  const [row] = await database<Array<{ readonly definition: string }>>`
    select pg_get_constraintdef(oid) as definition from pg_constraint where conname = ${CONSTRAINT_NAME}
  `
  return row?.definition ?? null
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
