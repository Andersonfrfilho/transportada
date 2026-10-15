/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T2.3: `POST /trip-occurrences/:kind/:id/resolution` — validação do corpo, 201, 404 (também
 * para outra empresa) e os dois 409, com o banco substituído por uma unidade de trabalho em memória.
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type {
  OccurrenceResolutionTransactionPort,
  OccurrenceTarget,
} from '../../src/trips/application/occurrence-resolution.port.js'
import { createResolveOccurrenceUseCase } from '../../src/trips/application/resolve-occurrence.use-case.js'
import type { OccurrenceResolutionEventFact } from '../../src/trips/domain/occurrence-resolution.types.js'
import { createOccurrenceResolutionRoutes } from '../../src/trips/presentation/occurrence-resolution.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000009'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const OCCURRENCE_ID = '00000000-0000-4000-8000-0000000000a1'
const PATH = '/trip-occurrences/:kind/:id/resolution'

type FakeState = {
  readonly cancelledAt?: string
  readonly events: OccurrenceResolutionEventFact[]
  readonly inserted: { actorUserId: string; note: string; occurrenceKind: string }[]
  readonly logs: { message: string; metadata: Record<string, unknown> | undefined }[]
}

function context(companyId = COMPANY_ID): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['occurrences.resolve'] as never),
      roles: ['company-admin'],
      userId: USER_ID,
    },
  }
}

function buildRoute(state: FakeState) {
  const transaction: OccurrenceResolutionTransactionPort = {
    insertInternalResolution: async (input) => {
      state.inserted.push({
        actorUserId: input.actorUserId,
        note: input.note,
        occurrenceKind: input.occurrenceKind,
      })
      return { createdAt: '2026-10-15T12:00:00.000Z' }
    },
    listLatestEvents: async () => state.events,
    lockOccurrence: async (input: OccurrenceTarget) =>
      input.companyId === COMPANY_ID && input.occurrenceId === OCCURRENCE_ID
        ? { cancelledAt: state.cancelledAt }
        : undefined,
  }
  const resolveOccurrence = createResolveOccurrenceUseCase({
    logger: {
      error: () => undefined,
      info: (message, metadata) => state.logs.push({ message, metadata }),
      warn: () => undefined,
    },
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  const route = createOccurrenceResolutionRoutes({ resolveOccurrence }).find(
    (candidate) => candidate.method === 'POST' && candidate.pathname === PATH,
  )
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return route
}

function freshState(overrides: Partial<FakeState> = {}): FakeState {
  return { events: [], inserted: [], logs: [], ...overrides }
}

function call(
  state: FakeState,
  input: { body?: unknown; companyId?: string; id?: string; kind?: string } = {},
): Promise<Response> {
  const kind = input.kind ?? 'document'
  const id = input.id ?? OCCURRENCE_ID
  return buildRoute(state).execute({
    context: context(input.companyId),
    correlationId: 'correlation-1',
    pathParameters: { id, kind },
    request: new Request(`http://localhost/trip-occurrences/${kind}/${id}/resolution`, {
      body: JSON.stringify(input.body ?? { note: 'Resolvido por telefone' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  })
}

const RESOLVED_EVENT: OccurrenceResolutionEventFact = {
  actorKind: 'internal',
  caseEventStatus: undefined,
  createdAt: '2026-10-15T10:00:00.000Z',
  id: '00000000-0000-4000-8000-0000000000e1',
  kind: 'resolved',
  note: 'antes',
}

describe('POST /trip-occurrences/:kind/:id/resolution (spec 266 T2.3)', () => {
  it('201 com o envelope, a nota aparada e o ator do contexto; nota de parada também', async () => {
    for (const kind of ['document', 'stop']) {
      const state = freshState()
      const response = await call(state, { body: { note: '  Resolvido  ' }, kind })

      expect(response.status).toBe(201)
      expect(await response.json()).toEqual({
        data: {
          note: 'Resolvido',
          occurrenceId: OCCURRENCE_ID,
          occurrenceKind: kind,
          resolvedAt: '2026-10-15T12:00:00.000Z',
          state: 'resolved',
        },
      })
      expect(state.inserted).toEqual([
        { actorUserId: USER_ID, note: 'Resolvido', occurrenceKind: kind },
      ])
    }
  })

  it('loga só os identificadores, nunca a observação', async () => {
    const state = freshState()
    await call(state, { body: { note: 'segredo do escritório' } })

    expect(state.logs).toEqual([
      {
        message: 'occurrence.resolution.resolved',
        metadata: {
          actorKind: 'internal',
          occurrenceId: OCCURRENCE_ID,
          occurrenceKind: 'document',
        },
      },
    ])
  })

  it('reabrida (último evento reopened) volta a poder ser resolvida', async () => {
    const reopened: OccurrenceResolutionEventFact = {
      actorKind: 'driver',
      caseEventStatus: undefined,
      createdAt: '2026-10-15T11:00:00.000Z',
      id: '00000000-0000-4000-8000-0000000000e2',
      kind: 'reopened',
      note: undefined,
    }
    const state = freshState({ events: [RESOLVED_EVENT, reopened] })

    expect((await call(state)).status).toBe(201)
  })

  it('400 para nota vazia, só espaço, longa demais, campo extra, kind inválido e id que não é uuid', async () => {
    const attempts = [
      { body: { note: '' } },
      { body: { note: '   ' } },
      { body: { note: 'x'.repeat(2001) } },
      { body: {} },
      { body: { note: 'ok', companyId: OTHER_COMPANY_ID } },
      { body: { note: 'ok' }, kind: 'trip' },
      { body: { note: 'ok' }, id: 'not-a-uuid' },
    ]
    for (const attempt of attempts) {
      const state = freshState()
      await expect(call(state, attempt)).rejects.toMatchObject({ status: 400 })
      expect(state.inserted).toEqual([])
    }
  })

  it('404 TRIP_OCCURRENCE_NOT_FOUND para outra empresa e para id inexistente', async () => {
    for (const attempt of [
      { companyId: OTHER_COMPANY_ID },
      { id: '00000000-0000-4000-8000-0000000000ff' },
    ]) {
      await expect(call(freshState(), attempt)).rejects.toMatchObject({
        code: 'TRIP_OCCURRENCE_NOT_FOUND',
        status: 404,
      })
    }
  })

  it('409 OCCURRENCE_ALREADY_RESOLVED quando o último evento é resolved', async () => {
    const state = freshState({ events: [RESOLVED_EVENT] })

    await expect(call(state)).rejects.toMatchObject({
      code: 'OCCURRENCE_ALREADY_RESOLVED',
      status: 409,
    })
    expect(state.inserted).toEqual([])
  })

  it('409 OCCURRENCE_CANCELLED para a ocorrência cancelada, mesmo sem eventos', async () => {
    const state = freshState({ cancelledAt: '2026-10-14T09:00:00.000Z' })

    await expect(call(state)).rejects.toMatchObject({ code: 'OCCURRENCE_CANCELLED', status: 409 })
    expect(state.inserted).toEqual([])
  })
})
