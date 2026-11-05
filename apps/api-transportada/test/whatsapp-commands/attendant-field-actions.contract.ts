/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21 (conversa individual): o atendente baixa várias notas e encerra a rota direto com o bot.
 */
import { describe, expect, test } from 'bun:test'

import {
  createAttendantFieldFlowActions,
  interpretAttendantFieldCommand,
  type AttendantFieldDependencies,
  type AttendantRoadTrip,
} from '../../src/whatsapp-commands/application/register-attendant-field-flow-actions.js'
import type { WhatsAppDriverEventResult } from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import {
  ATTENDANT_CLOSE_ANSWER,
  ATTENDANT_FLOW_ACTION_KIND,
  ATTENDANT_FLOW_CONTEXT_KEY,
  ATTENDANT_FLOW_NODE,
  ATTENDANT_TEXT,
} from '../../src/whatsapp-commands/domain/whatsapp-attendant-flow.constant.js'
import {
  interpretCloseTripCommand,
  isCloseTripCommand,
} from '../../src/whatsapp-commands/domain/whatsapp-trip-close-command.policy.js'
import { WHATSAPP_ROOT_FLOW_GRAPH } from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'

const doc = (id: string, number: string, extra: Record<string, unknown> = {}) => ({
  id,
  number,
  releasedAt: null,
  separationStatus: 'loaded' as const,
  ...extra,
})

const TRIP_A: AttendantRoadTrip = {
  documents: [
    doc('D1', '017234'),
    doc('D2', '17235'),
    doc('D3', '17236', { separationStatus: 'delivered' }),
  ],
  id: 'TA',
  vehiclePlate: 'AAA1A11',
}
const TRIP_B: AttendantRoadTrip = {
  documents: [doc('D4', '900'), doc('D5', '901', { releasedAt: '2026-11-01T10:00:00.000Z' })],
  id: 'TB',
  vehiclePlate: 'BBB2B22',
}

function setup(trips: readonly AttendantRoadTrip[] = [TRIP_A, TRIP_B]) {
  const texts: string[] = []
  const lists: { rows: { id: string; title: string }[] }[] = []
  const delivered: { actorUserId: string; documentId: string }[] = []
  const closed: { tripId: string; userId: string }[] = []
  const results = new Map<string, WhatsAppDriverEventResult>()
  const failures = { close: false }
  const deps: AttendantFieldDependencies = {
    closeTrip: async ({ context, tripId }) => {
      if (failures.close) throw new Error('boom')
      closed.push({ tripId, userId: context.userId })
    },
    deliverDocument: async (input) => {
      delivered.push({ actorUserId: input.actorUserId, documentId: input.documentId })
      return (
        results.get(input.documentId) ?? {
          details: { proofPending: false, stopCompleted: false, tripCompleted: false },
          event: 'deliver',
          kind: 'registered',
        }
      )
    },
    listRoadTrips: async () => trips,
  }
  const actions = createAttendantFieldFlowActions(deps)
  const run = async (kind: string, context: Record<string, unknown>) => {
    const definition = actions.find((action) => action.kind === kind)
    if (definition === undefined) throw new Error(`sem ação ${kind}`)
    return definition.handler({
      actor: { scope: { companyId: 'C1', userId: 'U9' } },
      channel: {
        sendInteractiveList: async (message: { rows: { id: string; title: string }[] }) => {
          lists.push(message)
        },
        sendText: async (_to: string, body: string) => {
          texts.push(body)
        },
      },
      context,
      node: { id: 'n' },
      session: { companyId: 'C1', whatsappNumber: '5516' },
    } as never)
  }
  const command = (value: unknown) =>
    run(ATTENDANT_FLOW_ACTION_KIND.fieldCommand, {
      [ATTENDANT_FLOW_CONTEXT_KEY.fieldCommand]: value,
    })
  return { closed, command, delivered, failures, lists, results, run, texts }
}

describe('o comando do atendente', () => {
  test('encerrar a rota, com ou sem a NF; só a frase inteira', () => {
    expect(interpretCloseTripCommand('encerrar a rota')).toEqual({ documentNumber: null })
    expect(interpretCloseTripCommand('Fechar viagem da NF 17234')).toEqual({
      documentNumber: '17234',
    })
    expect(interpretCloseTripCommand('encerrar a rota 017234')).toEqual({
      documentNumber: '017234',
    })
    expect(interpretCloseTripCommand('a rota foi encerrada')).toBeNull()
    expect(isCloseTripCommand('encerrar a rota')).toBe(true)
    expect(isCloseTripCommand('encerrar a rota 17234')).toBe(false)
  })

  test('baixa de várias notas e encerrar viram comando; saí e cheguei não são do atendente', () => {
    expect(interpretAttendantFieldCommand('entreguei 17234 17235')).toEqual({
      kind: 'deliver',
      numbers: ['17234', '17235'],
    })
    expect(interpretAttendantFieldCommand('encerrar a rota')).toEqual({
      documentNumber: null,
      kind: 'close',
    })
    expect(interpretAttendantFieldCommand('cheguei')).toBeUndefined()
    expect(interpretAttendantFieldCommand('bom dia')).toBeUndefined()
  })
})

describe('baixa de várias notas pelo escritório', () => {
  test('acha as notas nas viagens na rua, mesmo de viagens diferentes, e baixa com o usuário do atendente', async () => {
    const t = setup()
    await t.command({ kind: 'deliver', numbers: ['17234', '900'] })
    expect(t.delivered).toEqual([
      { actorUserId: 'U9', documentId: 'D1' },
      { actorUserId: 'U9', documentId: 'D4' },
    ])
    expect(t.texts).toEqual(['Baixa registrada pelo escritório: NF 17234, NF 900.'])
  })

  test('nota fechada, liberada ou inexistente não é baixada e entra no resumo', async () => {
    const t = setup()
    await t.command({ kind: 'deliver', numbers: ['17236', '901', '555', '17235'] })
    expect(t.delivered).toEqual([{ actorUserId: 'U9', documentId: 'D2' }])
    expect(t.texts[0]).toContain('Baixa registrada pelo escritório: NF 17235.')
    expect(t.texts[0]).toContain(
      'Não encontrei em aberto em viagem na rua: NF 17236, NF 901, NF 555.',
    )
  })

  test('já baixada, canhoto pendente e recusa saem separados', async () => {
    const t = setup()
    t.results.set('D1', { event: 'deliver', kind: 'already_registered' })
    t.results.set('D2', {
      details: { proofPending: true, stopCompleted: false, tripCompleted: false },
      event: 'deliver',
      kind: 'registered',
    })
    t.results.set('D4', {
      event: 'deliver',
      kind: 'refused',
      refusal: { code: 'document_not_reachable' },
    })
    await t.command({ kind: 'deliver', numbers: ['17234', '17235', '900'] })
    expect(t.texts[0]).toContain('Canhoto pendente: NF 17235.')
    expect(t.texts[0]).toContain('Já estavam baixadas: NF 17234.')
    expect(t.texts[0]).toContain('Não consegui baixar: NF 900.')
  })

  test('"entreguei" sem nota pede os números; mais de oito é recusado', async () => {
    const t = setup()
    await t.command({ kind: 'deliver', numbers: [] })
    await t.command({ kind: 'too_many_documents' })
    expect(t.texts).toEqual([ATTENDANT_TEXT.askNumbers, ATTENDANT_TEXT.tooManyNotes(8)])
    expect(t.delivered).toEqual([])
  })
})

describe('encerrar a rota pelo bot', () => {
  test('com a NF a viagem é escolhida por ela e a contagem segue a regra do servidor (liberada não conta)', async () => {
    const t = setup()
    const next = await t.command({ documentNumber: '900', kind: 'close' })
    expect(t.texts).toEqual([ATTENDANT_TEXT.confirm(1)])
    expect(next).toMatchObject({
      context: { [ATTENDANT_FLOW_CONTEXT_KEY.tripId]: 'TB' },
      next: ATTENDANT_FLOW_NODE.closeMenu,
    })
    expect(t.closed).toEqual([])
  })

  test('NF fora das viagens na rua avisa e não pergunta nada', async () => {
    const t = setup()
    const next = await t.command({ documentNumber: '555', kind: 'close' })
    expect(t.texts).toEqual([ATTENDANT_TEXT.tripNotFound('555')])
    expect(next).toMatchObject({ next: 'menu' })
  })

  test('sem NF e com mais de uma viagem na rua: lista para escolher', async () => {
    const t = setup()
    const next = await t.command({ documentNumber: null, kind: 'close' })
    expect(next).toMatchObject({ next: ATTENDANT_FLOW_NODE.tripEntry })
    expect(JSON.stringify(t.lists)).toContain('TA')
    expect(JSON.stringify(t.lists)).toContain('TB')
    const routed = await t.run(ATTENDANT_FLOW_ACTION_KIND.tripRouter, {
      [ATTENDANT_FLOW_CONTEXT_KEY.tripAnswer]: 'TA',
    })
    expect(routed).toMatchObject({
      context: { [ATTENDANT_FLOW_CONTEXT_KEY.tripId]: 'TA' },
      next: ATTENDANT_FLOW_NODE.closeMenu,
    })
    expect(t.texts).toEqual([ATTENDANT_TEXT.confirm(2)])
  })

  test('uma viagem só na rua vai direto à confirmação; nenhuma avisa', async () => {
    const one = setup([TRIP_A])
    expect(await one.command({ documentNumber: null, kind: 'close' })).toMatchObject({
      next: ATTENDANT_FLOW_NODE.closeMenu,
    })
    const none = setup([])
    await none.command({ documentNumber: null, kind: 'close' })
    expect(none.texts).toEqual([ATTENDANT_TEXT.noRoadTrips])
  })

  test('viagem da lista que saiu da rua no meio é recusada', async () => {
    const t = setup()
    const routed = await t.run(ATTENDANT_FLOW_ACTION_KIND.tripRouter, {
      [ATTENDANT_FLOW_CONTEXT_KEY.tripAnswer]: 'GONE',
    })
    expect(routed).toMatchObject({ next: 'menu' })
    expect(t.texts).toEqual([ATTENDANT_TEXT.tripUnavailable])
  })

  test('1 - Sim encerra pela função do painel com o contexto do atendente; 2 - Não deixa aberta', async () => {
    const yes = setup()
    await yes.run(ATTENDANT_FLOW_ACTION_KIND.closeRouter, {
      [ATTENDANT_FLOW_CONTEXT_KEY.closeAnswer]: ATTENDANT_CLOSE_ANSWER.confirm,
      [ATTENDANT_FLOW_CONTEXT_KEY.tripId]: 'TB',
    })
    expect(yes.closed).toEqual([{ tripId: 'TB', userId: 'U9' }])
    expect(yes.texts).toEqual([ATTENDANT_TEXT.closed])

    const no = setup()
    await no.run(ATTENDANT_FLOW_ACTION_KIND.closeRouter, {
      [ATTENDANT_FLOW_CONTEXT_KEY.closeAnswer]: ATTENDANT_CLOSE_ANSWER.cancel,
      [ATTENDANT_FLOW_CONTEXT_KEY.tripId]: 'TB',
    })
    expect(no.closed).toEqual([])
    expect(no.texts).toEqual([ATTENDANT_TEXT.cancelled])
  })

  test('falha ao encerrar vira aviso, nunca silêncio', async () => {
    const t = setup()
    t.failures.close = true
    await t.run(ATTENDANT_FLOW_ACTION_KIND.closeRouter, {
      [ATTENDANT_FLOW_CONTEXT_KEY.closeAnswer]: ATTENDANT_CLOSE_ANSWER.confirm,
      [ATTENDANT_FLOW_CONTEXT_KEY.tripId]: 'TB',
    })
    expect(t.texts).toEqual([ATTENDANT_TEXT.closeFailed])
  })
})

describe('o grafo publicado tem o ramo do atendente', () => {
  test('cada nó do ramo existe e as ações apontam para tipos registrados', () => {
    const nodes = WHATSAPP_ROOT_FLOW_GRAPH.nodes
    for (const id of Object.values(ATTENDANT_FLOW_NODE)) expect(nodes[id]).toBeDefined()
    const kinds = new Set<string>(Object.values(ATTENDANT_FLOW_ACTION_KIND))
    for (const id of Object.values(ATTENDANT_FLOW_NODE)) {
      const node = nodes[id]
      if (node?.type === 'action') expect(kinds.has(node.actionKind ?? '')).toBe(true)
    }
  })
})
