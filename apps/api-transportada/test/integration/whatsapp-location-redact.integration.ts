/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 245 T2.4 (RF5, CA4): a redação do legado contra o Postgres de verdade, com o schema e as
 * migrations do pacote — os mesmos casos de uso que o script `whatsapp-location-redact.ts` liga.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  CountInboundLocationsUseCase,
  INBOUND_LOCATION_CONTENT,
  MessageRepository,
  RedactInboundLocationsUseCase,
} from '@adatechnology/meta-whatsapp-module'
import { sql } from 'drizzle-orm'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  runWhatsAppLocationRedaction,
  type WhatsAppLocationRedactPorts,
} from '../../src/whatsapp/application/whatsapp-location-redact.service.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const COMPANY_A = '0b9a7c1e-3f4d-4a52-9b6e-1d2c3b4a5f60'
const COMPANY_B = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
const CUTOFF = new Date('2026-10-01T00:00:00.000Z')
const SECRET_LABEL = 'Rua Secreta 123'
const LATITUDE = '-23.55123'

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_t245',
    migrate: (connectionString) => runAllDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}

async function seedSession(database: TestDatabase, companyId: string): Promise<string> {
  const rows = await database.db.execute(sql`
    insert into meta_whatsapp.sessions (company_id, whatsapp_number)
    values (${companyId}, '5511999990000') returning id
  `)
  return String((rows[0] as { id: string }).id)
}

type SeedMessage = {
  readonly companyId: string
  readonly createdAt: string
  readonly direction: 'inbound' | 'outbound'
  readonly key: string
  readonly isScalarString?: boolean
  readonly payload: string | null
  readonly sessionId: string
  readonly type: string
}

async function seedMessage(database: TestDatabase, message: SeedMessage): Promise<void> {
  const payloadValue =
    message.isScalarString === true
      ? sql`to_jsonb(${message.payload}::text)`
      : sql`${message.payload}::text::jsonb`
  await database.db.execute(sql`
    insert into meta_whatsapp.messages
      (company_id, session_id, whatsapp_number, direction, sender, type, content, payload, wa_message_id, created_at)
    values (${message.companyId}, ${message.sessionId}, '5511999990000', ${message.direction}, 'customer',
      ${message.type}, ${SECRET_LABEL}, ${payloadValue}, ${message.key}, ${message.createdAt}::timestamptz)
  `)
}

const LOCATION_PAYLOAD = JSON.stringify({
  location: { latitude: Number(LATITUDE), longitude: -46.63331, name: SECRET_LABEL },
})
const LOCATION_WITH_EXTRA = JSON.stringify({
  extra: 'fica',
  location: { latitude: Number(LATITUDE) },
})

async function seedWorld(database: TestDatabase): Promise<{ readonly sessionB: string }> {
  const sessionA = await seedSession(database, COMPANY_A)
  const sessionB = await seedSession(database, COMPANY_B)
  const old = '2026-09-20T10:00:00.000Z'
  const base = { createdAt: old, direction: 'inbound', type: 'location' } as const
  const rows: readonly SeedMessage[] = [
    {
      ...base,
      companyId: COMPANY_A,
      key: 'a-reachable',
      payload: LOCATION_PAYLOAD,
      sessionId: sessionA,
    },
    {
      ...base,
      companyId: COMPANY_A,
      key: 'a-extra',
      payload: LOCATION_WITH_EXTRA,
      sessionId: sessionA,
    },
    {
      ...base,
      companyId: COMPANY_A,
      key: 'a-scalar',
      isScalarString: true,
      payload: LOCATION_PAYLOAD,
      sessionId: sessionA,
    },
    {
      ...base,
      companyId: COMPANY_A,
      createdAt: '2026-10-03T10:00:00.000Z',
      key: 'a-after-cutoff',
      payload: LOCATION_PAYLOAD,
      sessionId: sessionA,
    },
    {
      ...base,
      companyId: COMPANY_A,
      direction: 'outbound',
      key: 'a-outbound',
      payload: LOCATION_PAYLOAD,
      sessionId: sessionA,
    },
    {
      ...base,
      companyId: COMPANY_A,
      key: 'a-text',
      payload: JSON.stringify({ body: 'oi' }),
      sessionId: sessionA,
      type: 'text',
    },
    {
      ...base,
      companyId: COMPANY_B,
      key: 'b-reachable',
      payload: LOCATION_PAYLOAD,
      sessionId: sessionB,
    },
  ]
  for (const row of rows) await seedMessage(database, row)
  return { sessionB }
}

async function snapshot(database: TestDatabase): Promise<readonly Record<string, unknown>[]> {
  const rows = await database.db.execute(sql`
    select wa_message_id as key, content, payload::text as payload
    from meta_whatsapp.messages order by wa_message_id
  `)
  return Array.from(rows) as Record<string, unknown>[]
}

function createPorts(database: TestDatabase): WhatsAppLocationRedactPorts {
  const messages = new MessageRepository(database.db as never)
  const count = new CountInboundLocationsUseCase(messages)
  const redact = new RedactInboundLocationsUseCase(messages)
  return { count: (scope) => count.execute(scope), redact: (params) => redact.execute(params) }
}

function createCapturedLogger(): {
  readonly lines: string[]
  readonly logger: Parameters<typeof runWhatsAppLocationRedaction>[0]['logger']
} {
  const lines: string[] = []
  const record = (message: string, metadata?: Record<string, unknown>) => {
    lines.push(JSON.stringify({ message, metadata }))
  }
  return { lines, logger: { error: record, info: record, warn: record } }
}

describe('spec 245 T2.4 — redação do legado de localização do WhatsApp', () => {
  testWithPostgres(
    'dry-run conta sem escrever; --confirm redige só a empresa e o corte pedidos; a segunda execução devolve 0',
    async () => {
      await withDisposableDatabase(async (database) => {
        await seedWorld(database)
        const before = await snapshot(database)
        const captured = createCapturedLogger()

        const dryRun = await runWhatsAppLocationRedaction({
          logger: captured.logger,
          options: { companyId: COMPANY_A, confirm: false, receivedBefore: CUTOFF },
          ports: createPorts(database),
        })

        expect(dryRun).toEqual({ counted: 2, mode: 'dry-run', unreachable: 1 })
        expect(await snapshot(database)).toEqual(before)

        const confirmed = await runWhatsAppLocationRedaction({
          logger: captured.logger,
          options: { companyId: COMPANY_A, confirm: true, receivedBefore: CUTOFF },
          ports: createPorts(database),
        })

        expect(confirmed).toEqual({ counted: 2, mode: 'confirmed', redacted: 2, unreachable: 1 })
        const after = new Map((await snapshot(database)).map((row) => [row.key, row]))
        const unchanged = new Map(before.map((row) => [row.key, row]))

        expect(after.get('a-reachable')).toMatchObject({
          content: INBOUND_LOCATION_CONTENT,
          payload: null,
        })
        expect(JSON.parse(String(after.get('a-extra')?.payload))).toEqual({ extra: 'fica' })
        expect(after.get('a-extra')?.content).toBe(INBOUND_LOCATION_CONTENT)
        for (const key of ['a-scalar', 'a-after-cutoff', 'a-outbound', 'a-text', 'b-reachable']) {
          expect(after.get(key)).toEqual(unchanged.get(key)!)
        }

        const second = await runWhatsAppLocationRedaction({
          logger: captured.logger,
          options: { companyId: COMPANY_A, confirm: true, receivedBefore: CUTOFF },
          ports: createPorts(database),
        })
        expect(second).toMatchObject({ counted: 0, redacted: 0, unreachable: 1 })

        const logged = captured.lines.join('\n')
        expect(logged).not.toContain(SECRET_LABEL)
        expect(logged).not.toContain(LATITUDE)
        expect(logged).toContain('whatsapp.location.redacted')
      })
    },
  )

  testWithPostgres(
    'a empresa B continua intacta até ser pedida, e o lote respeita o teto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { sessionB } = await seedWorld(database)
        for (let index = 0; index < 5; index += 1) {
          await seedMessage(database, {
            companyId: COMPANY_B,
            createdAt: '2026-09-21T10:00:00.000Z',
            direction: 'inbound',
            key: `b-extra-${index}`,
            payload: LOCATION_PAYLOAD,
            sessionId: sessionB,
            type: 'location',
          })
        }
        const beforeCompanyA = await snapshot(database)
        const ports = createPorts(database)

        const batch = await ports.redact({
          batchSize: 2,
          companyId: COMPANY_B,
          receivedBefore: CUTOFF,
        })
        expect(batch.redacted).toBe(2)

        const result = await runWhatsAppLocationRedaction({
          logger: createCapturedLogger().logger,
          options: { companyId: COMPANY_B, confirm: true, receivedBefore: CUTOFF },
          ports,
        })
        expect(result).toMatchObject({ mode: 'confirmed', redacted: 4 })
        const isCompanyA = (row: Record<string, unknown>): boolean =>
          String(row.key).startsWith('a-')
        expect((await snapshot(database)).filter(isCompanyA)).toEqual(
          beforeCompanyA.filter(isCompanyA),
        )
      })
    },
  )
})
