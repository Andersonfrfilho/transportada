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
    'authorizes a contractor contact with the nfe_xml type, an active status and the WhatsApp opt-in (spec 302)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const otherCompanyId = crypto.randomUUID()
        for (const id of [companyId, otherCompanyId]) {
          await database.db.execute(
            sql`insert into companies (id, status) values (${id}, 'active')`,
          )
        }
        const adminId = crypto.randomUUID()
        await database.db.execute(
          sql`insert into identity_users (id, status) values (${adminId}, 'active')`,
        )
        const [contractor] = await database.db.execute<{ id: string }>(sql`
          insert into contractors (company_id, tax_id, display_name)
          values (${companyId}, '12345678000195', 'Contratante') returning id
        `)
        const contractorId = contractor?.id ?? ''
        const seed = async (input: {
          optIn: boolean
          phone: string
          status?: string
          types: string
        }) => {
          await database.db.execute(sql`
            insert into contractor_contacts
              (company_id, contractor_id, email, phone, types, status, whatsapp_opt_in_at, whatsapp_opt_in_by_user_id)
            values (${companyId}, ${contractorId}, ${`c${input.phone}@contratante.com.br`}, ${input.phone},
              ${input.types}::text[], ${input.status ?? 'active'},
              ${input.optIn ? NOW.toISOString() : null}::timestamptz, ${input.optIn ? adminId : null}::uuid)
          `)
        }
        await seed({ optIn: true, phone: '5516911112222', types: '{nfe_xml}' })
        await seed({ optIn: true, phone: '5516922223333', types: '{occurrences}' }) // sem o tipo
        await seed({ optIn: false, phone: '5516933334444', types: '{nfe_xml}' }) // sem o aceite do WhatsApp
        await seed({ optIn: true, phone: '5516944445555', status: 'inactive', types: '{nfe_xml}' }) // inativo
        const repository = createDrizzleWhatsAppXmlReceiptRepository(database.db)
        const find = (phone: string, company = companyId) =>
          repository.findImportSender({ companyId: company, now: NOW, phone })

        expect(await find('5516911112222')).toEqual({
          userId: '00000000-0000-4000-8000-000000000006',
        })
        expect(await find('551611112222')).toEqual({
          userId: '00000000-0000-4000-8000-000000000006',
        })
        expect(await find('5516922223333')).toBeUndefined()
        expect(await find('5516933334444')).toBeUndefined()
        expect(await find('5516944445555')).toBeUndefined()
        expect(await find('5516911112222', otherCompanyId)).toBeUndefined()
      })
    },
    60_000,
  )

  testWithPostgres(
    'the listing carries the import outcome: counts, when it finished and the contractors of the notes (spec 303)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        await database.db.execute(
          sql`insert into companies (id, status) values (${companyId}, 'active')`,
        )
        const userId = crypto.randomUUID()
        await database.db.execute(
          sql`insert into identity_users (id, status) values (${userId}, 'active')`,
        )
        const membershipId = crypto.randomUUID()
        await database.db.execute(sql`
          insert into user_company_memberships (id, user_id, company_id, status)
          values (${membershipId}, ${userId}, ${companyId}, 'active')
        `)
        await database.db.execute(sql`
          insert into contractors (company_id, tax_id, display_name)
          values (${companyId}, '11111111000191', 'Contratante Um')
        `)
        const objectId = crypto.randomUUID()
        await database.db.execute(sql`
          insert into stored_objects
            (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes, status)
          values (${objectId}, ${companyId}, 'integration', ${`xml/${objectId}`}, 's3', 'nfe_document',
            'application/xml', ${'a'.repeat(64)}, 10, 'final')
        `)
        const newImport = async (
          key: string,
          status: string,
          imported: number,
          duplicated: number,
        ) => {
          const id = crypto.randomUUID()
          await database.db.execute(sql`
            insert into nfe_imports
              (id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
               request_fingerprint, status, received_count, processed_count, imported_count, duplicated_count,
               updated_at)
            values (${id}, ${companyId}, 'upload', ${userId}, ${key}, ${key}, ${key}, ${status},
              ${imported + duplicated + (status === 'processing' ? 1 : 0)}, ${imported + duplicated}, ${imported}, ${duplicated}, ${NOW.toISOString()}::timestamptz)
          `)
          return id
        }
        const document = async (
          importId: string,
          key: string,
          emitterTaxId: string,
          name: string,
        ) => {
          const id = crypto.randomUUID()
          await database.db.execute(sql`
            insert into nfe_documents
              (id, company_id, access_key, model, number, series, issued_at, operation_nature,
               operation_type, status, source, total_value, products_value, xml_object_id, xml_sha256,
               import_id, created_by_user_id, authorization_protocol)
            values (${id}, ${companyId}, ${key.padEnd(44, '0')}, '55', '1', '1', ${NOW.toISOString()},
              'venda', '1', 'authorized', 'upload', '10.00', '10.00', ${objectId}, ${'0'.repeat(64)},
              ${importId}, ${userId}, 'p')
          `)
          await database.db.execute(sql`
            insert into nfe_participants (company_id, document_id, role, tax_id, legal_name)
            values (${companyId}, ${id}, 'emitter', ${emitterTaxId}, ${name})
          `)
        }
        const done = await newImport('done', 'completed', 3, 1)
        await document(done, '1', '11111111000191', 'Razão do Um')
        await document(done, '2', '11111111000191', 'Razão do Um')
        await document(done, '3', '22222222000191', 'Razão do Dois')
        const running = await newImport('running', 'processing', 0, 0)

        const repository = createDrizzleWhatsAppXmlReceiptRepository(database.db)
        for (const [messageId, importId] of [
          ['done', done],
          ['running', running],
        ] as const) {
          await repository.recordReceipt({
            companyId,
            media: {
              fileName: 'n.zip',
              mimeType: 'application/zip',
              rawMessage: { key: {}, message: {} },
              sizeBytes: 1,
            },
            providerMessageId: messageId,
            rejectReason: null,
            replyTo: null,
            requestedByUserId: userId,
            sender: '5516988887777',
            status: 'pending',
          })
          await database.db.execute(sql`
            update nfe_xml_receipts set status = 'imported', import_id = ${importId}::uuid
            where provider_message_id = ${messageId}
          `)
        }

        const list = await createDrizzleNfeXmlReceiptReadRepository(database.db).listRecent({
          companyId,
          limit: 10,
        })
        const byImport = new Map(list.map((row) => [row.importId, row.import]))
        const finished = byImport.get(done)
        expect(finished?.status).toBe('completed')
        expect(finished?.finishedAt).toBe(NOW.toISOString())
        expect(finished?.counts).toMatchObject({ duplicated: 1, imported: 3, received: 4 })
        expect(finished?.contractors).toEqual([
          { count: 2, name: 'Contratante Um', taxId: '11111111000191' },
          { count: 1, name: 'Razão do Dois', taxId: '22222222000191' },
        ])
        const pending = byImport.get(running)
        expect(pending?.finishedAt).toBeNull()
        expect(pending?.contractors).toEqual([])
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
