/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T301 (spec 143 T013): o unique `contractor_contacts_company_contractor_email_unique`
 * (por `lower(email)`, sem `citext` neste repositório) só se prova contra um Postgres de verdade —
 * um fake em memória não confere que o índice de fato existe nem que a violação vira
 * `ContractorContactEmailTakenError`. O isolamento por tenant (companyId + contractorId na mesma
 * condição) também é conferido aqui, com duas empresas reais no mesmo banco descartável.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { ContractorContactEmailTakenError } from '../../src/contractor-mail/domain/contractor-mail.error.js'
import { DrizzleContractorMailRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, contractors } from '../../src/database/database.schema.js'

const CONTRACTOR_TAX_ID = '30290856000160'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('contractor contacts repository integration (spec 150 T301, spec 143 T013)', () => {
  testWithPostgres(
    'creates, lists and updates a contact, and a duplicate email answers the stable 409',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, contractorId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        const created = await repository.createContractorContact({
          canDecide: false,
          companyId,
          contractorId,
          email: 'ocorrencias@example.com.br',
          receivesOccurrences: true,
        })
        expect(created.status).toBe('active')

        const listed = await repository.listContractorContacts({ companyId, contractorId })
        expect(listed).toEqual([created])

        const updated = await repository.updateContractorContact({
          companyId,
          contactId: created.id,
          contractorId,
          status: 'inactive',
        })
        expect(updated?.status).toBe('inactive')

        await expect(
          repository.createContractorContact({
            canDecide: false,
            companyId,
            contractorId,
            // Mesma caixa alta/baixa do já cadastrado, sem `citext`: o índice é sobre `lower(email)`.
            email: 'OCORRENCIAS@example.com.br',
            receivesOccurrences: false,
          }),
        ).rejects.toBeInstanceOf(ContractorContactEmailTakenError)
      })
    },
    30_000,
  )

  testWithPostgres(
    'never lists or updates a contact of a contractor from another company (BOLA)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const first = await seedTenant(database)
        const second = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)

        const contact = await repository.createContractorContact({
          canDecide: false,
          companyId: first.companyId,
          contractorId: first.contractorId,
          email: 'contato@example.com.br',
          receivesOccurrences: true,
        })

        const crossTenantList = await repository.listContractorContacts({
          companyId: second.companyId,
          contractorId: first.contractorId,
        })
        expect(crossTenantList).toEqual([])

        const crossTenantUpdate = await repository.updateContractorContact({
          companyId: second.companyId,
          contactId: contact.id,
          contractorId: first.contractorId,
          status: 'inactive',
        })
        expect(crossTenantUpdate).toBeUndefined()
      })
    },
    30_000,
  )

  /**
   * Revisão final, item de segurança B1: a fronteira HTTP recusa acima de 254 caracteres
   * (`contractor-contacts.routes.ts`), e a CHECK `contractor_contacts_email_length_check` é a
   * segunda trava, contra qualquer escrita que não passe pela rota — só se prova contra Postgres
   * de verdade.
   */
  testWithPostgres(
    'the database itself rejects an email longer than 254 characters',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, contractorId } = await seedTenant(database)
        const repository = new DrizzleContractorMailRepository(database.db)
        const oversized = `${'a'.repeat(250)}@example.com`
        expect(oversized.length).toBeGreaterThan(254)

        await expect(
          repository.createContractorContact({
            canDecide: false,
            companyId,
            contractorId,
            email: oversized,
            receivesOccurrences: false,
          }),
        ).rejects.toThrow()
      })
    },
    30_000,
  )
})

async function seedTenant(
  database: TestDatabase,
): Promise<{ readonly companyId: string; readonly contractorId: string }> {
  const companyId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(contractors).values({
    companyId,
    displayName: 'Contratante Sintética',
    id: contractorId,
    taxId: CONTRACTOR_TAX_ID,
  })
  return { companyId, contractorId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_ccontact_${crypto.randomUUID().replaceAll('-', '')}`
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
