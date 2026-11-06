/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * "Entreguei" sem número na conversa individual: o bot segue o que está em andamento em vez de listar todas as notas da
 * viagem. A entrega em preparo é retomada; sem ela, a parada que chegou e falta a baixa (ou a que está a caminho) decide;
 * só sem nada em andamento a lista é a da viagem inteira. O número digitado sempre vence. Fakes, sem banco.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
} from '@adatechnology/meta-whatsapp-contracts'

import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type { FindCurrentDriverTripResult } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import type { WhatsAppStopCandidate } from '../../src/trips/domain/driver-stop-resolution.policy.js'
import {
  createDriverWhatsAppFlowActions,
  type DriverFlowActionDependencies,
} from '../../src/whatsapp-commands/application/register-driver-flow-actions.js'
import type {
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { readWhatsAppStopInProgress } from '../../src/whatsapp-commands/application/whatsapp-stop-in-progress.service.js'
import {
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000301'
const USER_ID = '00000000-0000-4000-8000-000000000302'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000303'
const DRIVER_ID = '00000000-0000-4000-8000-000000000304'
const TRIP_ID = '00000000-0000-4000-8000-000000000305'
const ACTOR = { companyId: COMPANY_ID, driverId: DRIVER_ID }

type Doc = { id: string; number: string; recipientName: string; separationStatus: string }
type Stop = WhatsAppStopCandidate & { documents: Doc[] }

function stopOf(
  id: string,
  sequence: number,
  numbers: readonly string[],
  extra: Partial<Stop> = {},
): Stop {
  return {
    arrivedAt: null,
    completedAt: null,
    documents: numbers.map((number) => ({
      id: `doc-${number}`,
      number,
      recipientName: `CLIENTE ${number}`,
      separationStatus: 'loaded',
    })),
    enRouteSince: null,
    id,
    sequence,
    ...extra,
  }
}

const ARRIVED = { arrivedAt: '2026-11-06T03:28:00.000Z', enRouteSince: '2026-11-06T03:00:00.000Z' }
const EN_ROUTE = { enRouteSince: '2026-11-06T03:00:00.000Z' }

describe('a parada em andamento (o que o "entreguei" sem número continua)', () => {
  test('a que chegou e falta a baixa vence a que está a caminho; o bloco da parada vem pronto', async () => {
    const stops = [
      stopOf('S1', 1, ['899840'], ARRIVED),
      stopOf('S2', 2, ['899841'], EN_ROUTE),
      stopOf('S3', 3, ['899842']),
    ]
    expect(
      await readWhatsAppStopInProgress({ actor: ACTOR, listStops: async () => stops }),
    ).toEqual({
      documents: [{ id: 'doc-899840', number: '899840', recipientName: 'CLIENTE 899840' }],
      header: ['*Parada 1*', '*NF 899840*', '🏪 *CLIENTE 899840*'].join('\n'),
      stopId: 'S1',
    })
  })

  test('sem parada chegada, a que está a caminho', async () => {
    const stops = [stopOf('S1', 1, ['899840']), stopOf('S2', 2, ['899841'], EN_ROUTE)]
    expect(
      (await readWhatsAppStopInProgress({ actor: ACTOR, listStops: async () => stops }))?.stopId,
    ).toBe('S2')
  })

  test('várias notas em aberto na parada: as notas dela, sem o bloco (a pergunta lista)', async () => {
    const stop = stopOf('S1', 1, ['899840', '899843', '899844'], ARRIVED)
    stop.documents[1] = { ...(stop.documents[1] as Doc), separationStatus: 'delivered' }
    expect(
      await readWhatsAppStopInProgress({ actor: ACTOR, listStops: async () => [stop] }),
    ).toEqual({
      documents: [
        { id: 'doc-899840', number: '899840', recipientName: 'CLIENTE 899840' },
        { id: 'doc-899844', number: '899844', recipientName: 'CLIENTE 899844' },
      ],
      header: null,
      stopId: 'S1',
    })
  })

  test('nada em andamento: null', async () => {
    const stops = [stopOf('S1', 1, ['899840']), stopOf('S2', 2, ['899841'])]
    expect(await readWhatsAppStopInProgress({ actor: ACTOR, listStops: async () => stops })).toBe(
      null,
    )
  })

  test('o bloco do leitor (#552) é melhor esforço: leitor que falha cai no bloco mínimo', async () => {
    const stops = [stopOf('S1', 1, ['899840'], ARRIVED)]
    const failing = await readWhatsAppStopInProgress({
      actor: ACTOR,
      listStops: async () => stops,
      stopCards: {
        read: async () => {
          throw new Error('banco fora')
        },
      },
    })
    expect(failing?.header).toBe(['*Parada 1*', '*NF 899840*', '🏪 *CLIENTE 899840*'].join('\n'))
  })
})

function tripOf(stops: Stop[]): FindCurrentDriverTripResult {
  return {
    isRegisteredDriver: true,
    pendingProofs: [],
    trips: [{ id: TRIP_ID, manifest: null, status: 'dispatched', stops, vehiclePlate: 'ABC1D23' }],
  } as unknown as FindCurrentDriverTripResult
}

const reply = (texts: string[]): WhatsAppDeliveryPreparationReply => ({
  awaitingText: false,
  documentNumber: '899840',
  finished: false,
  texts,
})

function setupDirect(options: { readonly stops: Stop[]; readonly openPreparation?: boolean }) {
  const sent: string[] = []
  const begun: { documentId: string; documentNumber: string }[] = []
  const channel = {
    sendInteractiveList: async ({ body, rows }: { body: string; rows: { title: string }[] }) => {
      sent.push([`LIST:${body}`, ...rows.map((row) => `[ ${row.title} ]`)].join('\n'))
      return { externalMessageId: null }
    },
    sendText: async (_to: string, body: string) => {
      sent.push(body)
      return { externalMessageId: null }
    },
  } as unknown as ChannelAdapterInterface
  const preparations = {
    begin: async (input: { documentId: string; documentNumber: string }) => {
      begun.push({ documentId: input.documentId, documentNumber: input.documentNumber })
      return reply([`📍 *NF ${input.documentNumber}:* se puder, compartilhe a localização.`])
    },
    resume: async () =>
      options.openPreparation === true
        ? reply([
            '↩️ *Continuando a entrega da NF 899840.*',
            '📸 *NF 899840:* mande a foto do canhoto assinado.',
          ])
        : null,
  } as unknown as WhatsAppDeliveryPreparations
  const deps: DriverFlowActionDependencies = {
    consumeSharedLocation: () => null,
    deliveryPreparations: preparations,
    driverPrompts: {
      askLocation: () => null,
      recordStop: async () => ({ context: {}, handled: true, texts: [] }),
      stopInProgress: (input) =>
        readWhatsAppStopInProgress({ ...input, listStops: async () => options.stops }),
    },
    findCurrentTrip: async () => tripOf(options.stops),
    listOccurrenceTypes: async () => [],
    registerOccurrence: async () => ({}) as never,
    reportArrival: async () => ({}) as never,
    reportDelivery: async () => ({ alreadySettled: false }),
    reportDeparture: async () => ({}) as never,
    reportReturn: async () => ({ alreadySettled: false }),
    resolveDriverId: async () => DRIVER_ID,
  }
  async function command(numbers: readonly string[]) {
    const context = {
      [DRIVER_FLOW_CONTEXT_KEY.directCommand]: { kind: 'deliver', numbers },
    }
    const definition = createDriverWhatsAppFlowActions(deps).find(
      (item) => item.kind === DRIVER_FLOW_ACTION_KIND.directCommand,
    )
    if (definition === undefined) throw new Error('directCommand')
    return definition.handler({
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
      node: { actionKind: DRIVER_FLOW_ACTION_KIND.directCommand, id: 'n', type: 'action' } as never,
      session: {
        companyId: COMPANY_ID,
        context,
        whatsappNumber: '5516999995555',
      } as unknown as ConversationSession,
    })
  }
  return { begun, command, sent }
}

const SEVEN_NOTES = [
  stopOf('S1', 1, ['899840'], ARRIVED),
  stopOf('S2', 2, ['899841']),
  stopOf('S3', 3, ['899842']),
  stopOf('S4', 4, ['899843', '899844']),
  stopOf('S5', 5, ['899845', '899846']),
]

describe('conversa individual: "entreguei" sem número segue o que está em andamento', () => {
  test('entrega em preparo aberta: retoma a NF e repete a pergunta (nunca a lista da viagem)', async () => {
    const t = setupDirect({ openPreparation: true, stops: SEVEN_NOTES })
    const result = await t.command([])
    // Uma mensagem só: o aviso e a pergunta pendente nunca chegam separados.
    expect(t.sent).toEqual([
      '↩️ *Continuando a entrega da NF 899840.*\n📸 *NF 899840:* mande a foto do canhoto assinado.',
    ])
    expect(t.begun).toEqual([])
    expect(result).toMatchObject({ next: DRIVER_FLOW_NODE.tripMenu })
  })

  test('sem preparação (venceu ou nunca abriu), a parada que chegou e falta a baixa decide: uma nota vai direto', async () => {
    const t = setupDirect({ stops: SEVEN_NOTES })
    const result = await t.command([])
    expect(t.sent).toEqual([
      [
        '*Parada 1*',
        '*NF 899840*',
        '🏪 *CLIENTE 899840*',
        '📍 *NF 899840:* se puder, compartilhe a localização.',
      ].join('\n'),
    ])
    expect(t.begun).toEqual([{ documentId: 'doc-899840', documentNumber: '899840' }])
    expect(result).toMatchObject({ next: DRIVER_FLOW_NODE.tripMenu })
  })

  test('parada a caminho com várias notas: a lista é só a dela', async () => {
    const stops = [stopOf('S1', 1, ['899840']), stopOf('S4', 2, ['899843', '899844'], EN_ROUTE)]
    const t = setupDirect({ stops })
    const result = await t.command([])
    expect(t.sent).toEqual([
      [
        'LIST:Toque na nota que você quer entregar.',
        '[ 899843 · CLIENTE 89… ]',
        '[ 899844 · CLIENTE 89… ]',
      ].join('\n'),
    ])
    expect(t.begun).toEqual([])
    expect(result).toMatchObject({
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: 'deliver',
      },
      next: DRIVER_FLOW_NODE.documentEntry,
    })
  })

  test('nada em andamento: a lista da viagem inteira, como antes', async () => {
    const stops = [stopOf('S1', 1, ['899840']), stopOf('S2', 2, ['899841'])]
    const t = setupDirect({ stops })
    expect(await t.command([])).toMatchObject({ next: DRIVER_FLOW_NODE.listDocuments })
    expect(t.sent).toEqual([])
  })

  test('o número digitado vence a parada em andamento e a preparação aberta', async () => {
    const t = setupDirect({ openPreparation: true, stops: SEVEN_NOTES })
    expect(await t.command(['899845'])).toMatchObject({ next: DRIVER_FLOW_NODE.directConfirm })
    expect(t.begun).toEqual([])
    expect(t.sent.join('\n')).toContain('899845')
    expect(t.sent.join('\n')).not.toContain('Continuando')
  })
})
