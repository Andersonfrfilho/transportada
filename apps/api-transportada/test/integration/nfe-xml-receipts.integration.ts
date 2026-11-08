/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: a autorização do remetente do WhatsApp (número verificado e dentro da validade + vínculo ativo + papel que
 * importa nota) e o recibo gravado pelo webhook, contra Postgres de verdade e as migrations reais (CHECKs incluídos).
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import { nfeXmlReceipts } from '../../src/database/database.schema'
import { createDrizzleNfeXmlReceiptReadRepository } from '../../src/nfe-xml-receipts/infrastructure/drizzle-nfe-xml-receipt-read.repository'
import { createDrizzleWhatsAppXmlReceiptRepository } from '../../src/nfe-xml-receipts/infrastructure/drizzle-whatsapp-xml-receipt.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-11-08T12:00:00.000Z')
const DAY_MS = 86_400_000

async function seedUser(
  database: TestDatabase,
  input: {
    companyId: string
    membershipStatus?: string
    phone: string
    role: string
    verifiedAt: Date | null
  },
) {
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  await database.db.execute(
    sql`insert into identity_users (id, status) values (${userId}, 'active')`,
  )
  await database.db.execute(sql`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${membershipId}, ${userId}, ${input.companyId}, ${input.membershipStatus ?? 'active'})
  `)
  await database.db.execute(sql`
    insert into membership_roles (membership_id, role) values (${membershipId}, ${input.role})
  `)
  await database.db.execute(sql`
    insert into user_whatsapp_phones (user_id, phone, verified_at)
    values (${userId}, ${input.phone}, ${input.verifiedAt === null ? null : input.verifiedAt.toISOString()})
  `)
  return userId
}

describe('nfe xml receipts (spec 301, API)', () => {
  testWithPostgres(
    'authorizes only a verified, in-validity number of an active member with an importing role',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const otherCompanyId = crypto.randomUUID()
        await database.db.execute(
          sql`insert into companies (id, status) values (${companyId}, 'active')`,
        )
        await database.db.execute(
          sql`insert into companies (id, status) values (${otherCompanyId}, 'active')`,
        )
        const operator = await seedUser(database, {
          companyId,
          phone: '5516988887777',
          role: 'operator',
          verifiedAt: new Date(NOW.getTime() - 5 * DAY_MS),
        })
        await seedUser(database, {
          companyId,
          phone: '5516977776666',
          role: 'viewer',
          verifiedAt: NOW,
        })
        await seedUser(database, {
          companyId,
          phone: '5516966665555',
          role: 'driver',
          verifiedAt: NOW,
        })
        await seedUser(database, {
          companyId,
          phone: '5516955554444',
          role: 'fiscal',
          verifiedAt: null,
        })
        await seedUser(database, {
          companyId,
          phone: '5516944443333',
          role: 'fiscal',
          verifiedAt: new Date(NOW.getTime() - 120 * DAY_MS),
        })
        await seedUser(database, {
          companyId,
          membershipStatus: 'disabled',
          phone: '5516933332222',
          role: 'company-admin',
          verifiedAt: NOW,
        })
        const repository = createDrizzleWhatsAppXmlReceiptRepository(database.db)
        const find = (phone: string, company = companyId) =>
          repository.findImportSender({ companyId: company, now: NOW, phone })

        expect(await find('5516988887777')).toEqual({ userId: operator })
        // as duas grafias do nono dígito são a mesma pessoa
        expect(await find('551688887777')).toEqual({ userId: operator })
        expect(await find('5516977776666')).toBeUndefined() // leitor
        expect(await find('5516966665555')).toBeUndefined() // motorista
        expect(await find('5516955554444')).toBeUndefined() // número não verificado
        expect(await find('5516944443333')).toBeUndefined() // verificação vencida (90 dias)
        expect(await find('5516933332222')).toBeUndefined() // vínculo desativado
        expect(await find('5516988887777', otherCompanyId)).toBeUndefined() // outra empresa
        expect(await find('abc')).toBeUndefined()
      })
    },
    60_000,
  )

  testWithPostgres(
    'records a pending receipt once per message, and a rejected one only with its reason',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        await database.db.execute(
          sql`insert into companies (id, status) values (${companyId}, 'active')`,
        )
        const repository = createDrizzleWhatsAppXmlReceiptRepository(database.db)
        const base = {
          companyId,
          media: {
            fileName: 'n.zip',
            mimeType: 'application/zip',
            rawMessage: { key: {}, message: {} },
            sizeBytes: 10,
          },
          providerMessageId: 'M1',
          rejectReason: null,
          replyTo: '1@g.us',
          requestedByUserId: null,
          sender: '5516988887777',
          status: 'pending' as const,
        }
        expect(await repository.recordReceipt(base)).toEqual({ created: true })
        expect(await repository.recordReceipt(base)).toEqual({ created: false })

        await repository.recordReceipt({
          ...base,
          media: null,
          providerMessageId: 'M2',
          rejectReason: 'sender_not_allowed',
          status: 'rejected',
        })
        // status `rejected` sem motivo é barrado pelo CHECK do banco
        await expect(
          repository.recordReceipt({ ...base, providerMessageId: 'M3', status: 'rejected' }),
        ).rejects.toThrow()

        const rows = await database.db.select().from(nfeXmlReceipts)
        expect(rows.map((row) => [row.providerMessageId, row.status, row.channel]).sort()).toEqual([
          ['M1', 'pending', 'whatsapp'],
          ['M2', 'rejected', 'whatsapp'],
        ])

        const list = await createDrizzleNfeXmlReceiptReadRepository(database.db).listRecent({
          companyId,
          limit: 10,
        })
        expect(list).toHaveLength(2)
        expect(
          await createDrizzleNfeXmlReceiptReadRepository(database.db).listRecent({
            companyId: crypto.randomUUID(),
            limit: 10,
          }),
        ).toEqual([])
      })
    },
    60_000,
  )
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_nfe_xml_receipts',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
