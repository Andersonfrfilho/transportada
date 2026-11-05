/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T14 — saí, cheguei e o comando direto na conversa individual. Fakes, sem banco.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
} from '@adatechnology/meta-whatsapp-contracts'

import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type { FindCurrentDriverTripResult } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import {
  createDriverWhatsAppFlowActions,
  type DriverFlowActionDependencies,
} from '../../src/whatsapp-commands/application/register-driver-flow-actions.js'
import {
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import { interpretWhatsAppDriverEventCommand } from '../../src/whatsapp-commands/domain/whatsapp-driver-event-command.policy.js'
import { WHATSAPP_ROOT_FLOW_GRAPH } from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000241'
const USER_ID = '00000000-0000-4000-8000-000000000242'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000243'
const DRIVER_ID = '00000000-0000-4000-8000-000000000244'
const TRIP_ID = '00000000-0000-4000-8000-000000000245'
const NOW = new Date('2026-11-04T12:00:00.000Z')

type Doc = { id: string; number: string; separationStatus: string }
type Stop = {
  arrivedAt: string | null
  documents: Doc[]
  enRouteSince: string | null
  id: string
  sequence: number
}

function stop(id: string, sequence: number, number: string, extra: Partial<Stop> = {}): Stop {
  return {
    arrivedAt: null,
    documents: [{ id: `doc-${id}`, number, separationStatus: 'loaded' }],
    enRouteSince: null,
    id,
    sequence,
    ...extra,
  }
}

function tripOf(stops: Stop[]): FindCurrentDriverTripResult {
  return {
    isRegisteredDriver: true,
    pendingProofs: [],
    trips: [
      {
        id: TRIP_ID,
        manifest: null,
        status: 'dispatched',
        stops: stops.map((s) => ({ ...s, completedAt: null })),
        vehiclePlate: 'ABC1D23',
      },
    ],
  } as unknown as FindCurrentDriverTripResult
}

function setup(stops: Stop[]) {
  const calls: { kind: string; input: Record<string, unknown> }[] = []
  const sent: string[] = []
  const channel = {
    sendInteractiveList: async ({ body }: { body: string }) => {
      sent.push(`LIST:${body}`)
      return { externalMessageId: null }
    },
    sendText: async (_to: string, body: string) => {
      sent.push(body)
      return { externalMessageId: null }
    },
  } as unknown as ChannelAdapterInterface
  const deps: DriverFlowActionDependencies = {
    consumeSharedLocation: () => null,
    findCurrentTrip: async () => tripOf(stops),
    listOccurrenceTypes: async () => [],
    now: () => NOW,
    registerOccurrence: async () => ({}) as never,
    reportArrival: async (input) => {
      calls.push({ input, kind: 'arrive' })
      return {}
    },
    reportDelivery: async (input) => {
      calls.push({ input, kind: 'deliver' })
      return { alreadySettled: false }
    },
    reportDeparture: async (input) => {
      calls.push({ input, kind: 'depart' })
      return { changed: true }
    },
    reportReturn: async (input) => {
      calls.push({ input, kind: 'return' })
      return { alreadySettled: false }
    },
    resolveDriverId: async () => DRIVER_ID,
  }
  async function run(kind: string, context: Record<string, unknown> = {}) {
    const definition = createDriverWhatsAppFlowActions(deps).find((item) => item.kind === kind)
    if (definition === undefined) throw new Error(kind)
    return definition.handler({
      actor: {
        identity: {
          channel: 'whatsapp',
          companyIdClaim: COMPANY_ID,
          externalIdentityId: 'e',
          issuer: 'i',
          platformAdmin: false,
          serviceAccount: false,
          subject: 's',
          userId: USER_ID,
        },
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
      node: { actionKind: kind, id: 'n', type: 'action' } as never,
      session: {
        companyId: COMPANY_ID,
        context,
        whatsappNumber: '5516999995555',
      } as unknown as ConversationSession,
    })
  }
  return { calls, run, sent }
}

const WITH_TRIP = { [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID }

describe('comando direto do motorista (spec 293 T14)', () => {
  test('saí e cheguei vêm do interpretador compartilhado; entreguei e devolvi do mesmo módulo', () => {
    expect(interpretWhatsAppDriverEventCommand('Saí')).toEqual({ kind: 'depart' })
    expect(interpretWhatsAppDriverEventCommand('cheguei')).toEqual({ kind: 'arrive' })
    expect(interpretWhatsAppDriverEventCommand('entreguei 17234 17235')).toEqual({
      kind: 'deliver',
      numbers: ['17234', '17235'],
    })
    expect(interpretWhatsAppDriverEventCommand('Devolvi 17234 ausente')).toEqual({
      kind: 'return',
      numbers: ['17234'],
      reason: 'recipient_absent',
    })
    expect(interpretWhatsAppDriverEventCommand('entreguei 1 2 3 4 5 6 7 8 9')).toEqual({
      kind: 'too_many_documents',
    })
    expect(
      interpretWhatsAppDriverEventCommand('cliente fechado, cheguei e ninguém atendeu'),
    ).toBeUndefined()
    expect(interpretWhatsAppDriverEventCommand('bom dia')).toBeUndefined()
  })

  test('o menu da viagem tem 5 opções e saí/cheguei têm nó próprio', () => {
    const menu = WHATSAPP_ROOT_FLOW_GRAPH.nodes[DRIVER_FLOW_NODE.tripMenu]
    expect(menu?.options?.map(([id]) => id)).toEqual([
      'depart',
      'arrive',
      'deliver',
      'return',
      'occurrence',
    ])
    expect(WHATSAPP_ROOT_FLOW_GRAPH.nodes[DRIVER_FLOW_NODE.depart]?.actionKind).toBe(
      DRIVER_FLOW_ACTION_KIND.depart,
    )
    expect(WHATSAPP_ROOT_FLOW_GRAPH.nodes[DRIVER_FLOW_NODE.arrive]?.actionKind).toBe(
      DRIVER_FLOW_ACTION_KIND.arrive,
    )
  })

  test('saí com uma parada possível registra direto e volta ao menu da viagem', async () => {
    const { calls, run, sent } = setup([stop('s1', 1, '17234')])
    const result = await run(DRIVER_FLOW_ACTION_KIND.depart, WITH_TRIP)
    expect(calls.map((call) => call.kind)).toEqual(['depart'])
    expect(calls[0]?.input).toMatchObject({ driverId: DRIVER_ID, stopId: 's1', tappedAt: NOW })
    expect(sent).toEqual(['Saída registrada. 🚚'])
    expect(result).toMatchObject({ next: DRIVER_FLOW_NODE.tripMenu })
  })

  test('cheguei com duas paradas abre a lista; a resposta é conferida', async () => {
    const { calls, run } = setup([stop('s1', 1, '1'), stop('s2', 2, '2')])
    const listed = await run(DRIVER_FLOW_ACTION_KIND.arrive, WITH_TRIP)
    expect(listed).toMatchObject({ next: DRIVER_FLOW_NODE.listStops })
    const ctx = { ...WITH_TRIP, [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'arrive' }
    await run(DRIVER_FLOW_ACTION_KIND.listStops, ctx)
    const bad = await run(DRIVER_FLOW_ACTION_KIND.stopRouter, {
      ...ctx,
      [DRIVER_FLOW_CONTEXT_KEY.stopAnswer]: 'outra',
    })
    expect(calls).toEqual([])
    expect(bad).toMatchObject({ next: DRIVER_FLOW_NODE.stopEntry })
    await run(DRIVER_FLOW_ACTION_KIND.stopRouter, {
      ...ctx,
      [DRIVER_FLOW_CONTEXT_KEY.stopAnswer]: 's2',
    })
    expect(calls.map((call) => [call.kind, call.input.stopId])).toEqual([['arrive', 's2']])
  })

  test('saí com parada já a caminho avisa e não grava', async () => {
    const { calls, run, sent } = setup([
      stop('s1', 1, '1', { enRouteSince: NOW.toISOString() }),
      stop('s2', 2, '2'),
    ])
    await run(DRIVER_FLOW_ACTION_KIND.depart, WITH_TRIP)
    expect(calls).toEqual([])
    expect(sent[0]).toContain('A parada 1 já está a caminho')
  })

  test('entreguei com número confirma antes de gravar; Não não grava; Sim grava', async () => {
    const { calls, run, sent } = setup([stop('s1', 1, '17234')])
    const asked = await run(DRIVER_FLOW_ACTION_KIND.directCommand, {
      [DRIVER_FLOW_CONTEXT_KEY.directCommand]: { kind: 'deliver', numbers: ['017234'] },
    })
    expect(calls).toEqual([])
    expect(sent).toEqual(['Entregar NF 17234?'])
    expect(asked).toMatchObject({ next: DRIVER_FLOW_NODE.directConfirm })
    const pending = {
      ...WITH_TRIP,
      [DRIVER_FLOW_CONTEXT_KEY.directDocumentIds]: ['doc-s1'],
      [DRIVER_FLOW_CONTEXT_KEY.directEvent]: 'deliver',
    }
    await run(DRIVER_FLOW_ACTION_KIND.directConfirmRouter, {
      ...pending,
      [DRIVER_FLOW_CONTEXT_KEY.directConfirmAnswer]: 'no',
    })
    expect(calls).toEqual([])
    await run(DRIVER_FLOW_ACTION_KIND.directConfirmRouter, {
      ...pending,
      [DRIVER_FLOW_CONTEXT_KEY.directConfirmAnswer]: 'yes',
    })
    expect(calls.map((call) => [call.kind, call.input.documentId])).toEqual([['deliver', 'doc-s1']])
  })

  test('nota que não está aberta na viagem não grava nada', async () => {
    const { calls, run, sent } = setup([stop('s1', 1, '17234')])
    await run(DRIVER_FLOW_ACTION_KIND.directCommand, {
      [DRIVER_FLOW_CONTEXT_KEY.directCommand]: { kind: 'deliver', numbers: ['999'] },
    })
    expect(calls).toEqual([])
    expect(sent[0]).toContain('999')
  })

  test('devolvi sem motivo cai no menu de motivos; com motivo confirma', async () => {
    const { run } = setup([stop('s1', 1, '17234')])
    const noReason = await run(DRIVER_FLOW_ACTION_KIND.directCommand, {
      [DRIVER_FLOW_CONTEXT_KEY.directCommand]: { kind: 'return', numbers: ['17234'] },
    })
    expect(noReason).toMatchObject({ next: DRIVER_FLOW_NODE.returnReasonMenu })
    const withReason = await run(DRIVER_FLOW_ACTION_KIND.directCommand, {
      [DRIVER_FLOW_CONTEXT_KEY.directCommand]: {
        kind: 'return',
        numbers: ['17234'],
        reason: 'recipient_absent',
      },
    })
    expect(withReason).toMatchObject({ next: DRIVER_FLOW_NODE.directConfirm })
  })
})
