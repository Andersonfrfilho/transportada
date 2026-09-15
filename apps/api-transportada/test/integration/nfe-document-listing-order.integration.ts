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
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { DrizzleNfeDocumentRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document.repository'
import type { NfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SHA = 'b'.repeat(64)
const NOT_STORAGE = {} as NfeStorageGateway
const CURSOR_SHAPE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z::\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z::[0-9a-f-]{36}$/

type SeededDocument = Readonly<{
  id: string
  issuedAt: string
  number: string
  updatedAt: string
}>

/**
 * Na ordem esperada. `first`/`second` diferem só no microssegundo — o `Date` do JS perderia a
 * diferença, e o cursor que a arredondasse pularia a segunda nota. `thirdTie`/`fourthTie` empatam na
 * atualização e se resolvem pela emissão; `fourthTie`/`fifthTie` empatam nas duas e caem no id.
 * `sixth` tem a emissão mais nova de todas e mesmo assim vem por último: quem manda é a atualização.
 */
const PRIMARY_DOCUMENTS: readonly SeededDocument[] = [
  {
    id: '00000000-0000-4000-8000-00000000a001',
    issuedAt: '2026-09-01T12:00:00.000000Z',
    number: '1',
    updatedAt: '2026-09-14T10:00:00.000002Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000a002',
    issuedAt: '2026-09-10T12:00:00.000000Z',
    number: '2',
    updatedAt: '2026-09-14T10:00:00.000001Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000a003',
    issuedAt: '2026-09-12T12:00:00.000000Z',
    number: '3',
    updatedAt: '2026-09-14T09:00:00.000000Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000a005',
    issuedAt: '2026-09-11T12:00:00.000000Z',
    number: '4',
    updatedAt: '2026-09-14T09:00:00.000000Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000a004',
    issuedAt: '2026-09-11T12:00:00.000000Z',
    number: '5',
    updatedAt: '2026-09-14T09:00:00.000000Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000a006',
    issuedAt: '2026-09-14T12:00:00.000000Z',
    number: '6',
    updatedAt: '2026-09-13T00:00:00.000000Z',
  },
]

/** Mais novas que tudo da empresa principal: se o filtro de tenant falhar, elas abrem a página. */
const OTHER_DOCUMENTS: readonly SeededDocument[] = [
  {
    id: '00000000-0000-4000-8000-00000000b001',
    issuedAt: '2026-09-14T12:00:00.000000Z',
    number: '1',
    updatedAt: '2026-09-15T10:00:00.000000Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000b002',
    issuedAt: '2026-09-14T09:00:00.000000Z',
    number: '2',
    updatedAt: '2026-09-14T09:00:00.000000Z',
  },
]

const EXPECTED_ORDER = PRIMARY_DOCUMENTS.map((document) => document.id)

describe('nfe document listing order integration', () => {
  testWithPostgres(
    'a mais atualizada abre a lista, a emissão desempata e o id fecha o empate',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { context } = await seedTenants(database)
        const repository = new DrizzleNfeDocumentRepository(database.db, NOT_STORAGE)

        const page = await repository.list({ accessKey: null, context, cursor: null, limit: 50 })

        expect(page.items.map((item) => item.id)).toEqual(EXPECTED_ORDER)
        expect(page.nextCursor).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'a paginação por cursor não pula nem repete nota, nem sai da empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { context } = await seedTenants(database)
        const repository = new DrizzleNfeDocumentRepository(database.db, NOT_STORAGE)

        for (const limit of [1, 2, 4]) {
          const visited: string[] = []
          let cursor: string | null = null
          for (let pageIndex = 0; pageIndex < EXPECTED_ORDER.length + 1; pageIndex += 1) {
            const page = await repository.list({ accessKey: null, context, cursor, limit })
            visited.push(...page.items.map((item) => item.id))
            if (page.nextCursor === null) break
            expect(page.nextCursor).toMatch(CURSOR_SHAPE)
            cursor = page.nextCursor
          }
          expect(visited).toEqual(EXPECTED_ORDER)
        }
      })
    },
    60_000,
  )

  testWithPostgres(
    'quando um evento fiscal cancela a nota, ela sobe ao topo mesmo com a emissão mais antiga (spec 149 H1)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { context, otherCompanyId } = await seedTenants(database)
        const repository = new DrizzleNfeDocumentRepository(database.db, NOT_STORAGE)
        // Hoje a terceira colocada (updatedAt '2026-09-14T09:00:00.000000Z') — nem a mais nova
        // emissão, nem a mais nova atualização antes do cancelamento.
        const cancelledDocument = PRIMARY_DOCUMENTS[2]
        if (cancelledDocument === undefined) throw new Error('MISSING_FIXTURE_DOCUMENT')
        const cancelledAt = '2026-09-16T08:00:00.000000Z'

        // Mesmas duas colunas que `applyStatusChange` (worker, spec 149 T3) grava juntas dentro
        // da mesma transação, quando um `procEventoNFe` de cancelamento muda o status da nota.
        await database.db.execute(
          sql`update nfe_documents
            set status = 'cancelled', updated_at = ${cancelledAt}::timestamptz
            where id = ${cancelledDocument.id}`,
        )

        const page = await repository.list({ accessKey: null, context, cursor: null, limit: 50 })

        expect(page.items[0]?.id).toBe(cancelledDocument.id)
        expect(page.items[0]?.status).toBe('cancelled')
        expect(page.items.slice(1).map((item) => item.id)).toEqual(
          EXPECTED_ORDER.filter((id) => id !== cancelledDocument.id),
        )
        // Contrato negativo de tenant: a nota cancelada não vaza para a leitura da outra empresa.
        const otherPage = await repository.list({
          accessKey: null,
          context: { ...context, companyId: otherCompanyId },
          cursor: null,
          limit: 50,
        })
        expect(otherPage.items.some((item) => item.id === cancelledDocument.id)).toBe(false)
      })
    },
    60_000,
  )
})

async function seedTenants(database: TestDatabase): Promise<{
  readonly context: {
    readonly companyId: string
    readonly kind: 'company'
    readonly membershipId: string
    readonly permissions: ReadonlySet<never>
    readonly roles: readonly never[]
    readonly userId: string
  }
  readonly otherCompanyId: string
}> {
  const primary = await seedCompany(database, PRIMARY_DOCUMENTS)
  const other = await seedCompany(database, OTHER_DOCUMENTS)
  return {
    otherCompanyId: other.companyId,
    context: {
      companyId: primary.companyId,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set<never>(),
      roles: [],
      userId: primary.userId,
    },
  }
}

async function seedCompany(
  database: TestDatabase,
  documents: readonly SeededDocument[],
): Promise<{ readonly companyId: string; readonly userId: string }> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
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
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values(
    documents.map((document) => ({
      accessKey: `35260811111111000191550010${document.number.padStart(8, '0')}1000000018`,
      authorizationProtocol: `protocol-${document.id}`,
      companyId,
      createdByUserId: userId,
      id: document.id,
      importId,
      issuedAt: new Date(document.issuedAt),
      model: '55',
      number: document.number,
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload' as const,
      status: 'authorized' as const,
      totalValue: '1000.0000',
      xmlObjectId,
      xmlSha256: SHA,
    })),
  )
  /** Os microssegundos vão como texto: um `Date` do JS os truncaria antes de chegar ao banco. */
  for (const document of documents) {
    await database.db.execute(
      sql`update nfe_documents
        set updated_at = ${document.updatedAt}::timestamptz, issued_at = ${document.issuedAt}::timestamptz
        where id = ${document.id}`,
    )
  }
  return { companyId, userId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_order_${crypto.randomUUID().replaceAll('-', '')}`
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
