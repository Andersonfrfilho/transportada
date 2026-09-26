/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 D7 (CA06): quem recebeu escolhido **depois** do envio da foto vira
 * `PATCH /me/trips/current/documents/:documentId/proof/receiver`, com `Idempotency-Key`. A forma é a
 * tolerante do motorista (D2), a configuração é a mesma do anexo (D5) e só as linhas do motorista
 * (`photo`/`signature`, `driver_app`) mudam — nunca a do escritório nem a foto da carga.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { updateDriverProofReceiver } from '../../src/trips/application/update-driver-proof-receiver.use-case.js'
import { DEFAULT_DELIVERY_PROOF_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import type { DeliveryProofFieldMode } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  createMeProofReceiverRoutes,
  PROOF_RECEIVER_RATE_LIMIT,
} from '../../src/trips/presentation/me-proof-receiver.routes.js'
import { parseProofReceiverBody } from '../../src/trips/presentation/me-proof-receiver.schema.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const EVENT_ID = 'event-1'

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/me/trips/current/documents/x/proof/receiver', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  return undefined
}

describe('o corpo do PATCH de quem recebeu (spec 193 D7)', () => {
  it('campo ausente não mexe; presente passa pela forma tolerante', async () => {
    expect(await parseProofReceiverBody(jsonRequest({}))).toEqual({})
    expect(
      await parseProofReceiverBody(
        jsonRequest({ receivedBy: ' neighbor ', receivedByDetail: ' casa 12 ' }),
      ),
    ).toEqual({ receivedBy: { receivedBy: 'neighbor', receivedByDetail: 'casa 12' } })
  })

  it('relação fora da lista limpa a relação em vez de recusar (D2)', async () => {
    expect(await parseProofReceiverBody(jsonRequest({ receivedBy: 'cousin' }))).toEqual({
      receivedBy: { receivedBy: null, receivedByDetail: null },
    })
  })

  it('o nome é aparado e cortado em 120 caracteres', async () => {
    expect(await parseProofReceiverBody(jsonRequest({ receiverName: '  Maria  ' }))).toEqual({
      receiverName: 'Maria',
    })
    const long = await parseProofReceiverBody(jsonRequest({ receiverName: 'x'.repeat(300) }))
    expect(long.receiverName).toHaveLength(120)
  })

  it('corpo que não é objeto, ou com chave desconhecida, é 400', async () => {
    for (const body of [[], 'texto', { receivedBy: 'neighbor', extra: true }]) {
      const error = await captureError(parseProofReceiverBody(jsonRequest(body)))
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(400)
    }
  })
})

describe('updateDriverProofReceiver (spec 193 D5/D7, CA06)', () => {
  function buildWorld(input: {
    readonly eventId?: string | null
    readonly mode?: DeliveryProofFieldMode
    readonly rows?: number
  }) {
    const state = createFieldReportState()
    for (let index = 0; index < (input.rows ?? 1); index += 1) {
      const rows = state.proofReceivers.get(EVENT_ID) ?? []
      rows.push({
        id: `proof-${index}`,
        receivedBy: null,
        receivedByDetail: null,
        receiverName: '',
      })
      state.proofReceivers.set(EVENT_ID, rows)
    }
    const unitOfWork = createFieldReportUnitOfWork(state)
    const run = (
      idempotencyKey: string,
      patch: Parameters<typeof updateDriverProofReceiver>[0]['patch'],
    ) =>
      updateDriverProofReceiver({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        driverId: DRIVER_ID,
        idempotencyKey,
        patch,
        proofs: {
          findDeliveryEventId: async () => (input.eventId === undefined ? EVENT_ID : input.eventId),
          resolveProofFieldSettings: async () => ({
            ...DEFAULT_DELIVERY_PROOF_SETTINGS,
            receivedBy: input.mode ?? 'optional',
          }),
        },
        unitOfWork,
      })
    return { run, state }
  }

  const NEIGHBOR = { receivedBy: { receivedBy: 'neighbor', receivedByDetail: 'casa 12' } } as const

  it('atualiza a linha do motorista e diz que mudou', async () => {
    const world = buildWorld({})

    expect(await world.run('chave-1', { ...NEIGHBOR, receiverName: 'Maria' })).toMatchObject({
      changed: true,
    })
    expect(world.state.proofReceivers.get(EVENT_ID)).toEqual([
      { id: 'proof-0', receivedBy: 'neighbor', receivedByDetail: 'casa 12', receiverName: 'Maria' },
    ])
  })

  it('a mesma Idempotency-Key não refaz o efeito', async () => {
    const world = buildWorld({})
    await world.run('chave-1', NEIGHBOR)

    const replay = await world.run('chave-1', {
      receivedBy: { receivedBy: 'doorman', receivedByDetail: null },
    })

    expect(replay.changed).toBe(false)
    expect(world.state.proofReceivers.get(EVENT_ID)?.[0]?.receivedBy).toBe('neighbor')
  })

  it('o modo off grava nulo', async () => {
    const world = buildWorld({ mode: 'off' })

    await world.run('chave-1', NEIGHBOR)

    expect(world.state.proofReceivers.get(EVENT_ID)?.[0]).toMatchObject({
      receivedBy: null,
      receivedByDetail: null,
    })
  })

  it.each([
    ['sem entrega da nota', { eventId: null }],
    ['sem comprovante do motorista', { rows: 0 }],
  ] as const)('%s responde 404 TRIP_DELIVERY_PROOF_NOT_FOUND', async (_label, input) => {
    const error = await captureError(buildWorld(input).run('chave-1', NEIGHBOR))

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).code).toBe('TRIP_DELIVERY_PROOF_NOT_FOUND')
  })
})

describe('a rota do PATCH (spec 193 D7)', () => {
  it('é PATCH em /me/trips/current/documents/:documentId/proof/receiver, com teto próprio', () => {
    const routes = createMeProofReceiverRoutes({
      resolveDriverId: async () => DRIVER_ID,
      updateProofReceiver: async () => ({ changed: false, id: 'proof-0' }),
    })

    expect(routes.map((route) => `${route.method} ${route.pathname}`)).toEqual([
      'PATCH /me/trips/current/documents/:documentId/proof/receiver',
    ])
    expect(routes[0]?.rateLimit).toEqual(PROOF_RECEIVER_RATE_LIMIT)
  })
})
