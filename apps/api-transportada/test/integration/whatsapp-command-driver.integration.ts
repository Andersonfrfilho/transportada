/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T006 — a mensagem assinada entra pela rota do webhook real, atravessa o
 * `module.webhook.receive.execute` do pacote, chega ao despachante pelo hook e sai como chamada à
 * Graph API — que aqui é um servidor local: nenhuma mensagem vai à Meta.
 *
 * Cobre também as duas consultas que a T005 deixou sem banco: `hasUnverifiedBindingByPhone` (número
 * declarado e nunca verificado) e `findStanding` (sem membership × membership suspensa).
 */
import { createHmac } from 'node:crypto'
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { SessionRepository } from '@adatechnology/meta-whatsapp-module'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
  userWhatsAppPhones,
} from '../../src/database/database.schema.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository.js'
import { createResolveWhatsAppActorUseCase } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { WHATSAPP_DENIED_REPLY } from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'
import {
  WHATSAPP_ROOT_FLOW,
  WHATSAPP_ROOT_FLOW_KEY,
} from '../../src/whatsapp-commands/domain/whatsapp-root-flow.constant.js'
import { DrizzleWhatsAppPhoneRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'
import { createWhatsAppCommandHookFactory } from '../../src/whatsapp-commands/infrastructure/whatsapp-command-hook.factory.js'
import { createMetaWhatsAppModuleResolver } from '../../src/whatsapp/application/meta-whatsapp-module.resolver.js'
import { createDrizzleWebhookNonceStore } from '../../src/whatsapp/infrastructure/drizzle-webhook-nonce.store.js'
import { createWhatsAppWebhookRoutes } from '../../src/whatsapp/presentation/whatsapp-webhook.routes.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type Database = TestDatabase['db']

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const APP_SECRET = 'app-secret-t006'
const VERIFY_TOKEN = 'verify-token-t006'
const ACCESS_TOKEN = 'access-token-t006'
const API_VERSION = 'v21.0'
const ENVELOPE = {
  algorithm: 'A256GCM' as const,
  ciphertext: 'cipher',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1 as const,
}

type GraphRequest = {
  readonly authorization: string | null
  readonly body: Record<string, unknown>
  readonly path: string
}

const graphRequests: GraphRequest[] = []
let graphServer: ReturnType<typeof Bun.serve> | undefined
let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  graphServer = Bun.serve({
    async fetch(request) {
      graphRequests.push({
        authorization: request.headers.get('authorization'),
        body: (await request.json()) as Record<string, unknown>,
        path: new URL(request.url).pathname,
      })
      return Response.json({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] })
    },
    hostname: '127.0.0.1',
    port: 0,
  })

  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_144_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    /** O schema `meta_whatsapp` (sessões) viaja no pacote e só vem com a migração completa. */
    await runAllDatabaseMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
})

afterAll(async () => {
  await graphServer?.stop(true)
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

describe('a mensagem do WhatsApp vira passo de fluxo (spec 144 T006)', () => {
  testWithPostgres(
    'número verificado com membership recebe o menu em botões e anda até o fim',
    async () => {
      const db = requireDatabase()
      const scenario = await buildScenario(db)
      const phone = randomPhone()
      const userId = await seedUser(db)
      await new DrizzleWhatsAppPhoneRepository(db).saveVerified({
        phone,
        userId,
        verifiedAt: new Date(),
      })
      await seedMembership(db, { companyId: scenario.companyId, status: 'active', userId })

      await scenario.receive({ from: phone, text: { body: 'oi' }, type: 'text' })
      const [menu] = scenario.sentMessages()
      expect(menu?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
      expect(menu?.body).toMatchObject({
        interactive: {
          action: { buttons: [{ reply: { id: 'about' }, type: 'reply' }] },
          type: 'button',
        },
        to: phone,
        type: 'interactive',
      })

      await scenario.receive({
        from: phone,
        interactive: {
          button_reply: { id: 'about', title: 'ℹ️ O que já dá' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      expect(scenario.sentMessages().at(-1)?.body).toMatchObject({
        text: { body: WHATSAPP_ROOT_FLOW.nodes.about?.directMessage },
        to: phone,
        type: 'text',
      })

      const session = await new SessionRepository(db as never).getContext(scenario.companyId, phone)
      expect(session?.flowKey ?? null).toBeNull()
      expect(JSON.stringify(scenario.logged)).not.toContain(phone)
    },
  )

  const DENIALS = [
    { reason: 'unknown_phone', seed: async () => {} },
    {
      reason: 'unverified_or_expired',
      seed: async (input: SeedInput) => {
        await input.db
          .insert(userWhatsAppPhones)
          .values({ phone: input.phone, userId: input.userId })
      },
    },
    { reason: 'no_membership', seed: async (input: SeedInput) => bindVerified(input) },
    {
      reason: 'suspended',
      seed: async (input: SeedInput) => {
        await bindVerified(input)
        await seedMembership(input.db, {
          companyId: input.companyId,
          status: 'disabled',
          userId: input.userId,
        })
      },
    },
  ] as const

  for (const denial of DENIALS) {
    testWithPostgres(
      `recusa pelo banco (${denial.reason}) sai neutra e com a razão no log`,
      async () => {
        const db = requireDatabase()
        const scenario = await buildScenario(db)
        const phone = randomPhone()
        const userId = await seedUser(db)
        await denial.seed({ companyId: scenario.companyId, db, phone, userId })

        await scenario.receive({ from: phone, text: { body: 'emitir tudo' }, type: 'text' })

        expect(scenario.sentMessages().map((request) => request.body)).toEqual([
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            text: { body: WHATSAPP_DENIED_REPLY },
            to: phone,
            type: 'text',
          },
        ])
        const denied = scenario.logged.find((entry) => entry.message === 'whatsapp.command.denied')
        expect(denied?.meta).toMatchObject({ reason: denial.reason })
        const serialized = JSON.stringify(scenario.logged)
        expect(serialized).not.toContain(phone)
        expect(serialized).not.toContain('emitir tudo')
      },
    )
  }
})

type SeedInput = {
  readonly companyId: string
  readonly db: Database
  readonly phone: string
  readonly userId: string
}

async function bindVerified(input: SeedInput): Promise<void> {
  await new DrizzleWhatsAppPhoneRepository(input.db).saveVerified({
    phone: input.phone,
    userId: input.userId,
    verifiedAt: new Date(),
  })
}

async function buildScenario(db: Database) {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  const phoneNumberId = randomDigits(15)
  const logged: { message: string; meta?: unknown }[] = []
  const record = (message: string, meta?: unknown): void => {
    logged.push({ message, ...(meta === undefined ? {} : { meta }) })
  }
  const logger = { error: record, info: record, warn: record }
  const baseUrl = `http://127.0.0.1:${graphServer?.port}`

  const resolver = createMetaWhatsAppModuleResolver({
    apiVersion: API_VERSION,
    appSecret: APP_SECRET,
    baseUrl,
    buildMessageHook: createWhatsAppCommandHookFactory({
      apiVersion: API_VERSION,
      authorization: new AuthorizationService(),
      baseUrl,
      clock: () => new Date(),
      flowActions: [],
      graphs: createStaticWhatsAppFlowGraphProvider({
        graphs: [WHATSAPP_ROOT_FLOW],
        rootFlowKey: WHATSAPP_ROOT_FLOW_KEY,
      }),
      logger,
      rateLimiter: createRateLimiter(),
      resolveActor: createResolveWhatsAppActorUseCase({
        memberships: new DrizzleMembershipRepository(db),
        phones: new DrizzleWhatsAppPhoneRepository(db),
        tenantContext: new TenantContextService({
          repository: new DrizzleMembershipRepository(db),
        }),
      }),
    }),
    database: db,
    nonceStore: createDrizzleWebhookNonceStore(db),
    repository: {
      findByPhoneNumberId: async (input) =>
        input.phoneNumberId === phoneNumberId
          ? {
              channelId: `channel-${phoneNumberId}`,
              companyId,
              envelope: ENVELOPE,
              phoneNumberId,
              version: '1',
              wabaId: '',
            }
          : undefined,
    },
    secretService: {
      decrypt: async () => ({ accessToken: ACCESS_TOKEN }),
      encrypt: async () => ENVELOPE,
    },
    verifyToken: VERIFY_TOKEN,
  })
  const post = createWhatsAppWebhookRoutes({
    appSecret: APP_SECRET,
    logger,
    resolver,
    verifyToken: VERIFY_TOKEN,
  }).find((route) => route.method === 'POST')
  if (post === undefined) throw new Error('rota do webhook não registrada')

  async function receive(message: Record<string, unknown>): Promise<void> {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Contato' }, wa_id: message.from }],
                messages: [
                  { id: `wamid.${crypto.randomUUID()}`, timestamp: '1757592000', ...message },
                ],
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '5516000000000', phone_number_id: phoneNumberId },
              },
            },
          ],
          id: 'waba-t006',
        },
      ],
      object: 'whatsapp_business_account',
    })
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
    const response = await post?.execute({
      correlationId: 'corr-t006',
      pathParameters: {},
      request: new Request('https://api.local/public/whatsapp/webhook', {
        body,
        headers: { 'x-hub-signature-256': signature },
        method: 'POST',
      }),
    })
    expect(response?.status).toBe(200)
  }

  const sentMessages = (): readonly GraphRequest[] =>
    graphRequests.filter((request) => request.path === `/${API_VERSION}/${phoneNumberId}/messages`)

  return { companyId, logged, receive, sentMessages }
}

async function seedUser(db: Database): Promise<string> {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  return userId
}

async function seedMembership(
  db: Database,
  input: {
    readonly companyId: string
    readonly status: 'active' | 'disabled'
    readonly userId: string
  },
): Promise<void> {
  const [membership] = await db
    .insert(userCompanyMemberships)
    .values({ companyId: input.companyId, status: input.status, userId: input.userId })
    .returning({ id: userCompanyMemberships.id })
  if (membership === undefined) throw new Error('membership não criada')
  await db.insert(membershipRoles).values({ membershipId: membership.id, role: 'driver' })
}

/** Celular canônico com o nono dígito: 55 + DDD 16 + 9 + oito dígitos. */
function randomPhone(): string {
  return `55169${randomDigits(8)}`
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')
}

function requireDatabase(): Database {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  return shared.database.db
}
