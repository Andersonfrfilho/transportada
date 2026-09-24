/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T14 (RF17/D16, CA9): a imagem recebida viaja pelo contexto do turno, nunca pela
 * assinatura de `extractWhatsAppAnswer` (que o `FlowInterpreter` tipa `string | undefined`, e cujo
 * handler não recebe a `WhatsAppMessage` inteira). O despachante escreve o descritor
 * (`mediaId`/`mimeType`) ao montar o cursor, e apaga a chave do contexto persistido **sempre**, em
 * todo turno — consumida ou não pelo `FlowActionHandler` do nó alcançado — porque o `media-id`
 * resgata a mídia com o token da empresa (credencial de curta duração, nunca em log, nunca
 * sobrevivendo além do turno em que chegou).
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
  FlowGraphData,
  WhatsAppMessage,
} from '@adatechnology/meta-whatsapp-contracts'
import { FlowInterpreter } from '@adatechnology/meta-whatsapp-module'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import type { ResolveWhatsAppActorResult } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY } from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000031'
const USER_ID = '00000000-0000-4000-8000-000000000032'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000033'
const PHONE = '5516999992345'
const FLOW_KEY = 'incoming-image-contract-root'
const MEDIA_ID = 'wamid.super-secret-media-handle'

const GRAPH: FlowGraphData = {
  key: FLOW_KEY,
  label: 'Contrato de imagem',
  nodes: {
    menu: {
      fallbackMessage: 'Escolha uma das opções.',
      id: 'menu',
      next: { byAnswer: { p: 'photo' }, default: 'menu' },
      options: [['p', '📷 Foto']],
      question: 'O que você quer fazer?',
      type: 'menu',
    },
    photo: { actionKind: 'contract.photo', id: 'photo', type: 'action' },
    photoDone: { directMessage: 'Foto recebida.', id: 'photoDone', type: 'action' },
  },
  startNodeId: 'menu',
  version: 1,
}

async function buildAuthorizedActor(): Promise<ResolveWhatsAppActorResult> {
  const tenantContext = new TenantContextService({
    repository: {
      findActiveByUserAndCompany: async () => ({
        grantedPermissions: [],
        membershipId: MEMBERSHIP_ID,
        roles: ['operator'],
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

function createHarness(input: {
  readonly photoHandlerContexts: Record<string, unknown>[]
  readonly startAtPhotoNode?: boolean
}) {
  const logged: { message: string; meta?: unknown }[] = []
  const storedContexts: Record<string, unknown>[] = []
  const position: { value: WhatsAppSessionPosition } = {
    value:
      input.startAtPhotoNode === true
        ? { context: {}, currentNodeId: 'photo', currentState: 'start', flowKey: FLOW_KEY }
        : { context: {}, currentNodeId: null, currentState: 'start', flowKey: null },
  }

  const sessions: WhatsAppCommandSessionPort = {
    async getContext() {
      return position.value
    },
    async requestHuman() {},
    async setFlowPosition(_companyId, _number, flowKey, currentNodeId) {
      position.value = { ...position.value, currentNodeId, flowKey }
    },
    async setState(_companyId, _number, currentState, context) {
      storedContexts.push(context ?? {})
      position.value = { ...position.value, context: context ?? {}, currentState }
    },
  }

  const sent: unknown[] = []
  const sender: WhatsAppMessageSenderPort = {
    async sendButtons(input_) {
      sent.push(input_)
    },
    async sendList(input_) {
      sent.push(input_)
    },
    async sendText(input_) {
      sent.push(input_)
    },
  }

  const interpreter = new FlowInterpreter()
  interpreter.registerFlowAction('contract.photo', async ({ context }) => {
    input.photoHandlerContexts.push(context)
    return { next: 'photoDone' }
  })

  const record = (message: string, meta?: unknown): void => {
    logged.push({ message, ...(meta === undefined ? {} : { meta }) })
  }

  const onMessageReceived = createWhatsAppCommandDriver({
    channel: {} as ChannelAdapterInterface,
    clock: () => new Date('2026-09-21T12:00:00.000Z'),
    graphs: createStaticWhatsAppFlowGraphProvider({ graphs: [GRAPH], rootFlowKey: FLOW_KEY }),
    interpreter,
    logger: { error: record, info: record, warn: record },
    rateLimiter: createRateLimiter(),
    resolveActor: async () => buildAuthorizedActor(),
    sender,
    sessions,
  })

  return { logged, onMessageReceived, position, sent, storedContexts }
}

function buildSession(): ConversationSession {
  return {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {},
    createdAt: '2026-09-21T12:00:00.000Z',
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-1',
    lastActivity: '2026-09-21T12:00:00.000Z',
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: '2026-09-21T12:00:00.000Z',
    whatsappNumber: PHONE,
  }
}

function image(input: { readonly id?: string; readonly mimeType?: string } = {}): WhatsAppMessage {
  return {
    from: PHONE,
    id: crypto.randomUUID(),
    image: { id: input.id ?? MEDIA_ID, mime_type: input.mimeType ?? 'image/jpeg' },
    type: 'image',
  }
}

function button(id: string): WhatsAppMessage {
  return {
    from: PHONE,
    id: crypto.randomUUID(),
    interactive: { button_reply: { id, title: id }, type: 'button_reply' },
    type: 'interactive',
  }
}

describe('spec 161 T14 — a imagem viaja pelo contexto, não pela assinatura', () => {
  test('o nó alcançado recebe mediaId/mimeType no contexto do FlowActionHandler', async () => {
    const photoHandlerContexts: Record<string, unknown>[] = []
    const harness = createHarness({ photoHandlerContexts, startAtPhotoNode: true })

    await harness.onMessageReceived(image(), buildSession())

    expect(photoHandlerContexts).toHaveLength(1)
    expect(photoHandlerContexts[0]?.[WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY]).toEqual({
      mediaId: MEDIA_ID,
      mimeType: 'image/jpeg',
    })
  })

  test('a chave some do contexto persistido ao fim do turno, mesmo sem o handler apagá-la', async () => {
    const harness = createHarness({ photoHandlerContexts: [], startAtPhotoNode: true })

    await harness.onMessageReceived(image(), buildSession())

    for (const stored of harness.storedContexts) {
      expect(stored).not.toHaveProperty(WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY)
    }
    expect(harness.position.value.context).not.toHaveProperty(WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY)
  })

  test('imagem em nó de escolha vira resposta inválida (D8) — não avança e não persiste a chave', async () => {
    const harness = createHarness({ photoHandlerContexts: [] })
    // abre o menu raiz primeiro, para a posição apontar para o nó de escolha
    await harness.onMessageReceived(button('__unused__'), buildSession())
    expect(harness.position.value.currentNodeId).toBe('menu')

    await harness.onMessageReceived(image(), buildSession())

    expect(harness.position.value.currentNodeId).toBe('menu')
    for (const stored of harness.storedContexts) {
      expect(stored).not.toHaveProperty(WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY)
    }
  })

  test('o media-id nunca aparece nos logs', async () => {
    const harness = createHarness({ photoHandlerContexts: [], startAtPhotoNode: true })

    await harness.onMessageReceived(image(), buildSession())

    const serializedLog = JSON.stringify(harness.logged)
    expect(serializedLog).not.toContain(MEDIA_ID)
  })
})
