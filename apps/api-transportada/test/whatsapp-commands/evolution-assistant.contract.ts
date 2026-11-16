/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O assistente de contas no número Evolution: o despachante da Meta (de verdade, com o `FlowInterpreter` do pacote)
 * falando por um canal de texto. Os fakes são só do que é de fora: sessão (memória), envio e ator.
 */
import { describe, expect, test } from 'bun:test'
import type { ConversationSession, FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import { FlowInterpreter } from '@adatechnology/meta-whatsapp-module'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import {
  createEvolutionAssistant,
  EVOLUTION_ASSISTANT_TEXT,
  type EvolutionAssistantSessions,
} from '../../src/whatsapp-commands/application/evolution-assistant.service.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppSessionPosition,
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import {
  renderEvolutionChoice,
  resolveEvolutionChoice,
} from '../../src/whatsapp-commands/domain/whatsapp-evolution-choice.policy.js'
import { createEvolutionAssistantTransport } from '../../src/whatsapp-commands/infrastructure/evolution-assistant-channel.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000031'
const PHONE = '5516999990000'
const ROOT = 'contract-root'

const ROWS = [
  { id: 'a', title: '💰 Lançar conta' },
  { id: 'b', title: '🚚 Minha viagem' },
]

describe('a escolha numerada do Evolution', () => {
  test('a lista vira texto numerado com a instrução de resposta', () => {
    expect(renderEvolutionChoice({ body: 'O que você quer fazer?', options: ROWS })).toBe(
      'O que você quer fazer?\n\n*1* - 💰 Lançar conta\n*2* - 🚚 Minha viagem\n\n_Responda com o número._',
    )
  })

  test('o número ou o nome (sem ícone nem acento) volta a ser o id; o resto segue como digitado', () => {
    expect(resolveEvolutionChoice('2', ROWS)).toBe('b')
    expect(resolveEvolutionChoice('lançar conta', ROWS)).toBe('a')
    expect(resolveEvolutionChoice('LANCAR CONTA', ROWS)).toBe('a')
    expect(resolveEvolutionChoice('3', ROWS)).toBeUndefined()
    expect(resolveEvolutionChoice('150,00', ROWS)).toBeUndefined()
    expect(resolveEvolutionChoice('', ROWS)).toBeUndefined()
  })
})

describe('o canal do assistente no Evolution', () => {
  function transport(now = new Date('2026-11-16T12:00:00.000Z')) {
    const sent: string[] = []
    const clock = { now }
    const made = createEvolutionAssistantTransport({
      clock: () => clock.now,
      companyId: COMPANY_ID,
      send: ({ text }) => {
        sent.push(text)
      },
    })
    return { clock, made, sent }
  }

  test('lista e botões saem numerados e as linhas ficam lembradas', async () => {
    const { made, sent } = transport()
    await made.sender.sendList({ body: 'Qual?', buttonLabel: 'Ver', rows: ROWS, to: PHONE })

    expect(sent).toEqual([renderEvolutionChoice({ body: 'Qual?', options: ROWS })])
    expect(made.offered({ companyId: COMPANY_ID, phone: PHONE })).toEqual(ROWS)

    await made.channel.sendInteractiveButtons?.({ body: 'Sim?', buttons: ROWS, to: PHONE })
    expect(sent).toHaveLength(2)
  })

  test('um texto livre depois da escolha apaga as linhas: "1" como valor não é opção', async () => {
    const { made } = transport()
    await made.sender.sendList({ body: 'Qual?', buttonLabel: 'Ver', rows: ROWS, to: PHONE })
    await made.sender.sendText({ body: 'Quanto foi?', to: PHONE })

    expect(made.offered({ companyId: COMPANY_ID, phone: PHONE })).toEqual([])
  })

  test('as linhas vencem em 30 minutos e mídia não é suportada (falha alta, nunca silêncio)', async () => {
    const { clock, made } = transport()
    await made.sender.sendList({ body: 'Qual?', buttonLabel: 'Ver', rows: ROWS, to: PHONE })
    clock.now = new Date(clock.now.getTime() + 31 * 60_000)

    expect(made.offered({ companyId: COMPANY_ID, phone: PHONE })).toEqual([])
    await expect(made.channel.fetchMediaAsBase64('m')).rejects.toThrow('does not support')
  })
})

/** O grafo mínimo no formato do real: menu raiz → `expense_start` (ação) → `expense_entry` (resposta) → `expense_router`. */
const GRAPH: FlowGraphData = {
  key: ROOT,
  label: 'Contrato',
  nodes: {
    expense_entry: {
      contextKey: 'answer',
      id: 'expense_entry',
      next: 'expense_router',
      question: 'Responda à pergunta acima.',
      type: 'entrada_choice',
    },
    expense_router: { actionKind: 'contract.router', id: 'expense_router', type: 'action' },
    expense_start: { actionKind: 'contract.start', id: 'expense_start', type: 'action' },
    menu: {
      fallbackMessage: 'Toque numa das opções do menu.',
      id: 'menu',
      next: { byAnswer: { lancar_conta: 'expense_start' }, default: 'menu' },
      options: [['lancar_conta', '💰 Lançar conta']],
      question: 'Olá! O que você quer fazer?',
      type: 'menu',
    },
  },
  startNodeId: 'menu',
  version: 1,
}

async function authorizedActor() {
  const tenantContext = new TenantContextService({
    repository: {
      findActiveByUserAndCompany: async () => ({
        grantedPermissions: ['expenses.manage'],
        membershipId: '00000000-0000-4000-8000-000000000033',
        roles: ['finance'],
      }),
    },
  })
  const context = await tenantContext.resolveCompanyForUser({
    channel: 'whatsapp',
    companyId: COMPANY_ID,
    userId: '00000000-0000-4000-8000-000000000032',
  })
  if (context === null) throw new Error('fixture sem contexto')
  return { context, status: 'authorized' as const }
}

function harness(options: { readonly denied?: boolean } = {}) {
  const sent: string[] = []
  const clock = { now: new Date('2026-11-16T12:00:00.000Z') }
  const position: {
    value: WhatsAppSessionPosition & { lastActivity: Date }
  } = {
    value: {
      context: {},
      currentNodeId: null,
      currentState: 'idle',
      flowKey: null,
      lastActivity: clock.now,
    },
  }
  const sessions: WhatsAppCommandSessionPort & EvolutionAssistantSessions = {
    async getContext() {
      return position.value
    },
    async requestHuman() {},
    async setFlowPosition(_companyId, _number, flowKey, currentNodeId) {
      position.value = { ...position.value, currentNodeId, flowKey, lastActivity: clock.now }
    },
    async setState(_companyId, _number, currentState, context) {
      position.value = {
        ...position.value,
        context: context ?? {},
        currentState,
        lastActivity: clock.now,
      }
    },
  }
  const transport = createEvolutionAssistantTransport({
    clock: () => clock.now,
    companyId: COMPANY_ID,
    send: ({ text }) => {
      sent.push(text)
    },
  })
  const interpreter = new FlowInterpreter()
  const answers: unknown[] = []
  interpreter.registerFlowAction('contract.start', async ({ channel, session }) => {
    await channel.sendText(session.whatsappNumber, 'Qual o nome da conta?')
    return { next: 'expense_entry' }
  })
  interpreter.registerFlowAction('contract.router', async ({ channel, context, session }) => {
    answers.push(context.answer)
    await channel.sendText(session.whatsappNumber, `Conta ${String(context.answer)} salva.`)
    return { next: 'expense_entry' }
  })
  const handler = createWhatsAppCommandDriver({
    channel: transport.channel,
    clock: () => clock.now,
    graphs: createStaticWhatsAppFlowGraphProvider({ graphs: [GRAPH], rootFlowKey: ROOT }),
    interpreter,
    logger: { error() {}, info() {}, warn() {} },
    rateLimiter: createRateLimiter(),
    resolveActor: async () =>
      options.denied === true ? { reason: 'unknown_phone', status: 'denied' } : authorizedActor(),
    sender: transport.sender,
    sessions,
  })
  const session: ConversationSession = {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {},
    createdAt: clock.now.toISOString(),
    currentNodeId: null,
    currentState: 'idle',
    flowKey: null,
    humanRequestedAt: null,
    id: 'S1',
    lastActivity: clock.now.toISOString(),
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: clock.now.toISOString(),
    whatsappNumber: PHONE,
  }
  const assistant = createEvolutionAssistant({
    clock: () => clock.now,
    companyId: COMPANY_ID,
    handler,
    logger: { error() {}, info() {}, warn() {} },
    openSession: async () => session,
    rootFlowKey: ROOT,
    sessions,
    transport,
  })
  return { answers, assistant, clock, position, sent }
}

describe('o assistente de contas pelo Evolution (despachante de verdade)', () => {
  test('abrir "Lançar conta" faz a primeira pergunta do fluxo e deixa a pessoa no meio dele', async () => {
    const { assistant, position, sent } = harness()

    expect(await assistant.isActive({ phone: PHONE })).toBe(false)
    await assistant.start({ phone: PHONE, providerMessageId: 'M1' })

    // O interpretador também diz a pergunta do nó de resposta; em produção o turno junta tudo numa mensagem.
    expect(sent).toEqual(['Qual o nome da conta?', 'Responda à pergunta acima.'])
    expect(position.value).toMatchObject({ currentNodeId: 'expense_entry', flowKey: ROOT })
    expect(await assistant.isActive({ phone: PHONE })).toBe(true)
  })

  test('as respostas seguintes (texto livre) andam o fluxo', async () => {
    const { answers, assistant, sent } = harness()
    await assistant.start({ phone: PHONE, providerMessageId: 'M1' })

    expect(await assistant.handle({ phone: PHONE, providerMessageId: 'M2', text: 'Luz' })).toBe(
      'handled',
    )

    expect(answers).toEqual(['Luz'])
    expect(sent).toContain('Conta Luz salva.')
  })

  test('"sair" e "cancelar" fecham a conta e dizem que cancelou; "menu" devolve ao motorista', async () => {
    const first = harness()
    await first.assistant.start({ phone: PHONE, providerMessageId: 'M1' })
    expect(
      await first.assistant.handle({ phone: PHONE, providerMessageId: 'M2', text: 'Sair' }),
    ).toBe('handled')
    expect(first.sent.at(-1)).toBe(EVOLUTION_ASSISTANT_TEXT.cancelled)
    expect(first.position.value).toMatchObject({ currentNodeId: null, flowKey: null })
    expect(await first.assistant.isActive({ phone: PHONE })).toBe(false)

    const second = harness()
    await second.assistant.start({ phone: PHONE, providerMessageId: 'M1' })
    expect(
      await second.assistant.handle({ phone: PHONE, providerMessageId: 'M2', text: 'menu' }),
    ).toBe('released')
    expect(await second.assistant.isActive({ phone: PHONE })).toBe(false)
  })

  test('uma conta parada há mais de 2 horas não prende a conversa: volta ao motorista', async () => {
    const { assistant, clock, position } = harness()
    await assistant.start({ phone: PHONE, providerMessageId: 'M1' })
    clock.now = new Date(clock.now.getTime() + 3 * 60 * 60_000)
    position.value = { ...position.value, lastActivity: new Date('2026-11-16T12:00:00.000Z') }

    expect(await assistant.isActive({ phone: PHONE })).toBe(false)
    expect(position.value).toMatchObject({ currentNodeId: null, flowKey: null })
  })

  test('posição de outro fluxo (a viagem, na Meta) não é conta aberta', async () => {
    const { assistant, position } = harness()
    position.value = { ...position.value, currentNodeId: 'driver_trip_menu', flowKey: ROOT }

    expect(await assistant.isActive({ phone: PHONE })).toBe(false)
  })

  test('sem permissão o despachante recusa e o assistente não deixa posição aberta', async () => {
    const { assistant, sent } = harness({ denied: true })
    await assistant.start({ phone: PHONE, providerMessageId: 'M1' })

    expect(sent).not.toContain('Qual o nome da conta?')
  })
})
