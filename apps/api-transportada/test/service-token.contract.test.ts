/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { HealthService } from '../src/health/health.service'
import { defineRoute } from '../src/http/router.service'
import { AuthenticationService } from '../src/identity/application/authentication.service'
import { TenantContextService } from '../src/identity/application/tenant-context.service'
import { createKeycloakAccessTokenVerifier } from '../src/identity/infrastructure/keycloak-jwt.gateway'
import { createHttpRouterFixture } from './fixtures/http-router.fixture'

const AUDIENCE = 'transportada-api'
const KEY_ID = 'contract-signing-key'
const SERVICE_SUBJECT = 'service-account-transportada-worker'
const HUMAN_SUBJECT = 'keycloak-human-user'
const SERVICE_USER_ID = '00000000-0000-4000-8000-0000000000a1'
const HUMAN_USER_ID = '00000000-0000-4000-8000-0000000000a2'
const MEMBER_COMPANY = '00000000-0000-4000-8000-0000000000c1'
const FOREIGN_COMPANY = '00000000-0000-4000-8000-0000000000c2'
const SERVICE_ROLE = 'transportada-service'

/**
 * Em 05/11/2026 o staging mostrou que nenhuma chamada worker→API passava: o verificador exigia a
 * claim `company_id`, que token de `client_credentials` nunca carrega (ADR-0047 §3). O 401 saía antes
 * do caminho do serviço. Este contrato assina tokens de verdade e passa pelo verificador real, para a
 * regra não voltar a viver só num dublê.
 */
describe('service token contract (ADR-0047, emenda 2026-11-05)', () => {
  let server: ReturnType<typeof Bun.serve>
  let issuer: string
  let privateKey: CryptoKey

  beforeAll(async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        hash: 'SHA-256',
        modulusLength: 2048,
        name: 'RSASSA-PKCS1-v1_5',
        publicExponent: new Uint8Array([1, 0, 1]),
      },
      true,
      ['sign', 'verify'],
    )
    privateKey = keyPair.privateKey
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    const jwks = { keys: [{ ...publicJwk, alg: 'RS256', kid: KEY_ID, use: 'sig' }] }
    server = Bun.serve({ fetch: () => Response.json(jwks), hostname: '127.0.0.1', port: 0 })
    issuer = `http://127.0.0.1:${server.port}/realms/contract`
  })

  afterAll(() => {
    server.stop(true)
  })

  function sign(claims: Readonly<Record<string, unknown>>): Promise<string> {
    return signJwt({ claims, privateKey })
  }

  function serviceClaims(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
      aud: AUDIENCE,
      azp: 'transportada-worker',
      exp: nowSeconds() + 300,
      iss: issuer,
      realm_access: { roles: [SERVICE_ROLE] },
      sub: SERVICE_SUBJECT,
      ...overrides,
    }
  }

  function humanClaims(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
      aud: AUDIENCE,
      company_id: MEMBER_COMPANY,
      exp: nowSeconds() + 300,
      iss: issuer,
      realm_access: { roles: ['company-admin'] },
      sub: HUMAN_SUBJECT,
      ...overrides,
    }
  }

  function createRouter() {
    const authentication = new AuthenticationService({
      repository: {
        async findActiveByIssuerAndSubject({ subject }) {
          if (subject === SERVICE_SUBJECT) {
            return { externalIdentityId: 'service-identity', userId: SERVICE_USER_ID }
          }
          if (subject === HUMAN_SUBJECT) {
            return { externalIdentityId: 'human-identity', userId: HUMAN_USER_ID }
          }
          return null
        },
      },
      verifier: createKeycloakAccessTokenVerifier({
        audience: AUDIENCE,
        issuer,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
    })
    const tenantContext = new TenantContextService({
      repository: {
        // A membership sintética do serviço existe só em MEMBER_COMPANY.
        async findActiveByUserAndCompany({ companyId }) {
          if (companyId !== MEMBER_COMPANY) return null
          return {
            grantedPermissions: [],
            membershipId: '00000000-0000-4000-8000-0000000000d1',
            roles: ['automation', 'company-admin'],
          }
        },
      },
    })
    const routes = [
      defineRoute<Record<string, never>>({
        async handle({ context }) {
          return Response.json({ companyId: context.scope.companyId })
        },
        method: 'POST',
        parse: () => ({}),
        pathname: '/trips/probe/mdfe-manifests/automatic',
        policy: { permission: 'mdfe.auto-issue', scope: 'company' },
      }),
      defineRoute<Record<string, never>>({
        async handle() {
          return new Response('{}', { status: 200 })
        },
        method: 'GET',
        parse: () => ({}),
        pathname: '/me/probe',
        policy: { membership: 'active', scope: 'company' },
      }),
    ]
    return createHttpRouterFixture({
      authentication,
      healthService: healthService(),
      routes,
      tenantContext,
    })
  }

  async function call(input: {
    readonly companyHeader?: string
    readonly method?: string
    readonly pathname?: string
    readonly token: string
  }): Promise<Response> {
    const pathname = input.pathname ?? '/trips/probe/mdfe-manifests/automatic'
    const method = input.method ?? 'POST'
    const headers: Record<string, string> = { authorization: `Bearer ${input.token}` }
    if (input.companyHeader !== undefined) headers['x-company-id'] = input.companyHeader
    try {
      return await createRouter().handle({
        correlationId: 'service-token-contract',
        method,
        pathname,
        request: new Request(`http://localhost${pathname}`, { headers, method }),
      })
    } catch (error: unknown) {
      const status = (error as { status?: unknown }).status
      if (typeof status === 'number') return new Response(null, { status })
      throw error
    }
  }

  test('service token without company_id, with a member company header, is accepted', async () => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      token: await sign(serviceClaims()),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ companyId: MEMBER_COMPANY })
  })

  test('service token on a company without the service membership is 403 (BOLA)', async () => {
    const response = await call({
      companyHeader: FOREIGN_COMPANY,
      token: await sign(serviceClaims()),
    })

    expect(response.status).toBe(403)
  })

  test('service token without the company header is 403', async () => {
    const response = await call({ token: await sign(serviceClaims()) })

    expect(response.status).toBe(403)
  })

  test('a company_id claim does not steer a service token: only the header does', async () => {
    const response = await call({
      companyHeader: FOREIGN_COMPANY,
      token: await sign(serviceClaims({ company_id: MEMBER_COMPANY })),
    })

    expect(response.status).toBe(403)
  })

  test.each([
    ['without aud', { aud: undefined }],
    ['with another audience', { aud: 'account' }],
    ['expired', { exp: nowSeconds() - 120 }],
    ['from another issuer', { iss: 'http://127.0.0.1:1/realms/other' }],
  ])('service token %s is 401', async (_name, overrides) => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      token: await sign(serviceClaims(overrides)),
    })

    expect(response.status).toBe(401)
  })

  test('service token with a bad signature is 401', async () => {
    const token = await sign(serviceClaims())
    const tampered = `${token.slice(0, token.lastIndexOf('.') + 1)}${'A'.repeat(342)}`

    const response = await call({ companyHeader: MEMBER_COMPANY, token: tampered })

    expect(response.status).toBe(401)
  })

  test('token without company_id and without the exact service realm role is 401', async () => {
    for (const roles of [['company-admin'], ['transportada-services'], []]) {
      const response = await call({
        companyHeader: MEMBER_COMPANY,
        token: await sign(serviceClaims({ realm_access: { roles } })),
      })
      expect(response.status).toBe(401)
    }
  })

  test('human token without company_id is still 401', async () => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      token: await sign(humanClaims({ company_id: undefined })),
    })

    expect(response.status).toBe(401)
  })

  test('human token keeps working, and the company header never steers it', async () => {
    const response = await call({
      companyHeader: FOREIGN_COMPANY,
      token: await sign(humanClaims()),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ companyId: MEMBER_COMPANY })
  })

  test('service token cannot use a person-only (membership) route', async () => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      method: 'GET',
      pathname: '/me/probe',
      token: await sign(serviceClaims()),
    })

    expect(response.status).toBe(403)
  })
})

function nowSeconds(): number {
  return Math.floor(Date.now() / 1_000)
}

function base64Url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  return Buffer.from(bytes).toString('base64url')
}

async function signJwt(input: {
  readonly claims: Readonly<Record<string, unknown>>
  readonly privateKey: CryptoKey
}): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'RS256', kid: KEY_ID, typ: 'JWT' }))
  const payload = base64Url(JSON.stringify(input.claims))
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    input.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${base64Url(signature)}`
}

function healthService(): HealthService {
  return new HealthService({
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
    migrationStatus: {
      async countPending() {
        return 0
      },
    },
  })
}
