/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T301: `POST`/`GET /v1/toll-booths/extracts` — `settings.manage`, `201` com a linha,
 * `409` no duplicado (linha ou objeto) sem sobrescrever, `400` com todos os erros de validação
 * juntos, `403` sem a permissão, listagem do mais novo para o mais antigo.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { API_TOLL_BOOTH_EXTRACTS_PATH } from '../../src/shared/api.constant.js'
import {
  TollBoothExtractDuplicateError,
  TollBoothExtractObjectConflictError,
} from '../../src/toll-booths/domain/toll-booth-extract.error.js'
import type { TollBoothExtractRow } from '../../src/toll-booths/domain/toll-booth-extract.policy.js'
import { createTollBoothExtractRoutes } from '../../src/toll-booths/presentation/toll-booth-extract.routes.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY_ID = '33333333-3333-3333-3333-333333333333'
const USER_ID = '44444444-4444-4444-4444-444444444444'
const FRONTEND_ORIGIN = 'https://app.test'

const BOOTH_ROW = {
  chargeCar: '4.2000',
  chargePerAxle: '4.2000',
  latitude: '-23.5101982',
  longitude: '-46.8172702',
  name: 'Barueri - 2',
  operator: 'Ecovias Raposo Castello',
  osmNodeId: '25937851',
}

const EXTRACT_ROW: TollBoothExtractRow = {
  boothCount: 1,
  boothsWithAxleCharge: 1,
  boothsWithCharge: 1,
  dataset: 'sudeste',
  missingObjectObservedAt: null,
  objectKey: 'toll-booths/osm/sudeste/2026-09-14/toll-booths.json',
  observedOn: '2026-09-14',
  reloadedAt: null,
  reloadedBoothCount: null,
  reloadedByUserId: null,
  sha256: 'a'.repeat(64),
  uploadedByUserId: USER_ID,
}

type ExecuteCall = Record<string, unknown>

async function createFixture(
  params: {
    readonly createExtractImpl?: (input: ExecuteCall) => Promise<TollBoothExtractRow>
    readonly listExtractsResult?: readonly TollBoothExtractRow[]
    readonly permissions?: CompanyContext['permissions']
  } = {},
) {
  const createExtractCalls: ExecuteCall[] = []
  const routes = createTollBoothExtractRoutes({
    createExtract: {
      async execute(input) {
        createExtractCalls.push(structuredClone({ ...input, rawBody: undefined }))
        if (params.createExtractImpl) return params.createExtractImpl(input)
        return EXTRACT_ROW
      },
    },
    listExtracts: {
      async execute() {
        return params.listExtractsResult ?? [EXTRACT_ROW]
      },
    },
  })

  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'toll-booth-extract-http-contract',
      userId: USER_ID,
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: params.permissions ?? new Set(['settings.manage']),
      roles: [],
      userId: USER_ID,
    },
  }

  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: {
      async authenticate() {
        return context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        authorization.authorize(value, policy)
      },
    },
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
    routes,
    tenantContext: {
      async resolveCompany() {
        return context
      },
    },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handle = createRequestHandler({
    createCorrelationId: () => 'toll-booth-extract-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    createExtractCalls,
    handle: (request: Request) => handle(request, { timeout() {} }),
  }
}

function postRequest(query: string, body: unknown): Request {
  return new Request(`https://api.test${API_TOLL_BOOTH_EXTRACTS_PATH}${query}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
      origin: FRONTEND_ORIGIN,
    },
    method: 'POST',
  })
}

function getRequest(): Request {
  return new Request(`https://api.test${API_TOLL_BOOTH_EXTRACTS_PATH}`, {
    headers: { authorization: 'Bearer token', origin: FRONTEND_ORIGIN },
    method: 'GET',
  })
}

describe('POST /toll-booths/extracts http contract (spec 154, T301)', () => {
  test('answers 201 with the registered row', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )
    const body = (await response.json()) as { data: Record<string, unknown> }

    expect(response.status).toBe(201)
    expect(body.data.dataset).toBe('sudeste')
    expect(body.data.boothCount).toBe(1)
  })

  test('reads dataset/observedOn from the query and the actor from the token, never the body', async () => {
    const fixture = await createFixture()

    await fixture.handle(postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]))

    expect(fixture.createExtractCalls).toEqual([
      {
        actorUserId: USER_ID,
        booths: [BOOTH_ROW],
        dataset: 'sudeste',
        observedOn: '2026-09-14',
        rawBody: undefined,
      },
    ])
  })

  test('answers 409 when the (dataset, observedOn) pair is already registered', async () => {
    const fixture = await createFixture({
      createExtractImpl: async () => {
        throw new TollBoothExtractDuplicateError()
      },
    })

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('TOLL_BOOTH_EXTRACT_DUPLICATE')
  })

  test('answers 409 when the object already exists with different content, without overwriting it', async () => {
    const fixture = await createFixture({
      createExtractImpl: async () => {
        throw new TollBoothExtractObjectConflictError()
      },
    })

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('TOLL_BOOTH_EXTRACT_OBJECT_CONFLICT')
  })

  test('answers 400 with every validation issue at once on a malformed extract', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [
        { ...BOOTH_ROW, chargeCar: '4.20', osmNodeId: 'abc' },
      ]),
    )
    const body = (await response.json()) as { error: { details: readonly unknown[] } }

    expect(response.status).toBe(400)
    expect(body.error.details.length).toBeGreaterThanOrEqual(2)
  })

  test('answers 400 when the same osmNodeId repeats in the extract', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [
        BOOTH_ROW,
        { ...BOOTH_ROW, name: 'Barueri - 3' },
      ]),
    )

    expect(response.status).toBe(400)
  })

  test('answers 400 when latitude or longitude is out of range', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [
        { ...BOOTH_ROW, latitude: '-99.0000000' },
      ]),
    )

    expect(response.status).toBe(400)
  })

  test('answers 400 on an invalid dataset in the query string', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(
      postRequest('?dataset=Sudeste!&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(400)
  })

  test('answers 403 without settings.manage', async () => {
    const fixture = await createFixture({ permissions: new Set() })

    const response = await fixture.handle(
      postRequest('?dataset=sudeste&observedOn=2026-09-14', [BOOTH_ROW]),
    )

    expect(response.status).toBe(403)
  })
})

describe('GET /toll-booths/extracts http contract (spec 154, T301)', () => {
  test('answers 200 with the extracts, newest first', async () => {
    const olderExtract = { ...EXTRACT_ROW, dataset: 'sudeste', observedOn: '2026-08-01' }
    const fixture = await createFixture({ listExtractsResult: [EXTRACT_ROW, olderExtract] })

    const response = await fixture.handle(getRequest())
    const body = (await response.json()) as { data: readonly Record<string, unknown>[] }

    expect(response.status).toBe(200)
    expect(body.data.map((row) => row.observedOn)).toEqual(['2026-09-14', '2026-08-01'])
  })

  test('answers 403 without settings.manage', async () => {
    const fixture = await createFixture({ permissions: new Set() })

    const response = await fixture.handle(getRequest())

    expect(response.status).toBe(403)
  })
})
