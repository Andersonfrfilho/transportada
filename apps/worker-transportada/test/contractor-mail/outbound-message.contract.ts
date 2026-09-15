/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  sendContractorMailOutboundMessage,
  type SendContractorMailOutboundMessageDependencies,
} from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import {
  ResendInvalidRecipientsError,
  ResendProviderUnauthorizedError,
  ResendProviderUnreachableError,
} from '../../src/contractor-mail/domain/resend-provider.error.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type { ContractorMailOutboundEnvelopeV1 } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type {
  ContractorMailOutboundMessageRecord,
  ContractorMailOutboundSettingsRecord,
  ContractorMailReferenceHeaders,
} from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'

const COMPANY_ID = crypto.randomUUID()
const MESSAGE_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()
const SETTINGS_ID = crypto.randomUUID()
const REPLY_TOKEN_SECRET = 'a'.repeat(64)

const MESSAGE: ContractorMailOutboundMessageRecord = {
  bodyHtml: null,
  bodyText: 'Este é um e-mail de teste.',
  subject: 'Teste de configuração de e-mail com contratantes',
  threadId: THREAD_ID,
  toAddresses: ['admin@fernandes-transportadora.com.br'],
}

const SETTINGS: ContractorMailOutboundSettingsRecord = {
  id: SETTINGS_ID,
  replyDomain: 'resposta.fernandes-transportadora.com.br',
  secretEnvelope: { algorithm: 'A256GCM', ciphertext: 'x', keyId: 'k', nonce: 'n', version: 1 },
  senderAddress: 'ocorrencias@fernandes-transportadora.com.br',
  senderName: 'Fernandes Transportadora',
}

function buildEnvelope(): ContractorMailOutboundEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'contractor-mail-outbound-message-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { messageId: MESSAGE_ID },
    type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
    version: 1,
  }
}

function buildDependencies(input: {
  readonly message?: ContractorMailOutboundMessageRecord
  readonly referenceHeaders?: ContractorMailReferenceHeaders
  readonly sendEmail: SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
  readonly settings?: ContractorMailOutboundSettingsRecord
}): {
  readonly dependencies: SendContractorMailOutboundMessageDependencies
  readonly failedCalls: { readonly companyId: string; readonly messageId: string }[]
  readonly sentCalls: {
    readonly companyId: string
    readonly messageId: string
    readonly providerEmailId: string
  }[]
} {
  const sentCalls: { companyId: string; messageId: string; providerEmailId: string }[] = []
  const failedCalls: { companyId: string; messageId: string }[] = []
  const message = input.message ?? MESSAGE
  const settings = input.settings ?? SETTINGS

  const dependencies: SendContractorMailOutboundMessageDependencies = {
    mailGateway: {
      downloadRawEmail: async () => Buffer.alloc(0),
      fetchReceivedEmail: async () => {
        throw new Error('not used by this contract')
      },
      sendEmail: input.sendEmail,
    },
    repository: {
      async findLastInboundReferenceHeaders() {
        return input.referenceHeaders
      },
      async findMessageById({ companyId, messageId }) {
        return companyId === COMPANY_ID && messageId === MESSAGE_ID ? message : undefined
      },
      async findSettingsByCompanyId({ companyId }) {
        return companyId === COMPANY_ID ? settings : undefined
      },
      async markMessageFailed(callInput) {
        failedCalls.push(callInput)
      },
      async markMessageSent(callInput) {
        sentCalls.push(callInput)
      },
    },
    secretService: {
      async decrypt() {
        return {
          apiKey: 're_test_key',
          replyTokenSecret: REPLY_TOKEN_SECRET,
          webhookSigningSecret: 'whsec_test',
        }
      },
    },
  }

  return { dependencies, failedCalls, sentCalls }
}

describe('send contractor mail outbound message (spec 143, T009 — correção pós-entrega)', () => {
  test('sends the mail with the sender from settings, the derived reply-to and the Idempotency-Key equal to the messageId', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const { dependencies, sentCalls } = buildDependencies({
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id-1' }
      },
    })

    const result = await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'sent', threadId: THREAD_ID })
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      apiKey: 're_test_key',
      from: 'Fernandes Transportadora <ocorrencias@fernandes-transportadora.com.br>',
      headers: {},
      idempotencyKey: MESSAGE_ID,
      subject: 'Teste de configuração de e-mail com contratantes',
      text: 'Este é um e-mail de teste.',
      to: ['admin@fernandes-transportadora.com.br'],
    })
    expect(requests[0]?.replyTo.endsWith(`@${SETTINGS.replyDomain}`)).toBe(true)
    expect(sentCalls).toEqual([
      { companyId: COMPANY_ID, messageId: MESSAGE_ID, providerEmailId: 'resend-email-id-1' },
    ])
  })

  /** RF7: a mesma conversa produz sempre o mesmo Reply-To — nunca lido do banco nem da fila. */
  test('derives the exact same reply-to for two sends of the same conversation', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const { dependencies } = buildDependencies({
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id' }
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)
    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests).toHaveLength(2)
    expect(requests[0]?.replyTo).toBe(requests[1]?.replyTo)
  })

  test('derives a different reply-to for a different conversation (thread) of the same company', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const otherThreadId = crypto.randomUUID()
    const { dependencies } = buildDependencies({
      message: { ...MESSAGE, threadId: otherThreadId },
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id' }
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    const { dependencies: firstDependencies } = buildDependencies({
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id' }
      },
    })
    await sendContractorMailOutboundMessage(buildEnvelope(), firstDependencies)

    expect(requests[0]?.replyTo).not.toBe(requests[1]?.replyTo)
  })

  test('uses the subject from the message row', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const { dependencies } = buildDependencies({
      message: {
        ...MESSAGE,
        subject: 'Assunto gravado na mensagem',
        toAddresses: ['destinatario@example.com'],
      },
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id' }
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests[0]).toMatchObject({
      subject: 'Assunto gravado na mensagem',
      to: ['destinatario@example.com'],
    })
  })

  /** Spec 150 T302: um e-mail só, para todos os contatos, com o HTML e o texto gravados pela API. */
  test('sends one mail to every recorded recipient, in order, with the recorded html and text', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const { dependencies } = buildDependencies({
      message: {
        ...MESSAGE,
        bodyHtml: '<p>Endereço a corrigir</p>',
        bodyText: 'Endereço a corrigir',
        toAddresses: ['primeiro@example.com', 'segundo@example.com', 'terceiro@example.com'],
      },
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id' }
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.to).toEqual([
      'primeiro@example.com',
      'segundo@example.com',
      'terceiro@example.com',
    ])
    expect(requests[0]?.html).toBe('<p>Endereço a corrigir</p>')
    expect(requests[0]?.text).toBe('Endereço a corrigir')
  })

  test('a message without html sends text only, without the html key', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const { dependencies } = buildDependencies({
      message: { ...MESSAGE, bodyHtml: null },
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id' }
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests).toHaveLength(1)
    expect(requests[0] !== undefined && 'html' in requests[0]).toBe(false)
  })

  test('a recipient repeated with different case is sent only once, lowercased, in first-seen order', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const { dependencies } = buildDependencies({
      message: {
        ...MESSAGE,
        toAddresses: ['Contato@Example.com', 'outro@example.com', 'contato@example.com'],
      },
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id' }
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests[0]?.to).toEqual(['contato@example.com', 'outro@example.com'])
  })

  /** RF7: resposta (e aqui, qualquer envio numa conversa com histórico) carrega In-Reply-To/References. */
  test('adds In-Reply-To and References when the thread has a previous inbound message', async () => {
    const requests: Parameters<
      SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
    >[0][] = []
    const { dependencies } = buildDependencies({
      referenceHeaders: { rfcMessageId: '<abc123@mail.example.com>' },
      sendEmail: async (request) => {
        requests.push(request)
        return { id: 'resend-email-id-2' }
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests[0]?.headers).toEqual({
      'In-Reply-To': '<abc123@mail.example.com>',
      References: '<abc123@mail.example.com>',
    })
  })

  /** Erro permanente: a chave foi recusada, retentar não conserta nada — vira failed, sem relançar. */
  test('a permanent provider error marks the message failed and does not throw', async () => {
    const { dependencies, failedCalls, sentCalls } = buildDependencies({
      sendEmail: async () => {
        throw new ResendProviderUnauthorizedError()
      },
    })

    const result = await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'provider_unauthorized',
      threadId: THREAD_ID,
    })
    expect(failedCalls).toEqual([{ companyId: COMPANY_ID, messageId: MESSAGE_ID }])
    expect(sentCalls).toEqual([])
  })

  /** Spec 150 T302: destinatário que o gateway recusa não se conserta retentando — vira failed. */
  test('a recipient list refused by the gateway marks the message failed and does not throw', async () => {
    const { dependencies, failedCalls, sentCalls } = buildDependencies({
      sendEmail: async () => {
        throw new ResendInvalidRecipientsError()
      },
    })

    const result = await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'failed', reason: 'invalid_recipients', threadId: THREAD_ID })
    expect(failedCalls).toEqual([{ companyId: COMPANY_ID, messageId: MESSAGE_ID }])
    expect(sentCalls).toEqual([])
  })

  /** Erro transitório: relança para o consumidor decidir o retry — a mensagem segue queued. */
  test('a transient provider error propagates instead of marking the message failed', async () => {
    const { dependencies, failedCalls, sentCalls } = buildDependencies({
      sendEmail: async () => {
        throw new ResendProviderUnreachableError(new Error('ECONNRESET'))
      },
    })

    await expect(
      sendContractorMailOutboundMessage(buildEnvelope(), dependencies),
    ).rejects.toBeInstanceOf(ResendProviderUnreachableError)
    expect(failedCalls).toEqual([])
    expect(sentCalls).toEqual([])
  })
})
