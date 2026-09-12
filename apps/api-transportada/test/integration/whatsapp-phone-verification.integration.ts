/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T004 — o número se prova pela própria mensagem, ponta a ponta: a rota pede o código, a
 * mensagem assinada que o traz entra pelo webhook real, o despachante verifica, e a partir daí
 * `resolveWhatsAppActor` autoriza o número. Postgres real; a Graph API é um servidor local.
 */
import { createHash, createHmac } from 'node:crypto'
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
  userWhatsAppPhones,
  whatsAppPhoneVerificationRequests,
  whatsappChannels,
} from '../../src/database/database.schema.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository.js'
import { maskPhone } from '../../src/logging/phone-mask.policy.js'
import { createRequestWhatsAppPhoneVerificationUseCase } from '../../src/whatsapp-commands/application/request-whatsapp-phone-verification.use-case.js'
import { createResolveWhatsAppActorUseCase } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createUnbindWhatsAppPhoneUseCase } from '../../src/whatsapp-commands/application/unbind-whatsapp-phone.use-case.js'
import { createVerifyWhatsAppPhoneUseCase } from '../../src/whatsapp-commands/application/verify-whatsapp-phone.use-case.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import {
  WHATSAPP_DENIED_REPLY,
  WHATSAPP_PHONE_VERIFIED_REPLY,
} from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'
import { WHATSAPP_PHONE_AUDIT } from '../../src/whatsapp-commands/domain/whatsapp-phone-verification.constant.js'
import {
  WHATSAPP_ROOT_FLOW,
  WHATSAPP_ROOT_FLOW_KEY,
} from '../../src/whatsapp-commands/domain/whatsapp-root-flow.constant.js'
import { DrizzleWhatsAppPhoneRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'
import { createWhatsAppCommandHookFactory } from '../../src/whatsapp-commands/infrastructure/whatsapp-command-hook.factory.js'
import { createWhatsAppPhoneRoutes } from '../../src/whatsapp-commands/presentation/whatsapp-phone.routes.js'
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

const APP_SECRET = 'app-secret-t004'
const VERIFY_TOKEN = 'verify-token-t004'
const ACCESS_TOKEN = 'access-token-t004'
const API_VERSION = 'v21.0'
const COMPANY_DISPLAY_NUMBER = '551633334444'
const ENVELOPE = {
  algorithm: 'A256GCM' as const,
  ciphertext: 'cipher',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1 as const,
}

type GraphRequest = {
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
        body: (await request.json()) as Record<string, unknown>,
        path: new URL(request.url).pathname,
      })
      return Response.json({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] })
    },
    hostname: '127.0.0.1',
    port: 0,
  })

  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_144_t004_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
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

describe('o número se prova pela própria mensagem (spec 144 T004)', () => {
  testWithPostgres(
    'rota → mensagem com o código → vínculo verificado → o número passa a ser ator',
    async () => {
      const db = requireDatabase()
      const scenario = await buildScenario(db)
      const phone = randomPhone()
      const member = await seedMember(db, scenario.companyId)

      const response = await scenario.requestCode({ member, phone })
      expect(response.status).toBe(201)
      const { data } = (await response.json()) as {
        readonly data: { code: string; companyNumber: string; expiresAt: string }
      }
      expect(data.code).toMatch(/^\d{6}$/)
      expect(data.companyNumber).toBe(COMPANY_DISPLAY_NUMBER)
      const [stored] = await db
        .select({ codeHash: whatsAppPhoneVerificationRequests.codeHash })
        .from(whatsAppPhoneVerificationRequests)
        .where(eq(whatsAppPhoneVerificationRequests.userId, member.userId))
      expect(stored?.codeHash).toBe(createHash('sha256').update(data.code).digest('hex'))

      await scenario.receive({ from: phone, text: { body: data.code }, type: 'text' })

      const [confirmation, menu] = scenario.sentMessages()
      expect(confirmation?.body).toMatchObject({ text: { body: WHATSAPP_PHONE_VERIFIED_REPLY } })
      expect(menu?.body).toMatchObject({ interactive: { type: 'button' }, to: phone })
      const actor = await scenario.resolveActor({
        companyId: scenario.companyId,
        fromPhone: phone,
        now: new Date(),
      })
      expect(actor.status).toBe('authorized')
      expect(actor.status === 'authorized' ? actor.context.scope.userId : undefined).toBe(
        member.userId,
      )

      const trail = await readAudit(db, scenario.companyId)
      expect(trail).toEqual([
        {
          action: WHATSAPP_PHONE_AUDIT.verified,
          actorUserId: member.userId,
          metadata: { phone: maskPhone(phone) },
          result: 'allowed',
        },
      ])
      const serializedLogs = JSON.stringify(scenario.logged)
      expect(serializedLogs).not.toContain(phone)
      expect(serializedLogs).not.toContain(data.code)
    },
  )

  testWithPostgres('o código certo vindo de outro número não verifica', async () => {
    const db = requireDatabase()
    const scenario = await buildScenario(db)
    const phone = randomPhone()
    const stranger = randomPhone()
    const member = await seedMember(db, scenario.companyId)
    const { data } = (await (await scenario.requestCode({ member, phone })).json()) as {
      readonly data: { code: string }
    }

    await scenario.receive({ from: stranger, text: { body: data.code }, type: 'text' })

    expect(scenario.sentMessages().map((request) => request.body)).toEqual([
      expect.objectContaining({ text: { body: WHATSAPP_DENIED_REPLY }, to: stranger }),
    ])
    const bindings = await db
      .select()
      .from(userWhatsAppPhones)
      .where(eq(userWhatsAppPhones.userId, member.userId))
    expect(bindings).toHaveLength(0)
    expect(await readAudit(db, scenario.companyId)).toEqual([])
  })

  testWithPostgres(
    'número já verificado por outra pessoa: neutra, pedido morto e colisão na trilha',
    async () => {
      const db = requireDatabase()
      const scenario = await buildScenario(db)
      const phone = randomPhone()
      const owner = await seedUser(db)
      await new DrizzleWhatsAppPhoneRepository(db).saveVerified({
        phone,
        userId: owner,
        verifiedAt: new Date(),
      })
      const member = await seedMember(db, scenario.companyId)
      const { data } = (await (await scenario.requestCode({ member, phone })).json()) as {
        readonly data: { code: string }
      }

      /** O número é de outra pessoa: a mensagem dele cai no fluxo dele, não na verificação. */
      const verify = createVerifyWhatsAppPhoneUseCase({
        repository: new DrizzleWhatsAppPhoneRepository(db),
      })
      const result = await verify({
        code: data.code,
        companyId: scenario.companyId,
        correlationId: 'wamid.collision',
        fromPhone: phone,
        now: new Date(),
      })

      expect(result).toEqual({ reason: 'phone_taken', status: 'rejected' })
      const [request] = await db
        .select({ consumedAt: whatsAppPhoneVerificationRequests.consumedAt })
        .from(whatsAppPhoneVerificationRequests)
        .where(eq(whatsAppPhoneVerificationRequests.userId, member.userId))
      expect(request?.consumedAt).not.toBeNull()
      expect(await readAudit(db, scenario.companyId)).toEqual([
        {
          action: WHATSAPP_PHONE_AUDIT.collision,
          actorUserId: member.userId,
          metadata: { phone: maskPhone(phone) },
          result: 'denied',
        },
      ])
      const [ownerBinding] = await db
        .select({ userId: userWhatsAppPhones.userId })
        .from(userWhatsAppPhones)
        .where(eq(userWhatsAppPhones.phone, phone))
      expect(ownerBinding?.userId).toBe(owner)
    },
  )

  testWithPostgres('DELETE /me/whatsapp-phone desfaz uma vez e deixa uma trilha só', async () => {
    const db = requireDatabase()
    const scenario = await buildScenario(db)
    const phone = randomPhone()
    const member = await seedMember(db, scenario.companyId)
    await new DrizzleWhatsAppPhoneRepository(db).saveVerified({
      phone,
      userId: member.userId,
      verifiedAt: new Date(),
    })

    const first = await scenario.unbindOwn(member)
    const second = await scenario.unbindOwn(member)

    expect([first.status, second.status]).toEqual([204, 204])
    expect(
      await db
        .select()
        .from(userWhatsAppPhones)
        .where(eq(userWhatsAppPhones.userId, member.userId)),
    ).toHaveLength(0)
    expect(await readAudit(db, scenario.companyId)).toEqual([
      {
        action: WHATSAPP_PHONE_AUDIT.unbound,
        actorUserId: member.userId,
        metadata: { phone: maskPhone(phone) },
        result: 'allowed',
      },
    ])
  })
})

type Member = { readonly membershipId: string; readonly userId: string }

async function buildScenario(db: Database) {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  const phoneNumberId = randomDigits(15)
  await db.insert(whatsappChannels).values({
    companyId,
    displayPhoneNumber: COMPANY_DISPLAY_NUMBER,
    phoneNumberId,
    secretEnvelope: ENVELOPE,
    wabaId: randomDigits(15),
  })
  const logged: { message: string; meta?: unknown }[] = []
  const record = (message: string, meta?: unknown): void => {
    logged.push({ message, ...(meta === undefined ? {} : { meta }) })
  }
  const logger = { error: record, info: record, warn: record }
  const baseUrl = `http://127.0.0.1:${graphServer?.port}`
  const phones = new DrizzleWhatsAppPhoneRepository(db)
  const memberships = new DrizzleMembershipRepository(db)
  const resolveActor = createResolveWhatsAppActorUseCase({
    memberships,
    phones,
    tenantContext: new TenantContextService({ repository: memberships }),
  })

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
      resolveActor,
      verifyPhone: createVerifyWhatsAppPhoneUseCase({ repository: phones }),
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
  const webhook = createWhatsAppWebhookRoutes({
    appSecret: APP_SECRET,
    logger,
    resolver,
    verifyToken: VERIFY_TOKEN,
  }).find((route) => route.method === 'POST')
  if (webhook === undefined) throw new Error('rota do webhook não registrada')

  const phoneRoutes = createWhatsAppPhoneRoutes({
    requestVerification: createRequestWhatsAppPhoneVerificationUseCase({
      clock: () => new Date(),
      repository: phones,
    }),
    unbind: createUnbindWhatsAppPhoneUseCase({ memberships, repository: phones }),
  })
  const findRoute = (method: string, pathname: string) => {
    const route = phoneRoutes.find(
      (candidate) => candidate.method === method && candidate.pathname === pathname,
    )
    if (route === undefined) throw new Error(`${method} ${pathname} não registrada`)
    return route
  }

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
                metadata: {
                  display_phone_number: COMPANY_DISPLAY_NUMBER,
                  phone_number_id: phoneNumberId,
                },
              },
            },
          ],
          id: 'waba-t004',
        },
      ],
      object: 'whatsapp_business_account',
    })
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
    const response = await webhook?.execute({
      correlationId: 'corr-t004',
      pathParameters: {},
      request: new Request('https://api.local/public/whatsapp/webhook', {
        body,
        headers: { 'x-hub-signature-256': signature },
        method: 'POST',
      }),
    })
    expect(response?.status).toBe(200)
  }

  return {
    companyId,
    logged,
    receive,
    requestCode: (input: { readonly member: Member; readonly phone: string }) =>
      findRoute('POST', '/me/whatsapp-phone/verification').execute({
        context: buildContext({ companyId, member: input.member }),
        correlationId: 'corr-t004-request',
        pathParameters: {},
        request: new Request('https://api.local/me/whatsapp-phone/verification', {
          body: JSON.stringify({ phone: input.phone }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      }),
    resolveActor,
    sentMessages: (): readonly GraphRequest[] =>
      graphRequests.filter(
        (request) => request.path === `/${API_VERSION}/${phoneNumberId}/messages`,
      ),
    unbindOwn: (member: Member) =>
      findRoute('DELETE', '/me/whatsapp-phone').execute({
        context: buildContext({ companyId, member }),
        correlationId: 'corr-t004-unbind',
        pathParameters: {},
        request: new Request('https://api.local/me/whatsapp-phone', { method: 'DELETE' }),
      }),
  }
}

function buildContext(input: {
  readonly companyId: string
  readonly member: Member
}): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: input.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'whatsapp-phone-integration',
      userId: input.member.userId,
    },
    scope: {
      companyId: input.companyId,
      kind: 'company',
      membershipId: input.member.membershipId,
      permissions: new Set(),
      roles: ['driver'],
      userId: input.member.userId,
    },
  }
}

async function readAudit(db: Database, companyId: string) {
  return db
    .select({
      action: auditLogs.action,
      actorUserId: auditLogs.actorUserId,
      metadata: auditLogs.metadata,
      result: auditLogs.result,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.companyId, companyId),
        eq(auditLogs.entityType, WHATSAPP_PHONE_AUDIT.entityType),
      ),
    )
}

async function seedUser(db: Database): Promise<string> {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  return userId
}

async function seedMember(db: Database, companyId: string): Promise<Member> {
  const userId = await seedUser(db)
  const [membership] = await db
    .insert(userCompanyMemberships)
    .values({ companyId, status: 'active', userId })
    .returning({ id: userCompanyMemberships.id })
  if (membership === undefined) throw new Error('membership não criada')
  await db.insert(membershipRoles).values({ membershipId: membership.id, role: 'driver' })
  return { membershipId: membership.id, userId }
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
