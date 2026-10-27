/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b: o cadastro de números de WhatsApp do cliente de entrega contra Postgres — adicionar (E.164),
 * listar mascarado, editar rótulo e número, remover, limite de 10, duplicata, outra empresa (`404`), o cadastro de
 * e-mails intocado e a auditoria sem o número em claro.
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
import { createDeliveryClientWhatsAppUseCase } from '../../src/delivery-clients/application/delivery-client-whatsapp.use-case.js'
import { DrizzleDeliveryClientEmailRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-client-email.repository.js'
import { DrizzleDeliveryClientWhatsAppRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-client-whatsapp.repository.js'
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

describe('números de WhatsApp do cliente de entrega contra Postgres (spec 281 T8b)', () => {
  testWithPostgres(
    'cadastra em E.164, lista mascarado, edita rótulo e número, remove e audita sem o número em claro',
    async () => {
      await withDisposableDatabase(async (database) => {
        await seed(database)
        const numbers = useCase(database)

        const created = await numbers.add({
          actor: actorOf(),
          label: 'balcão',
          number: '(16) 99999-1111',
          taxId: TAX_ID,
        })
        expect(created.numberMasked).toBe('+55 ••••1111')
        expect(created.createdByKind).toBe('office')
        const [stored] = await database.db
          .select({
            address: deliveryClientContacts.address,
            channel: deliveryClientContacts.channel,
          })
          .from(deliveryClientContacts)
        expect(stored).toEqual({ address: '+5516999991111', channel: 'whatsapp' })

        // O cadastro de e-mails não enxerga o número, e o de WhatsApp não enxerga e-mail.
        const emails = createDeliveryClientEmailsUseCase({
          repository: new DrizzleDeliveryClientEmailRepository(database.db),
        })
        await emails.add({
          actor: actorOf(),
          address: 'contas@mercado.test',
          label: '',
          purpose: 'boleto',
          taxId: TAX_ID,
        })
        expect(await emails.list({ companyId: COMPANY_ID, taxId: TAX_ID })).toHaveLength(1)
        expect(await numbers.list({ companyId: COMPANY_ID, taxId: TAX_ID })).toHaveLength(1)

        const relabeled = await numbers.update({
          actor: actorOf(),
          label: 'recebimento',
          numberId: created.id,
          taxId: TAX_ID,
        })
        expect(relabeled.label).toBe('recebimento')
        const changed = await numbers.update({
          actor: actorOf(),
          number: '16 98888 2222',
          numberId: created.id,
          taxId: TAX_ID,
        })
        expect(changed.numberMasked).toBe('+55 ••••2222')

        await numbers.remove({ actor: actorOf(), numberId: created.id, taxId: TAX_ID })
        expect(await numbers.list({ companyId: COMPANY_ID, taxId: TAX_ID })).toEqual([])

        const audit = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.entityType, 'delivery_client_whatsapp'))
        expect(audit.map((row) => row.action).sort()).toEqual([
          'delivery-client-whatsapp.created',
          'delivery-client-whatsapp.removed',
          'delivery-client-whatsapp.updated',
          'delivery-client-whatsapp.updated',
        ])
        expect(JSON.stringify(audit)).not.toContain('99999')
        expect(JSON.stringify(audit)).not.toContain('98888')
      })
    },
  )

  testWithPostgres('recusa número inválido, duplicata e o 11º; outra empresa é 404', async () => {
    await withDisposableDatabase(async (database) => {
      await seed(database)
      const numbers = useCase(database)
      const add = (number: string) =>
        numbers.add({ actor: actorOf(), label: '', number, taxId: TAX_ID })

      await expect(add('123')).rejects.toMatchObject({
        code: 'WHATSAPP_NUMBER_INVALID',
        status: 400,
      })
      const first = await add('+5516999990000')
      await expect(add('(16) 99999-0000')).rejects.toMatchObject({
        code: 'DELIVERY_CLIENT_WHATSAPP_ALREADY_EXISTS',
        details: [{ field: 'number', message: first.id }],
        status: 409,
      })
      for (let index = 1; index < DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE; index += 1) {
        await add(`+55169999${String(index).padStart(5, '0')}`)
      }
      await expect(add('+5516911112222')).rejects.toMatchObject({
        code: 'DELIVERY_CLIENT_WHATSAPP_LIMIT_REACHED',
        status: 422,
      })

      const other = { ...actorOf(OTHER_COMPANY_ID) }
      await expect(
        numbers.add({ actor: other, label: '', number: '+5516911112222', taxId: TAX_ID }),
      ).rejects.toMatchObject({ status: 404 })
      await expect(
        numbers.remove({ actor: other, numberId: first.id, taxId: TAX_ID }),
      ).rejects.toMatchObject({ code: 'DELIVERY_CLIENT_WHATSAPP_NOT_FOUND', status: 404 })
    })
  })

  testWithPostgres('inclusões simultâneas no limite não passam de 10', async () => {
    await withDisposableDatabase(async (database) => {
      await seed(database)
      const numbers = useCase(database)
      const results = await Promise.allSettled(
        Array.from({ length: 14 }, (_unused, index) =>
          numbers.add({
            actor: actorOf(),
            label: '',
            number: `+55169888${String(index).padStart(5, '0')}`,
            taxId: TAX_ID,
          }),
        ),
      )
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(
        DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
      )
    })
  })
})

function useCase(database: TestDatabase) {
  return createDeliveryClientWhatsAppUseCase({
    repository: new DrizzleDeliveryClientWhatsAppRepository(database.db),
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
    namePrefix: 'transportada_281_t8b',
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
