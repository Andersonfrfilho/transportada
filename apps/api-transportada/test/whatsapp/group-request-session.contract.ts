/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T4: a sessão do pedido no grupo do motorista — abrir, um por vez, cancelar, tentativas,
 * reentrega e quem pode responder pelo dono.
 */
import { botFarewell, botGreeting } from '../../src/whatsapp/domain/bot-greeting.policy.js'
import { describe, expect, test } from 'bun:test'

import type { ApiLogger } from '../../src/shared/api.types.js'
import type { AdmittedGroupMessage } from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupQuestionAsked,
  GroupRequest,
  GroupRequestClosed,
  GroupRequestFlow,
  GroupRequestRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createWhatsAppGroupRequestSessions,
  GROUP_REQUEST_TEXT,
  isCancelText,
} from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const GROUP = '120363025246125486@g.us'
const DRIVER = '5516988887777'
const SUPPORT = '5516977776666'

type Stored = GroupRequest & { status: string; timeoutMs: number }

function createMemoryRepository(clock: () => Date) {
  const requests: Stored[] = []
  const messages = new Map<
    string,
    { requestId: null | string; sender: string; stepBefore: null | string }
  >()
  let sequence = 0
  const openOf = (groupJid: string) =>
    requests.find((item) => item.groupJid === groupJid && item.status === 'open')

  const repository: GroupRequestRepositoryPort = {
    async claimMessage({ providerMessageId, senderNumber }) {
      if (messages.has(providerMessageId)) return false
      messages.set(providerMessageId, { requestId: null, sender: senderNumber, stepBefore: null })
      return true
    },
    async findOpen({ groupJid, now }) {
      const open = openOf(groupJid)
      if (open !== undefined && open.expiresAt <= now) open.status = 'expired'
      const valid = openOf(groupJid)
      return valid === undefined ? null : { ...valid }
    },
    async linkMessage({ providerMessageId, requestId, stepBefore }) {
      const message = messages.get(providerMessageId)
      if (message !== undefined) Object.assign(message, { requestId, stepBefore })
    },
    async open({ driverId, groupJid, now, ownerNumber, step }) {
      if (openOf(groupJid) !== undefined) return null
      sequence += 1
      const request: Stored = {
        attempts: 0,
        companyId: COMPANY_ID,
        driverId,
        expiresAt: new Date(now.getTime() + 600_000),
        groupJid,
        id: `R${sequence}`,
        ownerNumber,
        state: {},
        status: 'open',
        step,
        timeoutMs: 600_000,
        version: 1n,
      }
      requests.push(request)
      return { ...request }
    },
    async update({ attempts, close, id, now, state, step, version }) {
      const request = requests.find((item) => item.id === id)
      if (request === undefined || request.status !== 'open' || request.version !== version) {
        return false
      }
      Object.assign(request, {
        attempts,
        state,
        step,
        version: version + 1n,
        ...(close === undefined
          ? { expiresAt: new Date(now.getTime() + request.timeoutMs) }
          : { status: close }),
      })
      return true
    },
  }
  void clock
  return { messages, repository, requests }
}

/** Fluxo de mentira: pede a nota (dígitos) e conclui. */
function fakeFlow() {
  const turns: { kind: 'answer' | 'start'; turn: GroupFlowTurn }[] = []
  return {
    flow: {
      async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
        turns.push({ kind: 'answer', turn })
        if (/^\d+$/u.test(turn.text)) return { kind: 'done', replies: [`Nota ${turn.text} ok.`] }
        return { kind: 'not_understood', prompt: 'Qual a nota?', reason: 'a nota tem só números' }
      },
      initialStep: 'note',
      async start(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
        turns.push({ kind: 'start', turn })
        return { kind: 'continue', replies: ['Qual a nota?'], state: { asked: true }, step: 'note' }
      },
    },
    turns,
  }
}

function setup(
  extra: {
    readonly cancel?: GroupRequestFlow['cancel']
    readonly onQuestionAsked?: GroupQuestionAsked
    readonly onRequestClosed?: GroupRequestClosed
  } = {},
) {
  let now = new Date('2026-11-04T12:00:00.000Z')
  const clock = () => now
  const memory = createMemoryRepository(clock)
  const { flow, turns } = fakeFlow()
  const sent: { body: string; number: string }[] = []
  const replies = createEvolutionGroupReplySender({
    logger: silentLogger(),
    sendText: async ({ body, number }) => {
      sent.push({ body, number })
    },
  })
  const sessions = createWhatsAppGroupRequestSessions({
    clock,
    flow: { ...flow, ...(extra.cancel === undefined ? {} : { cancel: extra.cancel }) },
    logger: silentLogger(),
    ...(extra.onQuestionAsked === undefined ? {} : { onQuestionAsked: extra.onQuestionAsked }),
    ...(extra.onRequestClosed === undefined ? {} : { onRequestClosed: extra.onRequestClosed }),
    replies,
    repository: memory.repository,
  })
  let id = 0
  const message = (overrides: Partial<AdmittedGroupMessage>): AdmittedGroupMessage => {
    id += 1
    return {
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      groupJid: GROUP,
      providerMessageId: `M${id}`,
      replyToProviderMessageId: null,
      requestOwner: null,
      sender: DRIVER,
      senderName: null,
      text: '',
      via: 'mention',
      ...overrides,
    }
  }
  /** O que o bot disse, sem o @número de quem pediu que abre a mensagem (a marca tem teste próprio). */
  const said = async () => {
    await replies.idle()
    return sent.splice(0).map((item) => item.body.replace(/^@\d+ /u, ''))
  }
  return {
    idle: () => replies.idle(),
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms)
    },
    memory,
    message,
    said,
    sent,
    sessions,
    turns,
  }
}

/** 09:00 em Brasília, sem nome do WhatsApp. */
const HELLO = 'Bom dia! 👋'

function silentLogger(): ApiLogger {
  return { error: () => undefined, info: () => undefined, warn: () => undefined }
}

describe('pedido no grupo: abrir e responder', () => {
  test('marcar o bot abre o pedido com o dono e a resposta sai no grupo', async () => {
    const { memory, message, said, sent, sessions } = setup()

    await sessions.handle(message({ text: '' }))
    expect(await said()).toEqual([`${HELLO}\n\nQual a nota?`])
    expect(memory.requests).toHaveLength(1)
    expect(await sessions.findOpenOwner({ companyId: COMPANY_ID, groupJid: GROUP })).toBe(DRIVER)

    await sessions.handle(message({ text: '17234', via: 'owner_reply' }))
    expect(await said()).toEqual(['Nota 17234 ok.\n\nTenha um bom dia! ☀️'])
    expect(memory.requests[0]?.status).toBe('completed')
    expect(sent).toEqual([])
  })

  test('a mesma mensagem reentregue não anda o pedido duas vezes', async () => {
    const { memory, message, said, sessions } = setup()
    const call = message({ text: '' })

    await sessions.handle(call)
    await sessions.handle(call)
    expect(await said()).toEqual([`${HELLO}\n\nQual a nota?`])
    expect(memory.requests).toHaveLength(1)
  })

  test('o histórico guarda quem respondeu e em que passo', async () => {
    const { memory, message, sessions } = setup()

    await sessions.handle(message({ providerMessageId: 'A', text: '' }))
    await sessions.handle(
      message({ providerMessageId: 'B', sender: SUPPORT, text: '17234', via: 'mention' }),
    )
    expect(memory.messages.get('A')).toEqual({
      requestId: 'R1',
      sender: DRIVER,
      stepBefore: 'note',
    })
    expect(memory.messages.get('B')).toEqual({
      requestId: 'R1',
      sender: SUPPORT,
      stepBefore: 'note',
    })
    expect(memory.requests[0]?.status).toBe('completed')
  })
})

describe('pedido no grupo: um por vez', () => {
  test('outra pessoa marcando o bot sem responder a pergunta recebe "em andamento" e o dono não perde tentativa', async () => {
    const { memory, message, said, sessions } = setup()

    await sessions.handle(message({ text: '' }))
    await said()
    await sessions.handle(message({ sender: SUPPORT, text: 'prorrogação' }))
    expect(await said()).toEqual([GROUP_REQUEST_TEXT.busy])
    expect(memory.requests[0]?.attempts).toBe(0)
  })

  test('o prazo vencido libera o grupo para um pedido novo', async () => {
    const { advance, memory, message, said, sessions } = setup()

    await sessions.handle(message({ text: '' }))
    advance(600_000)
    expect(await sessions.findOpenOwner({ companyId: COMPANY_ID, groupJid: GROUP })).toBeNull()
    await sessions.handle(message({ sender: SUPPORT, text: '' }))
    await said()
    expect(memory.requests.map((item) => [item.status, item.ownerNumber])).toEqual([
      ['expired', DRIVER],
      ['open', SUPPORT],
    ])
  })

  test('resposta do dono depois que o prazo venceu não abre pedido', async () => {
    const { advance, memory, message, said, sessions } = setup()

    await sessions.handle(message({ text: '' }))
    await said()
    advance(600_000)
    await sessions.handle(message({ text: '17234', via: 'owner_reply' }))
    expect(await said()).toEqual([])
    expect(memory.requests).toHaveLength(1)
  })
})

describe('pedido no grupo: cumprimenta pela hora de Brasília', () => {
  test('bom dia, boa tarde e boa noite pela hora do motorista, com o primeiro nome', () => {
    expect(botGreeting(new Date('2026-11-04T12:00:00Z'), 'Anderson Fernandes')).toBe(
      'Bom dia, Anderson! 👋',
    )
    expect(botGreeting(new Date('2026-11-04T18:00:00Z'), '🚚 Zé')).toBe('Boa tarde, Zé! 👋')
    expect(botGreeting(new Date('2026-11-05T00:47:00Z'), null)).toBe('Boa noite! 👋')
    expect(botGreeting(new Date('2026-11-04T07:59:00Z'), '')).toBe('Boa noite! 👋')
    expect(botFarewell(new Date('2026-11-05T00:47:00Z'))).toBe('Tenha uma boa noite! 🌙')
  })
})

describe('pedido no grupo: cancelar e tentativas', () => {
  test('o dono cancela sem marcar; quem marca o bot também cancela', async () => {
    const { memory, message, said, sessions } = setup()

    await sessions.handle(message({ text: '' }))
    await sessions.handle(message({ text: 'Cancelar', via: 'owner_reply' }))
    expect(await said()).toEqual([`${HELLO}\n\nQual a nota?`, GROUP_REQUEST_TEXT.cancelled])
    expect(memory.requests[0]?.status).toBe('cancelled')

    await sessions.handle(message({ text: '' }))
    await sessions.handle(message({ sender: SUPPORT, text: 'cancela', via: 'mention' }))
    expect(memory.requests[1]?.status).toBe('cancelled')
  })

  test('"cancelar" vai ao fluxo dono do passo, que encerra do jeito dele', async () => {
    const seen: string[] = []
    const { memory, message, said, sessions } = setup({
      cancel: async (turn) => {
        seen.push(turn.request.step)
        return { kind: 'done', replies: ['Entrega cancelada.'] }
      },
    })
    await sessions.handle(message({ text: '' }))
    await said()
    await sessions.handle(message({ text: 'cancelar', via: 'owner_reply' }))
    expect(seen).toEqual(['note'])
    const [reply] = await said()
    expect(reply?.startsWith('Entrega cancelada.')).toBe(true)
    expect(memory.requests[0]?.status).toBe('completed')
  })

  test('fluxo dono sem cancelamento próprio (null): o pedido só fecha como cancelado', async () => {
    const { memory, message, said, sessions } = setup({ cancel: async () => null })
    await sessions.handle(message({ text: '' }))
    await said()
    await sessions.handle(message({ text: 'cancelar', via: 'owner_reply' }))
    expect(await said()).toEqual([GROUP_REQUEST_TEXT.cancelled])
    expect(memory.requests[0]?.status).toBe('cancelled')
  })

  test('cada pergunta nova do bot avisa quem espera resposta; fim do pedido não', async () => {
    const asked: string[] = []
    const { message, sessions } = setup({
      onQuestionAsked: ({ groupJid, owner }) => {
        asked.push(`${groupJid}:${owner}`)
      },
    })
    await sessions.handle(message({ text: '' }))
    expect(asked).toEqual([`${GROUP}:${DRIVER}`])
    await sessions.handle(message({ text: '123', via: 'owner_reply' }))
    expect(asked).toHaveLength(1)
  })

  test('o fim do pedido (concluído, cancelado ou abandonado) avisa; pergunta nova não', async () => {
    const closed: string[] = []
    const { message, sessions } = setup({
      onRequestClosed: ({ driverId, groupJid }) => {
        closed.push(`${groupJid}:${driverId}`)
      },
    })
    await sessions.handle(message({ text: '' }))
    expect(closed).toEqual([])
    await sessions.handle(message({ text: '123', via: 'owner_reply' }))
    expect(closed).toEqual([`${GROUP}:${DRIVER_ID}`])
    await sessions.handle(message({ text: '' }))
    await sessions.handle(message({ text: 'cancelar', via: 'owner_reply' }))
    expect(closed).toHaveLength(2)
    await sessions.handle(message({ text: '' }))
    for (const text of ['abc', 'def', 'ghi']) {
      await sessions.handle(message({ text, via: 'owner_reply' }))
    }
    expect(closed).toHaveLength(3)
  })

  test('três respostas que não cabem encerram o pedido e avisam o suporte', async () => {
    const { memory, message, said, sessions } = setup()

    await sessions.handle(message({ text: '' }))
    await said()
    await sessions.handle(message({ text: 'abc', via: 'owner_reply' }))
    await sessions.handle(message({ text: 'def', via: 'owner_reply' }))
    expect(await said()).toEqual([
      'Não entendi: a nota tem só números.\nQual a nota?',
      'Não entendi: a nota tem só números.\nQual a nota?',
    ])
    await sessions.handle(message({ text: 'ghi', via: 'owner_reply' }))
    expect(await said()).toEqual([GROUP_REQUEST_TEXT.gaveUp])
    expect(memory.requests[0]?.status).toBe('abandoned')
  })

  test('resposta certa zera as tentativas', async () => {
    const { memory, message, sessions } = setup()

    await sessions.handle(message({ text: '' }))
    await sessions.handle(message({ text: 'abc', via: 'owner_reply' }))
    expect(memory.requests[0]?.attempts).toBe(1)
  })

  test('"cancelar" só vale como comando curto', () => {
    expect(isCancelText('cancelar')).toBe(true)
    expect(isCancelText('Cancela!')).toBe(true)
    expect(isCancelText('quero cancelar')).toBe(true)
    expect(isCancelText('17234')).toBe(false)
    expect(isCancelText('não era para cancelar o boleto da nota 17234, era prorrogar')).toBe(false)
  })
})

describe('pedido no grupo: a resposta marca quem pediu', () => {
  const HELPER = '5516977776666'
  const ATTENDANT = '5516966665555'

  test.each([
    ['motorista', DRIVER],
    ['ajudante', HELPER],
    ['atendente', ATTENDANT],
  ])('a resposta ao %s abre com o @ do número dele', async (_role, sender) => {
    const { idle, message, sent, sessions } = setup()
    await sessions.handle(message({ sender, text: '' }))
    await idle()
    expect(sent[0]?.body.startsWith(`@${sender} ${HELLO}`)).toBe(true)
  })

  test('a recusa por pedido ocupado também marca quem escreveu', async () => {
    const { idle, message, sent, sessions } = setup()
    await sessions.handle(message({ text: '' }))
    await sessions.handle(message({ sender: HELPER, text: '' }))
    await idle()
    expect(sent.at(-1)?.body.startsWith(`@${HELPER} `)).toBe(true)
  })
})

describe('pedido no grupo: envio da resposta', () => {
  // Uma resposta é UMA mensagem (o espaçador do Evolution segurava a segunda e a pergunta chegava depois da resposta).
  test('cada resposta sai numa mensagem só, em ordem; a que falha vai a log e não segura as seguintes', async () => {
    const sent: string[] = []
    const warnings: unknown[] = []
    const sender = createEvolutionGroupReplySender({
      logger: { ...silentLogger(), warn: (_message, fields) => warnings.push(fields) },
      sendText: async ({ body, number }) => {
        expect(number).toBe(GROUP)
        if (body === 'falha') throw new Error('down')
        sent.push(body)
      },
    })
    sender.send({ companyId: COMPANY_ID, groupJid: GROUP, texts: ['a', 'b'] })
    sender.send({ companyId: COMPANY_ID, groupJid: GROUP, texts: ['falha'] })
    sender.send({ companyId: COMPANY_ID, groupJid: GROUP, texts: ['c'] })
    await sender.idle()
    expect(sent).toEqual(['a\n\nb', 'c'])
    expect(warnings).toHaveLength(1)
    expect(JSON.stringify(warnings)).not.toContain(GROUP)
  })
})
