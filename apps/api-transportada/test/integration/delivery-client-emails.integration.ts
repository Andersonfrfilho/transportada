/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T2 (CA1): o cadastro de e-mails do cliente de entrega contra Postgres — adicionar, listar
 * mascarado, editar o rótulo, remover, limite de 10 por tipo, duplicata sem distinguir caixa, outra
 * empresa (`404`) e a auditoria sem o endereço em claro.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  deliveryClientContacts,
  deliveryClients,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { createDeliveryClientEmailsUseCase } from '../../src/delivery-clients/application/delivery-client-emails.use-case.js'
import { DrizzleDeliveryClientEmailRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-client-email.repository.js'
import { DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE } from '../../src/shared/delivery-client-email.constant.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const COMPANY_ID = '00000000-0000-4000-8000-000000000a01'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000a02'
const USER_ID = '00000000-0000-4000-8000-000000000a11'
const TAX_ID = '12345678000190'

function actorOf(companyId = COMPANY_ID) {
  return { companyId, correlationId: 'corr-279-t2', ipAddress: '203.0.113.9', userId: USER_ID }
}

describe('e-mails do cliente de entrega contra Postgres (spec 279 T2)', () => {
  testWithPostgres(
    'cadastra, lista mascarado, edita o rótulo, remove e audita sem o endereço em claro',
    async () => {
      await withDisposableDatabase(async (database) => {
        await seed(database)
        const emails = useCase(database)

        const created = await emails.add({
          actor: actorOf(),
          address: 'Contas@Mercado.test',
          label: 'financeiro',
          purpose: 'boleto',
          taxId: TAX_ID,
        })
        expect(created.addressMasked).toBe('C***@M***.test')
        expect(created.createdByKind).toBe('office')
        expect(JSON.stringify(created)).not.toContain('Contas@Mercado.test')

        // Mesmo endereço, outro tipo: existe nos dois.
        await emails.add({
          actor: actorOf(),
          address: 'contas@mercado.test',
          label: '',
          purpose: 'finance',
          taxId: TAX_ID,
        })

        const boleto = await emails.list({
          companyId: COMPANY_ID,
          purpose: 'boleto',
          taxId: TAX_ID,
        })
        expect(boleto.map((email) => email.id)).toEqual([created.id])
        expect(await emails.list({ companyId: COMPANY_ID, taxId: TAX_ID })).toHaveLength(2)

        const relabeled = await emails.updateLabel({
          actor: actorOf(),
          emailId: created.id,
          label: 'dono',
          taxId: TAX_ID,
        })
        expect(relabeled.label).toBe('dono')

        await emails.remove({ actor: actorOf(), emailId: created.id, taxId: TAX_ID })
        expect(
          await emails.list({ companyId: COMPANY_ID, purpose: 'boleto', taxId: TAX_ID }),
        ).toEqual([])

        const audit = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityType, 'delivery_client_email'))
        expect(audit.map((row) => row.action).sort()).toEqual([
          'delivery-client-email.created',
          'delivery-client-email.created',
          'delivery-client-email.removed',
          'delivery-client-email.updated',
        ])
        expect(JSON.stringify(audit)).not.toContain('ontas@')
        expect(JSON.stringify(audit)).not.toContain('mercado.test')
      })
    },
  )

  testWithPostgres(
    'duplicata não distingue caixa e o limite é de 10 por tipo, não por cliente',
    async () => {
      await withDisposableDatabase(async (database) => {
        await seed(database)
        const emails = useCase(database)
        const add = (address: string, purpose: 'boleto' | 'invoice' = 'boleto') =>
          emails.add({ actor: actorOf(), address, label: '', purpose, taxId: TAX_ID })

        const first = await add('a@mercado.test')
        await expect(add('A@MERCADO.TEST')).rejects.toMatchObject({
          code: 'DELIVERY_CLIENT_EMAIL_ALREADY_EXISTS',
          details: [{ field: 'address', message: first.id }],
          status: 409,
        })

        for (let index = 1; index < DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE; index += 1) {
          await add(`caixa${String(index)}@mercado.test`)
        }
        await expect(add('onze@mercado.test')).rejects.toMatchObject({
          code: 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED',
          status: 422,
        })
        // Outro tipo do mesmo cliente segue livre.
        await add('onze@mercado.test', 'invoice')
      })
    },
  )

  testWithPostgres('inclusões simultâneas no limite não passam de 10', async () => {
    await withDisposableDatabase(async (database) => {
      await seed(database)
      const emails = useCase(database)

      const results = await Promise.allSettled(
        Array.from({ length: 14 }, (_unused, index) =>
          emails.add({
            actor: actorOf(),
            address: `corrida${String(index)}@mercado.test`,
            label: '',
            purpose: 'boleto',
            taxId: TAX_ID,
          }),
        ),
      )

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
        DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
      )
      const stored = await database.db.select().from(deliveryClientContacts)
      expect(stored).toHaveLength(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE)
    })
  })

  testWithPostgres('outra empresa e cliente inexistente são 404, e nada vaza', async () => {
    await withDisposableDatabase(async (database) => {
      await seed(database)
      const emails = useCase(database)
      const created = await emails.add({
        actor: actorOf(),
        address: 'contas@mercado.test',
        label: '',
        purpose: 'boleto',
        taxId: TAX_ID,
      })

      const other = actorOf(OTHER_COMPANY_ID)
      await expect(
        emails.list({ companyId: OTHER_COMPANY_ID, taxId: TAX_ID }),
      ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_NOT_FOUND', status: 404 })
      await expect(
        emails.add({
          actor: other,
          address: 'x@y.test',
          label: '',
          purpose: 'boleto',
          taxId: TAX_ID,
        }),
      ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_NOT_FOUND' })
      await expect(
        emails.updateLabel({ actor: other, emailId: created.id, label: 'x', taxId: TAX_ID }),
      ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_EMAIL_NOT_FOUND', status: 404 })
      await expect(
        emails.remove({ actor: other, emailId: created.id, taxId: TAX_ID }),
      ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_EMAIL_NOT_FOUND', status: 404 })
      await expect(
        emails.list({ companyId: COMPANY_ID, taxId: '99999999000199' }),
      ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_NOT_FOUND' })

      expect(await emails.list({ companyId: COMPANY_ID, taxId: TAX_ID })).toHaveLength(1)
    })
  })
})

function useCase(database: TestDatabase) {
  return createDeliveryClientEmailsUseCase({
    repository: new DrizzleDeliveryClientEmailRepository(database.db),
  })
}

async function seed(database: TestDatabase): Promise<void> {
  await database.db.insert(companies).values([
    { id: COMPANY_ID, status: 'active' },
    { id: OTHER_COMPANY_ID, status: 'active' },
  ])
  await database.db.insert(identityUsers).values({ id: USER_ID, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId: COMPANY_ID, status: 'active', userId: USER_ID })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: COMPANY_ID, displayName: 'Loja Central', taxId: TAX_ID })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_279_t2',
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
