/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { HealthService } from '../src/health/health.service'
import { defineRoute } from '../src/http/router.service'
import { AuthenticationService } from '../src/identity/application/authentication.service'
import { TenantContextService } from '../src/identity/application/tenant-context.service'
import { createKeycloakAccessTokenVerifier } from '../src/identity/infrastructure/keycloak-jwt.gateway'
import { createTripRoutes } from '../src/trips/presentation/trip.routes'
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
const SERVICE_CLIENT_IDS = ['transportada-worker', 'transportada-worker-cnh-picture'] as const
const TRIP_ID = '00000000-0000-4000-8000-0000000000e1'
const AUTOMATIC_MANIFEST_PATH = `/trips/${TRIP_ID}/mdfe-manifests/automatic`

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
      typ: 'Bearer',
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
      typ: 'Bearer',
      ...overrides,
    }
  }

  function createRouter(input: { readonly mdfeAutoIssueEnabled?: boolean } = {}) {
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
      serviceClientIds: SERVICE_CLIENT_IDS,
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
      defineRoute<Record<string, never>>({
        async handle({ context }) {
          return Response.json({ companyId: context.scope.companyId })
        },
        method: 'POST',
        parse: () => ({}),
        pathname: '/trips/probe/manage',
        policy: { permission: 'trip.manage', scope: 'company' },
      }),
      ...createTripRoutes({
        issueManifestAutomatically: {
          async execute() {
            return { status: 'issued' }
          },
        },
        mdfeAutoIssueEnabled: input.mdfeAutoIssueEnabled ?? true,
      } as never).filter(
        (route) => route.method === 'POST' && route.pathname.endsWith('/automatic'),
      ),
    ]
    return createHttpRouterFixture({
      authentication,
      healthService: healthService(),
      routes,
      tenantContext,
    })
  }

  async function call(input: {
    readonly companyHeader?: string | readonly string[]
    readonly mdfeAutoIssueEnabled?: boolean
    readonly method?: string
    readonly pathname?: string
    readonly token: string
  }): Promise<Response> {
    const pathname = input.pathname ?? '/trips/probe/mdfe-manifests/automatic'
    const method = input.method ?? 'POST'
    const headers = new Headers({ authorization: `Bearer ${input.token}` })
    for (const value of [input.companyHeader ?? []].flat()) headers.append('x-company-id', value)
    try {
      const router = createRouter(
        input.mdfeAutoIssueEnabled === undefined
          ? {}
          : { mdfeAutoIssueEnabled: input.mdfeAutoIssueEnabled },
      )
      return await router.handle({
        correlationId: 'service-token-contract',
        method,
        pathname,
        request: new Request(`http://localhost${pathname}`, { headers, method }),
      })
    } catch (error: unknown) {
      const { code, status } = error as { code?: unknown; status?: unknown }
      if (typeof status === 'number') return Response.json({ error: { code } }, { status })
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

  /** Fail-closed: com o papel e uma empresa na claim não é serviço nem gente — 401, nunca o caminho da claim. */
  test('a service-role token carrying company_id is 401, in any company', async () => {
    for (const companyHeader of [MEMBER_COMPANY, FOREIGN_COMPANY]) {
      const response = await call({
        companyHeader,
        token: await sign(serviceClaims({ company_id: MEMBER_COMPANY })),
      })

      expect(response.status).toBe(401)
    }
  })

  test.each([
    ['from a client outside SERVICE_CLIENT_IDS', { azp: 'transportada-spa' }],
    ['without azp', { azp: undefined }],
    ['with a non-string azp', { azp: ['transportada-worker'] }],
  ])('service-role token %s is 401', async (_name, overrides) => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      token: await sign(serviceClaims(overrides)),
    })

    expect(response.status).toBe(401)
  })

  test('the CNH picture client is also a service client', async () => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      token: await sign(serviceClaims({ azp: 'transportada-worker-cnh-picture' })),
    })

    expect(response.status).toBe(200)
  })

  test.each([
    ['a refresh token', 'Refresh'],
    ['an ID token', 'ID'],
    ['a token without typ', undefined],
  ])('%s is never an access token: 401', async (_name, typ) => {
    for (const claims of [serviceClaims({ typ }), humanClaims({ typ })]) {
      const response = await call({ companyHeader: MEMBER_COMPANY, token: await sign(claims) })

      expect(response.status).toBe(401)
    }
  })

  test.each([
    ['without aud', { aud: undefined }],
    ['with another audience', { aud: 'account' }],
    ['expired', { exp: nowSeconds() - 120 }],
    ['from another issuer', { iss: 'http://127.0.0.1:1/realms/other' }],
  ])('human token %s is 401', async (_name, overrides) => {
    const response = await call({ token: await sign(humanClaims(overrides)) })

    expect(response.status).toBe(401)
  })

  test('alg none is 401', async () => {
    const header = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    const payload = base64Url(JSON.stringify(serviceClaims()))

    const response = await call({ companyHeader: MEMBER_COMPANY, token: `${header}.${payload}.` })

    expect(response.status).toBe(401)
  })

  test('HS256 signed with the public key as secret is 401', async () => {
    const publicJwk = JSON.stringify(
      (
        (await (await fetch(`${issuer}/protocol/openid-connect/certs`)).json()) as {
          keys: unknown[]
        }
      ).keys[0],
    )
    const header = base64Url(JSON.stringify({ alg: 'HS256', kid: KEY_ID, typ: 'JWT' }))
    const payload = base64Url(JSON.stringify(serviceClaims()))
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(publicJwk),
      { hash: 'SHA-256', name: 'HMAC' },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign(
      'HMAC',
      hmacKey,
      new TextEncoder().encode(`${header}.${payload}`),
    )

    const response = await call({
      companyHeader: MEMBER_COMPANY,
      token: `${header}.${payload}.${base64Url(signature)}`,
    })

    expect(response.status).toBe(401)
  })

  test.each([
    ['not a UUID', 'not-a-uuid'],
    ['a SQL fragment', `${MEMBER_COMPANY}' or '1'='1`],
    ['sent twice', [MEMBER_COMPANY, MEMBER_COMPANY]],
    ['sent twice with different companies', [MEMBER_COMPANY, FOREIGN_COMPANY]],
  ])('service token with an x-company-id header %s is 403', async (_name, companyHeader) => {
    const response = await call({ companyHeader, token: await sign(serviceClaims()) })

    expect(response.status).toBe(403)
  })

  test('service token on a human permission (trip.manage) is 403, even with the role', async () => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      pathname: '/trips/probe/manage',
      token: await sign(serviceClaims()),
    })

    expect(response.status).toBe(403)
  })

  test('a person holding the automation role is 403 on service routes', async () => {
    const response = await call({ token: await sign(humanClaims()) })

    expect(response.status).toBe(403)
  })

  test('a person keeps human permissions on the same membership', async () => {
    const response = await call({
      pathname: '/trips/probe/manage',
      token: await sign(humanClaims()),
    })

    expect(response.status).toBe(200)
  })

  test('automatic MDF-e answers 404 MDFE_AUTO_ISSUE_DISABLED while the switch is off', async () => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      mdfeAutoIssueEnabled: false,
      pathname: AUTOMATIC_MANIFEST_PATH,
      token: await sign(serviceClaims()),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: 'MDFE_AUTO_ISSUE_DISABLED' } })
  })

  test('automatic MDF-e reaches the use case only with the switch on', async () => {
    const response = await call({
      companyHeader: MEMBER_COMPANY,
      mdfeAutoIssueEnabled: true,
      pathname: AUTOMATIC_MANIFEST_PATH,
      token: await sign(serviceClaims()),
    })

    expect(response.status).toBe(200)
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
      pathname: '/trips/probe/manage',
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
