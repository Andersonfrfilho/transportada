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
import { createDrizzleAggregateApplicationAttachmentReviewRepository } from '../../src/fleet/infrastructure/drizzle-aggregate-application-attachment-review.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/**
 * Cada caso cria um banco descartável e roda todas as migrations — ~2s ocioso, e o teto padrão de
 * 5s do Bun vira sorteio em runner concorrido. Medido: dois casos estouraram quando outra suíte de
 * banco corria junto, e passaram sozinhos logo depois.
 */
const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000

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

/**
 * Um anexo já lido: é o estado em que a revisão o encontra, e o único em que a limpeza tem o que
 * limpar. Devolve o `id` (não o `draft_id`), porque é por ele que a revisão endereça.
 */
async function seedReadAttachment(
  db: TestDatabase['db'],
  input: { readonly applicationId: string; readonly companyId: string },
): Promise<string> {
  const storedObjectId = crypto.randomUUID()
  await db.insert(storedObjects).values({
    bucket: 'test-bucket',
    companyId: input.companyId,
    id: storedObjectId,
    mimeType: 'application/pdf',
    objectKey: `tenants/${input.companyId}/aggregate-application-attachments/cnh/${storedObjectId}`,
    provider: 'object-storage',
    purpose: 'aggregate_application_attachment',
    sha256: 'b'.repeat(64),
    sizeBytes: BigInt(2048),
    status: 'final',
  })

  const [row] = await db
    .insert(aggregateApplicationAttachments)
    .values({
      applicationId: input.applicationId,
      companyId: input.companyId,
      // O que a leitura do servidor grava: nome, registro da CNH e o CPF do proprietário do CRLV.
      extractedFields: { licenseNumber: '01234567890', name: 'Maria de Sousa' },
      storedObjectId,
      type: 'cnh',
    })
    .returning({ id: aggregateApplicationAttachments.id })
  if (row === undefined) throw new Error('attachment not seeded')
  return row.id
}

async function readExtractedFields(db: TestDatabase['db'], attachmentId: string): Promise<unknown> {
  const [row] = await db
    .select({
      extractedFields: aggregateApplicationAttachments.extractedFields,
      status: aggregateApplicationAttachments.status,
    })
    .from(aggregateApplicationAttachments)
    .where(eq(aggregateApplicationAttachments.id, attachmentId))
  return row
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
  testWithPostgres(
    'amarra o rascunho da própria empresa',
    async () => {
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
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /** `draft_id` é global e vem de cliente anônimo: sem o filtro de empresa, isto roubaria o anexo. */
  testWithPostgres(
    'não amarra rascunho de outra empresa, e não falha por isso',
    async () => {
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
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /** Rascunho já vinculado pertence a outra candidatura: reivindicá-lo seria roubo, não vínculo. */
  testWithPostgres(
    'não rouba rascunho já vinculado a outra candidatura',
    async () => {
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
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /** Identificador que não existe é ausência, nunca erro — o submit responde 202 de qualquer modo. */
  testWithPostgres(
    'identificador desconhecido não derruba o vínculo',
    async () => {
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
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
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

/**
 * A leitura do servidor guarda CPF e número de CNH em texto puro, numa tabela sem prazo de descarte
 * — inclusive de terceiros, porque o proprietário do CRLV frequentemente não é quem se candidatou
 * (achado de 02/09/2026 no `docs/SECURITY.md`). A coluna existe para a **conferência**: revisada a
 * candidatura, ela é cópia redundante de dado pessoal, e o arquivo original continua no bucket.
 *
 * A limpeza vai no **mesmo `UPDATE`** da decisão de propósito: em duas escritas, uma falha no meio
 * deixaria a PII para trás justamente no caminho de erro, que é o menos observado.
 */
describe('a revisão descarta a leitura, contra Postgres', () => {
  testWithPostgres(
    'aprovar limpa os campos lidos e mantém a decisão',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const applicationId = await seedApplication(db, companyId)
        const attachmentId = await seedReadAttachment(db, { applicationId, companyId })

        await createDrizzleAggregateApplicationAttachmentReviewRepository(db).review({
          attachmentId,
          companyId,
          decision: 'approved',
          rejectionReason: '',
          reviewedBy: crypto.randomUUID(),
        })

        expect(await readExtractedFields(db, attachmentId)).toEqual({
          extractedFields: null,
          status: 'approved',
        })
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'reprovar limpa os campos lidos e mantém o motivo',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = await seedCompany(db)
        const applicationId = await seedApplication(db, companyId)
        const attachmentId = await seedReadAttachment(db, { applicationId, companyId })

        await createDrizzleAggregateApplicationAttachmentReviewRepository(db).review({
          attachmentId,
          companyId,
          decision: 'rejected',
          rejectionReason: 'documento ilegível',
          reviewedBy: crypto.randomUUID(),
        })

        expect(await readExtractedFields(db, attachmentId)).toEqual({
          extractedFields: null,
          status: 'rejected',
        })
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})
