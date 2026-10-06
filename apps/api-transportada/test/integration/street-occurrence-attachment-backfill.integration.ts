/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.3 (RF1d), contra Postgres real: o backfill da foto da ocorrência de rua sobre dado
 * gravado **antes** dele. Verifica as **linhas** de `trip_document_occurrence_attachments` — a
 * leitura "linha nova, senão coluna antiga" devolveria a mesma foto sem o backfill e mascararia um
 * `INSERT` arrancado. O banco descartável nasce migrado, desfaz a T1d.2 pelo próprio `rollback.sql`
 * (só o journal), recebe as sementes, e o migrador reaplica o `migration.sql` lido do disco.
 */
import { join } from 'node:path'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { SQL } from 'bun'
import { describe, expect } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { tripDocumentOccurrenceAttachments } from '../../src/database/trip.schema.js'
import { readOccurrenceAttachments } from '../../src/trips/application/occurrence-attachment.service.js'
import { DrizzleOccurrenceAttachmentRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import { listTripOccurrenceAttachmentLocations } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { withDisposableDatabase } from '../fixtures/disposable-database.fixture.js'
import {
  scenarioDay,
  seedBackfillScenario,
} from '../fixtures/street-occurrence-backfill-scenario.fixture.js'
import {
  databaseUrl,
  seedCompany,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

const MIGRATION_DIRECTORY = new URL(
  '../../drizzle/20261006205232_street_occurrence_attachment_backfill/',
  import.meta.url,
)
const DOWNLOADS = {
  async createDownloadUrl(input: { readonly objectKey: string }) {
    return { expiresAt: '2026-09-21T12:05:00.000Z', url: `https://bucket.test/${input.objectKey}` }
  },
}

function expectedRow(occurrenceId: string, position: number, storedObjectId: string, day: number) {
  return { createdAt: scenarioDay(day), occurrenceId, position, storedObjectId }
}

async function readRows(database: TestDatabase, company: Company) {
  return database.db
    .select({
      createdAt: tripDocumentOccurrenceAttachments.createdAt,
      occurrenceId: tripDocumentOccurrenceAttachments.occurrenceId,
      position: tripDocumentOccurrenceAttachments.position,
      storedObjectId: tripDocumentOccurrenceAttachments.storedObjectId,
    })
    .from(tripDocumentOccurrenceAttachments)
    .where(eq(tripDocumentOccurrenceAttachments.companyId, company.companyId))
    .orderBy(
      asc(tripDocumentOccurrenceAttachments.createdAt),
      asc(tripDocumentOccurrenceAttachments.position),
    )
}

async function countPhotosRead(
  database: TestDatabase,
  scope: { readonly companyId: string; readonly occurrenceId: string },
): Promise<readonly number[]> {
  const feed = await listTripOccurrenceAttachmentLocations(database.db, scope)
  const panel = await readOccurrenceAttachments({
    ...scope,
    downloads: DOWNLOADS,
    repository: new DrizzleOccurrenceAttachmentRepository(database.db),
  })
  return [feed.length, panel.length]
}

/** O `rollback.sql` da T1d.2 só tira o journal: as linhas ficam, e o migrador reaplica o INSERT. */
async function undoBackfillJournal(raw: SQL): Promise<void> {
  await raw.unsafe(await Bun.file(join(MIGRATION_DIRECTORY.pathname, 'rollback.sql')).text())
}

async function proveBackfill(database: TestDatabase, raw: SQL, connectionString: string) {
  await undoBackfillJournal(raw)
  const company = await seedCompany(database)
  const seed = await seedBackfillScenario(database, company)
  await runDatabaseMigrations({ connectionString })

  const rows = await readRows(database, company)
  expect(rows).toEqual([
    expectedRow(seed.onlyColumn, 1, seed.onlyColumnObject, 1),
    expectedRow(seed.withSecond, 2, seed.secondObject, 3),
    expectedRow(seed.warehouse, 1, seed.warehouseObjects[0], 5),
    expectedRow(seed.warehouse, 2, seed.warehouseObjects[1], 5),
    expectedRow(seed.batch[0], 1, seed.batchObject, 6),
    expectedRow(seed.batch[1], 1, seed.batchObject, 7),
    expectedRow(seed.batch[2], 1, seed.batchObject, 8),
    expectedRow(seed.reusedUpload[0], 1, seed.reusedUploadObject, 10),
    expectedRow(seed.reusedUpload[1], 1, seed.reusedUploadObject, 11),
  ])
  expect(rows).toHaveLength(9)

  // (a) e (b): o leitor devolve exatamente uma foto, no feed e no painel.
  for (const occurrenceId of [seed.onlyColumn, seed.withSecond]) {
    expect(await countPhotosRead(database, { companyId: company.companyId, occurrenceId })).toEqual(
      [1, 1],
    )
  }

  await undoBackfillJournal(raw)
  await runDatabaseMigrations({ connectionString })
  expect(await readRows(database, company)).toHaveLength(rows.length)
}

describe('a foto antiga da rua ganha a linha da 161 (spec 246 T1d.3)', () => {
  testWithPostgres(
    'as cinco sementes saem com as linhas certas, a hora da ocorrência, e reexecutar não duplica',
    async () => {
      if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
      await withDisposableDatabase({
        adminUrl: databaseUrl,
        namePrefix: 'transportada_street_photo',
        migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
        open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
        operation: async (database, connectionString) => {
          const raw = new SQL(connectionString, { max: 1 })
          try {
            await proveBackfill(database, raw, connectionString)
          } finally {
            await raw.close()
          }
        },
      })
    },
    60_000,
  )
})
