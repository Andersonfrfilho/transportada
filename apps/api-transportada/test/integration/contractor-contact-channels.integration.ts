/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T301 (RF5, D6), contra Postgres real: o preenchimento da migration leva os dois campos
 * antigos para `types` sem mudar o sentido de nada, e os CHECKs recusam telefone fora do formato do
 * WhatsApp, aceite sem telefone e WhatsApp preferido sem aceite. O `migration-test` roda sobre banco
 * vazio — é aqui que o `UPDATE` encontra linhas.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq } from 'drizzle-orm'

import { createContractorContactsUseCase } from '../../src/contractor-mail/application/contractor-contacts.use-case.js'
import { DrizzleContractorMailRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  contractorContacts,
  contractors,
  identityUsers,
} from '../../src/database/database.schema.js'

const MIGRATION_SQL = new URL(
  '../../drizzle/20260924201711_contractor_contact_channels/migration.sql',
  import.meta.url,
)

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/** O `UPDATE` de preenchimento, lido do próprio arquivo — o teste prova o que vai para produção. */
async function readBackfillStatement(): Promise<string> {
  const statements = (await Bun.file(MIGRATION_SQL).text()).split('--> statement-breakpoint')
  const backfill = statements.find((statement) =>
    statement.includes('UPDATE "contractor_contacts"'),
  )
  if (backfill === undefined) throw new Error('EXPECTED_BACKFILL')
  return backfill
}

async function seedContractor(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(contractors).values({
    companyId,
    displayName: 'Contratante Sintética',
    id: contractorId,
    taxId: '30290856000160',
  })
  return { companyId, contractorId, userId }
}

async function rejects(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation()
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
    return cause instanceof Error ? cause.message : String(cause)
  }
  throw new Error('EXPECTED_REJECTION')
}

describe('contatos da contratante com tipos e canais (spec 183 T301)', () => {
  testWithPostgres(
    'o preenchimento leva receives_occurrences e can_decide para types, nas quatro combinações',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, contractorId } = await seedContractor(database)
        await database.db.insert(contractorContacts).values(
          [
            { canDecide: false, email: 'a@example.test', receivesOccurrences: false },
            { canDecide: false, email: 'b@example.test', receivesOccurrences: true },
            { canDecide: true, email: 'c@example.test', receivesOccurrences: false },
            { canDecide: true, email: 'd@example.test', receivesOccurrences: true },
          ].map((contact) => ({ ...contact, companyId, contractorId })),
        )

        await database.db.execute(await readBackfillStatement())

        const rows = await database.db
          .select({
            email: contractorContacts.email,
            occurrenceStages: contractorContacts.occurrenceStages,
            preferredChannel: contractorContacts.preferredChannel,
            types: contractorContacts.types,
          })
          .from(contractorContacts)
          .where(eq(contractorContacts.companyId, companyId))
          .orderBy(asc(contractorContacts.email))
        expect(rows.map((row) => [row.email, row.types])).toEqual([
          ['a@example.test', []],
          ['b@example.test', ['occurrences']],
          ['c@example.test', ['approves_charges']],
          ['d@example.test', ['occurrences', 'approves_charges']],
        ])
        for (const row of rows) {
          expect(row.occurrenceStages).toEqual(['separation', 'delivery', 'stop'])
          expect(row.preferredChannel).toBe('email')
        }
      })
    },
    30_000,
  )

  testWithPostgres(
    'recusa telefone fora do formato, tipo fora da lista, aceite sem telefone e WhatsApp sem aceite',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, contractorId, userId } = await seedContractor(database)
        const base = { companyId, contractorId, email: 'x@example.test' }
        const insert = (values: Partial<typeof contractorContacts.$inferInsert>) =>
          database.db.insert(contractorContacts).values({ ...base, ...values })

        expect(await rejects(() => insert({ phone: '11999990001' }))).toContain(
          'contractor_contacts_phone_check',
        )
        expect(
          await rejects(() =>
            insert({
              types: ['occurrences', 'marketing'] as never,
            }),
          ),
        ).toContain('contractor_contacts_types_check')
        expect(
          await rejects(() =>
            insert({ whatsappOptInAt: new Date(), whatsappOptInByUserId: userId }),
          ),
        ).toContain('contractor_contacts_whatsapp_opt_in_phone_check')
        expect(
          await rejects(() => insert({ phone: '5511999990001', whatsappOptInAt: new Date() })),
        ).toContain('contractor_contacts_whatsapp_opt_in_pair_check')
        expect(
          await rejects(() => insert({ phone: '5511999990001', preferredChannel: 'whatsapp' })),
        ).toContain('contractor_contacts_preferred_whatsapp_check')

        await insert({
          name: 'Compradora Souza',
          phone: '5511999990001',
          preferredChannel: 'whatsapp',
          roleLabel: 'Compras',
          types: ['occurrences', 'approves_charges'],
          whatsappOptInAt: new Date('2026-09-24T10:00:00.000Z'),
          whatsappOptInByUserId: userId,
        })
      })
    },
    30_000,
  )
})

/**
 * Spec 183 T302: o caso de uso sobre o repositório de verdade. O que a política decidiu chega ao
 * banco, volta na leitura, e o contato de uma empresa não é achado com o contexto de outra.
 */
describe('escrita de contato com tipos e aceite contra Postgres (spec 183 T302)', () => {
  testWithPostgres(
    'grava e relê tudo; trocar o número derruba o aceite; outra empresa não acha o contato',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, contractorId, userId } = await seedContractor(database)
        const other = await seedContractor(database)
        const now = new Date('2026-09-24T18:00:00.000Z')
        const useCase = createContractorContactsUseCase({
          getContractor: { execute: async () => undefined },
          now: () => now,
          repository: new DrizzleContractorMailRepository(database.db),
        })
        const context = {
          companyId,
          permissions: new Set(['settings.manage'] as const),
          userId,
        } as unknown as Parameters<typeof useCase.create>[0]['context']

        const created = await useCase.create({
          context,
          contractorId,
          email: 'Compras@Example.test',
          name: 'Compradora Souza',
          occurrenceStages: ['delivery'],
          phone: '(11) 99999-0001',
          preferredChannel: 'whatsapp',
          roleLabel: 'Compras',
          types: ['approves_charges', 'occurrences'],
          whatsappOptIn: true,
        })
        expect(created).toMatchObject({
          canDecide: true,
          email: 'compras@example.test',
          phone: '5511999990001',
          receivesOccurrences: true,
          types: ['occurrences', 'approves_charges'],
          whatsappOptInAt: now,
          whatsappOptInByUserId: userId,
        })

        const [listed] = await useCase.list({ context, contractorId })
        expect(listed).toEqual(created)

        const changed = await useCase.update({
          contactId: created.id,
          context,
          contractorId,
          phone: '11988887777',
          preferredChannel: 'email',
        })
        expect(changed).toMatchObject({
          phone: '5511988887777',
          preferredChannel: 'email',
          whatsappOptInAt: null,
          whatsappOptInByUserId: null,
        })

        const repository = new DrizzleContractorMailRepository(database.db)
        expect(
          await repository.findContractorContact({
            companyId: other.companyId,
            contactId: created.id,
            contractorId,
          }),
        ).toBeUndefined()
      })
    },
    30_000,
  )
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_ccchannel_${crypto.randomUUID().replaceAll('-', '')}`
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
