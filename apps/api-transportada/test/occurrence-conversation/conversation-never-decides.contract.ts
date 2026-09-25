/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T504 (D4): a conversa conversa — nunca decide. Nada que chega pela conversa (texto, botão
 * de WhatsApp, resposta de e-mail com "APROVADO", áudio, transcrição) muda a tratativa, a taxa ou o
 * acerto. A decisão continua só na tratativa da 164: `occurrences.resolve` no painel e
 * `occurrences.decide` no portal.
 *
 * Duas provas: (1) por texto de fonte, o código da conversa (API e worker) e o trilho de entrada de
 * e-mail não escrevem nem importam os escritores da tratativa, da cobrança e do acerto; (2) por
 * comportamento, um botão "Aprovado" e um texto "APROVADO" pelo WhatsApp só viram mensagem.
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import type { ConversationSession, WhatsAppMessage } from '@adatechnology/meta-whatsapp-contracts'

import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { createContractorPortalConversationUseCase } from '../../src/occurrence-conversation/application/contractor-portal-conversation.use-case.js'
import { createOccurrenceConversationWhatsAppHook } from '../../src/occurrence-conversation/application/whatsapp-conversation-inbound.service.js'

const APPS = new URL('../../../', import.meta.url)

/** O código por onde a conversa entra: tudo dele, nas duas apps. */
const CONVERSATION_SOURCES = [
  'api-transportada/src/occurrence-conversation',
  'api-transportada/src/contractor-mail/application/process-inbound-email-webhook.use-case.ts',
  'worker-transportada/src/occurrence-conversation',
  'worker-transportada/src/contractor-mail',
] as const

/** O que decide: as tabelas e os casos de uso da tratativa, da cobrança e do acerto (164). */
const DECISION_WRITERS = [
  'tripOccurrenceCases',
  'tripOccurrenceCaseEvents',
  'tripOccurrenceItemSettlements',
  'deliveryCharges',
  'deliveryChargeEvents',
  'extraChargeBatches',
  'occurrence-case.use-case',
  'decide-occurrence-case.use-case',
  'record-occurrence-settlement.use-case',
  'reimburse-occurrence-settlement.use-case',
  'drizzle-occurrence-case.repository',
  'drizzle-occurrence-settlement',
  'drizzle-delivery-charge.repository',
  'redelivery-application',
] as const

async function listSources(entry: string): Promise<readonly string[]> {
  const url = new URL(entry, APPS)
  if (entry.endsWith('.ts')) return [url.pathname]
  const files = await readdir(url, { recursive: true })
  return files
    .filter((file) => file.endsWith('.ts'))
    .map((file) => new URL(file, `${url.href}/`).pathname)
}

describe('a conversa nunca decide (spec 183 T504, D4)', () => {
  test('o código da conversa não toca tratativa, cobrança nem acerto', async () => {
    const offenders: string[] = []
    const files = (await Promise.all(CONVERSATION_SOURCES.map(listSources))).flat()

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const writer of DECISION_WRITERS) {
        if (source.includes(writer)) offenders.push(`${file.split('/apps/')[1] ?? file}: ${writer}`)
      }
    }

    expect(files.length).toBeGreaterThan(10)
    expect(offenders).toEqual([])
  })

  test('botão "Aprovado" e texto "APROVADO" pelo WhatsApp só viram mensagem da conversa', async () => {
    const writes: string[] = []
    const hook = createOccurrenceConversationWhatsAppHook({
      clock: () => new Date('2026-09-24T15:00:00.000Z'),
      /** A porta só sabe gravar mensagem: é essa a superfície inteira do que a conversa escreve. */
      inbound: {
        loadAttributionContext: async () => ({
          openContractorConversations: [
            { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
          ],
          replyTo: null,
          sender: {
            contractorContacts: [
              { contactId: 'contact-1', contractorId: 'contractor-alfa', optedIn: true },
            ],
            driverUserId: null,
          },
        }),
        recordConversationMessage: async (input) => void writes.push(`message:${input.bodyText}`),
        recordUnassigned: async (input) => void writes.push(`unassigned:${input.bodyText}`),
      },
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      next: async () => {
        writes.push('command')
        return { outcome: 'handled' }
      },
      rateLimiter: createRateLimiter(),
    })
    const session = {
      companyId: 'company-1',
      whatsappNumber: '5511987654321',
    } as ConversationSession
    const messages: WhatsAppMessage[] = [
      {
        from: '5511987654321',
        id: 'wamid.button',
        interactive: { button_reply: { id: 'approve', title: 'Aprovado' }, type: 'button_reply' },
        type: 'interactive',
      },
      { from: '5511987654321', id: 'wamid.text', text: { body: 'APROVADO' }, type: 'text' },
    ]

    for (const message of messages) await hook(message, session)

    expect(writes).toEqual(['message:Aprovado', 'message:APROVADO'])
  })
})

/**
 * Spec 183 T652 (D4, D9): pelo portal, a contratante conversa e decide em lugares diferentes. O que
 * ela escreve na conversa só vira mensagem; a decisão continua sendo a rota da 164
 * (`POST /client/me/occurrences/:id/decision`, `occurrences.decide`) e o `DecisionForm` da tela.
 */
describe('pelo portal, a conversa também nunca decide (spec 183 T652)', () => {
  const PORTAL_REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'

  test('"APROVADO" escrito no portal só grava a mensagem e a chave de idempotência', async () => {
    const writes: string[] = []
    const useCase = createContractorPortalConversationUseCase({
      clock: () => new Date('2026-09-25T12:00:00.000Z'),
      fingerprintService: { create: async ({ operation }) => operation },
      newRef: () => PORTAL_REF,
      scopes: {
        resolveScope: async () =>
          resolveContractorScope([{ contractorId: 'contractor-alfa', taxId: '11222333000181' }]),
      },
      /**
       * A porta inteira da conversa do portal: nenhuma operação dela alcança a tratativa, a taxa ou
       * o acerto — o que se prova aqui é que o envio usa só as duas escritas de mensagem.
       */
      unitOfWork: {
        execute: (work) =>
          work({
            ensureConversationRefs: async () => {
              writes.push('ensureConversationRefs')
              return new Map()
            },
            findConversation: async () => ({ id: 'conversation-a' }),
            findIdempotency: async () => null,
            insertPortalMessage: async (input) => {
              writes.push(`message:${input.bodyText}`)
              return { createdAt: input.createdAt }
            },
            listMessages: async () => [],
            markRead: async () => void writes.push('markRead'),
            saveIdempotency: async () => void writes.push('idempotency'),
            unreadCount: async () => 0,
          }),
      },
    })

    for (const bodyText of ['APROVADO', 'Aprovo a devolução, pode cobrar a taxa.']) {
      await useCase.send({
        bodyText,
        context: {
          companyId: 'company-1',
          kind: 'company',
          membershipId: 'membership-portal',
          permissions: new Set(['deliveries.track', 'occurrences.decide']),
          roles: ['contractor'],
          userId: 'portal-user',
        },
        idempotencyKey: `portal-decide-key-${bodyText.length}`,
        ref: PORTAL_REF,
      })
    }

    expect(writes).toEqual([
      'message:APROVADO',
      'idempotency',
      'message:Aprovo a devolução, pode cobrar a taxa.',
      'idempotency',
    ])
  })

  test('no portal, só a rota da 164 decide, e a conversa não pede occurrences.decide', async () => {
    const files = await readdir(new URL('../../src/', import.meta.url), { recursive: true })
    const routeFiles = files.filter((file) => file.endsWith('.routes.ts'))
    const deciding: string[] = []
    for (const file of routeFiles) {
      const source = await readFile(new URL(`../../src/${file}`, import.meta.url), 'utf8')
      if (source.includes("'/client/") || source.includes('API_CLIENT_')) {
        if (source.includes('occurrences.decide')) deciding.push(file)
      }
    }

    expect(deciding).toEqual(['contractor-portal/presentation/contractor-occurrence.routes.ts'])
    const conversationRoutes = await readFile(
      new URL(
        '../../src/occurrence-conversation/presentation/client-occurrence-conversation.routes.ts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(conversationRoutes).toInclude("permission: 'deliveries.track'")
    expect(conversationRoutes).not.toInclude('occurrences.decide')
  })
})
