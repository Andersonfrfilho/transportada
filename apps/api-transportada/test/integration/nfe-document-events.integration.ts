/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  identityUserProfiles,
  identityUsers,
  nfeDocumentStatusChanges,
  nfeDocuments,
  nfeEvents,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { ApiError } from '../../src/shared/api.error'
import { DrizzleNfeDocumentEventRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document-event.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SHA = 'c'.repeat(64)
const ACCESS_KEY = '35260811111111000191550010000000031000000013'

describe('nfe document events integration (spec 149 D19, H9-H14)', () => {
  testWithPostgres(
    'orders event and status-change entries newest first, resolving actor names by membership',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const repository = new DrizzleNfeDocumentEventRepository(database.db)

        const page = await repository.listEvents({
          context: scenario.contextA,
          cursor: null,
          documentId: scenario.documentId,
          limit: 20,
        })

        expect(page.items.map((item) => item.id)).toEqual([
          scenario.correctionEventId,
          scenario.documentInsertChangeId,
          scenario.cancellationEventId,
        ])
        expect(page.nextCursor).toBeNull()

        const cancellation = page.items[2]!
        expect(cancellation.kind).toBe('event')
        expect(cancellation.origin).toBe('manual')
        expect(cancellation.statusBefore).toBe('authorized')
        expect(cancellation.statusAfter).toBe('cancelled')
        expect(cancellation.actor).toEqual({ id: scenario.activeUserId, name: 'Ana Fiscal' })
        expect(cancellation.requestedBy).toBeNull()

        const documentInsert = page.items[1]!
        expect(documentInsert.kind).toBe('statusChange')
        expect(documentInsert.origin).toBe('automatic')
        // Sem id gravado (`actorUserId` nulo): não havia ninguém — nunca `{ removed: true }`.
        expect(documentInsert.actor).toBeNull()
        // Solicitante com id gravado mas sem membership ativa: "usuário removido", nunca "Sistema".
        expect(documentInsert.requestedBy).toEqual({ removed: true })

        const correction = page.items[0]!
        expect(correction.eventType).toBe('110110')
        expect(correction.correctionText).toBe('Corrigir o bairro do destinatário')
        // Ator com id gravado mas sem membership ativa na empresa: nunca o id cru (D16, H13).
        expect(correction.actor).toEqual({ removed: true })

        const serialized = JSON.stringify(page)
        expect(serialized).not.toContain('xmlObjectId')
        expect(serialized).not.toContain('xml_object_id')
        expect(serialized).not.toContain('storage')
      })
    },
    60_000,
  )

  testWithPostgres(
    'answers 404 for a document that belongs to another company (H13)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const repository = new DrizzleNfeDocumentEventRepository(database.db)

        await expect(
          repository.listEvents({
            context: scenario.contextB,
            cursor: null,
            documentId: scenario.documentId,
            limit: 20,
          }),
        ).rejects.toThrow(ApiError)
      })
    },
    60_000,
  )

  testWithPostgres(
    'resolves a resent legacy event status change by joining nfe_document_status_changes on event_id',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedLegacyEventScenario(database)
        const repository = new DrizzleNfeDocumentEventRepository(database.db)

        const page = await repository.listEvents({
          context: scenario.context,
          cursor: null,
          documentId: scenario.documentId,
          limit: 20,
        })

        const legacy = page.items.find((item) => item.id === scenario.legacyEventId)
        expect(legacy).toBeDefined()
        // O evento em si continua sem snapshot próprio (D17) — o `before`/`after` vem do reprocessamento.
        expect(legacy?.statusBefore).toBe('authorized')
        expect(legacy?.statusAfter).toBe('cancelled')
      })
    },
    60_000,
  )

  testWithPostgres(
    'paginates without skipping or repeating an entry (H14)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const repository = new DrizzleNfeDocumentEventRepository(database.db)
        const expectedOrder = [
          scenario.correctionEventId,
          scenario.documentInsertChangeId,
          scenario.cancellationEventId,
        ]

        const visited: string[] = []
        let cursor: string | null = null
        for (let page = 0; page < expectedOrder.length + 1; page += 1) {
          const result = await repository.listEvents({
            context: scenario.contextA,
            cursor,
            documentId: scenario.documentId,
            limit: 1,
          })
          visited.push(...result.items.map((item) => item.id))
          if (result.nextCursor === null) break
          cursor = result.nextCursor
        }
        expect(visited).toEqual(expectedOrder)
      })
    },
    60_000,
  )
})

type Scenario = {
  readonly activeUserId: string
  readonly cancellationEventId: string
  readonly contextA: {
    readonly companyId: string
    readonly kind: 'company'
    readonly membershipId: string
    readonly permissions: ReadonlySet<never>
    readonly roles: readonly never[]
    readonly userId: string
  }
  readonly contextB: {
    readonly companyId: string
    readonly kind: 'company'
    readonly membershipId: string
    readonly permissions: ReadonlySet<never>
    readonly roles: readonly never[]
    readonly userId: string
  }
  readonly correctionEventId: string
  readonly documentId: string
  readonly documentInsertChangeId: string
}

/**
 * Empresa A: nota nascida `authorized`, um evento de CC-e (`110110`, ator sem membership ativa),
 * um evento de cancelamento (`110111`, manual, ator com nome resolvido) e uma linha de
 * `document_insert` (a nota nasceu cancelada por um evento anterior — D5). Empresa B só existe para
 * provar o isolamento (H13).
 */
async function seedScenario(database: TestDatabase): Promise<Scenario> {
  const companyIdA = crypto.randomUUID()
  const companyIdB = crypto.randomUUID()
  const activeUserId = crypto.randomUUID()
  const removedUserId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const cancellationEventId = crypto.randomUUID()
  const correctionEventId = crypto.randomUUID()
  const documentInsertChangeId = crypto.randomUUID()

  await database.db.insert(identityUsers).values([
    { id: activeUserId, status: 'active' },
    { id: removedUserId, status: 'disabled' },
  ])
  await database.db.insert(identityUserProfiles).values([
    {
      contactAddress: 'ana@example.com',
      contactChannel: 'email',
      name: 'Ana Fiscal',
      userId: activeUserId,
      username: 'ana.fiscal',
    },
    {
      contactAddress: 'ex@example.com',
      contactChannel: 'email',
      name: 'Ex Funcionário',
      userId: removedUserId,
      username: 'ex.funcionario',
    },
  ])
  await database.db.insert(companies).values([
    { id: companyIdA, status: 'active' },
    { id: companyIdB, status: 'active' },
  ])
  await database.db.insert(userCompanyMemberships).values([
    { companyId: companyIdA, id: crypto.randomUUID(), status: 'active', userId: activeUserId },
    // O ator do evento de CC-e não tem mais vínculo ativo com a empresa A (H13).
    { companyId: companyIdA, id: crypto.randomUUID(), status: 'disabled', userId: removedUserId },
  ])
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: companyIdA,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${companyIdA}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: companyIdA,
    correlationId: `correlation-${companyIdA}`,
    id: importId,
    idempotencyKey: `import-${companyIdA}`,
    requestFingerprint: `fingerprint-${companyIdA}`,
    requestedByUserId: activeUserId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: ACCESS_KEY,
    authorizationProtocol: 'protocol-0001',
    companyId: companyIdA,
    createdByUserId: activeUserId,
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-01T12:00:00.000Z'),
    model: '55',
    number: '31',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'cancelled',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: SHA,
  })

  // O cancelamento manual — o mais antigo, `registered_at` mais velho.
  await database.db.insert(nfeEvents).values({
    actorUserId: activeUserId,
    companyId: companyIdA,
    correctionText: null,
    documentStatusAfter: 'cancelled',
    documentStatusBefore: 'authorized',
    eventSequence: 1n,
    eventType: '110111',
    id: cancellationEventId,
    importId,
    occurredAt: new Date('2026-09-14T13:00:00.000Z'),
    origin: 'manual',
    protocol: '135260000000002',
    requestedByUserId: null,
    statusCode: '135',
    targetAccessKey: ACCESS_KEY,
    xmlObjectId,
  })
  await database.db.execute(
    sql`update nfe_events set created_at = '2026-09-14T13:00:00.000001Z'::timestamptz where id = ${cancellationEventId}`,
  )

  // A entrada de `document_insert` fica entre as duas — a nota nasceu cancelada por este evento (D5).
  // `requestedByUserId` aponta para o usuário removido: prova que "solicitante removido" e "Sistema
  // (distribuição agendada)" são sinais diferentes na resposta (nunca os dois como `null`).
  await database.db.insert(nfeDocumentStatusChanges).values({
    actorUserId: null,
    cause: 'document_insert',
    companyId: companyIdA,
    documentId,
    eventId: cancellationEventId,
    id: documentInsertChangeId,
    importId,
    origin: 'automatic',
    requestedByUserId: removedUserId,
    statusAfter: 'cancelled',
    statusBefore: 'authorized',
  })
  await database.db.execute(
    sql`update nfe_document_status_changes set changed_at = '2026-09-14T13:00:00.000002Z'::timestamptz where id = ${documentInsertChangeId}`,
  )

  // A CC-e — a mais recente, e o ator não tem mais membership ativa (H13: "usuário removido").
  await database.db.insert(nfeEvents).values({
    actorUserId: removedUserId,
    companyId: companyIdA,
    correctionText: 'Corrigir o bairro do destinatário',
    documentStatusAfter: 'cancelled',
    documentStatusBefore: 'cancelled',
    eventSequence: 2n,
    eventType: '110110',
    id: correctionEventId,
    importId,
    occurredAt: new Date('2026-09-15T09:00:00.000Z'),
    origin: 'manual',
    protocol: '135260000000003',
    requestedByUserId: null,
    statusCode: '135',
    targetAccessKey: ACCESS_KEY,
    xmlObjectId,
  })
  await database.db.execute(
    sql`update nfe_events set created_at = '2026-09-15T09:00:00.000003Z'::timestamptz where id = ${correctionEventId}`,
  )

  const contextFor = (companyId: string, userId: string) => ({
    companyId,
    kind: 'company' as const,
    membershipId: crypto.randomUUID(),
    permissions: new Set<never>(),
    roles: [],
    userId,
  })

  return {
    activeUserId,
    cancellationEventId,
    contextA: contextFor(companyIdA, activeUserId),
    contextB: contextFor(companyIdB, crypto.randomUUID()),
    correctionEventId,
    documentId,
    documentInsertChangeId,
  }
}

type LegacyEventScenario = {
  readonly context: {
    readonly companyId: string
    readonly kind: 'company'
    readonly membershipId: string
    readonly permissions: ReadonlySet<never>
    readonly roles: readonly never[]
    readonly userId: string
  }
  readonly documentId: string
  readonly legacyEventId: string
}

/**
 * Evento gravado antes da spec 149 (colunas `document_status_before/after` nulas, sem origem/ator —
 * D17), depois reenviado pela SEFAZ e reprocessado sob a política nova: a mudança real fica em
 * `nfe_document_status_changes` (`cause: 'event'`) referenciando o evento legado por `event_id`, não
 * dentro do próprio evento. O repositório precisa achar isso pelo join, não pelas colunas do evento.
 */
async function seedLegacyEventScenario(database: TestDatabase): Promise<LegacyEventScenario> {
  const companyId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const legacyEventId = crypto.randomUUID()
  const distributionActorUserId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: distributionActorUserId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: distributionActorUserId,
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${companyId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-${companyId}`,
    id: importId,
    idempotencyKey: `import-${companyId}`,
    requestFingerprint: `fingerprint-${companyId}`,
    requestedByUserId: distributionActorUserId,
    source: 'distribution',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: ACCESS_KEY,
    authorizationProtocol: null,
    companyId,
    createdByUserId: distributionActorUserId,
    id: documentId,
    importId,
    issuedAt: new Date('2026-01-01T12:00:00.000Z'),
    model: '55',
    number: '31',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'distribution',
    status: 'cancelled',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: SHA,
  })

  // O evento legado: sem status_code/protocol/origin/ator nem snapshot — gravado antes desta spec.
  await database.db.insert(nfeEvents).values({
    companyId,
    correctionText: null,
    eventSequence: 1n,
    eventType: '110111',
    id: legacyEventId,
    occurredAt: new Date('2026-01-02T13:00:00.000Z'),
    targetAccessKey: ACCESS_KEY,
    xmlObjectId,
  })

  // O reprocessamento, já sob a política nova, referencia o evento legado por `event_id`.
  await database.db.insert(nfeDocumentStatusChanges).values({
    actorUserId: null,
    cause: 'event',
    companyId,
    documentId,
    eventId: legacyEventId,
    importId,
    origin: 'automatic',
    requestedByUserId: null,
    statusAfter: 'cancelled',
    statusBefore: 'authorized',
  })

  return {
    context: {
      companyId,
      kind: 'company' as const,
      membershipId: crypto.randomUUID(),
      permissions: new Set<never>(),
      roles: [],
      userId: crypto.randomUUID(),
    },
    documentId,
    legacyEventId,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_events_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
