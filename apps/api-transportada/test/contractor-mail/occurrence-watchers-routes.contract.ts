/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267 (T1.4): os responsáveis por ocorrências, pelo roteador real (`createRouter` + `allowedMethods`). Um contrato
 * que contorna o roteador não pega colisão de caminho — a 266 mostrou. A elegibilidade e os tetos reais estão em
 * `test/integration/occurrence-watchers-repository.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'

import type {
  OccurrenceWatcherRepositoryPort,
  OccurrenceWatcherRow,
  OccurrenceWatcherScope,
  OccurrenceWatcherUser,
} from '../../src/contractor-mail/application/occurrence-watcher.port.js'
import { createOccurrenceWatchersUseCase } from '../../src/contractor-mail/application/occurrence-watchers.use-case.js'
import {
  OccurrenceWatcherListTooLongError,
  OccurrenceWatcherNotFoundError,
} from '../../src/contractor-mail/domain/occurrence-watcher.error.js'
import { createOccurrenceWatchersRoutes } from '../../src/contractor-mail/presentation/occurrence-watchers.routes.js'
import { ContractorNotFoundError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from '../fixtures/nfe-import-application.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY_ID = NFE_COMPANY_CONTEXT.companyId
const CONTRACTOR_ID = '00000000-0000-4000-8000-0000000000c1'
const ANA = '00000000-0000-4000-8000-0000000000a1'
const BRUNO = '00000000-0000-4000-8000-0000000000a2'
const NO_PERMISSION = '00000000-0000-4000-8000-0000000000a3'
const NO_EMAIL = '00000000-0000-4000-8000-0000000000a4'
const STRANGER = '00000000-0000-4000-8000-0000000000a5'

const USERS: readonly OccurrenceWatcherUser[] = [
  { address: 'ana@empresa.test', canResolve: true, name: 'Ana', userId: ANA },
  { address: 'bruno@empresa.test', canResolve: true, name: 'Bruno', userId: BRUNO },
  { address: 'sem@empresa.test', canResolve: false, name: 'Sem Permissão', userId: NO_PERMISSION },
  { address: undefined, canResolve: true, name: 'Sem Email', userId: NO_EMAIL },
]

function buildRepository(): OccurrenceWatcherRepositoryPort & {
  readonly lists: Map<string, OccurrenceWatcherRow[]>
  readonly writes: unknown[]
} {
  const lists = new Map<string, OccurrenceWatcherRow[]>()
  const writes: unknown[] = []
  const keyOf = (scope: OccurrenceWatcherScope) =>
    scope.kind === 'company' ? 'company' : `contractor:${scope.contractorId}`
  const rowsOf = (scope: OccurrenceWatcherScope) => {
    const rows = lists.get(keyOf(scope)) ?? []
    lists.set(keyOf(scope), rows)
    return rows
  }
  return {
    lists,
    writes,
    async addWatcher(context) {
      writes.push(context)
      const rows = rowsOf(context.scope)
      if (rows.some((row) => row.userId === context.userId)) return false
      if (rows.length >= 2) throw new OccurrenceWatcherListTooLongError()
      rows.push({ status: 'active', userId: context.userId })
      return true
    },
    async findWatcherUsers({ userIds }) {
      return USERS.filter((user) => userIds === undefined || userIds.includes(user.userId))
    },
    async listWatcherRows(scope) {
      return [...rowsOf(scope)]
    },
    async loadEffectiveCandidates() {
      return { company: [], contractor: [] }
    },
    async removeWatcher(context) {
      writes.push(context)
      const rows = rowsOf(context.scope)
      const index = rows.findIndex((row) => row.userId === context.userId)
      if (index === -1) throw new OccurrenceWatcherNotFoundError()
      rows.splice(index, 1)
    },
    async setWatcherStatus(context) {
      writes.push(context)
      const row = rowsOf(context.scope).find((candidate) => candidate.userId === context.userId)
      if (row === undefined) throw new OccurrenceWatcherNotFoundError()
      rowsOf(context.scope)[rowsOf(context.scope).indexOf(row)] = {
        status: context.status,
        userId: context.userId,
      }
    },
  }
}

function buildApi(permissions: readonly string[] = ['settings.manage']) {
  const repository = buildRepository()
  const useCase = createOccurrenceWatchersUseCase({
    getContractor: {
      async execute({ id }) {
        if (id !== CONTRACTOR_ID) throw new ContractorNotFoundError()
      },
    },
    repository,
  })
  const scope: CompanyContext = {
    ...NFE_COMPANY_CONTEXT,
    companyId: COMPANY_ID,
    permissions: new Set(permissions) as CompanyContext['permissions'],
  }
  const identity = {
    companyIdClaim: COMPANY_ID,
    externalIdentityId: crypto.randomUUID(),
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    serviceAccount: false,
    subject: 'occurrence-watchers-contract',
    userId: NFE_COMPANY_CONTEXT.userId,
  } satisfies AuthenticatedIdentity
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: { authenticate: async () => identity },
    authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    routes: createOccurrenceWatchersRoutes({ useCase }),
    tenantContext: { resolveCompany: async () => ({ identity, scope }) },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'occurrence-watchers-correlation',
    frontendOrigins: ['http://localhost:53000'],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    repository,
    router,
    send: (method: string, path: string, body?: unknown) =>
      handleRequest(
        new Request(`http://localhost${path}`, {
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: {
            authorization: 'Bearer occurrence-watchers-contract',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          method,
        }),
        { timeout() {} },
      ),
  }
}

const COMPANY_PATH = '/company-settings/occurrence-watchers'
const CONTRACTOR_PATH = `/contractors/${CONTRACTOR_ID}/occurrence-watchers`

async function readJson(response: Response): Promise<any> {
  return response.json()
}

describe('occurrence watchers routes (spec 267 T1.4)', () => {
  test('`candidates` é rota estática e nunca é lido como :userId', async () => {
    const api = buildApi()
    const response = await api.send('GET', `${COMPANY_PATH}/candidates`)
    expect(response.status).toBe(200)
    const body = await readJson(response)
    expect(body.data).toEqual([
      { maskedEmail: 'a***@e***.test', name: 'Ana', userId: ANA },
      { maskedEmail: 'b***@e***.test', name: 'Bruno', userId: BRUNO },
    ])
    expect(api.router.allowedMethods(`${COMPANY_PATH}/candidates`)).toEqual(['GET'])
    expect(api.router.allowedMethods(`${COMPANY_PATH}/${ANA}`)).toEqual(['PATCH', 'DELETE'])
    expect(api.router.allowedMethods(COMPANY_PATH)).toEqual(['GET', 'POST'])
    expect(api.router.allowedMethods(`${CONTRACTOR_PATH}/${ANA}`)).toEqual(['PATCH', 'DELETE'])
    expect((await api.send('GET', `${COMPANY_PATH}/${ANA}`)).status).toBe(404)
    expect(
      (await api.send('PATCH', `${COMPANY_PATH}/candidates`, { status: 'active' })).status,
    ).toBe(404)
  })

  test('POST cria (201), repetir é 200, e o corpo é estrito', async () => {
    const api = buildApi()
    const created = await api.send('POST', COMPANY_PATH, { userId: ANA })
    expect(created.status).toBe(201)
    expect((await readJson(created)).data).toEqual({
      eligible: true,
      maskedEmail: 'a***@e***.test',
      name: 'Ana',
      status: 'active',
      userId: ANA,
    })
    expect((await api.send('POST', COMPANY_PATH, { userId: ANA })).status).toBe(200)
    expect((await api.send('POST', COMPANY_PATH, { userId: ANA, address: 'x@y.com' })).status).toBe(
      400,
    )
    expect((await api.send('POST', COMPANY_PATH, { userId: 'nao-e-uuid' })).status).toBe(400)
  })

  test('POST de inelegível (sem permissão, sem e-mail, desconhecido) é 400 sem dizer qual', async () => {
    const api = buildApi()
    for (const userId of [NO_PERMISSION, NO_EMAIL, STRANGER]) {
      const response = await api.send('POST', COMPANY_PATH, { userId })
      expect(response.status).toBe(400)
      expect((await readJson(response)).error.code).toBe('OCCURRENCE_WATCHER_NOT_ELIGIBLE')
    }
    expect(api.repository.writes).toEqual([])
  })

  test('lista cheia é 400 OCCURRENCE_WATCHER_LIST_TOO_LONG', async () => {
    const api = buildApi()
    await api.send('POST', COMPANY_PATH, { userId: ANA })
    await api.send('POST', COMPANY_PATH, { userId: BRUNO })
    api.repository.lists.get('company')?.push({ status: 'active', userId: STRANGER })
    const response = await api.send('POST', COMPANY_PATH, { userId: ANA })
    expect(response.status).toBe(200)
    api.repository.lists.get('company')?.splice(0, 1)
    api.repository.lists.get('company')?.push({ status: 'inactive', userId: NO_EMAIL })
    const full = await api.send('POST', COMPANY_PATH, { userId: ANA })
    expect(full.status).toBe(400)
    expect((await readJson(full)).error.code).toBe('OCCURRENCE_WATCHER_LIST_TOO_LONG')
  })

  test('PATCH troca o estado; ativar inelegível é 400; ausente é 404', async () => {
    const api = buildApi()
    await api.send('POST', COMPANY_PATH, { userId: ANA })
    const response = await api.send('PATCH', `${COMPANY_PATH}/${ANA}`, { status: 'inactive' })
    expect(response.status).toBe(200)
    expect((await readJson(response)).data.status).toBe('inactive')
    expect((await api.send('PATCH', `${COMPANY_PATH}/${ANA}`, { status: 'paused' })).status).toBe(
      400,
    )
    expect(
      (await api.send('PATCH', `${COMPANY_PATH}/${ANA}`, { status: 'active', x: 1 })).status,
    ).toBe(400)
    const ineligible = await api.send('PATCH', `${COMPANY_PATH}/${NO_PERMISSION}`, {
      status: 'active',
    })
    expect((await readJson(ineligible)).error.code).toBe('OCCURRENCE_WATCHER_NOT_ELIGIBLE')
    const missing = await api.send('PATCH', `${COMPANY_PATH}/${BRUNO}`, { status: 'inactive' })
    expect(missing.status).toBe(404)
    expect((await readJson(missing)).error.code).toBe('OCCURRENCE_WATCHER_NOT_FOUND')
  })

  test('DELETE remove (204) e ausente é 404', async () => {
    const api = buildApi()
    await api.send('POST', COMPANY_PATH, { userId: ANA })
    expect((await api.send('DELETE', `${COMPANY_PATH}/${ANA}`)).status).toBe(204)
    expect((await api.send('DELETE', `${COMPANY_PATH}/${ANA}`)).status).toBe(404)
  })

  test('a lista devolve o item inelegível marcado, sem endereço em claro', async () => {
    const api = buildApi()
    api.repository.lists.set('company', [
      { status: 'active', userId: ANA },
      { status: 'inactive', userId: NO_PERMISSION },
    ])
    const response = await api.send('GET', COMPANY_PATH)
    const text = JSON.stringify(await readJson(response))
    expect(text).not.toContain('@empresa.test')
    const body = JSON.parse(text)
    expect(body.data.watchers.map((item: any) => [item.userId, item.eligible])).toEqual([
      [ANA, true],
      [NO_PERMISSION, false],
    ])
    expect(body.data.effectiveSource).toBeUndefined()
  })

  test('a lista da contratante diz qual lista vale; sem ativo vale a da empresa', async () => {
    const api = buildApi()
    const empty = await readJson(await api.send('GET', CONTRACTOR_PATH))
    expect(empty.data).toEqual({ effectiveSource: 'company', watchers: [] })
    await api.send('POST', CONTRACTOR_PATH, { userId: ANA })
    await api.send('PATCH', `${CONTRACTOR_PATH}/${ANA}`, { status: 'inactive' })
    expect((await readJson(await api.send('GET', CONTRACTOR_PATH))).data.effectiveSource).toBe(
      'company',
    )
    await api.send('PATCH', `${CONTRACTOR_PATH}/${ANA}`, { status: 'active' })
    expect((await readJson(await api.send('GET', CONTRACTOR_PATH))).data.effectiveSource).toBe(
      'contractor',
    )
    expect((await api.send('DELETE', `${CONTRACTOR_PATH}/${ANA}`)).status).toBe(204)
  })

  test('contratante desconhecida ou de outra empresa é 404 em todos os verbos', async () => {
    const api = buildApi()
    const other = '/contractors/00000000-0000-4000-8000-0000000000ff/occurrence-watchers'
    for (const [method, path, body] of [
      ['GET', other, undefined],
      ['POST', other, { userId: ANA }],
      ['PATCH', `${other}/${ANA}`, { status: 'inactive' }],
      ['DELETE', `${other}/${ANA}`, undefined],
    ] as const) {
      const response = await api.send(method, path, body)
      expect(response.status).toBe(404)
      expect((await readJson(response)).error.code).toBe('CONTRACTOR_NOT_FOUND')
    }
    expect(api.repository.writes).toEqual([])
  })

  test('sem settings.manage é 403', async () => {
    const api = buildApi(['occurrences.resolve'])
    expect((await api.send('GET', COMPANY_PATH)).status).toBe(403)
    expect((await api.send('POST', COMPANY_PATH, { userId: ANA })).status).toBe(403)
    expect((await api.send('GET', `${COMPANY_PATH}/candidates`)).status).toBe(403)
    expect((await api.send('DELETE', `${CONTRACTOR_PATH}/${ANA}`)).status).toBe(403)
  })
})
