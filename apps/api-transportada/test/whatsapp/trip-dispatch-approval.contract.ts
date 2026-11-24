/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O bot pede ao escritório para despachar a viagem planejada quando o motorista manda "saí"/"cheguei": só o
 * responsável responde, só com a permissão de despachar, só com a carga fechada, em até 10 minutos (reaviso aos 5), e
 * nada é despachado sozinho.
 */
import { describe, expect, test } from 'bun:test'

import {
  DISPATCH_APPROVAL_TEXT,
  interpretDispatchAnswer,
  type PendingDriverStopEvent,
} from '../../src/whatsapp/domain/trip-dispatch-approval.policy.js'
import {
  createGroupStopFlow,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type { GroupRequest } from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createTripDispatchApproval,
  type TripDispatchApprovalPorts,
  type TripDispatchRequestRecord,
} from '../../src/whatsapp/application/whatsapp-trip-dispatch-approval.service.js'

const RESPONDER = '5516977776666'
const GROUP = '120363@g.us'
const NOW = new Date('2026-11-23T13:00:00.000Z')

const depart = (sentAt: string, stopId = 'S1'): PendingDriverStopEvent => ({
  event: 'depart',
  sentAt,
  stopId,
})

function setup(
  options: {
    readonly cargoClosed?: boolean
    readonly dispatchFails?: boolean
    readonly dispatcher?: boolean
    readonly responder?: boolean
    readonly resolveRejects?: boolean
  } = {},
) {
  let clock = NOW
  const sent: { readonly groupJid: string; readonly texts: readonly string[] }[] = []
  const dispatched: string[] = []
  const replayed: string[] = []
  let open: null | TripDispatchRequestRecord = null
  const resolved: { readonly note?: string; readonly status: string }[] = []
  const ports: TripDispatchApprovalPorts = {
    clock: () => clock,
    dispatch: async ({ tripId }) => {
      if (options.dispatchFails === true) throw new Error('boom')
      dispatched.push(tripId)
    },
    findDispatcher: async () => (options.dispatcher === false ? null : { userId: 'U1' }),
    findResponder: async () =>
      options.responder === false ? null : { phone: RESPONDER, userId: 'U1' },
    isCargoClosed: async () => options.cargoClosed !== false,
    readDriverName: async () => 'Rogério',
    replay: async ({ event }) => {
      replayed.push(`${event.event}:${event.sentAt}`)
      return event.event === 'depart' ? 'Saída registrada.' : 'Chegada registrada.'
    },
    repository: {
      appendEvent: async ({ event }) => {
        if (open !== null) open = { ...open, pendingEvents: [...open.pendingEvents, event] }
      },
      claimExpired: async () => {
        const expired = open !== null && clock.getTime() >= NOW.getTime() + 10 * 60_000
        const found = expired ? open : null
        if (expired) open = null
        return found === null ? [] : [found]
      },
      claimReminders: async ({ afterMs }) => {
        const due = open !== null && clock.getTime() >= NOW.getTime() + afterMs && !reminded
        if (!due || open === null) return []
        reminded = true
        return [open]
      },
      findOpenByResponder: async () => open,
      findOpenByTrip: async () => open,
      insert: async (input) => {
        if (open !== null) return false
        open = {
          companyId: input.companyId,
          driverId: input.driverId,
          groupJid: input.groupJid,
          id: 'REQ1',
          pendingEvents: [input.event],
          responderPhone: input.responderPhone,
          responderUserId: input.responderUserId,
          tripId: input.tripId,
        }
        return true
      },
      resolve: async ({ note, status }) => {
        if (options.resolveRejects === true) return false
        resolved.push({ ...(note === undefined ? {} : { note }), status })
        if (status !== 'failed') open = null
        return true
      },
    },
    send: (reply) => sent.push({ groupJid: reply.groupJid, texts: reply.texts }),
  }
  let reminded = false
  const approval = createTripDispatchApproval(ports)
  const ask = (event = depart('2026-11-23T12:59:00.000Z')) =>
    approval.request({ companyId: 'C1', driverId: 'D1', event, groupJid: GROUP, tripId: 'T1' })
  return {
    advance: (minutes: number) => {
      clock = new Date(NOW.getTime() + minutes * 60_000)
    },
    answer: (text: string) => approval.answer({ companyId: 'C1', phone: RESPONDER, text }),
    approval,
    ask,
    dispatched,
    replayed,
    resolved,
    sent,
  }
}

describe('pedido de despacho: leitura da resposta do escritório', () => {
  test.each<[string, 'no' | 'yes' | null]>([
    ['sim', 'yes'],
    ['Sim, pode despachar', 'yes'],
    ['pode', 'yes'],
    ['não', 'no'],
    ['Não, aguarde', 'no'],
    ['nao', 'no'],
    ['talvez', null],
    ['sim e não', null],
    ['quando o motorista chegar eu vejo se despacho ou não', null],
    ['', null],
  ])('"%s" → %s', (text, expected) => {
    expect(interpretDispatchAnswer(text)).toBe(expected)
  })
})

describe('pedido de despacho: o bot pergunta ao responsável do escritório', () => {
  test('pergunta ao responsável, avisa o motorista e guarda o evento com a hora que ele mandou', async () => {
    const t = setup()
    const outcome = await t.ask()
    expect(outcome.replies[0]).toContain('Pedi ao escritório')
    expect(t.sent).toEqual([
      {
        groupJid: `${RESPONDER}@s.whatsapp.net`,
        texts: [
          DISPATCH_APPROVAL_TEXT.question({
            driverName: 'Rogério',
            events: [depart('2026-11-23T12:59:00.000Z')],
          }),
        ],
      },
    ])
    expect(t.dispatched).toEqual([])
  })

  test('sem responsável com telefone verificado, só avisa para falar com o escritório', async () => {
    const t = setup({ responder: false })
    const outcome = await t.ask()
    expect(outcome.replies).toEqual([DISPATCH_APPROVAL_TEXT.noResponder])
    expect(t.sent).toEqual([])
  })

  test('carga aberta: avisa o escritório para despachar no painel e não abre pedido', async () => {
    const t = setup({ cargoClosed: false })
    const outcome = await t.ask()
    expect(outcome.replies).toEqual([DISPATCH_APPROVAL_TEXT.cargoOpenDriver])
    expect(t.sent).toHaveLength(1)
    expect(t.sent[0]?.texts[0]).toContain('painel')
    expect(await t.answer('sim')).toBe(false)
  })

  test('um pedido por viagem: o segundo "cheguei" entra no mesmo pedido, sem nova pergunta', async () => {
    const t = setup()
    await t.ask()
    const again = await t.ask({ event: 'arrive', sentAt: '2026-11-23T13:00:30.000Z', stopId: 'S1' })
    expect(again.replies).toEqual([DISPATCH_APPROVAL_TEXT.alreadyAsked])
    expect(t.sent).toHaveLength(1)
  })
})

describe('pedido de despacho: a resposta do responsável', () => {
  test('"sim" despacha pelo caso de uso e lança os eventos na ordem da hora em que o motorista mandou', async () => {
    const t = setup()
    await t.ask({ event: 'arrive', sentAt: '2026-11-23T13:00:30.000Z', stopId: 'S1' })
    await t.ask(depart('2026-11-23T12:59:00.000Z'))
    t.sent.length = 0
    expect(await t.answer('sim')).toBe(true)
    expect(t.dispatched).toEqual(['T1'])
    expect(t.replayed).toEqual([
      'depart:2026-11-23T12:59:00.000Z',
      'arrive:2026-11-23T13:00:30.000Z',
    ])
    const toGroup = t.sent.find((message) => message.groupJid === GROUP)
    expect(toGroup?.texts[0]).toContain('despachada pelo escritório')
    expect(toGroup?.texts).toContain('Saída registrada.')
    expect(toGroup?.texts).toContain('Chegada registrada.')
    expect(t.resolved).toEqual([{ status: 'approved' }])
  })

  test('"não" recusa, avisa o motorista e não despacha', async () => {
    const t = setup()
    await t.ask()
    expect(await t.answer('não')).toBe(true)
    expect(t.dispatched).toEqual([])
    expect(t.sent.at(-1)).toEqual({
      groupJid: GROUP,
      texts: [DISPATCH_APPROVAL_TEXT.declinedDriver],
    })
    expect(t.resolved).toEqual([{ status: 'declined' }])
  })

  test('resposta que não é sim nem não repete a pergunta e mantém o pedido aberto', async () => {
    const t = setup()
    await t.ask()
    expect(await t.answer('talvez')).toBe(true)
    expect(t.sent.at(-1)?.texts).toEqual([DISPATCH_APPROVAL_TEXT.notUnderstood])
    expect(t.resolved).toEqual([])
    expect(t.dispatched).toEqual([])
  })

  test('quem não pode despachar não despacha: o pedido falha e o motorista é avisado', async () => {
    const t = setup({ dispatcher: false })
    await t.ask()
    expect(await t.answer('sim')).toBe(true)
    expect(t.dispatched).toEqual([])
    expect(t.resolved).toEqual([{ note: 'not_allowed', status: 'failed' }])
    expect(t.sent.at(-1)?.groupJid).toBe(GROUP)
  })

  test('o despacho que falha não lança nada e avisa os dois', async () => {
    const t = setup({ dispatchFails: true })
    await t.ask()
    expect(await t.answer('sim')).toBe(true)
    expect(t.replayed).toEqual([])
    expect(t.resolved.at(-1)).toEqual({ note: 'dispatch_failed', status: 'failed' })
    expect(t.sent.at(-1)).toEqual({
      groupJid: GROUP,
      texts: [DISPATCH_APPROVAL_TEXT.dispatchFailedDriver],
    })
  })

  test('resposta repetida (o pedido já foi resolvido) não despacha duas vezes', async () => {
    const t = setup({ resolveRejects: true })
    await t.ask()
    expect(await t.answer('sim')).toBe(true)
    expect(t.dispatched).toEqual([])
  })

  test('sem pedido aberto a mensagem não é do desvio', async () => {
    const t = setup()
    expect(await t.answer('sim')).toBe(false)
  })
})

describe('pedido de despacho: o prazo de 10 minutos, com reaviso na metade', () => {
  test('aos 5 minutos o responsável é lembrado uma vez, e aos 10 o pedido vence sem despachar', async () => {
    const t = setup()
    await t.ask()
    t.sent.length = 0

    t.advance(4)
    await t.approval.tick()
    expect(t.sent).toEqual([])

    t.advance(5)
    await t.approval.tick()
    await t.approval.tick()
    expect(t.sent).toEqual([
      { groupJid: `${RESPONDER}@s.whatsapp.net`, texts: [DISPATCH_APPROVAL_TEXT.reminder] },
    ])

    t.advance(10)
    await t.approval.tick()
    expect(t.sent.slice(1)).toEqual([
      { groupJid: `${RESPONDER}@s.whatsapp.net`, texts: [DISPATCH_APPROVAL_TEXT.expiredOffice] },
      { groupJid: GROUP, texts: [DISPATCH_APPROVAL_TEXT.expiredDriver] },
    ])
    expect(t.dispatched).toEqual([])
  })
})

describe('"saí"/"cheguei" em viagem não despachada pede o despacho', () => {
  function flowRequest(): GroupRequest {
    return {
      attempts: 0,
      companyId: 'C1',
      driverId: 'D1',
      expiresAt: new Date(),
      groupJid: GROUP,
      id: 'R1',
      ownerNumber: '5516988887777',
      state: {},
      step: 'start',
      version: 1n,
    }
  }

  function build(options: {
    readonly asked: null | readonly string[]
    readonly role: 'attendant' | 'crew'
  }) {
    const requested: Parameters<NonNullable<GroupStopFlowPorts['requestTripDispatch']>>[0][] = []
    const stop = createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      isStopTripNotDispatched: async () => true,
      listStops: async () => [
        {
          arrivedAt: null,
          completedAt: null,
          documents: [{ number: '933891', separationStatus: 'loaded' as const }],
          enRouteSince: null,
          id: 'S1',
          isAddressReliable: true,
          sequence: 1,
        },
      ],
      record: async () => ({ message: 'não deveria registrar' }),
      requestTripDispatch: async (input) => {
        requested.push(input)
        return options.asked
      },
      resolveSenderRole: async () =>
        options.role === 'crew' ? { kind: 'crew' } : { actorUserId: 'U9', kind: 'attendant' },
    })
    const flow = createGroupDriverFlow({
      occurrence: {
        answer: async () => ({ kind: 'done', replies: ['occ'] }),
        initialStep: 'document',
        start: async () => ({ kind: 'done', replies: ['occ'] }),
      },
      stop,
    })
    return { flow, requested }
  }

  const turn = (text: string) => ({
    request: flowRequest(),
    sender: '5516988887777',
    senderName: null,
    sentAt: new Date('2026-11-23T12:59:00.000Z'),
    text,
  })

  test('a tripulação pede ao escritório, com a hora da mensagem e a parada', async () => {
    const t = build({ asked: ['Pedi ao escritório.'], role: 'crew' })
    const outcome = await t.flow.start(turn('saí'))
    expect(outcome).toEqual({
      kind: 'done',
      replies: ['Pedi ao escritório.'],
      withoutFarewell: true,
    })
    expect(t.requested).toMatchObject([
      { companyId: 'C1', driverId: 'D1', event: 'depart', groupJid: GROUP, stopId: 'S1' },
    ])
    expect(t.requested[0]?.sentAt.toISOString()).toBe('2026-11-23T12:59:00.000Z')
  })

  test('sem a ponte do pedido, o bot só avisa que a viagem não foi despachada', async () => {
    const t = build({ asked: null, role: 'crew' })
    const outcome = await t.flow.start(turn('saí'))
    expect(outcome.kind === 'done' ? outcome.replies[0] : '').toContain('ainda não foi despachada')
  })

  test('o atendente não pede: só recebe o aviso', async () => {
    const t = build({ asked: ['Pedi ao escritório.'], role: 'attendant' })
    const outcome = await t.flow.start(turn('saí'))
    expect(outcome.kind === 'done' ? outcome.replies[0] : '').toContain('ainda não foi despachada')
    expect(t.requested).toEqual([])
  })
})
