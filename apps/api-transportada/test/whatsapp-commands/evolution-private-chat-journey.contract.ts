/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O chat privado do Evolution, ponta a ponta, pelas peças reais: o JSON cru do `messages.upsert`, o caso de uso do webhook
 * (quem decide entre motorista e assistente), a entrada direta, a sessão do pedido, o fluxo do motorista com o menu e o
 * assistente de contas (FlowInterpreter, ações de contas, canal numerado). Só o banco, o Evolution e as portas de viagem
 * são fakes. Em 16/11/2026 a pessoa digitou "7" (Lançar conta) e "1" (Fixa) e a conversa voltou à mesma pergunta: cada
 * peça tinha teste, e nenhum teste ligava a resposta de um turno ao turno seguinte.
 */
import { describe, expect, test } from 'bun:test'
import type { SessionRepository } from '@adatechnology/meta-whatsapp-module'
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import { createExpenseFlowActions } from '../../src/whatsapp-commands/application/register-expense-flow-actions.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { createWhatsAppTurnReplies } from '../../src/whatsapp-commands/application/whatsapp-turn-replies.service.js'
import {
  createDirectAssistantPort,
  createEvolutionAssistantRegistry,
} from '../../src/whatsapp-commands/infrastructure/evolution-assistant.factory.js'
import {
  WHATSAPP_ROOT_FLOW_GRAPH,
  WHATSAPP_ROOT_FLOW_GRAPH_KEY,
} from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'
import { directWhatsAppChatJid } from '../../src/whatsapp-inbox/domain/whatsapp-chat-jid.policy.js'
import {
  createEvolutionGroupInbound,
  type GroupAudioContext,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import type { EvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import { createWhatsAppEvolutionSecretService } from '../../src/whatsapp/application/whatsapp-evolution-secret.service.js'
import type { WhatsAppEvolutionWebhookRepositoryPort } from '../../src/whatsapp/application/whatsapp-evolution-webhook.port.js'
import { createWhatsAppEvolutionWebhookSecretService } from '../../src/whatsapp/application/whatsapp-evolution-webhook-secret.service.js'
import {
  createWhatsAppEvolutionWebhookUseCase,
  type WhatsAppDirectAssistantPort,
} from '../../src/whatsapp/application/whatsapp-evolution-webhook.use-case.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupRequest,
  GroupRequestRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createWhatsAppGroupRequestSessions } from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000051'
const SETTINGS_ID = '00000000-0000-4000-8000-000000000052'
const WEBHOOK_ID = '00000000-0000-4000-8000-0000000000ab'
const TOKEN = 'segredo-do-webhook-da-empresa'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
/** Motorista e do escritório (o perfil duplo do relato). */
const DUAL = '5516999990001'
/** Só motorista. */
const DRIVER_ONLY = '5516999990002'
/** Só escritório: lança conta, não dirige. */
const OFFICE_ONLY = '5516999990003'
const GROUP = '120363000000000000@g.us'

const silent: ApiLogger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function fakeProvider(): SecretEnvelopeProvider {
  const vault = new Map<string, { aad: string; plaintext: string }>()
  let sequence = 0
  return {
    async decrypt({ additionalAuthenticatedData, envelope }) {
      const stored = vault.get(envelope.ciphertext)
      if (stored === undefined || stored.aad !== decoder.decode(additionalAuthenticatedData)) {
        throw new Error('envelope inválido')
      }
      return encoder.encode(stored.plaintext)
    },
    async encrypt({ additionalAuthenticatedData, plaintext }) {
      sequence += 1
      const ciphertext = `cipher-${sequence}`
      vault.set(ciphertext, {
        aad: decoder.decode(additionalAuthenticatedData),
        plaintext: decoder.decode(plaintext),
      })
      return {
        algorithm: 'A256GCM',
        ciphertext,
        keyId: 'key-1',
        nonce: 'nonce-1',
        version: 1,
      } satisfies SecretEnvelopeV1
    },
  }
}

type Stored = GroupRequest & { status: string }

/** Um pedido aberto por conversa, em memória. */
function memoryRequests(): GroupRequestRepositoryPort {
  const requests: Stored[] = []
  const claimed = new Set<string>()
  const openOf = (groupJid: string) =>
    requests.find((item) => item.groupJid === groupJid && item.status === 'open')
  return {
    async claimMessage({ providerMessageId }) {
      if (claimed.has(providerMessageId)) return false
      claimed.add(providerMessageId)
      return true
    },
    async findOpen({ groupJid }) {
      const open = openOf(groupJid)
      return open === undefined ? null : { ...open }
    },
    async linkMessage() {},
    async open({ driverId, groupJid, now, ownerNumber, step }) {
      if (openOf(groupJid) !== undefined) return null
      const request: Stored = {
        attempts: 0,
        companyId: COMPANY_ID,
        driverId,
        expiresAt: new Date(now.getTime() + 600_000),
        groupJid,
        id: `R${requests.length + 1}`,
        ownerNumber,
        state: {},
        status: 'open',
        step,
        version: 1n,
      }
      requests.push(request)
      return { ...request }
    },
    async update({ attempts, close, id, state, step, version }) {
      const request = requests.find((item) => item.id === id)
      if (request === undefined || request.status !== 'open' || request.version !== version) {
        return false
      }
      Object.assign(request, {
        attempts,
        state,
        step,
        version: version + 1n,
        ...(close === undefined ? {} : { status: close }),
      })
      return true
    },
  }
}

/** A sessão do módulo da Meta, uma linha por telefone, com a forma que o `SessionRepository` devolve. */
function memorySessionRows() {
  const now = new Date('2026-11-16T10:50:00.000Z')
  const rows = new Map<string, Record<string, unknown>>()
  const rowOf = (phone: string) => {
    let row = rows.get(phone)
    if (row === undefined) {
      row = {
        assignedUserId: null,
        companyId: COMPANY_ID,
        context: {},
        createdAt: now,
        currentNodeId: null,
        currentState: 'idle',
        flowKey: null,
        humanRequestedAt: null,
        id: `S-${phone}`,
        lastActivity: now,
        lastAgentReadAt: null,
        lastInboundAt: null,
        mode: 'bot',
        updatedAt: now,
        whatsappNumber: phone,
      }
      rows.set(phone, row)
    }
    return row
  }
  return {
    async getContext(_company: string, phone: string) {
      return rowOf(phone)
    },
    async getOrCreate(_company: string, phone: string) {
      return rowOf(phone)
    },
    async requestHuman() {},
    async setFlowPosition(
      _company: string,
      phone: string,
      flowKey: null | string,
      node: null | string,
    ) {
      Object.assign(rowOf(phone), { currentNodeId: node, flowKey })
    },
    async setState(
      _company: string,
      phone: string,
      state: string,
      context?: Record<string, unknown>,
    ) {
      Object.assign(rowOf(phone), { context: context ?? {}, currentState: state })
    },
  }
}

async function setup() {
  const provider = fakeProvider()
  const scope = { companyId: COMPANY_ID, settingsId: SETTINGS_ID }
  const apiKeySecrets = createWhatsAppEvolutionSecretService({ envelopeProvider: provider })
  const webhookSecrets = createWhatsAppEvolutionWebhookSecretService({
    envelopeProvider: provider,
  })
  const webhookEnvelope = await webhookSecrets.encrypt({ ...scope, webhookToken: TOKEN })

  /** Tudo o que o Evolution mandou de volta: o destino e o corpo, na ordem. */
  const sent: { body: string; number: string }[] = []
  const created: Record<string, unknown>[] = []
  const recorded: { event: string; stopId: string }[] = []
  const turns = createWhatsAppTurnReplies({ logger: silent })
  const replies = createEvolutionGroupReplySender({
    logger: silent,
    async sendText({ body, number }) {
      sent.push({ body, number })
    },
    turnReplies: turns,
  })

  const expenseActions = createExpenseFlowActions({
    createExpense: async (input) => {
      created.push(input as unknown as Record<string, unknown>)
    },
    listCategories: async () => [
      { active: true, id: 'CAT1', name: 'Aluguel', requiresDriver: false },
      { active: true, id: 'CAT2', name: 'Seguro', requiresDriver: false },
    ],
    today: () => '2026-11-16',
  })
  const registry = createEvolutionAssistantRegistry({
    authorization: new AuthorizationService(),
    clock: () => new Date('2026-11-16T10:50:00.000Z'),
    flowActions: expenseActions,
    graphs: createStaticWhatsAppFlowGraphProvider({
      graphs: [WHATSAPP_ROOT_FLOW_GRAPH],
      rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
    }),
    logger: { error() {}, info() {}, warn() {} },
    rateLimiter: createRateLimiter(),
    resolveActor: async ({ fromPhone }) => {
      const tenantContext = new TenantContextService({
        repository: {
          findActiveByUserAndCompany: async () => ({
            grantedPermissions: fromPhone === DRIVER_ONLY ? ['trips.read'] : ['expenses.manage'],
            membershipId: '00000000-0000-4000-8000-000000000053',
            roles: ['finance'],
          }),
        },
      })
      const context = await tenantContext.resolveCompanyForUser({
        channel: 'whatsapp',
        companyId: COMPANY_ID,
        userId: '00000000-0000-4000-8000-000000000054',
      })
      if (context === null) throw new Error('fixture sem contexto')
      return { context, status: 'authorized' as const }
    },
    sessions: memorySessionRows() as unknown as SessionRepository,
    send: ({ companyId, phone, text }) => {
      const groupJid = directWhatsAppChatJid(phone)
      if (groupJid !== null) replies.send({ companyId, groupJid, texts: [text] })
    },
  })
  const directAssistant: WhatsAppDirectAssistantPort = createDirectAssistantPort({
    registry,
    turns,
  })

  const stops = [
    {
      arrivedAt: null,
      completedAt: null,
      documents: [{ number: '17234', separationStatus: 'loaded' as const }],
      enRouteSince: null,
      id: 'S1',
      isAddressReliable: true,
      sequence: 1,
    },
  ]
  const sessions = createWhatsAppGroupRequestSessions({
    clock: () => new Date('2026-11-16T10:50:00.000Z'),
    flow: createGroupDriverFlow({
      expenses: {
        start: ({ companyId, phone }) =>
          directAssistant
            .forCompany(companyId)
            .start({ phone, providerMessageId: crypto.randomUUID() }),
      },
      occurrence: {
        answer: async () => ({ kind: 'done', replies: ['ocorrência'] }),
        initialStep: 'document',
        start: async () => ({ kind: 'done', replies: ['ocorrência'] }),
      },
      stop: createGroupStopFlow({
        clock: () => new Date('2026-11-16T10:50:00.000Z'),
        enRouteMessage: async () => 'a caminho',
        listStops: async () => stops,
        record: async (input) => {
          recorded.push({ event: input.event, stopId: input.stopId })
          return { message: input.event === 'depart' ? 'Saída registrada.' : 'Chegada registrada.' }
        },
      }),
    }),
    logger: silent,
    replies,
    repository: memoryRequests(),
  })

  const identity = {
    async botNumber() {
      throw new Error('o 1:1 não pergunta o número do bot')
    },
    async lidDirectory() {
      throw new Error('o 1:1 não tem participantes de grupo')
    },
  } as unknown as EvolutionGroupIdentity
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger: silent,
    transcriber: { transcribe: async () => '' },
  })
  const driverPhones = new Set([DUAL, DRIVER_ONLY])
  const launcherPhones = new Set([DUAL, OFFICE_ONLY])
  const groupInbound = createEvolutionGroupInbound({
    audio: {
      bot,
      download: async () => ({ data: '', mimeType: 'audio/ogg' }),
      reply: (reply) => replies.send(reply),
      wakePhrase: ['atendimento'],
    },
    findDirectDriver: async ({ phone }) =>
      driverPhones.has(phone) ? { driverId: DRIVER_ID } : null,
    findDirectExpenseLauncher: async ({ phone }) => launcherPhones.has(phone),
    findDirectImporter: async () => false,
    findGroupDriver: async () => ({ driverId: DRIVER_ID }) as never,
    findOpenRequestOwner: (lookup) => sessions.findOpenOwner(lookup),
    handle: (message) => sessions.handle(message),
    identity,
    replyDirect: (reply) => replies.send(reply),
    turnReplies: turns,
  })

  const repository: WhatsAppEvolutionWebhookRepositoryPort = {
    async findByWebhookId({ webhookId }) {
      return webhookId === WEBHOOK_ID
        ? {
            companyId: COMPANY_ID,
            instanceName: 'transportada',
            settingsId: SETTINGS_ID,
            status: 'active',
            webhookEnvelope,
          }
        : null
    },
    async findRegistration() {
      return null
    },
    async markRegistered() {
      return new Date()
    },
    async recordDelivery() {},
    async storeSecret() {},
  }
  const messages: unknown[] = []
  const useCase = createWhatsAppEvolutionWebhookUseCase({
    apiKeySecrets,
    apiPublicUrl: 'https://api.exemplo.com/',
    directAssistant,
    gateway: { async setWebhook() {} },
    groupInbound,
    inbound: {
      consumeDirectLimit: () => true,
      async quotesConversation() {
        return false
      },
      async receiveMessage(input) {
        messages.push(input)
        return 'conversation'
      },
      async receiveStatus() {},
    },
    logger: silent,
    repository,
    webhookSecrets,
  })

  let sequence = 0
  /** Uma mensagem de texto do `from` para o bot, no JSON cru do Evolution. */
  const say = async (from: string, text: string, chat = `${from}@s.whatsapp.net`) => {
    sequence += 1
    const before = sent.length
    await useCase.receive({
      correlationId: `corr-${sequence}`,
      rawBody: JSON.stringify({
        data: {
          key: {
            fromMe: false,
            id: `MSG${sequence}`,
            participant: `${from}@s.whatsapp.net`,
            remoteJid: chat,
          },
          message: { conversation: text },
          messageTimestamp: 1_800_000_000 + sequence,
          pushName: 'Pessoa',
        },
        event: 'messages.upsert',
        instance: 'transportada',
      }),
      token: TOKEN,
      webhookId: WEBHOOK_ID,
    })
    await bot.idle()
    await replies.idle()
    const batch = sent.splice(before)
    return batch.map((item) => {
      // Tudo no privado de quem escreveu: nada vaza para outro chat.
      expect(item.number).toBe(chat)
      return item.body
    })
  }
  return { created, messages, recorded, say, sent }
}

/** O número do item do menu cujo texto tem `title`. */
function optionNumber(menu: string, title: string): string {
  const line = menu.split('\n').find((candidate) => candidate.includes(title))
  const match = line?.match(/(\d+)/)
  if (match === null || match === undefined)
    throw new Error(`"${title}" não está no menu:\n${menu}`)
  return match[1] ?? ''
}

describe('privado do Evolution: a pessoa de perfil duplo (motorista e escritório)', () => {
  test('oi → menu com Lançar conta → tipo → nome → categoria → valor → dia → confirma e grava', async () => {
    const t = await setup()
    const menu = (await t.say(DUAL, 'oi')).join('\n')
    expect(menu).toContain('Lançar conta')
    const number = optionNumber(menu, 'Lançar conta')

    const kind = (await t.say(DUAL, number)).join('\n')
    expect(kind).toContain('Que tipo de conta você quer lançar?')

    // O relato: "1" tem de escolher "Fixa", não repetir a pergunta.
    const afterKind = (await t.say(DUAL, '1')).join('\n')
    expect(afterKind).not.toContain('Que tipo de conta')

    expect((await t.say(DUAL, 'Aluguel do galpão')).join('\n')).toContain('*1* - ')
    expect((await t.say(DUAL, '1')).join('\n')).toContain('valor')
    expect((await t.say(DUAL, '4500')).join('\n')).toContain('*1* - ')
    await t.say(DUAL, '1')
    const confirm = (await t.say(DUAL, '5')).join('\n')
    expect(confirm).toContain('Aluguel do galpão')
    expect(t.created).toEqual([])
    await t.say(DUAL, '1')

    expect(t.created).toHaveLength(1)
    expect(t.created[0]).toMatchObject({
      categoryId: 'CAT1',
      channel: 'whatsapp',
      expectedAmount: '4500.00',
      kind: 'fixed',
      name: 'Aluguel do galpão',
    })
    // A mensagem do Evolution nunca vai para a conversa do painel.
    expect(t.messages).toEqual([])
  })

  test('terminada a conta, "oi" volta ao menu do motorista e "Saí" ainda funciona', async () => {
    const t = await setup()
    const menu = (await t.say(DUAL, 'oi')).join('\n')
    await t.say(DUAL, optionNumber(menu, 'Lançar conta'))
    await t.say(DUAL, 'sair')

    const again = (await t.say(DUAL, 'oi')).join('\n')
    expect(again).toContain('Lançar conta')
    expect(again).toContain('Saí')
  })

  test('"cancelar" no meio de cada pergunta da conta encerra sem gravar e libera o chat', async () => {
    const t = await setup()
    const number = optionNumber((await t.say(DUAL, 'oi')).join('\n'), 'Lançar conta')
    const answers = ['1', 'Aluguel do galpão', '1', '4500']
    for (let depth = 0; depth <= answers.length; depth += 1) {
      if (depth > 0) await t.say(DUAL, 'oi')
      await t.say(DUAL, number)
      for (const answer of answers.slice(0, depth)) await t.say(DUAL, answer)
      expect((await t.say(DUAL, 'cancelar')).join('\n')).toContain('cancelada')
    }
    expect(t.created).toEqual([])
    expect((await t.say(DUAL, 'oi')).join('\n')).toContain('Lançar conta')
  })

  test('número fora da lista repete a pergunta e a conversa segue depois', async () => {
    const t = await setup()
    const menu = (await t.say(DUAL, 'oi')).join('\n')
    await t.say(DUAL, optionNumber(menu, 'Lançar conta'))
    expect((await t.say(DUAL, '9')).join('\n')).toContain('Que tipo de conta')
    expect((await t.say(DUAL, '2')).join('\n')).not.toContain('Que tipo de conta')
  })
})

describe('privado do Evolution: o motorista que não lança conta', () => {
  test('o menu não oferece Lançar conta e "contas" não abre o assistente', async () => {
    const t = await setup()
    const menu = (await t.say(DRIVER_ONLY, 'oi')).join('\n')
    expect(menu).not.toContain('Lançar conta')
    expect((await t.say(DRIVER_ONLY, 'contas')).join('\n')).not.toContain('Que tipo de conta')
    expect(t.created).toEqual([])
  })
})

describe('privado do Evolution: o grupo não muda', () => {
  test('mensagem de grupo não passa pelo assistente e o menu do grupo não tem Lançar conta', async () => {
    const t = await setup()
    const replies = await t.say(DUAL, 'contas', GROUP)
    expect(replies.join('\n')).not.toContain('Que tipo de conta')
    expect(replies.join('\n')).not.toContain('Lançar conta')
    expect(t.created).toEqual([])
  })
})
