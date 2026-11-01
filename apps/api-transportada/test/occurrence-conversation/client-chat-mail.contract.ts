/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 287 (etapa 2): o chat do cliente por e-mail. Sai pelo mesmo envio do chat da contratante (modelo padrão,
 * assinatura, Resend), mas para os e-mails cadastrados do cliente, no fio e na conversa `client_email`.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CarrierIdentity,
  OccurrenceMailTarget,
  OccurrenceMailTransactionPort,
  RecordOccurrenceMailInput,
  SendOccurrenceMailResult,
} from '../../src/occurrence-conversation/application/occurrence-mail.port.js'
import { createSendClientChatMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-chat-mail.use-case.js'
import type { ResolvedStandardEmailTemplate } from '../../src/occurrence-conversation/application/standard-email-renderer.port.js'
import { SEND_CLIENT_CHAT_MAIL_OPERATION } from '../../src/occurrence-conversation/domain/occurrence-conversation.constant.js'
import {
  OccurrenceChatMailNoRecipientsError,
  OccurrenceConversationMailInvalidError,
} from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000287601'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000287602'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000287603'
const ACTOR_ID = '00000000-0000-4000-8000-000000287604'
const CLIENT_TAX_ID = '11222333000181'
const NOW = new Date('2026-11-01T12:00:00.000Z')
const CARRIER: CarrierIdentity = {
  city: 'Ribeirão Preto',
  cnpj: '11444777000161',
  displayName: 'Transportadora Sintética',
  hasLogo: false,
  legalName: 'Transportadora Sintética Ltda',
  state: 'SP',
}
const TARGET: OccurrenceMailTarget = {
  contractorId: CONTRACTOR_ID,
  contractorName: 'Contratante Alfa',
  contractorTaxId: '11222333000199',
  kind: 'document',
  occurrenceTypeId: null,
  stage: 'delivery',
}

function createFake(
  overrides: { audience?: { addresses: readonly string[]; taxId: string } | null } = {},
) {
  const state = {
    conversations: [] as unknown[],
    idempotency: new Map<string, { fingerprint: string; response: SendOccurrenceMailResult }>(),
    locks: [] as unknown[],
    mails: [] as RecordOccurrenceMailInput[],
    messages: [] as { bodyText: string; conversationId: string }[],
    threadLookups: [] as unknown[],
  }
  const transaction = {
    attachments: {},
    async findCarrierIdentity() {
      return CARRIER
    },
    async findChatMailSubjectFacts() {
      return { invoiceNumber: '4512', lastOutboundSubject: null, typeName: 'Recusa' }
    },
    async findClientEmailAudience() {
      return 'audience' in overrides
        ? overrides.audience
        : {
            addresses: ['financeiro@cliente.example.test', 'compras@cliente.example.test'],
            taxId: CLIENT_TAX_ID,
          }
    },
    async findIdempotency({
      idempotencyKey,
      operation,
    }: {
      idempotencyKey: string
      operation?: string
    }) {
      const found = state.idempotency.get(`${operation ?? ''}:${idempotencyKey}`)
      return found === undefined ? null : found
    },
    async findMailSettings() {
      return {
        id: 'settings-1',
        secretEnvelope: {},
        senderAddress: 'ocorrencias@transportadora.example.test',
        sendingVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
      }
    },
    async findOccurrenceTarget() {
      return TARGET
    },
    async findOccurrenceThread(params: unknown) {
      state.threadLookups.push(params)
      return undefined
    },
    async findOperatorSigner() {
      return { jobTitle: 'Operação', name: 'Operadora Lima' }
    },
    async findOrCreateClientEmailConversation(params: unknown) {
      state.conversations.push(params)
      return { id: 'client-email-conversation' }
    },
    async lockOccurrenceThread(params: unknown) {
      state.locks.push(params)
    },
    async recordConversationMessage(params: { bodyText: string; conversationId: string }) {
      state.messages.push(params)
      return { id: 'conversation-message-1' }
    },
    async recordMail(params: RecordOccurrenceMailInput) {
      state.mails.push(params)
      return { messageId: 'mail-message-1' }
    },
    async saveIdempotency(params: {
      fingerprint: string
      idempotencyKey: string
      operation?: string
      response: SendOccurrenceMailResult
    }) {
      state.idempotency.set(`${params.operation ?? ''}:${params.idempotencyKey}`, {
        fingerprint: params.fingerprint,
        response: params.response,
      })
    },
  } as unknown as OccurrenceMailTransactionPort
  const useCase = createSendClientChatMailUseCase({
    fingerprintService: {
      create: async ({ fields, operation }) =>
        `${operation}|${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
    },
    now: () => NOW,
    renderer: {
      render: () => ({
        bytes: 10,
        html: '<p>padrão</p>',
        template: { key: 'notification.standard-email', source: 'builtin', version: 0 },
        text: 'padrão',
        tooLarge: false,
      }),
      resolve: async () => ({}) as unknown as ResolvedStandardEmailTemplate,
    },
    secretService: {
      decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'a'.repeat(64) }),
    } as never,
    storage: {} as never,
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  return { state, useCase }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    actorUserId: ACTOR_ID,
    bodyText: '  Segue o boleto atualizado.  ',
    companyId: COMPANY_ID,
    correlationId: 'correlation-1',
    idempotencyKey: 'client-email:abc',
    occurrenceId: OCCURRENCE_ID,
    ...overrides,
  }
}

async function failure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
  } catch (error) {
    return error
  }
  throw new Error('EXPECTED_FAILURE')
}

describe('o chat do cliente por e-mail (spec 287)', () => {
  test('envia aos e-mails cadastrados do cliente, no fio e na conversa de e-mail do cliente', async () => {
    const { state, useCase } = createFake()

    const result = await useCase.send(input())

    expect(result).toMatchObject({
      conversationId: 'client-email-conversation',
      conversationMessageId: 'conversation-message-1',
      mailMessageId: 'mail-message-1',
      recipientCount: 2,
    })
    expect(state.conversations).toEqual([
      { clientTaxId: CLIENT_TAX_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID },
    ])
    const [mail] = state.mails
    expect(mail).toMatchObject({
      actorUserId: ACTOR_ID,
      ccAddresses: [],
      contractorId: CONTRACTOR_ID,
      threadAudience: 'client',
      toAddresses: ['financeiro@cliente.example.test', 'compras@cliente.example.test'],
    })
    expect(state.threadLookups).toEqual([
      {
        audience: 'client',
        companyId: COMPANY_ID,
        occurrenceId: OCCURRENCE_ID,
        occurrenceKind: 'document',
      },
    ])
    expect(state.messages).toEqual([
      expect.objectContaining({
        bodyText: 'Segue o boleto atualizado.',
        conversationId: 'client-email-conversation',
      }),
    ])
  })

  test('a mesma chave devolve a resposta gravada, sem novo e-mail', async () => {
    const { state, useCase } = createFake()
    const first = await useCase.send(input())
    const second = await useCase.send(input())

    expect(second).toEqual(first)
    expect(state.mails).toHaveLength(1)
    expect(SEND_CLIENT_CHAT_MAIL_OPERATION).not.toBe('')
  })

  test('sem cliente cadastrado ou sem e-mail recusa, e texto vazio é inválido', async () => {
    expect(
      await failure(() => createFake({ audience: null }).useCase.send(input())),
    ).toBeInstanceOf(OccurrenceChatMailNoRecipientsError)
    expect(
      await failure(() =>
        createFake({ audience: { addresses: [], taxId: CLIENT_TAX_ID } }).useCase.send(input()),
      ),
    ).toBeInstanceOf(OccurrenceChatMailNoRecipientsError)
    expect(
      await failure(() => createFake().useCase.send(input({ bodyText: '   ' }))),
    ).toBeInstanceOf(OccurrenceConversationMailInvalidError)
    expect(TripOccurrenceNotFoundError).toBeDefined()
  })
})
