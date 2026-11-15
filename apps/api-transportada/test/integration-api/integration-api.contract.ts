/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { PickupRequestAddress } from '../../src/database/pickup-request.schema.js'
import {
  createCancelIntegrationPickupUseCase,
  createCreateIntegrationPickupUseCase,
  createGetIntegrationPickupUseCase,
  type IntegrationPickupInput,
} from '../../src/integration-api/application/integration-api.use-case.js'
import type {
  IntegrationKeyRecord,
  IntegrationKeyRepositoryPort,
} from '../../src/integration-api/application/integration-key.port.js'
import {
  createAuthenticateIntegrationKeyUseCase,
  createCreateIntegrationKeyUseCase,
  createRevokeIntegrationKeyUseCase,
  type IntegrationCaller,
} from '../../src/integration-api/application/integration-key.use-case.js'
import {
  generateIntegrationKey,
  hashIntegrationKey,
  readIntegrationKey,
} from '../../src/integration-api/domain/integration-key.policy.js'
import { createIntegrationRoutes } from '../../src/integration-api/presentation/integration-api.routes.js'
import type {
  NewPickupRequest,
  PickupRequestAuditEntry,
  PickupRequestRecord,
  PickupRequestRepositoryPort,
} from '../../src/pickup-requests/application/pickup-request.port.js'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-11-16T12:00:00Z')

const ADDRESS: PickupRequestAddress = {
  city: 'Ribeirão Preto',
  cityIbgeCode: '3543402',
  complement: null,
  district: 'Centro',
  number: '100',
  postalCode: '14010000',
  state: 'SP',
  street: 'Rua A',
}

function fakeKeys() {
  const rows = new Map<string, IntegrationKeyRecord & { readonly keyHash: string }>()
  const audits: Parameters<IntegrationKeyRepositoryPort['appendAudit']>[0][] = []
  let sequence = 0
  const repository: IntegrationKeyRepositoryPort = {
    appendAudit: async (entry) => {
      audits.push(entry)
    },
    create: async (input) => {
      sequence += 1
      const row = {
        companyId: input.companyId,
        createdAt: NOW,
        createdByUserId: input.createdByUserId,
        id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
        keyHash: input.keyHash,
        keyPrefix: input.keyPrefix,
        lastUsedAt: null,
        name: input.name,
        revokedAt: null,
        scopes: input.scopes,
      }
      rows.set(row.id, row)
      return row
    },
    findActiveByHash: async ({ keyHash }) =>
      [...rows.values()].find((row) => row.keyHash === keyHash && row.revokedAt === null) ?? null,
    list: async ({ companyId }) => [...rows.values()].filter((row) => row.companyId === companyId),
    revoke: async ({ companyId, id, now }) => {
      const row = rows.get(id)
      if (row === undefined || row.companyId !== companyId || row.revokedAt !== null) return null
      const revoked = { ...row, revokedAt: now }
      rows.set(id, revoked)
      return revoked
    },
  }
  return { audits, repository, rows }
}

function fakePickups() {
  const rows = new Map<string, PickupRequestRecord>()
  const audits: PickupRequestAuditEntry[] = []
  let sequence = 0
  const repository = {
    appendAudit: async (entry: PickupRequestAuditEntry) => {
      audits.push(entry)
    },
    find: async ({ companyId, id }: { companyId: string; id: string }) => {
      const row = rows.get(id)
      return row !== undefined && row.companyId === companyId ? row : null
    },
    insert: async (input: NewPickupRequest) => {
      for (const row of rows.values()) {
        if (
          row.companyId === input.companyId &&
          row.source === input.source &&
          row.requesterName === input.idempotencyKey
        )
          return { created: false, record: row }
      }
      sequence += 1
      const record: PickupRequestRecord = {
        acceptedTotalAmount: null,
        acceptedWindowEnd: null,
        acceptedWindowStart: null,
        cargoDescription: input.cargoDescription,
        companyId: input.companyId,
        contractorId: input.contractorId,
        createdAt: NOW,
        decidedAt: null,
        decisionNote: null,
        destination: input.destination,
        expiresAt: input.expiresAt,
        id: `00000000-0000-4000-8000-${String(sequence + 100).padStart(12, '0')}`,
        integrationKeyId: input.integrationKeyId ?? null,
        kind: input.kind,
        note: input.note,
        origin: input.origin,
        quotedTotalAmount: input.quotedTotalAmount,
        quoteValidUntil: input.quoteValidUntil,
        requesterEmail: input.requesterEmail,
        requesterName: input.idempotencyKey,
        requesterPhone: input.requesterPhone,
        requesterTaxId: input.requesterTaxId,
        source: input.source,
        staleAlertedAt: null,
        status: 'requested',
        tripId: null,
        tripStopId: null,
        volumes: input.volumes,
        weightKg: input.weightKg,
        windowEnd: input.windowEnd,
        windowStart: input.windowStart,
      }
      rows.set(record.id, record)
      return { created: true, record }
    },
    transition: async (input: {
      companyId: string
      from: PickupRequestRecord['status']
      id: string
      integrationKeyId?: string
      to: PickupRequestRecord['status']
    }) => {
      const row = rows.get(input.id)
      if (row === undefined || row.companyId !== input.companyId || row.status !== input.from)
        return null
      if (input.integrationKeyId !== undefined && row.integrationKeyId !== input.integrationKeyId)
        return null
      const next = { ...row, status: input.to }
      rows.set(row.id, next)
      return next
    },
  } as unknown as PickupRequestRepositoryPort
  return { audits, repository, rows }
}

function pickupInput(
  caller: IntegrationCaller,
  key = 'idem-key-0000000001',
): IntegrationPickupInput {
  return {
    caller,
    cargoDescription: 'Caixas',
    correlationId: 'corr',
    destination: ADDRESS,
    idempotencyKey: key,
    kind: 'pickup',
    note: null,
    origin: ADDRESS,
    quote: { total: '4493.4600', validUntil: '2026-11-23' },
    requesterEmail: 'a@b.com',
    requesterName: 'Parceiro',
    requesterPhone: null,
    requesterTaxId: '12345678000199',
    volumes: 3,
    weightKg: '120.500',
    windowEnd: '2026-11-20',
    windowStart: '2026-11-18',
  }
}

async function setup() {
  const keys = fakeKeys()
  const pickups = fakePickups()
  const create = createCreateIntegrationKeyUseCase({ repository: keys.repository })
  const created = await create({
    companyId: COMPANY,
    correlationId: 'c',
    name: 'Parceiro X',
    scopes: ['quote', 'pickup'],
    userId: ADMIN,
  })
  const authenticate = createAuthenticateIntegrationKeyUseCase({
    clock: () => NOW,
    repository: keys.repository,
  })
  const caller = await authenticate({
    authorization: `Bearer ${created.plainKey}`,
    scope: 'pickup',
  })
  return { authenticate, caller, created, keys, pickups }
}

describe('chave de integração — política', () => {
  test('a chave gerada tem 256 bits, prefixo legível e hash estável', () => {
    const generated = generateIntegrationKey()
    expect(generated.plain).toMatch(/^tms_[A-Za-z0-9_-]{43}$/)
    expect(generated.prefix).toBe(generated.plain.slice(0, 12))
    expect(hashIntegrationKey(generated.plain)).toBe(generated.hash)
    expect(generateIntegrationKey().plain).not.toBe(generated.plain)
  })

  test('só aceita "Bearer tms_…" bem formado', () => {
    const { plain } = generateIntegrationKey()
    expect(readIntegrationKey(`Bearer ${plain}`)).toBe(plain)
    expect(readIntegrationKey(null)).toBeNull()
    expect(readIntegrationKey(plain)).toBeNull()
    expect(readIntegrationKey('Bearer abc')).toBeNull()
    expect(readIntegrationKey(`Basic ${plain}`)).toBeNull()
  })
})

describe('chave de integração — ciclo de vida', () => {
  test('a criação devolve a chave inteira e o banco guarda só o hash; a trilha não a leva', async () => {
    const { created, keys } = await setup()
    expect(created.plainKey.startsWith('tms_')).toBe(true)
    const stored = [...keys.rows.values()][0]
    expect(stored?.keyHash).toBe(hashIntegrationKey(created.plainKey))
    expect(JSON.stringify(stored)).not.toContain(created.plainKey)
    expect(JSON.stringify(keys.audits)).not.toContain(created.plainKey)
    expect(JSON.stringify(keys.audits)).not.toContain(stored?.keyHash ?? 'x')
  })

  test('chave ausente, desconhecida ou revogada responde o mesmo 401', async () => {
    const { authenticate, created, keys } = await setup()
    const refused = { code: 'UNAUTHORIZED', status: 401 }
    await expect(authenticate({ authorization: null, scope: 'quote' })).rejects.toMatchObject(
      refused,
    )
    await expect(
      authenticate({ authorization: `Bearer ${generateIntegrationKey().plain}`, scope: 'quote' }),
    ).rejects.toMatchObject(refused)
    const id = [...keys.rows.keys()][0] ?? ''
    await createRevokeIntegrationKeyUseCase({ clock: () => NOW, repository: keys.repository })({
      companyId: COMPANY,
      correlationId: 'c',
      id,
      userId: ADMIN,
    })
    await expect(
      authenticate({ authorization: `Bearer ${created.plainKey}`, scope: 'quote' }),
    ).rejects.toMatchObject(refused)
  })

  test('a chave sem a capacidade recebe 403, e revogar de outra empresa é 404', async () => {
    const keys = fakeKeys()
    const created = await createCreateIntegrationKeyUseCase({ repository: keys.repository })({
      companyId: COMPANY,
      correlationId: 'c',
      name: 'Só cotação',
      scopes: ['quote'],
      userId: ADMIN,
    })
    const authenticate = createAuthenticateIntegrationKeyUseCase({ repository: keys.repository })
    await expect(
      authenticate({ authorization: `Bearer ${created.plainKey}`, scope: 'pickup' }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_SCOPE_FORBIDDEN', status: 403 })
    await expect(
      createRevokeIntegrationKeyUseCase({ repository: keys.repository })({
        companyId: '99999999-9999-4999-8999-999999999999',
        correlationId: 'c',
        id: created.record.id,
        userId: ADMIN,
      }),
    ).rejects.toMatchObject({ code: 'INTEGRATION_KEY_NOT_FOUND', status: 404 })
  })
})

describe('pedido de coleta por integração', () => {
  test('nasce anônimo, ligado à chave, e repetir a chave de idempotência devolve o mesmo', async () => {
    const { caller, pickups } = await setup()
    const create = createCreateIntegrationPickupUseCase({
      clock: () => NOW,
      repository: pickups.repository,
    })
    const first = await create(pickupInput(caller))
    expect(first.created).toBe(true)
    expect(first.record).toMatchObject({
      companyId: COMPANY,
      contractorId: null,
      integrationKeyId: caller.keyId,
      quotedTotalAmount: '4493.4600',
      source: 'integration',
      status: 'requested',
    })
    expect(pickups.audits[0]).toMatchObject({
      action: 'pickup-request.created',
      actorUserId: ADMIN,
    })
    const replay = await create(pickupInput(caller))
    expect(replay.created).toBe(false)
    expect(replay.record.id).toBe(first.record.id)
    expect(pickups.audits).toHaveLength(1)
  })

  test('janela no passado é 422', async () => {
    const { caller, pickups } = await setup()
    const create = createCreateIntegrationPickupUseCase({
      clock: () => NOW,
      repository: pickups.repository,
    })
    await expect(
      create({ ...pickupInput(caller), windowEnd: '2026-11-10', windowStart: '2026-11-09' }),
    ).rejects.toMatchObject({ code: 'PICKUP_REQUEST_WINDOW_INVALID', status: 422 })
  })

  test('outra chave não lê nem cancela o pedido (404), e cancelar duas vezes é 409', async () => {
    const { caller, pickups } = await setup()
    const create = createCreateIntegrationPickupUseCase({
      clock: () => NOW,
      repository: pickups.repository,
    })
    const get = createGetIntegrationPickupUseCase({ repository: pickups.repository })
    const cancel = createCancelIntegrationPickupUseCase({ repository: pickups.repository })
    const { record } = await create(pickupInput(caller))
    const stranger: IntegrationCaller = { ...caller, keyId: '88888888-8888-4888-8888-888888888888' }
    await expect(get({ caller: stranger, id: record.id })).rejects.toMatchObject({ status: 404 })
    await expect(
      cancel({ caller: stranger, correlationId: 'c', id: record.id }),
    ).rejects.toMatchObject({
      status: 404,
    })
    expect((await cancel({ caller, correlationId: 'c', id: record.id })).status).toBe('canceled')
    await expect(cancel({ caller, correlationId: 'c', id: record.id })).rejects.toMatchObject({
      code: 'PICKUP_REQUEST_INVALID_TRANSITION',
      status: 409,
    })
  })
})

describe('rotas de integração', () => {
  async function routes() {
    const context = await setup()
    const routes = createIntegrationRoutes({
      authenticate: context.authenticate,
      calculate: {
        execute: async () =>
          ({
            costDetail: 'não deve sair',
            marginAmount: '1.0000',
            totalAmount: '4493.4600',
          }) as never,
      },
      cancelPickup: createCancelIntegrationPickupUseCase({
        repository: context.pickups.repository,
      }),
      clock: () => NOW,
      createPickup: createCreateIntegrationPickupUseCase({
        clock: () => NOW,
        repository: context.pickups.repository,
      }),
      getPickup: createGetIntegrationPickupUseCase({ repository: context.pickups.repository }),
    })
    return { ...context, routes }
  }

  function find(
    routes: Awaited<ReturnType<typeof routes>>['routes'],
    method: string,
    pathname: string,
  ) {
    const route = routes.find(
      (candidate) => candidate.method === method && candidate.pathname === pathname,
    )
    if (route === undefined) throw new Error(`route ${method} ${pathname} missing`)
    return route
  }

  test('toda rota de integração declara o balde por IP e por chave no Postgres', async () => {
    const { routes: registered } = await routes()
    expect(registered).toHaveLength(4)
    for (const route of registered) {
      expect(route.rateLimit).toMatchObject({ store: 'postgres' })
      expect(
        route.rateLimit && 'target' in route.rateLimit ? route.rateLimit.target : undefined,
      ).toBeDefined()
    }
  })

  test('cotar sem chave é 401; com chave devolve só total, moeda e validade de 7 dias', async () => {
    const { created, routes: registered } = await routes()
    const quote = find(registered, 'POST', '/integration/freight-quotes')
    const body = JSON.stringify({ axles: 5, cargoType: 5, distanceKm: '100' })
    const call = (authorization: string | null) =>
      quote.execute({
        correlationId: 'c',
        limitTarget: async () => ({ allowed: true }),
        pathParameters: {},
        request: new Request('http://x/integration/freight-quotes', {
          body,
          headers: {
            ...(authorization === null ? {} : { authorization }),
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
      } as never)
    await expect(call(null)).rejects.toMatchObject({ status: 401 })
    const response = await call(`Bearer ${created.plainKey}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: { currency: 'BRL', total: '4493.4600', validUntil: '2026-11-23' },
    })
  })

  test('o pedido devolvido ao parceiro não leva contratante, viagem, documento nem nota de aceite', async () => {
    const { created, routes: registered } = await routes()
    const send = (method: string, pathname: string, id: string | undefined, body?: unknown) =>
      find(registered, method, pathname).execute({
        correlationId: 'c',
        limitTarget: async () => ({ allowed: true }),
        pathParameters: id === undefined ? {} : { id },
        request: new Request('http://x/integration/pickup-requests', {
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          headers: {
            authorization: `Bearer ${created.plainKey}`,
            'content-type': 'application/json',
            'idempotency-key': 'idem-key-0000000009',
          },
          method,
        }),
      } as never)
    const payload = {
      cargoDescription: 'Caixas',
      destination: ADDRESS,
      kind: 'pickup',
      origin: ADDRESS,
      requesterEmail: 'a@b.com',
      requesterName: 'Parceiro',
      requesterTaxId: '12345678000199',
      volumes: 3,
      weightKg: '120.500',
      windowEnd: '2026-11-20',
      windowStart: '2026-11-18',
    }
    const post = await send('POST', '/integration/pickup-requests', undefined, payload)
    expect(post.status).toBe(201)
    const created201 = (await post.json()) as { data: Record<string, unknown> & { id: string } }
    expect(Object.keys(created201.data).sort()).toEqual([
      'acceptedWindowEnd',
      'acceptedWindowStart',
      'decisionNote',
      'expiresAt',
      'id',
      'kind',
      'scheduled',
      'status',
      'windowEnd',
      'windowStart',
    ])
    const read = await send('GET', '/integration/pickup-requests/:id', created201.data.id)
    expect(read.status).toBe(200)
    const cancel = await send('POST', '/integration/pickup-requests/:id/cancel', created201.data.id)
    expect(((await cancel.json()) as { data: { status: string } }).data.status).toBe('canceled')
  })
})
