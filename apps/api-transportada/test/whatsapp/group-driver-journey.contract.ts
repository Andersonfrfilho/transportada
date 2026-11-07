/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A jornada no grupo do motorista, pelo roteador e pela sessão do pedido: o "cheguei" repetido não lista as outras
 * paradas, o "saí" com a baixa pendente avisa antes, saída e chegada não se despedem (a rota segue), e os passos
 * novos (`journey.actions`, `return.reason`) têm dono no registro.
 */
import { describe, expect, test } from 'bun:test'

import type { ApiLogger } from '../../src/shared/api.types.js'
import {
  createGroupDriverFlow,
  GROUP_STEP_REGISTRY,
} from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupRequest,
  GroupRequestRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createWhatsAppGroupRequestSessions } from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import {
  createGroupReturnFlow,
  pickReturnReason,
} from '../../src/whatsapp/application/whatsapp-group-return-flow.service.js'
import {
  createGroupStopFlow,
  type GroupStopCandidate,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'

const ARRIVED_AT = '2026-11-06T03:28:00.000Z'

const stop = (
  id: string,
  sequence: number,
  number: string,
  extra: Partial<GroupStopCandidate> = {},
): GroupStopCandidate => ({
  arrivedAt: null,
  completedAt: null,
  documents: [{ number, recipientName: `Cliente ${number}`, separationStatus: 'loaded' }],
  enRouteSince: null,
  id,
  sequence,
  ...extra,
})

/** O cenário do dono: chegou na parada 1 e mandou "cheguei" de novo (seis outras paradas pendentes). */
const ROUTE = [
  stop('S1', 1, '899840', { arrivedAt: ARRIVED_AT }),
  ...[2, 3, 4, 5, 6, 7].map((sequence) => stop(`S${sequence}`, sequence, `9000${sequence}`)),
]

function setup(
  stops: readonly GroupStopCandidate[] = ROUTE,
  options: { readonly readStopCard?: GroupStopFlowPorts['readStopCard'] } = {},
) {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const returned: unknown[] = []
  const flow = createGroupDriverFlow({
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ'] }),
      initialStep: 'document',
      start: async (turn) => ({ kind: 'done', replies: [`ocorrência ${turn.text}`] }),
    },
    return: createGroupReturnFlow({
      listOpenDocuments: async () =>
        stops.flatMap((item) =>
          item.documents.map((document) => ({
            atArrivedStop: item.arrivedAt !== null,
            id: `DOC-${document.number}`,
            number: document.number,
          })),
        ),
      returnDocument: async (input) => {
        returned.push(input)
        return { message: '*NF 899840 não entregue* ↩️' }
      },
    }),
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      listStops: async () => stops,
      ...(options.readStopCard === undefined ? {} : { readStopCard: options.readStopCard }),
      record: async (input) => {
        recorded.push(input)
        return { message: input.event === 'depart' ? 'Saída' : 'Chegada' }
      },
    }),
  })
  let request: GroupRequest = {
    attempts: 0,
    companyId: 'C',
    driverId: 'D',
    expiresAt: new Date(),
    groupJid: '1@g.us',
    id: 'R1',
    ownerNumber: '5516',
    state: {},
    step: flow.initialStep,
    version: 1n,
  }
  const turn = (text: string) => ({ request, sender: '5516', senderName: null, text })
  const follow = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue')
      request = { ...request, state: outcome.state, step: outcome.step }
    return outcome
  }
  return {
    answer: async (text: string) => follow(await flow.answer(turn(text))),
    recorded,
    returned,
    start: async (text: string) => follow(await flow.start(turn(text))),
  }
}

describe('grupo: o "cheguei" repetido', () => {
  test('não lista as outras paradas: diz que a chegada já foi registrada e abre o menu da parada', async () => {
    const t = setup()
    const outcome = await t.start('cheguei')
    expect(outcome).toMatchObject({ kind: 'continue', step: 'journey.actions' })
    const text = outcome.kind === 'continue' ? (outcome.replies[0] ?? '') : ''
    expect(text.split('\n')[0]).toBe('⚠️ *A chegada nesta parada já foi registrada* às 00:28.')
    expect(text).toContain('*NF 899840*')
    expect(text).not.toContain('Qual parada?')
    expect(t.recorded).toEqual([])
  })

  test('"4" encerra sem registrar e diz o próximo passo; "2" abre o "não entreguei" da nota', async () => {
    const nothing = setup()
    await nothing.start('cheguei')
    expect(await nothing.answer('4')).toEqual({
      kind: 'done',
      replies: [
        'Certo, não registrei nada.\n➡️ _Próximo passo:_ depois da entrega, mande a foto do canhoto, ou *não entreguei*.',
      ],
    })
    const notDelivered = setup()
    await notDelivered.start('cheguei')
    expect(await notDelivered.answer('2')).toMatchObject({
      kind: 'continue',
      step: 'return.reason',
    })
    expect(await notDelivered.answer('recusou')).toMatchObject({ kind: 'done' })
    expect(notDelivered.returned).toMatchObject([
      { documentId: 'DOC-899840', reason: 'recipient_refused' },
    ])
  })

  test('"3" abre a ocorrência da nota', async () => {
    const t = setup()
    await t.start('cheguei')
    expect(await t.answer('3')).toEqual({ kind: 'done', replies: ['ocorrência 899840'] })
  })

  test('"cheguei 90002" citando outra parada segue a regra de sempre (não é repetição)', async () => {
    const t = setup()
    const outcome = await t.start('cheguei 90002')
    expect(outcome).not.toMatchObject({ step: 'journey.actions' })
  })
})

describe('grupo: "saí" com a baixa pendente', () => {
  test('avisa antes e nunca recusa: "sair sem dar a baixa" lista as pendentes e grava com a confirmação', async () => {
    const t = setup()
    const warned = await t.start('saí')
    expect(warned).toMatchObject({ kind: 'continue', step: 'journey.actions' })
    const text = warned.kind === 'continue' ? (warned.replies[0] ?? '') : ''
    expect(text).toContain('⚠️ *Falta a baixa desta parada.*')
    expect(await t.answer('3')).toMatchObject({ kind: 'continue', step: 'stop.choose' })
    expect(await t.answer('2')).toEqual({ kind: 'done', replies: ['Saída'], withoutFarewell: true })
    expect(t.recorded).toMatchObject([{ confirmOutOfOrder: true, event: 'depart', stopId: 'S2' }])
  })
})

describe('grupo: a saída e a chegada não se despedem', () => {
  test('o pedido fecha sem "Tenha uma boa noite"; a rota concluída se despede', async () => {
    const sent: string[] = []
    const stored = { open: true }
    const repository: GroupRequestRepositoryPort = {
      claimMessage: async () => true,
      findOpen: async () => null,
      linkMessage: async () => undefined,
      open: async (input) =>
        stored.open
          ? {
              ...input,
              attempts: 0,
              expiresAt: new Date(),
              id: 'R1',
              state: {},
              version: 1n,
            }
          : null,
      update: async () => true,
    }
    const outcomes: GroupFlowOutcome[] = [
      { kind: 'done', replies: ['*Saída registrada* 🚚'], withoutFarewell: true },
      { kind: 'done', replies: ['🏁 *Rota concluída:* todas as paradas fechadas.'] },
    ]
    const sessions = createWhatsAppGroupRequestSessions({
      clock: () => new Date('2026-11-06T01:00:00.000Z'),
      flow: {
        answer: async () => ({ kind: 'done', replies: [] }),
        initialStep: 'document',
        start: async () => outcomes.shift() ?? { kind: 'done', replies: [] },
      },
      logger: { info() {}, warn() {} } as unknown as ApiLogger,
      replies: { send: ({ texts }) => void sent.push(...texts) },
      repository,
    })
    const message = {
      companyId: 'C',
      driverId: 'D',
      groupJid: '1@g.us',
      providerMessageId: 'M',
      replyToProviderMessageId: null,
      requestOwner: null,
      sender: '5516',
      senderName: null,
      text: 'saí',
      via: 'mention' as const,
    }
    await sessions.handle(message)
    await sessions.handle({ ...message, providerMessageId: 'M2' })
    expect(sent).toEqual([
      'Boa noite! 👋\n\n*Saída registrada* 🚚',
      'Boa noite! 👋\n\n🏁 *Rota concluída:* todas as paradas fechadas.\n\nTenha uma boa noite! 🌙',
    ])
  })
})

describe('grupo: os passos novos têm dono', () => {
  test('o menu das ações e o motivo do "não entreguei" estão no registro', () => {
    const qualified = GROUP_STEP_REGISTRY.flatMap((entry) =>
      entry.steps.map((step) => `${entry.prefix}${step}`),
    )
    expect(qualified).toContain('journey.actions')
    expect(qualified).toContain('return.reason')
  })

  test.each([
    ['1', 'recipient_absent'],
    ['dois', 'recipient_refused'],
    ['fechado', 'establishment_closed'],
    ['talvez', undefined],
  ])('o motivo "%s" é %s', (text, reason) => {
    expect(pickReturnReason(text)).toBe(reason as never)
  })
})

describe('grupo: comando digitado com o menu aberto vai ao comando, não à nota do menu (revisão do #552)', () => {
  test('"não entreguei 90003" com o menu da parada 1 aberto abre a nota 90003, não a 899840', async () => {
    const t = setup()
    await t.start('cheguei')
    const outcome = await t.answer('não entreguei 90003')
    expect(outcome).toMatchObject({ kind: 'continue', step: 'return.reason' })
    const text = outcome.kind === 'continue' ? (outcome.replies[0] ?? '') : ''
    expect(text).toContain('NF 90003')
  })

  test('"saí" digitado no menu sem a opção de sair segue como comando (avisa a baixa), sem gastar tentativa', async () => {
    const t = setup()
    await t.start('cheguei')
    const outcome = await t.answer('saí')
    expect(outcome).toMatchObject({ kind: 'continue', step: 'journey.actions' })
    const text = outcome.kind === 'continue' ? (outcome.replies[0] ?? '') : ''
    expect(text).toContain('⚠️ *Falta a baixa desta parada.*')
  })

  test('"saí 0090003" com outra parada a caminho não é a saída repetida dela', async () => {
    const enRoute = [stop('S1', 1, '899840', { enRouteSince: ARRIVED_AT }), stop('S3', 3, '90003')]
    const t = setup(enRoute)
    const outcome = await t.start('saí 0090003')
    expect(outcome).not.toMatchObject({ step: 'journey.actions' })
  })
})

describe('grupo: o bloco da parada é melhor esforço (revisão do #552)', () => {
  test('o leitor do bloco falhando não derruba a resposta: o menu sai com o que a lista traz', async () => {
    const t = setup(ROUTE, {
      readStopCard: () => Promise.reject(new Error('banco fora')),
    })
    const outcome = await t.start('cheguei')
    expect(outcome).toMatchObject({ kind: 'continue', step: 'journey.actions' })
    const text = outcome.kind === 'continue' ? (outcome.replies[0] ?? '') : ''
    expect(text).toContain('*NF 899840*')
  })
})

describe('grupo: "não entreguei" sem a nota guardada (revisão do #552)', () => {
  test('o pedido fecha limpo, sem gastar tentativa com pergunta vazia', async () => {
    const flow = createGroupReturnFlow({
      listOpenDocuments: async () => [],
      returnDocument: async () => ({ message: '' }),
    })
    const outcome = await flow.answer({
      request: {
        attempts: 0,
        companyId: 'C',
        driverId: 'D',
        expiresAt: new Date(),
        groupJid: 'g',
        id: 'R',
        ownerNumber: '1',
        state: {},
        step: 'reason',
        version: 1n,
      },
      sender: '1',
      senderName: null,
      text: '1',
    })
    expect(outcome.kind).toBe('done')
  })
})
