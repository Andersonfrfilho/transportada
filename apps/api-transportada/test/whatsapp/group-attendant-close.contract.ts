/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21 (grupo): o atendente baixa várias notas de uma vez e encerra a rota; a tripulação
 * segue uma nota por vez e não encerra.
 */
import { describe, expect, test } from 'bun:test'

import type { WhatsAppDriverEventResult } from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import type { WhatsAppDeliveryPreparations } from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { isCloseTripCommand } from '../../src/whatsapp-commands/domain/whatsapp-trip-close-command.policy.js'
import {
  createGroupDeliveryFlow,
  GROUP_DELIVERY_TEXT,
} from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import {
  createGroupTripCloseFlow,
  GROUP_TRIP_CLOSE_TEXT,
  type GroupTripCloseFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-trip-close-flow.service.js'
import { createWhatsAppSenderRoleResolver } from '../../src/whatsapp/application/whatsapp-sender-role.service.js'
import { createWhatsAppGroupTripClosePorts } from '../../src/whatsapp/infrastructure/whatsapp-group-trip-close.adapter.js'

const CREW = '5516988887777'
const ATTENDANT = '5516977776666'
const STRANGER = '5511900000000'

const resolveSenderRole = createWhatsAppSenderRoleResolver({
  findAttendant: async ({ phone }) => (phone === ATTENDANT ? { actorUserId: 'U9' } : null),
  isCrewMember: async ({ phone }) => phone === CREW,
})

const preparations: WhatsAppDeliveryPreparations = {
  answer: async () => null,
  awaitingText: async () => false,
  begin: async () => ({ awaitingText: false, documentNumber: '', finished: true, texts: ['prep'] }),
  hasOpen: async () => false,
  receiveLocation: async () => null,
  receivePhoto: async () => null,
}

const request = (step: string, state: Record<string, unknown> = {}): GroupRequest => ({
  attempts: 0,
  companyId: 'C1',
  driverId: 'D1',
  expiresAt: new Date(),
  groupJid: '1@g.us',
  id: 'R1',
  ownerNumber: ATTENDANT,
  state,
  step,
  version: 1n,
})

function setup(
  options: { trip?: Awaited<ReturnType<GroupTripCloseFlowPorts['findActiveTrip']>> } = {},
) {
  const delivered: { documentId: string; actorUserId: string; attendant?: true }[] = []
  const closed: { phone: string; tripId: string }[] = []
  const results = new Map<string, WhatsAppDriverEventResult>()
  const delivery = createGroupDeliveryFlow({
    consumeLocation: () => null,
    deliverAsAttendant: async (input) => {
      delivered.push({
        actorUserId: input.actorUserId,
        ...(input.attendant === true ? { attendant: true as const } : {}),
        documentId: input.documentId,
      })
      return (
        results.get(input.documentId) ?? {
          details: { proofPending: false, stopCompleted: false, tripCompleted: false },
          event: 'deliver',
          kind: 'registered',
        }
      )
    },
    findActorUserId: async () => 'DRIVER_USER',
    listOpenDocuments: async () => [
      { id: 'DOC1', number: '17234' },
      { id: 'DOC2', number: '17235' },
      { id: 'DOC3', number: '17236' },
    ],
    preparations,
    resolveSenderRole,
    withoutAccessText: async () => 'sem acesso',
  })
  const tripClose = createGroupTripCloseFlow({
    close: async (input) => {
      closed.push({ phone: input.phone, tripId: input.tripId })
      return { kind: 'closed' }
    },
    findActiveTrip: async () =>
      options.trip ?? { kind: 'one', openDocumentNumbers: ['17234', '17235'], tripId: 'T1' },
    resolveSenderRole,
  })
  const flow = createGroupDriverFlow({
    delivery,
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ-answer'] }),
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ-start'] }),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'en-route',
      listStops: async () => [],
      record: async () => ({ message: 'ok' }),
    }),
    tripClose,
  })
  let current = request('document')
  const remember = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue') current = request(outcome.step, { ...outcome.state })
    return outcome
  }
  const turn = (sender: string, text: string) => ({
    request: current,
    sender,
    senderName: null,
    text,
  })
  return {
    answer: async (sender: string, text: string) => remember(await flow.answer(turn(sender, text))),
    closed,
    delivered,
    results,
    start: async (sender: string, text: string) => remember(await flow.start(turn(sender, text))),
  }
}

describe('várias notas de uma vez (RF21)', () => {
  test('o atendente baixa as duas notas pelo escritório, em nome dele', async () => {
    const t = setup()
    const outcome = await t.start(ATTENDANT, 'entreguei 17234 17235')
    expect(t.delivered).toEqual([
      { actorUserId: 'U9', attendant: true, documentId: 'DOC1' },
      { actorUserId: 'U9', attendant: true, documentId: 'DOC2' },
    ])
    expect(outcome).toEqual({
      kind: 'done',
      replies: [
        ['📋 *Baixa pelo escritório*', '', '✅ *Baixadas:* NF `17234`, NF `17235`'].join('\n'),
      ],
    })
  })

  test('o resumo separa nota que não existe, já baixada e canhoto pendente', async () => {
    const t = setup()
    t.results.set('DOC2', { event: 'deliver', kind: 'already_registered' })
    t.results.set('DOC1', {
      details: { proofPending: true, stopCompleted: false, tripCompleted: false },
      event: 'deliver',
      kind: 'registered',
    })
    const outcome = await t.start(ATTENDANT, 'entreguei 17234 17235 999')
    const text = outcome.kind === 'done' ? outcome.replies.join('\n') : ''
    expect(text).toBe(
      [
        '📋 *Baixa pelo escritório*',
        '',
        '🧾 *Canhoto pendente:* NF `17234`',
        '🔁 *Já estavam baixadas:* NF `17235`',
        '⚠️ *Não encontrei em aberto em viagem na rua:* NF `999`',
        '',
        '➡️ _Próximo passo:_ o canhoto pendente pode ser mandado aqui por foto.',
      ].join('\n'),
    )
  })

  test('a tripulação continua uma nota por vez', async () => {
    const t = setup()
    expect(await t.start(CREW, 'entreguei 17234 17235')).toEqual({
      kind: 'done',
      replies: [GROUP_DELIVERY_TEXT.oneAtATime],
    })
    expect(t.delivered).toEqual([])
  })

  test('número desconhecido não baixa nota nenhuma', async () => {
    const t = setup()
    const outcome = await t.start(STRANGER, 'entreguei 17234 17235')
    expect(outcome).toMatchObject({ kind: 'done' })
    expect(t.delivered).toEqual([])
  })

  test('mais de oito notas é recusado ao atendente', async () => {
    const t = setup()
    const outcome = await t.start(ATTENDANT, 'entreguei 1 2 3 4 5 6 7 8 9')
    expect(outcome).toEqual({ kind: 'done', replies: [GROUP_DELIVERY_TEXT.tooManyNotes(8)] })
    expect(t.delivered).toEqual([])
  })
})

describe('encerrar a rota (RF21)', () => {
  test('reconhece só a frase inteira', () => {
    expect(isCloseTripCommand('encerrar a rota')).toBe(true)
    expect(isCloseTripCommand('Fechar viagem')).toBe(true)
    expect(isCloseTripCommand('finalizar esta rota')).toBe(true)
    expect(isCloseTripCommand('a rota foi encerrada pelo cliente')).toBe(false)
    expect(isCloseTripCommand('encerrar')).toBe(false)
  })

  test('o atendente confirma com 1 e a viagem é encerrada pela função do painel', async () => {
    const t = setup()
    const asked = await t.start(ATTENDANT, 'encerrar a rota')
    expect(asked).toMatchObject({
      kind: 'continue',
      replies: [GROUP_TRIP_CLOSE_TEXT.confirm(['17234', '17235'])],
      step: 'close.confirm',
    })
    expect(await t.answer(ATTENDANT, '1')).toEqual({
      kind: 'done',
      replies: [GROUP_TRIP_CLOSE_TEXT.closed(['17234', '17235'])],
    })
    expect(t.closed).toEqual([{ phone: ATTENDANT, tripId: 'T1' }])
  })

  test('com 2 a rota continua aberta e nada é chamado', async () => {
    const t = setup()
    await t.start(ATTENDANT, 'encerrar a rota')
    expect(await t.answer(ATTENDANT, '2')).toEqual({
      kind: 'done',
      replies: [GROUP_TRIP_CLOSE_TEXT.cancelled],
    })
    expect(t.closed).toEqual([])
  })

  test('resposta fora do 1/2 repete a pergunta sem encerrar', async () => {
    const t = setup()
    await t.start(ATTENDANT, 'encerrar a rota')
    expect(await t.answer(ATTENDANT, 'talvez')).toMatchObject({ kind: 'not_understood' })
    expect(t.closed).toEqual([])
  })

  test('a tripulação não encerra; número desconhecido também não', async () => {
    const t = setup()
    expect(await t.start(CREW, 'encerrar a rota')).toEqual({
      kind: 'done',
      replies: [GROUP_TRIP_CLOSE_TEXT.attendantOnly],
    })
    expect(await t.start(STRANGER, 'encerrar a rota')).toMatchObject({ kind: 'done' })
    expect(t.closed).toEqual([])
  })

  test('quem confirma também precisa ser atendente', async () => {
    const t = setup()
    await t.start(ATTENDANT, 'encerrar a rota')
    expect(await t.answer(CREW, '1')).toMatchObject({ kind: 'not_understood' })
    expect(t.closed).toEqual([])
  })

  test('sem viagem ativa ou com mais de uma, o bot explica e não pergunta', async () => {
    expect(await setup({ trip: { kind: 'none' } }).start(ATTENDANT, 'encerrar a rota')).toEqual({
      kind: 'done',
      replies: [GROUP_TRIP_CLOSE_TEXT.noTrip],
    })
    expect(await setup({ trip: { kind: 'many' } }).start(ATTENDANT, 'encerrar a rota')).toEqual({
      kind: 'done',
      replies: [GROUP_TRIP_CLOSE_TEXT.manyTrips],
    })
  })

  test('todas as notas fechadas: a pergunta diz isso', async () => {
    expect(GROUP_TRIP_CLOSE_TEXT.confirm([])).toContain('✅ Todas as notas já estão fechadas.')
    expect(GROUP_TRIP_CLOSE_TEXT.confirm(['17234'])).toContain('*1 nota em aberto*')
  })
})

describe('contagem de notas abertas é a regra do servidor (trip-close.policy)', () => {
  const ports = (
    documents: { number: string; releasedAt: null | string; separationStatus: string }[],
  ) =>
    createWhatsAppGroupTripClosePorts({
      bridge: {},
      listActiveTrips: async () => [{ id: 'T1', status: 'on_delivery_route', stops: [] } as never],
      readCloseDocuments: async () => documents as never,
      resolveActor: async () => ({ reason: 'unknown_phone', status: 'denied' }),
      resolveSenderRole,
    })

  test('nota liberada e nota fechada não contam como abertas', async () => {
    const result = await ports([
      { number: '17234', releasedAt: null, separationStatus: 'loaded' },
      { number: '17235', releasedAt: '2026-11-01T10:00:00.000Z', separationStatus: 'loaded' },
      { number: '17236', releasedAt: null, separationStatus: 'delivered' },
      { number: '17237', releasedAt: null, separationStatus: 'returned' },
    ]).findActiveTrip({ companyId: 'C1', driverId: 'D1' })
    expect(result).toEqual({ kind: 'one', openDocumentNumbers: ['17234'], tripId: 'T1' })
  })
})
