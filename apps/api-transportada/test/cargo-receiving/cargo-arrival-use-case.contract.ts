/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: os casos de uso da chegada — a empresa, o ator e o canal vêm do contexto e da
 * composição; o relógio é injetado; cada resultado do repositório vira um código estável.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CargoArrivalReadRepositoryPort,
  CargoArrivalRegistrationRepositoryPort,
  CargoArrivalSeparationRepositoryPort,
} from '../../src/cargo-receiving/application/cargo-arrival.port.js'
import type { CargoArrivalRecord } from '../../src/cargo-receiving/application/cargo-arrival.types.js'
import { createGetCargoArrivalUseCase } from '../../src/cargo-receiving/application/read-cargo-arrival.use-case.js'
import { createRegisterCargoArrivalUseCase } from '../../src/cargo-receiving/application/register-cargo-arrival.use-case.js'
import {
  createChangeCargoArrivalDocumentStateUseCase,
  createCloseCargoArrivalUseCase,
} from '../../src/cargo-receiving/application/separate-cargo-arrival.use-case.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const CONTEXT: CompanyContext = {
  companyId: '00000000-0000-4000-8000-000000000e01',
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-000000000e02',
  permissions: new Set(['trip.manage', 'fleet.read']),
  roles: ['separator'],
  userId: '00000000-0000-4000-8000-000000000e03',
}
const ARRIVAL_ID = '00000000-0000-4000-8000-000000000e04'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000e05'
const NOW = new Date('2026-10-04T10:00:00.000Z')
const ARRIVED_AT = new Date('2026-10-03T08:00:00.000Z')

const ARRIVAL: CargoArrivalRecord = {
  arrivedAt: ARRIVED_AT,
  contractorId: CONTRACTOR_ID,
  contractorName: 'Contratante Alfa',
  createdAt: ARRIVED_AT,
  deliveryDeadlineBusinessDays: 3,
  id: ARRIVAL_ID,
  palletCount: 4,
  reference: null,
  separationDueAt: new Date('2026-10-04T08:00:00.000Z'),
  separationWindowHours: 24,
  status: 'open',
}

function document(nfeDocumentId: string, separationState: 'expected' | 'received' | 'separated') {
  return {
    accessKey: `3526${nfeDocumentId}`,
    cityIbgeCode: '3548906',
    cityName: 'São Carlos',
    isInLiveTrip: false,
    nfeDocumentId,
    number: nfeDocumentId,
    receivedAt: separationState === 'expected' ? null : ARRIVED_AT,
    recipientName: 'Destinatário',
    routeName: 'FR.S.CAR',
    separatedAt: separationState === 'separated' ? ARRIVED_AT : null,
    separationState,
    series: '1',
  }
}

function readRepository(documents = [document('1', 'expected')]): CargoArrivalReadRepositoryPort {
  return {
    findDetail: async () => ({ arrival: ARRIVAL, documents }),
    list: async () => ({ items: [], nextCursor: null }),
    listAvailableDocuments: async () => ({ isContractorFound: false }),
  }
}

const INPUT = {
  arrivedAt: ARRIVED_AT,
  contractorId: CONTRACTOR_ID,
  documentIds: ['1'],
  palletCount: 4,
  reference: null,
}

function register(result: Awaited<ReturnType<CargoArrivalRegistrationRepositoryPort['register']>>) {
  const calls: unknown[] = []
  const useCase = createRegisterCargoArrivalUseCase({
    channel: 'backoffice',
    now: () => NOW,
    readRepository: readRepository(),
    registrationRepository: {
      async register(params) {
        calls.push(params)
        return result
      },
    },
  })
  const execute = (input = INPUT) =>
    useCase.execute({
      context: CONTEXT,
      correlationId: 'c-1',
      idempotencyKey: 'k'.repeat(16),
      input,
    })
  return { calls, execute }
}

describe('registrar a chegada (spec 237 T2.3)', () => {
  test('leva empresa, ator e canal do contexto, e devolve a chegada criada', async () => {
    const { calls, execute } = register({ arrivalId: ARRIVAL_ID, kind: 'created' })
    const result = await execute()

    expect(result.isReplay).toBeFalse()
    expect(result.arrival.id).toBe(ARRIVAL_ID)
    expect(calls).toEqual([
      expect.objectContaining({
        actorUserId: CONTEXT.userId,
        channel: 'backoffice',
        companyId: CONTEXT.companyId,
        requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    ])
  })

  test('a repetição devolve a mesma chegada, marcada como repetição', async () => {
    const result = await register({ arrivalId: ARRIVAL_ID, kind: 'replayed' }).execute()

    expect(result.isReplay).toBeTrue()
    expect(result.arrival.id).toBe(ARRIVAL_ID)
  })

  test.each([
    [{ kind: 'contractor_not_found' }, 404, 'CONTRACTOR_NOT_FOUND'],
    [{ kind: 'not_enabled' }, 422, 'CARGO_RECEIVING_NOT_ENABLED'],
    [{ kind: 'key_reused' }, 409, 'CARGO_ARRIVAL_KEY_REUSED'],
  ] as const)('%p vira %p %p', async (result, status, code) => {
    await expect(register(result).execute()).rejects.toMatchObject({ code, status })
  })

  test('todas as notas recusadas voltam juntas, cada uma no seu campo', async () => {
    const refused = register({
      kind: 'refused',
      refusals: [
        { documentId: 'b', index: 1, reason: 'DOCUMENT_IN_LIVE_TRIP' },
        { documentId: 'c', index: 2, reason: 'DOCUMENT_FROM_ANOTHER_ISSUER' },
      ],
    })

    await expect(refused.execute()).rejects.toMatchObject({
      code: 'CARGO_ARRIVAL_DOCUMENTS_REFUSED',
      details: [
        { field: 'documentIds.1', message: 'DOCUMENT_IN_LIVE_TRIP' },
        { field: 'documentIds.2', message: 'DOCUMENT_FROM_ANOTHER_ISSUER' },
      ],
      status: 422,
    })
  })

  test('chegada mais de 2 min no futuro é recusada antes de tocar o banco', async () => {
    const { calls, execute } = register({ arrivalId: ARRIVAL_ID, kind: 'created' })

    await expect(
      execute({ ...INPUT, arrivedAt: new Date(NOW.getTime() + 2 * 60_000 + 1) }),
    ).rejects.toMatchObject({ code: 'CARGO_ARRIVAL_ARRIVED_AT_IN_FUTURE', status: 422 })
    expect(calls).toEqual([])
  })
})

describe('ler a chegada (spec 237 T2.3)', () => {
  test('agrupa por rota × cidade, conta os estados e calcula o vencimento pelo relógio', async () => {
    const getArrival = createGetCargoArrivalUseCase({
      now: () => NOW,
      readRepository: readRepository([document('2', 'separated'), document('1', 'received')]),
    })
    const detail = await getArrival.execute({ arrivalId: ARRIVAL_ID, context: CONTEXT })

    expect(detail.isSeparationOverdue).toBeTrue()
    expect(detail.counts).toEqual({ expected: 0, received: 1, separated: 1, total: 2 })
    expect(detail.separationDueAt).toBe('2026-10-04T08:00:00.000Z')
    expect(detail.groups.map((group) => group.documents.map((item) => item.number))).toEqual([
      ['1', '2'],
    ])
  })

  test('chegada de outra empresa ou inexistente é 404', async () => {
    const getArrival = createGetCargoArrivalUseCase({
      now: () => NOW,
      readRepository: { ...readRepository(), findDetail: async () => null },
    })

    await expect(
      getArrival.execute({ arrivalId: ARRIVAL_ID, context: CONTEXT }),
    ).rejects.toMatchObject({ code: 'CARGO_ARRIVAL_NOT_FOUND', status: 404 })
  })
})

function separationRepository(
  overrides: Partial<CargoArrivalSeparationRepositoryPort>,
): CargoArrivalSeparationRepositoryPort {
  return {
    assignRoute: async () => ({ kind: 'arrival_not_found' }),
    close: async () => ({ kind: 'arrival_not_found' }),
    transition: async () => ({ kind: 'arrival_not_found' }),
    ...overrides,
  }
}

describe('separar uma nota (spec 237 T2.3)', () => {
  test.each([
    [{ documentId: 'n', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND' }, 404],
    [{ documentId: 'n', reason: 'CARGO_ARRIVAL_CLOSED' }, 409],
    [{ documentId: 'n', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED' }, 409],
    [{ documentId: 'n', reason: 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED' }, 409],
  ] as const)('recusa %p vira %p com o código do motivo', async (refusal, status) => {
    const useCase = createChangeCargoArrivalDocumentStateUseCase({
      channel: 'backoffice',
      now: () => NOW,
      repository: separationRepository({
        transition: async () => ({
          kind: 'done',
          results: [{ ...refusal, outcome: 'refused' }],
        }),
      }),
    })

    await expect(
      useCase.execute({
        arrivalId: ARRIVAL_ID,
        context: CONTEXT,
        documentId: 'n',
        to: 'separated',
      }),
    ).rejects.toMatchObject({ code: refusal.reason, status })
  })

  test('a transição leva ator, canal e o relógio injetado', async () => {
    const calls: unknown[] = []
    const useCase = createChangeCargoArrivalDocumentStateUseCase({
      channel: 'backoffice',
      now: () => NOW,
      repository: separationRepository({
        async transition(params) {
          calls.push(params)
          return { kind: 'done', results: [{ documentId: 'n', outcome: 'changed' }] }
        },
      }),
    })

    expect(
      await useCase.execute({
        arrivalId: ARRIVAL_ID,
        context: CONTEXT,
        documentId: 'n',
        to: 'received',
      }),
    ).toEqual({ documentId: 'n', outcome: 'changed', state: 'received' })
    expect(calls).toEqual([
      {
        actorUserId: CONTEXT.userId,
        arrivalId: ARRIVAL_ID,
        channel: 'backoffice',
        companyId: CONTEXT.companyId,
        documentIds: ['n'],
        now: NOW,
        to: 'received',
      },
    ])
  })
})

describe('fechar a chegada (spec 237 T2.3)', () => {
  test('nota pendente é 409 com a lista inteira', async () => {
    const useCase = createCloseCargoArrivalUseCase({
      channel: 'backoffice',
      now: () => NOW,
      repository: separationRepository({
        close: async () => ({ documentIds: ['a', 'b'], kind: 'pending' }),
      }),
    })

    await expect(
      useCase.execute({ arrivalId: ARRIVAL_ID, context: CONTEXT, correlationId: 'c-2' }),
    ).rejects.toMatchObject({
      code: 'CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS',
      details: [
        { field: 'documentIds.0', message: 'a' },
        { field: 'documentIds.1', message: 'b' },
      ],
      status: 409,
    })
  })
})
