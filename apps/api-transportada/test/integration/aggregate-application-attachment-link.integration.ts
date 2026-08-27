/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O vínculo do anexo é um UPDATE condicional, e são as condições que importam: só rascunho **desta
 * empresa** e ainda **sem candidatura**. Nada disso aparece em teste com repositório falso — lá o
 * `where` é uma string que ninguém executa.
 *
 * As três guardas existem porque `draft_id` é global e chega de cliente anônimo: sem elas, quem
 * descobrisse um identificador anexaria o documento de outra pessoa à própria candidatura.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  aggregateApplicationAttachments,
  aggregateApplications,
  companies,
  storedObjects,
} from '../../src/database/database.schema.js'
import { createDrizzleAggregateApplicationRepository } from '../../src/fleet/infrastructure/drizzle-aggregate-application.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

/**
 * O documento varia por candidatura de propósito: `aggregate_applications_company_tax_id_pending_unique`
 * proíbe duas pendentes para o mesmo documento na mesma empresa, e o teste não existe para brigar
 * com essa regra.
 */
async function seedApplication(
  db: TestDatabase['db'],
  companyId: string,
  taxId = '12345678909',
): Promise<string> {
  const [row] = await db
    .insert(aggregateApplications)
    .values({
      companyId,
      email: 'fulano@example.test',
      name: 'Fulano de Tal',
      phone: '11999999999',
      taxId,
    })
    .returning({ id: aggregateApplications.id })
  if (row === undefined) throw new Error('application not seeded')
  return row.id
}

async function seedDraft(
  db: TestDatabase['db'],
  input: { readonly applicationId?: string; readonly companyId: string },
): Promise<string> {
  const storedObjectId = crypto.randomUUID()
  await db.insert(storedObjects).values({
    bucket: 'test-bucket',
    companyId: input.companyId,
    id: storedObjectId,
    mimeType: 'application/pdf',
    objectKey: `tenants/${input.companyId}/aggregate-application-attachments/ccmei/${storedObjectId}`,
    provider: 'object-storage',
    purpose: 'aggregate_application_attachment',
    sha256: 'a'.repeat(64),
    sizeBytes: BigInt(1024),
    status: 'final',
  })

  const [row] = await db
    .insert(aggregateApplicationAttachments)
    .values({
      companyId: input.companyId,
      storedObjectId,
      type: 'ccmei',
      ...(input.applicationId === undefined ? {} : { applicationId: input.applicationId }),
    })
    .returning({ draftId: aggregateApplicationAttachments.draftId })
  if (row === undefined) throw new Error('draft not seeded')
  return row.draftId
}

async function readApplicationId(
  db: TestDatabase['db'],
  draftId: string,
): Promise<string | null | undefined> {
  const [row] = await db
    .select({ applicationId: aggregateApplicationAttachments.applicationId })
    .from(aggregateApplicationAttachments)
    .where(eq(aggregateApplicationAttachments.draftId, draftId))
  return row?.applicationId
}

describe('vínculo de anexo à candidatura, contra Postgres', () => {
  testWithPostgres('amarra o rascunho da própria empresa', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const applicationId = await seedApplication(db, companyId)
      const draftId = await seedDraft(db, { companyId })

      await createDrizzleAggregateApplicationRepository(db).linkAttachmentDrafts({
        applicationId,
        companyId,
        draftIds: [draftId],
      })

      expect(await readApplicationId(db, draftId)).toBe(applicationId)
    })
  })

  /** `draft_id` é global e vem de cliente anônimo: sem o filtro de empresa, isto roubaria o anexo. */
  testWithPostgres('não amarra rascunho de outra empresa, e não falha por isso', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const otherCompanyId = await seedCompany(db)
      const applicationId = await seedApplication(db, companyId)
      const foreignDraftId = await seedDraft(db, { companyId: otherCompanyId })

      await createDrizzleAggregateApplicationRepository(db).linkAttachmentDrafts({
        applicationId,
        companyId,
        draftIds: [foreignDraftId],
      })

      expect(await readApplicationId(db, foreignDraftId)).toBeNull()
    })
  })

  /** Rascunho já vinculado pertence a outra candidatura: reivindicá-lo seria roubo, não vínculo. */
  testWithPostgres('não rouba rascunho já vinculado a outra candidatura', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const first = await seedApplication(db, companyId)
      const second = await seedApplication(db, companyId, '98765432100')
      const draftId = await seedDraft(db, { applicationId: first, companyId })

      await createDrizzleAggregateApplicationRepository(db).linkAttachmentDrafts({
        applicationId: second,
        companyId,
        draftIds: [draftId],
      })

      expect(await readApplicationId(db, draftId)).toBe(first)
    })
  })

  /** Identificador que não existe é ausência, nunca erro — o submit responde 202 de qualquer modo. */
  testWithPostgres('identificador desconhecido não derruba o vínculo', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const applicationId = await seedApplication(db, companyId)
      const draftId = await seedDraft(db, { companyId })

      await createDrizzleAggregateApplicationRepository(db).linkAttachmentDrafts({
        applicationId,
        companyId,
        draftIds: [crypto.randomUUID(), draftId],
      })

      expect(await readApplicationId(db, draftId)).toBe(applicationId)
    })
  })
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_attachlink_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
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
