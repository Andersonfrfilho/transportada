/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T004 — as três rotas do número. Pedir o código é de qualquer membership ativa (o bot
 * serve do motorista ao administrador); desfazer o de outra pessoa é `users.manage`. Nenhuma rota
 * verifica: quem verifica é a mensagem.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter, type defineRoute } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
  PlatformContext,
} from '../../src/identity/domain/tenant-context.js'
import { createRequestWhatsAppPhoneVerificationUseCase } from '../../src/whatsapp-commands/application/request-whatsapp-phone-verification.use-case.js'
import { createUnbindWhatsAppPhoneUseCase } from '../../src/whatsapp-commands/application/unbind-whatsapp-phone.use-case.js'
import { createWhatsAppPhoneRoutes } from '../../src/whatsapp-commands/presentation/whatsapp-phone.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { createWhatsAppPhoneRepositoryFake } from '../fixtures/whatsapp-phone-repository.fixture.js'

type RegisteredRoute = ReturnType<typeof defineRoute>

const COMPANY_ID = '00000000-0000-4000-8000-000000000051'
const USER_ID = '00000000-0000-4000-8000-000000000052'
const TARGET_USER_ID = '00000000-0000-4000-8000-000000000053'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000054'
const ORIGIN = 'http://127.0.0.1:53000'
const PHONE = '5516999991234'
const NOW = new Date('2026-09-11T12:00:00.000Z')

type IdentityOverride = Partial<
  Pick<AuthenticatedIdentity, 'channel' | 'platformAdmin' | 'serviceAccount'>
>

function companyContext(
  permissions: readonly CompanyPermission[],
  identity: IdentityOverride = {},
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000055',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'whatsapp-phone-routes',
      userId: USER_ID,
      ...identity,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: MEMBERSHIP_ID,
      permissions: new Set(permissions),
      roles: ['driver'],
      userId: USER_ID,
    },
  }
}

function createScenario(
  options: {
    readonly companyNumber?: string
    readonly identity?: IdentityOverride
    readonly permissions?: readonly CompanyPermission[]
    readonly targetStanding?: 'absent' | 'suspended'
  } = {},
) {
  const fake = createWhatsAppPhoneRepositoryFake({
    companyNumber: options.companyNumber ?? '551633334444',
  })
  const routes = createWhatsAppPhoneRoutes({
    requestVerification: createRequestWhatsAppPhoneVerificationUseCase({
      clock: () => NOW,
      repository: fake.repository,
    }),
    unbind: createUnbindWhatsAppPhoneUseCase({
      memberships: { findStanding: async () => options.targetStanding ?? 'suspended' },
      repository: fake.repository,
    }),
  })
  const router = createTestRouter({
    context: companyContext(options.permissions ?? ['trip.read', 'trip.report'], options.identity),
    routes,
  })
  /** O request handler é quem converte `ApiError` na resposta com código estável. */
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'corr-t004-routes',
    frontendOrigins: [ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    ...fake,
    routes,
    handle: (input: { readonly body?: unknown; readonly method: string; readonly path: string }) =>
      handleRequest(
        new Request(`${ORIGIN}${input.path}`, {
          headers: {
            origin: ORIGIN,
            ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          method: input.method,
          ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        }),
        { timeout() {} },
      ),
  }
}

async function readJson(response: Response): Promise<Record<string, Record<string, unknown>>> {
  return (await response.json()) as Record<string, Record<string, unknown>>
}

describe('POST /me/whatsapp-phone/verification (spec 144 T004)', () => {
  test('201 com o código, o número da empresa e o vencimento — para qualquer papel', async () => {
    const scenario = createScenario()

    const response = await scenario.handle({
      body: { phone: '(16) 99999-1234' },
      method: 'POST',
      path: '/me/whatsapp-phone/verification',
    })

    expect(response.status).toBe(201)
    const { data } = await readJson(response)
    expect(data?.code).toMatch(/^\d{6}$/)
    expect(data).toMatchObject({
      companyNumber: '551633334444',
      expiresAt: '2026-09-11T12:10:00.000Z',
    })
    expect(scenario.requests[0]).toMatchObject({ phone: PHONE, userId: USER_ID })
  })

  test('telefone que não canonicaliza é 400 WHATSAPP_PHONE_INVALID', async () => {
    const scenario = createScenario()

    const response = await scenario.handle({
      body: { phone: '16a99991234' },
      method: 'POST',
      path: '/me/whatsapp-phone/verification',
    })

    expect(response.status).toBe(400)
    expect((await readJson(response)).error?.code).toBe('WHATSAPP_PHONE_INVALID')
    expect(scenario.requests).toHaveLength(0)
  })

  test('canal sem número de exibição é 409 WHATSAPP_CHANNEL_NUMBER_MISSING', async () => {
    const scenario = createScenario({ companyNumber: '' })

    const response = await scenario.handle({
      body: { phone: PHONE },
      method: 'POST',
      path: '/me/whatsapp-phone/verification',
    })

    expect(response.status).toBe(409)
    expect((await readJson(response)).error?.code).toBe('WHATSAPP_CHANNEL_NUMBER_MISSING')
  })

  /** T005b B4: cinco tentativas valem por pedido; sem teto na rota, pedido novo é tentativa nova. */
  test('o sexto pedido do mesmo usuário em dez minutos é 429 com Retry-After', async () => {
    const scenario = createScenario()
    const request = {
      body: { phone: PHONE },
      method: 'POST',
      path: '/me/whatsapp-phone/verification',
    }

    const statuses: number[] = []
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      statuses.push((await scenario.handle(request)).status)
    }
    const sixth = await scenario.handle(request)

    expect(statuses).toEqual([201, 201, 201, 201, 201])
    expect(sixth.status).toBe(429)
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(scenario.requests).toHaveLength(5)
  })
})

/** T005b A1: número de WhatsApp é credencial de pessoa, e só de pessoa. */
describe('quem não é pessoa não pede código (spec 144 T005b)', () => {
  const cases: readonly (readonly [string, IdentityOverride])[] = [
    ['token de service account', { serviceAccount: true }],
    ['administrador de plataforma', { platformAdmin: true }],
    ['contexto que já veio do canal', { channel: 'whatsapp' }],
  ]

  for (const [label, identity] of cases) {
    test(`${label} recebe 403 e nenhum pedido é aberto`, async () => {
      const scenario = createScenario({ identity, permissions: ['mdfe.auto-issue'] })

      const response = await scenario.handle({
        body: { phone: PHONE },
        method: 'POST',
        path: '/me/whatsapp-phone/verification',
      })

      expect(response.status).toBe(403)
      expect(scenario.requests).toHaveLength(0)
    })
  }
})

describe('DELETE do vínculo (spec 144 T004)', () => {
  test('DELETE /me/whatsapp-phone é 204 e idempotente', async () => {
    const scenario = createScenario()
    await scenario.repository.saveVerified({ phone: PHONE, userId: USER_ID, verifiedAt: NOW })

    const first = await scenario.handle({ method: 'DELETE', path: '/me/whatsapp-phone' })
    const second = await scenario.handle({ method: 'DELETE', path: '/me/whatsapp-phone' })

    expect([first.status, second.status]).toEqual([204, 204])
    expect(scenario.bindings.size).toBe(0)
    expect(scenario.audits).toHaveLength(1)
  })

  test('o administrador desfaz o de outra pessoa com users.manage', async () => {
    const scenario = createScenario({ permissions: ['users.manage'] })
    await scenario.repository.saveVerified({
      phone: PHONE,
      userId: TARGET_USER_ID,
      verifiedAt: NOW,
    })

    const response = await scenario.handle({
      method: 'DELETE',
      path: `/company-users/${TARGET_USER_ID}/whatsapp-phone`,
    })

    expect(response.status).toBe(204)
    expect(scenario.audits[0]).toMatchObject({ actorUserId: USER_ID, targetId: TARGET_USER_ID })
  })

  test('sem users.manage é 403 e o vínculo fica', async () => {
    const scenario = createScenario()
    await scenario.repository.saveVerified({
      phone: PHONE,
      userId: TARGET_USER_ID,
      verifiedAt: NOW,
    })

    const response = await scenario.handle({
      method: 'DELETE',
      path: `/company-users/${TARGET_USER_ID}/whatsapp-phone`,
    })

    expect(response.status).toBe(403)
    expect(scenario.bindings.has(TARGET_USER_ID)).toBe(true)
  })

  test('usuário sem vínculo com a empresa do administrador é 404', async () => {
    const scenario = createScenario({ permissions: ['users.manage'], targetStanding: 'absent' })
    await scenario.repository.saveVerified({
      phone: PHONE,
      userId: TARGET_USER_ID,
      verifiedAt: NOW,
    })

    const response = await scenario.handle({
      method: 'DELETE',
      path: `/company-users/${TARGET_USER_ID}/whatsapp-phone`,
    })

    expect(response.status).toBe(404)
    expect(scenario.bindings.has(TARGET_USER_ID)).toBe(true)
  })

  test('nenhuma rota verifica o número fora da mensagem', () => {
    const signatures = createScenario()
      .routes.map((route) => `${route.method} ${route.pathname}`)
      .sort()

    expect(signatures).toEqual([
      'DELETE /company-users/:id/whatsapp-phone',
      'DELETE /me/whatsapp-phone',
      'POST /me/whatsapp-phone/verification',
    ])
  })
})

describe('a política de membership (spec 144 T004)', () => {
  const policy = { membership: 'active', scope: 'company' } as const

  test('aceita qualquer contexto de empresa, até sem permissão nenhuma', () => {
    expect(() => new AuthorizationService().authorize(companyContext([]), policy)).not.toThrow()
  })

  test('recusa o contexto de plataforma', () => {
    const platform: AuthenticatedContext<PlatformContext> = {
      identity: companyContext([]).identity,
      scope: { kind: 'platform', userId: USER_ID },
    }

    expect(() => new AuthorizationService().authorize(platform, policy)).toThrow()
  })

  test('recusa service account, administrador de plataforma e contexto de canal (T005b A1)', () => {
    const identities: readonly IdentityOverride[] = [
      { serviceAccount: true },
      { platformAdmin: true },
      { channel: 'whatsapp' },
    ]

    for (const identity of identities) {
      expect(() =>
        new AuthorizationService().authorize(companyContext([], identity), policy),
      ).toThrow()
    }
  })
})

function createTestRouter(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly routes: readonly RegisteredRoute[]
}) {
  return createRouter({
    authentication: { authenticate: async () => input.context.identity },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes: input.routes,
    tenantContext: { resolveCompany: async () => input.context },
  })
}
