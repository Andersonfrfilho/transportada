/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF19: o "saí" e o "cheguei" do atendente no grupo seguem as regras do ESCRITÓRIO: caminho do escritório
 * (alvo da viagem, ator = atendente, em nome do motorista), sem pergunta de fora de ordem, sem pergunta de
 * localização e sem etapa marcada junto. A tripulação segue como antes.
 */
import { describe, expect, test } from 'bun:test'

import type { DriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import {
  createGroupStopFlow,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import type { GroupRequest } from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { SENDER_NOT_ALLOWED_TEXT } from '../../src/whatsapp/application/whatsapp-sender-role.service.js'
import { createGroupStopPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-stop.adapter.js'

const ATTENDANT = '5516911112222'
const CREW = '5516988887777'
const STRANGER = '5511900000000'

const request = (): GroupRequest => ({
  attempts: 0,
  companyId: 'C1',
  driverId: 'D1',
  expiresAt: new Date(),
  groupJid: '1@g.us',
  id: 'R1',
  ownerNumber: CREW,
  state: {},
  step: 'start',
  version: 1n,
})
const turn = (sender: string, text = 'saí') => ({
  request: request(),
  sender,
  senderName: null,
  text,
})

function buildFlow(clock?: () => Date) {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const roleCalls: unknown[] = []
  const flow = createGroupStopFlow({
    ...(clock === undefined ? {} : { clock }),
    enRouteMessage: async () => 'a caminho',
    hasLocation: () => false,
    listStops: async () => [
      {
        arrivedAt: null,
        completedAt: null,
        documents: [{ number: '17400', separationStatus: 'loaded' }],
        enRouteSince: null,
        id: 's6',
        isAddressReliable: false,
        sequence: 6,
      },
    ],
    record: async (input) => {
      recorded.push(input)
      return { message: 'ok' }
    },
    resolveSenderRole: async (input) => {
      roleCalls.push(input)
      if (input.phone === ATTENDANT) return { actorUserId: 'U-att', kind: 'attendant' }
      return input.phone === CREW ? { kind: 'crew' } : { kind: 'unknown' }
    },
  })
  return { flow, recorded, roleCalls }
}

describe('grupo: saí e cheguei do atendente pelo escritório (RF19)', () => {
  test.each(['depart', 'arrive'] as const)(
    '%s do atendente registra direto, sem pedir a localização, levando o atendente',
    async (event) => {
      const { flow, recorded } = buildFlow()
      const outcome = await flow.begin(turn(ATTENDANT), event, [])
      expect(outcome).toEqual({ kind: 'done', replies: ['ok'], withoutFarewell: true })
      expect(recorded[0]).toMatchObject({ attendant: { actorUserId: 'U-att' }, event })
    },
  )

  test('a tripulação continua com a pergunta da localização e sem o atendente', async () => {
    const { flow, recorded } = buildFlow()
    const outcome = await flow.begin(turn(CREW), 'arrive', [])
    expect(outcome).toMatchObject({ kind: 'continue', step: 'location' })
    expect(recorded).toHaveLength(0)
    await flow.begin(turn(CREW), 'depart', [])
    expect(recorded[0]?.attendant).toBeUndefined()
  })
})

describe('grupo: a mensagem tardia do WhatsApp não pede localização (spec 294 RF14/RF24)', () => {
  const NOW = new Date('2026-11-05T15:00:00.000Z')
  const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000)

  test('cheguei enviado há mais de 60 min registra direto, levando a hora do WhatsApp', async () => {
    const { flow, recorded } = buildFlow(() => NOW)
    const outcome = await flow.begin({ ...turn(CREW, 'cheguei'), sentAt: at(61) }, 'arrive', [])
    expect(outcome).toEqual({ kind: 'done', replies: ['ok'], withoutFarewell: true })
    expect(recorded[0]?.sentAt).toEqual(at(61))
  })

  test('cheguei em tempo real (ou sem a hora do WhatsApp) segue pedindo a localização', async () => {
    const { flow, recorded } = buildFlow(() => NOW)
    expect(
      await flow.begin({ ...turn(CREW, 'cheguei'), sentAt: at(2) }, 'arrive', []),
    ).toMatchObject({ kind: 'continue', step: 'location' })
    expect(await flow.begin(turn(CREW, 'cheguei'), 'arrive', [])).toMatchObject({
      kind: 'continue',
      step: 'location',
    })
    expect(recorded).toHaveLength(0)
  })
})

describe('grupo: número desconhecido não registra saí nem cheguei (S1)', () => {
  test.each(['depart', 'arrive'] as const)('%s de desconhecido é recusado', async (event) => {
    const { flow, recorded } = buildFlow()
    const outcome = await flow.begin(turn(STRANGER), event, [])
    expect(outcome).toEqual({ kind: 'done', replies: [SENDER_NOT_ALLOWED_TEXT] })
    expect(recorded).toHaveLength(0)
  })

  test('desconhecido que responde "pular" na pergunta da localização não registra', async () => {
    const { flow, recorded } = buildFlow()
    const opened = await flow.begin(turn(CREW), 'arrive', [])
    expect(opened).toMatchObject({ kind: 'continue', step: 'location' })
    const state = (opened as { state: Record<string, unknown> }).state
    const answer = await flow.answer({
      request: { ...request(), state, step: 'location' },
      sender: STRANGER,
      senderName: null,
      text: 'pular',
    })
    expect(answer).toMatchObject({ kind: 'not_understood', reason: SENDER_NOT_ALLOWED_TEXT })
    expect(recorded).toHaveLength(0)
  })

  test('o papel de quem mandou é resolvido uma vez por mensagem, com o motorista do grupo', async () => {
    const { flow, roleCalls } = buildFlow()
    await flow.begin(turn(CREW), 'depart', [])
    expect(roleCalls).toEqual([{ companyId: 'C1', driverId: 'D1', phone: CREW }])
  })
})

describe('grupo: o adaptador do atendente usa o caminho do escritório (RF19)', () => {
  const trip = {
    id: 'T1',
    status: 'in_transit',
    stops: [{ documents: [{ number: '17400' }], id: 's6', sequence: 6 }],
  } as unknown as DriverTrip
  const database = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => [{ userId: 'U-driver' }] }) }),
      }),
    }),
  } as never

  function build() {
    const driverPath: string[] = []
    const tappedAt: Date[] = []
    const officePath: Record<string, unknown>[] = []
    const ports = createGroupStopPorts({
      clock: () => new Date('2026-11-05T12:00:00.000Z'),
      database,
      listActiveTrips: async () => [trip],
      officeStopEvents: {
        arrive: async (input) => {
          officePath.push({ ...input, kind: 'arrive' })
          return { id: 'e' }
        },
        depart: async (input) => {
          officePath.push({ ...input, kind: 'depart' })
          return { changed: true }
        },
      },
      ports: {
        reportArrival: async (input) => {
          driverPath.push('arrive')
          tappedAt.push(input.tappedAt)
          return { id: 'e' }
        },
        reportDeparture: async () => {
          driverPath.push('depart')
          return { changed: true }
        },
      },
    })
    return { driverPath, officePath, ports, tappedAt }
  }
  const base = {
    companyId: 'C1',
    driverId: 'D1',
    idempotencyKey: 'whatsapp-group-request:R1',
    stopId: 's6',
  } as const

  test.each(['arrive', 'depart'] as const)(
    '%s: o ator é o atendente, a viagem é a da parada e a tripulação não é chamada',
    async (event) => {
      const { driverPath, officePath, ports } = build()
      const result = await ports.record({
        ...base,
        attendant: { actorUserId: 'U-att' },
        event,
      })
      expect(result.outOfOrder).toBeUndefined()
      expect(driverPath).toHaveLength(0)
      expect(officePath).toEqual([
        expect.objectContaining({
          actorUserId: 'U-att',
          driverId: 'D1',
          kind: event,
          stopId: 's6',
          tripId: 'T1',
        }),
      ])
    },
  )

  test('sem atendente, o registro é o da tripulação, no nome do motorista', async () => {
    const { driverPath, officePath, ports, tappedAt } = build()
    await ports.record({ ...base, event: 'arrive' })
    expect(driverPath).toEqual(['arrive'])
    expect(officePath).toHaveLength(0)
    expect(tappedAt).toEqual([new Date('2026-11-05T12:00:00.000Z')])
  })

  test('a hora do WhatsApp da mensagem vira a hora do toque (a API mede o atraso por ela)', async () => {
    const { ports, tappedAt } = build()
    const sentAt = new Date('2026-11-05T10:00:00.000Z')
    await ports.record({ ...base, event: 'arrive', sentAt })
    expect(tappedAt).toEqual([sentAt])
  })
})
