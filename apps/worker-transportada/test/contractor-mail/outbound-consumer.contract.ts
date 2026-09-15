/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { startContractorMailOutboundConsumer } from '../../src/runtime/contractor-mail-outbound-consumer.service.js'
import { ResendProviderUnauthorizedError } from '../../src/contractor-mail/domain/resend-provider.error.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type { ContractorMailOutboundEnvelopeV1 } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type { SendContractorMailOutboundMessageDependencies } from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

const COMPANY_ID = crypto.randomUUID()
const MESSAGE_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()

function buildEnvelope(): ContractorMailOutboundEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'contractor-mail-outbound-consumer-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { messageId: MESSAGE_ID },
    type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
    version: 1,
  }
}

type LogCall = { readonly message: string; readonly metadata: Record<string, unknown> | undefined }

function buildLogger(): { readonly calls: LogCall[]; readonly logger: WorkerLogger } {
  const calls: LogCall[] = []
  return {
    calls,
    logger: {
      error: (message: string, metadata?: Record<string, unknown>) => {
        calls.push({ message, metadata })
      },
      info: (message: string, metadata?: Record<string, unknown>) => {
        calls.push({ message, metadata })
      },
      warn: () => undefined,
    },
  }
}

async function captureHandler(input: {
  readonly dependencies: SendContractorMailOutboundMessageDependencies
  readonly logger: WorkerLogger
}) {
  let handler:
    | ((params: {
        readonly payload: ContractorMailOutboundEnvelopeV1
      }) => Promise<{ readonly type: string }>)
    | undefined

  const provider = {
    async consume(consumeInput: {
      readonly handler: (params: {
        readonly payload: ContractorMailOutboundEnvelopeV1
      }) => Promise<{ readonly type: string }>
    }) {
      handler = consumeInput.handler
      return { cancel: async () => undefined } as RabbitMqConsumer
    },
  } as unknown as RabbitMqProvider

  await startContractorMailOutboundConsumer({
    config: { prefetch: 5 } as never,
    dependencies: input.dependencies,
    logger: input.logger,
    provider,
  })

  if (handler === undefined) throw new Error('consumer never called provider.consume')
  return handler
}

function buildDependenciesStub(
  sendEmail: SendContractorMailOutboundMessageDependencies['mailGateway']['sendEmail'],
): SendContractorMailOutboundMessageDependencies {
  return {
    mailGateway: {
      downloadRawEmail: async () => Buffer.alloc(0),
      fetchReceivedEmail: async () => {
        throw new Error('not used')
      },
      sendEmail,
    },
    repository: {
      async findLastInboundReferenceHeaders() {
        return undefined
      },
      async findMessageById() {
        return {
          bodyHtml: null,
          bodyText: 'corpo',
          subject: 'Teste de configuração de e-mail com contratantes',
          threadId: THREAD_ID,
          toAddresses: ['admin@example.com.br'],
        }
      },
      async findSettingsByCompanyId() {
        return {
          id: crypto.randomUUID(),
          replyDomain: 'resposta.example.com.br',
          secretEnvelope: {},
          senderAddress: 'ocorrencias@example.com.br',
          senderName: 'Remetente',
        }
      },
      async markMessageFailed() {},
      async markMessageSent() {},
    },
    secretService: {
      async decrypt() {
        return { apiKey: 'x', replyTokenSecret: 'a'.repeat(64), webhookSigningSecret: 'whsec_x' }
      },
    },
  }
}

describe('contractor mail outbound consumer (spec 143, T009)', () => {
  test('acks and logs contractor_mail_sent on success', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: buildDependenciesStub(async () => ({ id: 'resend-id' })),
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(calls).toEqual([
      {
        message: 'contractor_mail_sent',
        metadata: {
          companyId: COMPANY_ID,
          eventId: expect.any(String),
          messageId: MESSAGE_ID,
          threadId: THREAD_ID,
        },
      },
    ])
  })

  /** Erro permanente: o caso de uso já marcou `failed` — o consumidor faz `ack`, nunca `retry`. */
  test('acks and logs contractor_mail_failed on a permanent provider error', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: buildDependenciesStub(async () => {
        throw new ResendProviderUnauthorizedError()
      }),
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(calls).toEqual([
      {
        message: 'contractor_mail_failed',
        metadata: {
          companyId: COMPANY_ID,
          eventId: expect.any(String),
          messageId: MESSAGE_ID,
          reason: 'provider_unauthorized',
          threadId: THREAD_ID,
        },
      },
    ])
  })

  /** Erro transitório: nada marca `failed` — o consumidor devolve `retry` para o backoff do broker. */
  test('retries on a transient failure, without acking', async () => {
    const { logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: buildDependenciesStub(async () => {
        throw new Error('ECONNRESET')
      }),
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'retry' })
  })

  test('never logs the recipient address, the subject or the body', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: buildDependenciesStub(async () => ({ id: 'resend-id' })),
      logger,
    })

    await handler({ payload: buildEnvelope() })

    const serialized = JSON.stringify(calls)
    expect(serialized).not.toContain('admin@example.com.br')
    expect(serialized).not.toContain('corpo')
    expect(serialized).not.toContain('Teste de configuração')
  })
})
