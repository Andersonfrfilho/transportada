/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.10 (RF25): no grupo, o "saí"/"cheguei" fora de ordem vira a pergunta 1/2 (também por áudio):
 * "1" reenvia com `confirmOutOfOrder: true`; "2" descarta ou, na saída, vai à próxima do roteiro.
 */
import { describe, expect, test } from 'bun:test'

import type { DriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { TripStopOutOfOrderError } from '../../src/trips/domain/stop-order.error.js'
import { OUT_OF_ORDER_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-order.policy.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createGroupStopFlow,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { createGroupStopPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-stop.adapter.js'

const OWNER = '5516988887777'
const QUESTION = 'PERGUNTA 1/2'

function request(step: string, state: Record<string, unknown> = {}): GroupRequest {
  return {
    attempts: 0,
    companyId: 'C1',
    driverId: 'D1',
    expiresAt: new Date(),
    groupJid: '1@g.us',
    id: 'R1',
    ownerNumber: OWNER,
    state,
    step,
    version: 1n,
  }
}

function setup() {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const flow = createGroupDriverFlow({
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ'] }),
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ'] }),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      listStops: async () => [
        {
          arrivedAt: null,
          completedAt: null,
          documents: [{ number: '17400', separationStatus: 'loaded' }],
          enRouteSince: null,
          id: 's6',
          sequence: 6,
        },
      ],
      record: async (input) => {
        recorded.push(input)
        if (input.confirmOutOfOrder !== true && input.stopId === 's6') {
          return {
            message: QUESTION,
            outOfOrder: { nextStopId: 's4', stopId: 's6' },
          }
        }
        return { message: input.event === 'depart' ? 'Saída registrada.' : 'Chegada registrada.' }
      },
    }),
  })
  let current = request(flow.initialStep)
  const turn = (text: string) => ({ request: current, sender: OWNER, senderName: null, text })
  const follow = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue') current = request(outcome.step, { ...outcome.state })
    return outcome
  }
  return {
    answer: async (text: string) => follow(await flow.answer(turn(text))),
    recorded,
    start: async (text: string) => follow(await flow.start(turn(text))),
    step: () => current.step,
  }
}

describe('grupo: a pergunta do fora de ordem (RF25)', () => {
  test('"saí" numa parada fora do roteiro pergunta 1/2 sem gravar', async () => {
    const t = setup()
    expect(await t.start('saí')).toMatchObject({
      kind: 'continue',
      replies: [QUESTION],
      step: 'stop.confirm_order',
    })
    expect(t.recorded).toHaveLength(1)
    expect(t.recorded[0]?.confirmOutOfOrder).toBeUndefined()
  })

  test.each(['1', 'um', 'sim', 'Um.'])(
    '"%s" reenvia com confirmOutOfOrder: true',
    async (answer) => {
      const t = setup()
      await t.start('saí')
      expect(await t.answer(answer)).toEqual({
        kind: 'done',
        replies: ['Saída registrada.'],
        withoutFarewell: true,
      })
      expect(t.recorded.at(-1)).toMatchObject({
        confirmOutOfOrder: true,
        event: 'depart',
        idempotencyKey: 'whatsapp-group-request:R1',
        stopId: 's6',
      })
    },
  )

  test.each(['2', 'dois', 'não'])(
    '"%s" na saída vai à próxima do roteiro, sem confirmar a parada pedida',
    async (answer) => {
      const t = setup()
      await t.start('saí')
      expect(await t.answer(answer)).toEqual({
        kind: 'done',
        replies: ['Saída registrada.'],
        withoutFarewell: true,
      })
      expect(t.recorded.at(-1)).toMatchObject({ event: 'depart', stopId: 's4' })
      expect(t.recorded.at(-1)?.confirmOutOfOrder).toBeUndefined()
    },
  )

  test('"2" na chegada descarta e não grava nada', async () => {
    const t = setup()
    await t.start('cheguei')
    const before = t.recorded.length
    expect(await t.answer('2')).toEqual({ kind: 'done', replies: [OUT_OF_ORDER_TEXT.discarded] })
    expect(t.recorded).toHaveLength(before)
  })

  test('outra resposta repete a pergunta sem gravar', async () => {
    const t = setup()
    await t.start('saí')
    expect(await t.answer('talvez')).toEqual({
      kind: 'not_understood',
      prompt: '',
      reason: OUT_OF_ORDER_TEXT.notUnderstood,
    })
    expect(t.recorded).toHaveLength(1)
    expect(t.step()).toBe('stop.confirm_order')
  })
})

describe('grupo: o registro devolve a pergunta quando a API recusa (adaptador)', () => {
  const trip = {
    id: 'T1',
    status: 'in_transit',
    stops: [
      { documents: [{ number: '017234', recipientName: 'Padaria Sol' }], id: 's3', sequence: 3 },
      { documents: [{ number: '17300', recipientName: 'Mercado Estrela' }], id: 's5', sequence: 5 },
    ],
  } as unknown as DriverTrip
  const database = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => [{ userId: 'U1' }] }) }),
      }),
    }),
  } as never
  const refuse = () =>
    new TripStopOutOfOrderError({
      currentSequence: 3,
      currentStopId: 's3',
      nextSequence: 3,
      nextStopId: 's3',
      requestedSequence: 5,
      requestedStopId: 's5',
    })

  function build(received: Record<string, unknown>[]) {
    return createGroupStopPorts({
      clock: () => new Date('2026-11-05T12:00:00.000Z'),
      database,
      listActiveTrips: async () => [trip],
      ports: {
        reportArrival: async (input) => {
          received.push(input)
          if (input.confirmOutOfOrder !== true) throw refuse()
          return { id: 'e' }
        },
        reportDeparture: async () => ({ changed: true }),
      },
    })
  }
  const input = {
    companyId: 'C1',
    driverId: 'D1',
    event: 'arrive',
    idempotencyKey: 'whatsapp-group-request:R1',
    stopId: 's5',
  } as const

  test('o 409 vira a pergunta com nota e cliente das duas paradas', async () => {
    const received: Record<string, unknown>[] = []
    const result = await build(received).record(input)
    expect(result.message).toBe(
      [
        '⚠️ *Fora da rota sugerida*',
        'Você está a caminho da *parada 3*, e este "cheguei" é da *parada 5*. Se achar melhor, pode registrar.',
        '',
        '> 📍 *CHEGADA · PARADA 5*',
        '> 🧾 NF `17300` · *Mercado Estrela*',
        '',
        '*1* - ✅ Cheguei na *parada 5*',
        '*2* - ↩️ Foi engano, descartar',
        '',
        '_A parada 3 continua aberta. Responda 1 ou 2._',
      ].join('\n'),
    )
    expect(result.outOfOrder).toEqual({ nextStopId: 's3', stopId: 's5' })
  })

  test('com a confirmação, o pedido vai à API com confirmOutOfOrder: true e registra', async () => {
    const received: Record<string, unknown>[] = []
    const result = await build(received).record({ ...input, confirmOutOfOrder: true })
    expect(received[0]?.confirmOutOfOrder).toBe(true)
    expect(result.message).toBe('*Chegada registrada* 📍')
    expect(result.outOfOrder).toBeUndefined()
  })
})
