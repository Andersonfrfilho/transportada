/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.2 (RF5): o bot avisa a etapa que a API marcou junto — nos dois canais da tripulação.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
} from '@adatechnology/meta-whatsapp-contracts'

import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type { FindCurrentDriverTripResult } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { createGroupStopPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-stop.adapter.js'
import {
  createDriverWhatsAppFlowActions,
  type DriverFlowActionDependencies,
} from '../../src/whatsapp-commands/application/register-driver-flow-actions.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
} from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  describeRecordedTogether,
  describeWhatsAppDriverEventResult,
} from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import {
  arriveWhatsAppDriverStop,
  deliverWhatsAppDriverDocument,
  returnWhatsAppDriverDocument,
  type WhatsAppDriverEventPorts,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import {
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000002941'
const USER_ID = '00000000-0000-4000-8000-000000002942'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000002943'
const DRIVER_ID = '00000000-0000-4000-8000-000000002944'
const TRIP_ID = '00000000-0000-4000-8000-000000002945'
const NOW = new Date('2026-11-05T12:00:00.000Z')

const render = (line: ReturnType<typeof describeWhatsAppDriverEventResult>) =>
  renderBotSpeechLine({ companyId: COMPANY_ID, line, speech: CATALOG_BOT_SPEECH })

describe('a frase do "marquei junto" (spec 294 RF5)', () => {
  test('uma etapa, duas etapas e nenhuma', () => {
    expect(
      describeRecordedTogether({ documentNumber: '17234', event: 'deliver', steps: ['arrived'] }),
    ).toBe('_Marquei a chegada junto com a entrega._')
    expect(
      describeRecordedTogether({
        documentNumber: '17234',
        event: 'deliver',
        steps: ['departed', 'arrived'],
      }),
    ).toBe('_Marquei a saída e a chegada junto com a entrega._')
    expect(
      describeRecordedTogether({ documentNumber: '17234', event: 'return', steps: ['arrived'] }),
    ).toBe('Marquei a chegada junto com a devolução da NF 17234.')
    expect(
      describeRecordedTogether({ documentNumber: '17234', event: 'arrive', steps: ['departed'] }),
    ).toBe('Marquei a saída junto com a chegada da NF 17234.')
    expect(describeRecordedTogether({ event: 'deliver', steps: ['arrived'] })).toBe(
      '_Marquei a chegada junto com a entrega._',
    )
    expect(describeRecordedTogether({ event: 'deliver', steps: [] })).toBeUndefined()
  })

  test('o resultado do app leva as etapas marcadas junto, e a fala as acrescenta', async () => {
    const ports = {
      reportArrival: async () => ({ id: 'e', recordedTogether: ['departed'] }),
      reportDelivery: async () => ({
        alreadySettled: false,
        recordedTogether: ['departed', 'arrived'],
        stopCompleted: true,
      }),
      reportReturn: async () => ({ alreadySettled: false }),
    } as unknown as WhatsAppDriverEventPorts
    const actor = { actorUserId: 'u', companyId: COMPANY_ID, driverId: DRIVER_ID }
    const arrived = await arriveWhatsAppDriverStop(ports, {
      ...actor,
      idempotencyKey: 'k',
      location: null,
      sentAt: NOW,
      stopId: 's',
    })
    expect(arrived).toMatchObject({ kind: 'registered', recordedTogether: ['departed'] })
    const delivered = await deliverWhatsAppDriverDocument(ports, {
      ...actor,
      documentId: 'd',
      idempotencyKey: 'k',
      location: null,
    })
    expect(
      await render(
        describeWhatsAppDriverEventResult(delivered, { documentNumber: '17234', kind: 'group' }),
      ),
    ).toBe('✅ *NF `17234` entregue.*\n_Marquei a saída e a chegada junto com a entrega._')
    const returned = await returnWhatsAppDriverDocument(ports, {
      ...actor,
      documentId: 'd',
      idempotencyKey: 'k',
      location: null,
      reason: 'recipient_absent',
    })
    expect(returned).not.toHaveProperty('recordedTogether')
  })

  test('sem etapa marcada junto, a resposta é a de sempre', async () => {
    const ports = {
      reportArrival: async () => ({ id: 'e', recordedTogether: [] }),
    } as unknown as WhatsAppDriverEventPorts
    const arrived = await arriveWhatsAppDriverStop(ports, {
      actorUserId: 'u',
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      idempotencyKey: 'k',
      location: null,
      sentAt: NOW,
      stopId: 's',
    })
    expect(
      await render(describeWhatsAppDriverEventResult(arrived, { kind: 'driver', time: '23:20' })),
    ).toBe('📍 *Chegada registrada* · 23:20')
  })
})

describe('grupo: "cheguei" avisa a saída marcada junto', () => {
  test('a resposta do grupo leva a linha e a NF da parada', async () => {
    const ports = createGroupStopPorts({
      clock: () => NOW,
      database: {
        select: () => ({
          from: () => ({
            innerJoin: () => ({ where: () => ({ limit: async () => [{ userId: USER_ID }] }) }),
            where: () => ({ limit: async () => [{ userId: USER_ID }] }),
          }),
        }),
      } as never,
      listActiveTrips: async () => [],
      ports: {
        reportArrival: async () => ({ id: 'e', recordedTogether: ['departed'] }),
        reportDeparture: async () => ({ changed: true }),
      },
    })
    const result = await ports.record({
      companyId: COMPANY_ID,
      documentNumber: '17234',
      driverId: DRIVER_ID,
      event: 'arrive',
      idempotencyKey: 'whatsapp-group-request:R1',
      stopId: 's1',
    })
    expect(result.message).toContain('Marquei a saída junto com a chegada da NF 17234.')
  })
})

describe('conversa individual: "cheguei" avisa a saída marcada junto', () => {
  test('a resposta leva a linha com a NF da parada', async () => {
    const sent: string[] = []
    const channel = {
      sendText: async (_to: string, body: string) => {
        sent.push(body)
        return { externalMessageId: null }
      },
    } as unknown as ChannelAdapterInterface
    const trip = {
      isRegisteredDriver: true,
      pendingProofs: [],
      trips: [
        {
          id: TRIP_ID,
          manifest: null,
          status: 'dispatched',
          stops: [
            {
              arrivedAt: null,
              completedAt: null,
              documents: [{ id: 'doc-1', number: '017234', separationStatus: 'loaded' }],
              enRouteSince: null,
              id: 's1',
              sequence: 1,
            },
          ],
          vehiclePlate: 'ABC1D23',
        },
      ],
    } as unknown as FindCurrentDriverTripResult
    const deps: DriverFlowActionDependencies = {
      consumeSharedLocation: () => null,
      findCurrentTrip: async () => trip,
      listOccurrenceTypes: async () => [],
      now: () => NOW,
      registerOccurrence: async () => ({}) as never,
      reportArrival: async () => ({ id: 'e', recordedTogether: ['departed'] }),
      reportDelivery: async () => ({ alreadySettled: false }),
      reportDeparture: async () => ({ changed: true }),
      reportReturn: async () => ({ alreadySettled: false }),
      resolveDriverId: async () => DRIVER_ID,
    }
    const definition = createDriverWhatsAppFlowActions(deps).find(
      (item) => item.kind === DRIVER_FLOW_ACTION_KIND.arrive,
    )
    const context = { [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID }
    await definition?.handler({
      actor: {
        identity: { channel: 'whatsapp', userId: USER_ID },
        scope: {
          companyId: COMPANY_ID,
          kind: 'company',
          membershipId: MEMBERSHIP_ID,
          permissions: new Set<CompanyPermission>(['trip.read', 'trip.report']),
          roles: ['driver'],
          userId: USER_ID,
        },
      } as never,
      channel,
      context,
      node: { actionKind: DRIVER_FLOW_ACTION_KIND.arrive, id: 'n', type: 'action' } as never,
      session: {
        companyId: COMPANY_ID,
        context,
        whatsappNumber: '5516999995555',
      } as unknown as ConversationSession,
    })
    expect(sent).toEqual([
      '📍 *Chegada registrada* · 09:00\nMarquei a saída junto com a chegada da NF 17234.',
    ])
  })
})

describe('o resultado da chegada leva o que o ponto fez pelo endereço (spec 294 RF14)', () => {
  const stopInput = {
    actorUserId: 'u',
    companyId: COMPANY_ID,
    driverId: DRIVER_ID,
    idempotencyKey: 'k',
    location: null,
    sentAt: NOW,
    stopId: 's',
  }
  const portsFor = (outcome: unknown) =>
    ({ reportArrival: async () => outcome }) as unknown as WhatsAppDriverEventPorts

  test.each(['applied', 'suggested'])('"%s" chega ao resultado', async (addressCorrection) => {
    const result = await arriveWhatsAppDriverStop(
      portsFor({ addressCorrection, id: 'e', recordedTogether: [] }),
      stopInput,
    )
    expect(result).toMatchObject({ addressCorrection, kind: 'registered' })
  })

  test.each(['ignored', 'failed', undefined])('"%s" não chega (nada a dizer)', async (value) => {
    const result = await arriveWhatsAppDriverStop(
      portsFor({ addressCorrection: value, id: 'e' }),
      stopInput,
    )
    expect(result).not.toHaveProperty('addressCorrection')
  })
})
