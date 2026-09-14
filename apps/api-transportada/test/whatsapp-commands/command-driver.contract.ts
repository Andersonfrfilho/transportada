/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T006 — o despachante: a mensagem recebida vira passo de fluxo. Os fakes são das portas;
 * o interpretador é o `FlowInterpreter` de verdade do pacote, para que "avançar" aqui signifique o
 * mesmo que em produção.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
  FlowGraphData,
  WhatsAppMessage,
} from '@adatechnology/meta-whatsapp-contracts'
import { FlowInterpreter } from '@adatechnology/meta-whatsapp-module'

import { createRateLimiter, type RateLimiter } from '../../src/http/rate-limiter.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import type { ResolveWhatsAppActorResult } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import {
  WHATSAPP_COMMAND_RATE_LIMIT,
  WHATSAPP_DENIED_REPLY,
  WHATSAPP_HANDOFF_REPLY,
} from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'
import {
  WhatsAppCommandDeniedError,
  WhatsAppCommandHandoffRequestedError,
} from '../../src/whatsapp-commands/domain/whatsapp-command.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000021'
const USER_ID = '00000000-0000-4000-8000-000000000022'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000023'
const PHONE = '5516999991234'
const FREE_TEXT = 'quero cancelar tudo agora'
const FLOW_KEY = 'contract-root'

const GRAPH: FlowGraphData = {
  key: FLOW_KEY,
  label: 'Contrato',
  nodes: {
    done_a: { directMessage: 'Feito A', id: 'done_a', type: 'action' },
    guarded: { actionKind: 'contract.guarded', id: 'guarded', type: 'action' },
    menu: {
      fallbackMessage: 'Escolha uma das opções.',
      id: 'menu',
      next: { byAnswer: { a: 'done_a', g: 'guarded' }, default: 'menu' },
      options: [
        ['a', '🅰️ Opção A'],
        ['g', '🔒 Protegida'],
      ],
      question: 'O que você quer fazer?',
      type: 'menu',
    },
  },
  startNodeId: 'menu',
  version: 1,
}

type SentMessage =
  | { readonly kind: 'text'; readonly to: string; readonly body: string }
  | { readonly kind: 'buttons'; readonly to: string; readonly body: string; readonly ids: string[] }
  | { readonly kind: 'list'; readonly to: string; readonly body: string; readonly ids: string[] }

type HarnessOptions = {
  readonly actor?: 'authorized' | 'denied'
  readonly graph?: FlowGraphData
  readonly rateLimiter?: RateLimiter
  readonly failSending?: boolean
}

async function buildAuthorizedActor(): Promise<ResolveWhatsAppActorResult> {
  const tenantContext = new TenantContextService({
    repository: {
      findActiveByUserAndCompany: async () => ({
        grantedPermissions: [],
        membershipId: MEMBERSHIP_ID,
        roles: ['driver'],
      }),
    },
  })
  const context = await tenantContext.resolveCompanyForUser({
    channel: 'whatsapp',
    companyId: COMPANY_ID,
    userId: USER_ID,
  })
  if (context === null) throw new Error('fixture sem contexto')

  return { context, status: 'authorized' }
}

function createHarness(options: HarnessOptions = {}) {
  const sent: SentMessage[] = []
  const logged: { message: string; meta?: unknown }[] = []
  const storedContexts: Record<string, unknown>[] = []
  const handoffs: string[] = []
  const actorLookups: { companyId: string; fromPhone: string }[] = []
  const position: { value: WhatsAppSessionPosition } = {
    value: { context: {}, currentNodeId: null, currentState: 'start', flowKey: null },
  }
  let sessionReads = 0

  const sessions: WhatsAppCommandSessionPort = {
    async getContext() {
      sessionReads += 1
      return position.value
    },
    async requestHuman(_companyId, number) {
      handoffs.push(number)
    },
    async setFlowPosition(_companyId, _number, flowKey, currentNodeId) {
      position.value = { ...position.value, currentNodeId, flowKey }
    },
    async setState(_companyId, _number, currentState, context) {
      storedContexts.push(context ?? {})
      position.value = { ...position.value, context: context ?? {}, currentState }
    },
  }

  const guard = (): void => {
    if (options.failSending === true) throw new Error('graph api down')
  }
  const sender: WhatsAppMessageSenderPort = {
    async sendButtons({ body, buttons, to }) {
      guard()
      sent.push({ body, ids: buttons.map((button) => button.id), kind: 'buttons', to })
    },
    async sendList({ body, rows, to }) {
      guard()
      sent.push({ body, ids: rows.map((row) => row.id), kind: 'list', to })
    },
    async sendText({ body, to }) {
      guard()
      sent.push({ body, kind: 'text', to })
    },
  }

  const interpreter = new FlowInterpreter()
  interpreter.registerFlowAction('contract.guarded', async () => {
    throw new WhatsAppCommandDeniedError('permission')
  })
  interpreter.registerFlowAction('contract.handoff', async () => {
    throw new WhatsAppCommandHandoffRequestedError()
  })

  const record = (message: string, meta?: unknown): void => {
    logged.push({ message, ...(meta === undefined ? {} : { meta }) })
  }

  const onMessageReceived = createWhatsAppCommandDriver({
    channel: {} as ChannelAdapterInterface,
    clock: () => new Date('2026-09-11T12:00:00.000Z'),
    graphs: createStaticWhatsAppFlowGraphProvider({
      graphs: [options.graph ?? GRAPH],
      rootFlowKey: (options.graph ?? GRAPH).key,
    }),
    interpreter,
    logger: { error: record, info: record, warn: record },
    rateLimiter: options.rateLimiter ?? createRateLimiter(),
    resolveActor: async (input) => {
      actorLookups.push({ companyId: input.companyId, fromPhone: input.fromPhone })
      return options.actor === 'denied'
        ? { reason: 'unknown_phone', status: 'denied' }
        : buildAuthorizedActor()
    },
    sender,
    sessions,
  })

  return {
    actorLookups,
    handoffs,
    logged,
    onMessageReceived,
    position,
    sent,
    sessionReads: () => sessionReads,
    storedContexts,
  }
}

function buildSession(mode: 'bot' | 'human' = 'bot'): ConversationSession {
  return {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {},
    createdAt: '2026-09-11T12:00:00.000Z',
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-1',
    lastActivity: '2026-09-11T12:00:00.000Z',
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode,
    updatedAt: '2026-09-11T12:00:00.000Z',
    whatsappNumber: PHONE,
  }
}

function text(body: string): WhatsAppMessage {
  return { from: PHONE, id: crypto.randomUUID(), text: { body }, type: 'text' }
}

function button(id: string): WhatsAppMessage {
  return {
    from: PHONE,
    id: crypto.randomUUID(),
    interactive: { button_reply: { id, title: id }, type: 'button_reply' },
    type: 'interactive',
  }
}

describe('o despachante do WhatsApp (spec 144 T006)', () => {
  test('sem posição, qualquer mensagem abre o menu raiz em botões e grava a posição', async () => {
    const harness = createHarness()

    const outcome = await harness.onMessageReceived(text('oi'), buildSession())

    expect(outcome).toEqual({ outcome: 'handled' })
    expect(harness.sent).toEqual([
      { body: 'O que você quer fazer?', ids: ['a', 'g'], kind: 'buttons', to: PHONE },
    ])
    expect(harness.position.value).toMatchObject({ currentNodeId: 'menu', flowKey: FLOW_KEY })
    expect(harness.actorLookups).toEqual([{ companyId: COMPANY_ID, fromPhone: PHONE }])
  })

  /**
   * T020 (B5): a FlowAction que recusou duas respostas de lista seguidas não chama a pessoa sozinha —
   * o despachante chama, pelo mesmo `handOff` da resposta fora do menu.
   */
  test('FlowAction que pede uma pessoa: handoff, resposta de handoff e posição limpa', async () => {
    const graph: FlowGraphData = {
      ...GRAPH,
      nodes: {
        ...GRAPH.nodes,
        handoff: { actionKind: 'contract.handoff', id: 'handoff', type: 'action' },
        menu: {
          fallbackMessage: 'Escolha uma das opções.',
          id: 'menu',
          next: { byAnswer: { a: 'done_a', h: 'handoff' }, default: 'menu' },
          options: [
            ['a', '🅰️ Opção A'],
            ['h', '🙋 Pessoa'],
          ],
          question: 'O que você quer fazer?',
          type: 'menu',
        },
      },
    }
    const harness = createHarness({ graph })
    await harness.onMessageReceived(text('oi'), buildSession())

    await harness.onMessageReceived(button('h'), buildSession())

    expect(harness.handoffs).toEqual([PHONE])
    expect(harness.sent.at(-1)).toEqual({ body: WHATSAPP_HANDOFF_REPLY, kind: 'text', to: PHONE })
    expect(harness.position.value).toMatchObject({ currentNodeId: null, flowKey: null })
  })

  test('resposta válida avança; nó terminal manda a mensagem dele e limpa a posição', async () => {
    const harness = createHarness()
    await harness.onMessageReceived(text('oi'), buildSession())

    await harness.onMessageReceived(button('a'), buildSession())

    expect(harness.sent.at(-1)).toEqual({ body: 'Feito A', kind: 'text', to: PHONE })
    expect(harness.position.value).toMatchObject({ currentNodeId: null, flowKey: null })
  })

  /** D8: texto livre em nó de escolha nunca avança, nem quando parece um comando. */
  test('texto livre em nó de escolha não avança e recebe o fallbackMessage', async () => {
    const harness = createHarness()
    await harness.onMessageReceived(text('oi'), buildSession())

    await harness.onMessageReceived(text(FREE_TEXT), buildSession())

    expect(harness.sent.at(-1)).toEqual({
      body: 'Escolha uma das opções.',
      kind: 'text',
      to: PHONE,
    })
    expect(harness.position.value.currentNodeId).toBe('menu')
    expect(harness.position.value.context).toEqual({ whatsappInvalidAttempts: 1 })
  })

  test('id de botão que o nó não oferece também é resposta inválida', async () => {
    const harness = createHarness()
    await harness.onMessageReceived(text('oi'), buildSession())

    await harness.onMessageReceived(button('forjado'), buildSession())

    expect(harness.position.value.currentNodeId).toBe('menu')
    expect(harness.sent.at(-1)?.body).toBe('Escolha uma das opções.')
  })

  test('a segunda resposta inválida chama uma pessoa', async () => {
    const harness = createHarness()
    await harness.onMessageReceived(text('oi'), buildSession())

    await harness.onMessageReceived(text(FREE_TEXT), buildSession())
    await harness.onMessageReceived(text(FREE_TEXT), buildSession())

    expect(harness.handoffs).toEqual([PHONE])
    expect(harness.sent.at(-1)).toEqual({ body: WHATSAPP_HANDOFF_REPLY, kind: 'text', to: PHONE })
    expect(harness.position.value).toMatchObject({
      context: {},
      currentNodeId: null,
      flowKey: null,
    })
  })

  test('uma resposta válida zera as tentativas', async () => {
    /** Nó `action` sem handler é terminal no interpretador; a volta ao menu é por `condition`. */
    const harness = createHarness({
      graph: {
        ...GRAPH,
        nodes: {
          ...GRAPH.nodes,
          done_a: {
            conditionContextKey: 'never',
            conditionOperator: '==',
            conditionValue: 'set',
            id: 'done_a',
            next: 'menu',
            type: 'condition',
          },
        },
      },
    })
    await harness.onMessageReceived(text('oi'), buildSession())
    await harness.onMessageReceived(text(FREE_TEXT), buildSession())

    await harness.onMessageReceived(button('a'), buildSession())
    await harness.onMessageReceived(text(FREE_TEXT), buildSession())

    expect(harness.handoffs).toEqual([])
    expect(harness.position.value.context).toEqual({ whatsappInvalidAttempts: 1 })
  })

  test('sessão em modo humano segue para a inbox, sem resolver ator nem responder', async () => {
    const harness = createHarness()

    const outcome = await harness.onMessageReceived(text('oi'), buildSession('human'))

    expect(outcome).toEqual({ outcome: 'continue' })
    expect(harness.sent).toEqual([])
    expect(harness.actorLookups).toEqual([])
  })

  test('número recusado recebe a resposta neutra uma vez por janela', async () => {
    const harness = createHarness({ actor: 'denied' })

    const first = await harness.onMessageReceived(text('oi'), buildSession())
    const second = await harness.onMessageReceived(text('oi de novo'), buildSession())

    expect(first).toEqual({ outcome: 'handled' })
    expect(second).toEqual({ outcome: 'handled' })
    expect(harness.sent).toEqual([{ body: WHATSAPP_DENIED_REPLY, kind: 'text', to: PHONE }])
    expect(harness.sessionReads()).toBe(0)
    const denials = harness.logged.filter((entry) => entry.message === 'whatsapp.command.denied')
    expect(denials).toHaveLength(2)
    expect(denials[0]?.meta).toMatchObject({ phone: '****1234', reason: 'unknown_phone' })
  })

  test(`o teto de ${WHATSAPP_COMMAND_RATE_LIMIT.maxRequests} mensagens por número corta antes de qualquer banco`, async () => {
    const harness = createHarness({ actor: 'denied' })

    for (let index = 0; index < WHATSAPP_COMMAND_RATE_LIMIT.maxRequests; index += 1) {
      await harness.onMessageReceived(text('oi'), buildSession())
    }
    const lookupsBeforeLimit = harness.actorLookups.length
    const outcome = await harness.onMessageReceived(text('oi'), buildSession())

    expect(outcome).toEqual({ outcome: 'handled' })
    expect(lookupsBeforeLimit).toBe(WHATSAPP_COMMAND_RATE_LIMIT.maxRequests)
    expect(harness.actorLookups).toHaveLength(WHATSAPP_COMMAND_RATE_LIMIT.maxRequests)
    expect(harness.logged.at(-1)).toEqual({
      message: 'whatsapp.command.denied',
      meta: { companyId: COMPANY_ID, phone: '****1234', reason: 'rate_limited' },
    })
  })

  /** D2: a FlowAction re-resolve o ator; recusa dentro da ação vira a mesma resposta neutra. */
  test('ação recusada por permissão responde neutro e limpa a posição', async () => {
    const harness = createHarness()
    await harness.onMessageReceived(text('oi'), buildSession())

    await harness.onMessageReceived(button('g'), buildSession())

    expect(harness.sent.at(-1)).toEqual({ body: WHATSAPP_DENIED_REPLY, kind: 'text', to: PHONE })
    expect(harness.position.value).toMatchObject({ currentNodeId: null, flowKey: null })
    expect(harness.logged.at(-1)).toMatchObject({
      message: 'whatsapp.command.denied',
      meta: { reason: 'permission' },
    })
  })

  test('falha ao enviar não derruba o webhook: fica no log, sem corpo nem telefone', async () => {
    const harness = createHarness({ failSending: true })

    const outcome = await harness.onMessageReceived(text(FREE_TEXT), buildSession())

    expect(outcome).toEqual({ outcome: 'handled' })
    expect(harness.logged.at(-1)?.message).toBe('whatsapp.command.failed')
  })

  test('o contexto guardado não carrega ator, permissão nem telefone', async () => {
    const harness = createHarness()
    await harness.onMessageReceived(text('oi'), buildSession())
    await harness.onMessageReceived(text(FREE_TEXT), buildSession())
    await harness.onMessageReceived(button('a'), buildSession())

    const serialized = JSON.stringify(harness.storedContexts)
    expect(serialized).not.toContain(PHONE)
    expect(serialized).not.toContain(USER_ID)
    expect(serialized).not.toContain(MEMBERSHIP_ID)
    expect(serialized).not.toContain('permission')
    expect(serialized).not.toContain(FREE_TEXT)
  })

  test('nenhum log leva o telefone cru nem o que a pessoa escreveu', async () => {
    const harness = createHarness()
    await harness.onMessageReceived(text('oi'), buildSession())
    await harness.onMessageReceived(text(FREE_TEXT), buildSession())
    await harness.onMessageReceived(text(FREE_TEXT), buildSession())
    const denied = createHarness({ actor: 'denied' })
    await denied.onMessageReceived(text(FREE_TEXT), buildSession())

    const serialized = JSON.stringify([...harness.logged, ...denied.logged])
    expect(serialized).not.toContain(PHONE)
    expect(serialized).not.toContain(FREE_TEXT)
  })
})

describe('a escolha renderizada (spec 144 T006, política definitiva na T007)', () => {
  function menuWith(count: number): FlowGraphData {
    const options = Array.from(
      { length: count },
      (_, index) => [`o${index}`, `Opção ${index}`] as [string, string],
    )
    return {
      ...GRAPH,
      nodes: { menu: { ...GRAPH.nodes.menu, id: 'menu', options, type: 'menu' } },
    }
  }

  test('de 4 a 10 opções sai como lista', async () => {
    const harness = createHarness({ graph: menuWith(4) })

    await harness.onMessageReceived(text('oi'), buildSession())

    expect(harness.sent[0]?.kind).toBe('list')
  })

  /** T007: acima de 10 pagina — 9 opções + "➡️ Mais" na primeira página, nunca "as 10 primeiras". */
  test('acima de 10 pagina: a primeira página traz 9 opções e ➡️ Mais', async () => {
    const harness = createHarness({ graph: menuWith(12) })

    await harness.onMessageReceived(text('oi'), buildSession())

    const [first] = harness.sent
    expect(first?.kind).toBe('list')
    expect(first?.kind === 'list' ? first.ids : []).toEqual([
      'o0',
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'o6',
      'o7',
      'o8',
      '__more__:2',
    ])
  })

  test('__more__ avança a página sem contar tentativa inválida nem chamar o interpretador', async () => {
    const harness = createHarness({ graph: menuWith(12) })
    await harness.onMessageReceived(text('oi'), buildSession())
    const storedBeforeMore = harness.storedContexts.length

    await harness.onMessageReceived(button('__more__:2'), buildSession())

    const [, second] = harness.sent
    expect(second?.kind).toBe('list')
    expect(second?.kind === 'list' ? second.ids : []).toEqual(['__back__:1', 'o9', 'o10', 'o11'])
    expect(harness.position.value).toMatchObject({ currentNodeId: 'menu', flowKey: FLOW_KEY })
    /** Re-render de página não persiste nada: nem posição nova, nem contexto, nem tentativa. */
    expect(harness.storedContexts).toHaveLength(storedBeforeMore)
    expect(harness.position.value.context).toEqual({})
  })

  test('__back__ volta para a página anterior, com o mesmo __more__ estável', async () => {
    const harness = createHarness({ graph: menuWith(12) })
    await harness.onMessageReceived(text('oi'), buildSession())
    await harness.onMessageReceived(button('__more__:2'), buildSession())
    const storedBeforeBack = harness.storedContexts.length

    await harness.onMessageReceived(button('__back__:1'), buildSession())

    const third = harness.sent.at(-1)
    expect(third?.kind).toBe('list')
    expect(third?.kind === 'list' ? third.ids : []).toEqual([
      'o0',
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'o6',
      'o7',
      'o8',
      '__more__:2',
    ])
    expect(harness.storedContexts).toHaveLength(storedBeforeBack)
  })
})
