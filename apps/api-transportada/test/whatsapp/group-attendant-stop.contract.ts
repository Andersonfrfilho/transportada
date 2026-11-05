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
import { createGroupStopPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-stop.adapter.js'

const ATTENDANT = '5516911112222'
const CREW = '5516988887777'

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

function buildFlow() {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const flow = createGroupStopFlow({
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
    resolveSenderRole: async ({ phone }) =>
      phone === ATTENDANT ? { actorUserId: 'U-att', kind: 'attendant' } : { kind: 'crew' },
  })
  return { flow, recorded }
}

describe('grupo: saí e cheguei do atendente pelo escritório (RF19)', () => {
  test.each(['depart', 'arrive'] as const)(
    '%s do atendente registra direto, sem pedir a localização, levando o atendente',
    async (event) => {
      const { flow, recorded } = buildFlow()
      const outcome = await flow.begin(turn(ATTENDANT), event, [])
      expect(outcome).toEqual({ kind: 'done', replies: ['ok'] })
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
        reportArrival: async () => {
          driverPath.push('arrive')
          return { id: 'e' }
        },
        reportDeparture: async () => {
          driverPath.push('depart')
          return { changed: true }
        },
      },
    })
    return { driverPath, officePath, ports }
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
    const { driverPath, officePath, ports } = build()
    await ports.record({ ...base, event: 'arrive' })
    expect(driverPath).toEqual(['arrive'])
    expect(officePath).toHaveLength(0)
  })
})
