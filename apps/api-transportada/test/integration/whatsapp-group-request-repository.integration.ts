/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T4: o pedido no grupo do motorista contra Postgres de verdade, pelo cliente **da aplicação**
 * (`prepare: false`, o que pega `Date` mal convertida em SQL cru): um por vez por grupo (também sob
 * concorrência), vencimento, versão, mensagem gravada uma vez só e isolamento por empresa.
 */
import { describe, expect, test } from 'bun:test'

import { createDatabaseProvider } from '../../src/database/database-client.service.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, whatsappGroupRequestMessages } from '../../src/database/database.schema.js'
import { DrizzleFleetDriverRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver.repository.js'
import { createDrizzleWhatsAppGroupRequestRepository } from '../../src/whatsapp/infrastructure/drizzle-whatsapp-group-request.repository.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { DRIVER_FIELDS } from '../fixtures/fleet-http-payload.fixture'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const GROUP = '120363000000000001@g.us'
const OWNER = '5516988887777'
const T0 = new Date('2026-11-04T12:00:00.000Z')
const minutes = (value: number) => new Date(T0.getTime() + value * 60_000)

describe('pedido no grupo do motorista, repositório (spec 292 T4)', () => {
  testWithPostgres('um por vez por grupo; o prazo vencido libera o grupo', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, driverId, requests } = await setUp(database)
      const open = (now: Date, ownerNumber = OWNER) =>
        requests.open({ companyId, driverId, groupJid: GROUP, now, ownerNumber, step: 'menu' })

      const first = await open(T0)
      expect(first).toMatchObject({ attempts: 0, ownerNumber: OWNER, step: 'menu' })
      expect(first?.expiresAt.toISOString()).toBe(minutes(10).toISOString())
      expect(await open(minutes(1), '5516977776666')).toBeNull()
      expect((await requests.findOpen({ companyId, groupJid: GROUP, now: minutes(9) }))?.id).toBe(
        first?.id,
      )

      // vencido: findOpen fecha e o grupo fica livre
      expect(await requests.findOpen({ companyId, groupJid: GROUP, now: minutes(10) })).toBeNull()
      const second = await open(minutes(11))
      expect(second?.id).not.toBe(first?.id)
    })
  })

  testWithPostgres('duas chamadas ao mesmo tempo: só uma abre', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, driverId, requests } = await setUp(database)
      const results = await Promise.all(
        [OWNER, '5516977776666', '5516966665555'].map((ownerNumber) =>
          requests.open({
            companyId,
            driverId,
            groupJid: GROUP,
            now: T0,
            ownerNumber,
            step: 'menu',
          }),
        ),
      )
      expect(results.filter((item) => item !== null)).toHaveLength(1)
    })
  })

  testWithPostgres(
    'andar renova o prazo e exige a versão lida; fechar libera o grupo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { companyId, driverId, requests } = await setUp(database)
        const request = await requests.open({
          companyId,
          driverId,
          groupJid: GROUP,
          now: T0,
          ownerNumber: OWNER,
          step: 'menu',
        })
        if (request === null) throw new Error('not opened')
        const base = { companyId, id: request.id }

        expect(
          await requests.update({
            ...base,
            attempts: 1,
            now: minutes(8),
            state: { typeId: 'x' },
            step: 'document',
            version: request.version,
          }),
        ).toBe(true)
        // versão antiga perde
        expect(
          await requests.update({
            ...base,
            attempts: 0,
            now: minutes(8),
            state: {},
            step: 'menu',
            version: request.version,
          }),
        ).toBe(false)

        const advanced = await requests.findOpen({ companyId, groupJid: GROUP, now: minutes(15) })
        expect(advanced).toMatchObject({ attempts: 1, state: { typeId: 'x' }, step: 'document' })
        expect(advanced?.expiresAt.toISOString()).toBe(minutes(18).toISOString())

        expect(
          await requests.update({
            ...base,
            attempts: 1,
            close: 'cancelled',
            now: minutes(16),
            state: {},
            step: 'document',
            version: advanced?.version ?? 0n,
          }),
        ).toBe(true)
        expect(await requests.findOpen({ companyId, groupJid: GROUP, now: minutes(16) })).toBeNull()
      })
    },
  )

  testWithPostgres('o prazo vem da configuração da empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, driverId, requests } = await setUp(database)
      await database.db.execute(
        `insert into whatsapp_evolution_settings (company_id, base_url, instance_name, secret_envelope, group_request_timeout_seconds) values ('${companyId}', 'https://evolution.exemplo.com', 'teste', '{}', 120)`,
      )
      const request = await requests.open({
        companyId,
        driverId,
        groupJid: GROUP,
        now: T0,
        ownerNumber: OWNER,
        step: 'menu',
      })
      expect(request?.expiresAt.toISOString()).toBe(minutes(2).toISOString())
    })
  })

  testWithPostgres('a mesma mensagem só é aceita uma vez, e só na empresa dela', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, driverId, requests } = await setUp(database)
      const otherCompany = crypto.randomUUID()
      await database.db.insert(companies).values({ id: otherCompany, status: 'active' })
      const claim = (company: string) =>
        requests.claimMessage({
          companyId: company,
          providerMessageId: 'M1',
          senderNumber: OWNER,
          via: 'mention',
        })

      expect(await claim(companyId)).toBe(true)
      expect(await claim(companyId)).toBe(false)
      expect(await claim(otherCompany)).toBe(true)

      const request = await requests.open({
        companyId,
        driverId,
        groupJid: GROUP,
        now: T0,
        ownerNumber: OWNER,
        step: 'menu',
      })
      if (request === null) throw new Error('not opened')
      await requests.linkMessage({
        companyId,
        providerMessageId: 'M1',
        requestId: request.id,
        stepBefore: 'menu',
      })
      const rows = await database.db.select().from(whatsappGroupRequestMessages)
      expect(
        rows.map((row) => [row.companyId === companyId, row.requestId, row.stepBefore]).sort(),
      ).toEqual(
        [
          [false, null, null],
          [true, request.id, 'menu'],
        ].sort(),
      )
      expect(
        await requests.findOpen({ companyId: otherCompany, groupJid: GROUP, now: T0 }),
      ).toBeNull()
    })
  })
})

type TestDatabase = ReturnType<typeof createDatabaseProvider>

async function setUp(database: TestDatabase) {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  const driver = await new DrizzleFleetDriverRepository(database.db).create({
    canDrive: true,
    companyId,
    driver: {
      ...DRIVER_FIELDS,
      licenseNumber: '11111111111',
      membershipId: null,
      taxId: '11111111111',
    },
  })
  return {
    companyId,
    driverId: driver.id,
    requests: createDrizzleWhatsAppGroupRequestRepository(database.db),
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    namePrefix: 'transportada_t292r',
    open: (connectionString) =>
      createDatabaseProvider({
        pool: { connectTimeoutSeconds: 5, max: 4, queryTimeoutMs: 10_000 },
        url: connectionString,
      }),
    operation,
  })
}
