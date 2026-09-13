/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { startContractorMailInboundConsumer } from '../../src/runtime/contractor-mail-inbound-consumer.service.js'
import {
  ResendDownloadHostNotAllowedError,
  ResendProviderUnauthorizedError,
} from '../../src/contractor-mail/domain/resend-provider.error.js'
import { CONTRACTOR_MAIL_INBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import type { ContractorMailInboundEnvelopeV1 } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import type { RecordContractorMailInboundMessageDependencies } from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

const COMPANY_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()
const REPLY_DOMAIN = 'resposta.example.com.br'
/** 26 caracteres, só `[a-z2-7]` — o formato real de um token derivado (128 bits em base32). */
const REPLY_TOKEN = 'consumertoken234567abcdefg'
const PROVIDER_EMAIL_ID = 'evt_consumer_0001'

function buildEnvelope(): ContractorMailInboundEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'contractor-mail-inbound-consumer-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { providerEmailId: PROVIDER_EMAIL_ID },
    type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
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
  readonly dependencies: RecordContractorMailInboundMessageDependencies
  readonly logger: WorkerLogger
}) {
  let handler:
    | ((params: {
        readonly payload: ContractorMailInboundEnvelopeV1
      }) => Promise<{ readonly type: string }>)
    | undefined

  const provider = {
    async consume(consumeInput: {
      readonly handler: (params: {
        readonly payload: ContractorMailInboundEnvelopeV1
      }) => Promise<{ readonly type: string }>
    }) {
      handler = consumeInput.handler
      return { cancel: async () => undefined } as RabbitMqConsumer
    },
  } as unknown as RabbitMqProvider

  await startContractorMailInboundConsumer({
    config: { prefetch: 5 } as never,
    dependencies: input.dependencies,
    logger: input.logger,
    provider,
  })

  if (handler === undefined) throw new Error('consumer never called provider.consume')
  return handler
}

function buildDependenciesStub(overrides?: {
  readonly fetchReceivedEmail?: RecordContractorMailInboundMessageDependencies['mailGateway']['fetchReceivedEmail']
  readonly toAddress?: string
}): RecordContractorMailInboundMessageDependencies {
  const toAddress = overrides?.toAddress ?? `${REPLY_TOKEN}@${REPLY_DOMAIN}`

  return {
    dkimVerifier: {
      async verify() {
        return 'aligned'
      },
    },
    mailGateway: {
      downloadRawEmail: async () => Buffer.from('From: a@b.com\r\n\r\ncorpo secreto'),
      fetchReceivedEmail:
        overrides?.fetchReceivedEmail ??
        (async () => ({
          from: 'financeiro@contratante.com.br',
          headers: {},
          message_id: '<x@contratante.com.br>',
          raw: { download_url: 'https://cdn.resend.com/raw/x', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'assunto secreto',
          text: 'corpo secreto',
          to: [toAddress],
        })),
      sendEmail: async () => {
        throw new Error('not used')
      },
    },
    repository: {
      async findMessageByProviderEmailId() {
        return undefined
      },
      async findSettingsByCompanyId() {
        return {
          id: crypto.randomUUID(),
          replyDomain: REPLY_DOMAIN,
          secretEnvelope: {},
        }
      },
      async findThreadsByReplyTokenHashes() {
        return [{ id: THREAD_ID }]
      },
      async recordInboundMessage() {
        return { id: crypto.randomUUID() }
      },
    },
    secretService: {
      async decrypt() {
        return { apiKey: 'x', replyTokenSecret: 'a'.repeat(64), webhookSigningSecret: 'whsec_x' }
      },
    },
    storage: {
      async storeObject() {
        return undefined
      },
    },
    storageBucket: 'transportada-private',
    storageProvider: 'minio',
  }
}

describe('contractor mail inbound consumer (spec 143, T010)', () => {
  test('acks and logs inbound_email_dkim_verified on a recorded message', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({ dependencies: buildDependenciesStub(), logger })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(calls).toEqual([
      {
        message: 'inbound_email_dkim_verified',
        metadata: {
          companyId: COMPANY_ID,
          dkimResult: 'aligned',
          eventId: expect.any(String),
          threadId: THREAD_ID,
        },
      },
    ])
  })

  test('acks and logs inbound_email_token_unknown as a counter, without failing, when discarded', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: buildDependenciesStub({ toAddress: 'unknown@another-domain.com.br' }),
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(calls).toEqual([
      {
        message: 'inbound_email_token_unknown',
        metadata: { companyId: COMPANY_ID, eventId: expect.any(String), reason: 'token_unknown' },
      },
    ])
  })

  /** Falha permanente (chave recusada): ack, com contador — reentregar não muda o resultado. */
  test('acks on a permanent provider error, and logs the typed reason', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: buildDependenciesStub({
        fetchReceivedEmail: async () => {
          throw new ResendProviderUnauthorizedError()
        },
      }),
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(calls).toEqual([
      {
        message: 'inbound_email_webhook_rejected',
        metadata: {
          companyId: COMPANY_ID,
          eventId: expect.any(String),
          reason: 'provider_unauthorized',
        },
      },
    ])
  })

  /** `download_url` fora da allowlist: também permanente. */
  test('acks when the download host is outside the allowlist', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: {
        ...buildDependenciesStub(),
        mailGateway: {
          downloadRawEmail: async () => {
            throw new ResendDownloadHostNotAllowedError()
          },
          fetchReceivedEmail: buildDependenciesStub().mailGateway.fetchReceivedEmail,
          sendEmail: async () => {
            throw new Error('not used')
          },
        },
      },
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(calls).toEqual([
      {
        message: 'inbound_email_webhook_rejected',
        metadata: {
          companyId: COMPANY_ID,
          eventId: expect.any(String),
          reason: 'download_host_not_allowed',
        },
      },
    ])
  })

  /** Configuração ausente é permanente (revisão do `architect`): reentregar não faz ela aparecer. */
  test('acks when the company has no contractor mail settings', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: {
        ...buildDependenciesStub(),
        repository: {
          ...buildDependenciesStub().repository,
          async findSettingsByCompanyId() {
            return undefined
          },
        },
      },
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(calls).toEqual([
      {
        message: 'inbound_email_webhook_rejected',
        metadata: {
          companyId: COMPANY_ID,
          eventId: expect.any(String),
          reason: 'settings_missing',
        },
      },
    ])
  })

  test('retries on a transient failure, without acking', async () => {
    const { logger } = buildLogger()
    const handler = await captureHandler({
      dependencies: buildDependenciesStub({
        fetchReceivedEmail: async () => {
          throw new Error('ECONNRESET')
        },
      }),
      logger,
    })

    const disposition = await handler({ payload: buildEnvelope() })

    expect(disposition).toEqual({ type: 'retry' })
  })

  test('never logs the recipient address, the subject or the body', async () => {
    const { calls, logger } = buildLogger()
    const handler = await captureHandler({ dependencies: buildDependenciesStub(), logger })

    await handler({ payload: buildEnvelope() })

    const serialized = JSON.stringify(calls)
    expect(serialized).not.toContain('financeiro@contratante.com.br')
    expect(serialized).not.toContain('corpo secreto')
    expect(serialized).not.toContain('assunto secreto')
    expect(serialized).not.toContain(REPLY_TOKEN)
  })
})
