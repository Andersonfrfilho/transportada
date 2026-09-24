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

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
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
