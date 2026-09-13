/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  sendContractorMailOutboundMessage,
  type SendContractorMailOutboundMessageDependencies,
} from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import {
  ResendProviderUnauthorizedError,
  ResendProviderUnreachableError,
} from '../../src/contractor-mail/domain/resend-provider.error.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type { ContractorMailOutboundEnvelopeV1 } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type {
  ContractorMailOutboundMessageRecord,
  ContractorMailOutboundSettingsRecord,
  ContractorMailOutboundThreadRecord,
  ContractorMailReferenceHeaders,
} from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'

const COMPANY_ID = crypto.randomUUID()
const MESSAGE_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()
const SETTINGS_ID = crypto.randomUUID()

const MESSAGE: ContractorMailOutboundMessageRecord = {
  bodyText: 'Este é um e-mail de teste.',
  threadId: THREAD_ID,
}

const THREAD: ContractorMailOutboundThreadRecord = { subjectType: 'setup_test' }

const SETTINGS: ContractorMailOutboundSettingsRecord = {
  id: SETTINGS_ID,
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
    payload: {
      messageId: MESSAGE_ID,
      replyToAddress: 'abcdefghijklmnopqrstuvwxyz@resposta.fernandes-transportadora.com.br',
      toAddress: 'admin@fernandes-transportadora.com.br',
    },
    type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
    version: 1,
  }
}

function buildDependencies(input: {
  readonly referenceHeaders?: ContractorMailReferenceHeaders
  readonly sendEmail: SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail']
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
        return companyId === COMPANY_ID && messageId === MESSAGE_ID ? MESSAGE : undefined
      },
      async findSettingsByCompanyId({ companyId }) {
        return companyId === COMPANY_ID ? SETTINGS : undefined
      },
      async findThreadById({ companyId, threadId }) {
        return companyId === COMPANY_ID && threadId === THREAD_ID ? THREAD : undefined
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
        return { apiKey: 're_test_key', webhookSigningSecret: 'whsec_test' }
      },
    },
  }

  return { dependencies, failedCalls, sentCalls }
}

describe('send contractor mail outbound message (spec 143, T009, Objetivo 5)', () => {
  test('sends the mail with the sender from settings, the reply-to and the Idempotency-Key equal to the messageId', async () => {
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
    expect(requests).toEqual([
      {
        apiKey: 're_test_key',
        from: 'Fernandes Transportadora <ocorrencias@fernandes-transportadora.com.br>',
        headers: {},
        idempotencyKey: MESSAGE_ID,
        replyTo: 'abcdefghijklmnopqrstuvwxyz@resposta.fernandes-transportadora.com.br',
        subject: 'Teste de configuração de e-mail com contratantes',
        text: 'Este é um e-mail de teste.',
        to: 'admin@fernandes-transportadora.com.br',
      },
    ])
    expect(sentCalls).toEqual([
      { companyId: COMPANY_ID, messageId: MESSAGE_ID, providerEmailId: 'resend-email-id-1' },
    ])
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
