/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o ramo da prévia dentro do trilho de e-mail de entrada. Roteia só a mensagem que
 * casa o token de um perfil; o resto segue pelo trilho da conversa exatamente como antes. O log leva
 * ids, códigos e contagens — nunca endereço, assunto ou corpo.
 */
import { describe, expect, test } from 'bun:test'
import type { RabbitMqConsumer, RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type {
  CargoPreviewEmailIntakePort,
  CargoPreviewEmailIntakeResult,
} from '../../src/cargo-preview-email/application/cargo-preview-email.types.js'
import { CargoPreviewEmailDkimUnverifiableError } from '../../src/cargo-preview-email/domain/cargo-preview-email.error.js'
import { recordContractorMailInboundMessage } from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import type { RecordContractorMailInboundMessageDependencies } from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import { CONTRACTOR_MAIL_INBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import type { ContractorMailInboundEnvelopeV1 } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import { startContractorMailInboundConsumer } from '../../src/runtime/contractor-mail-inbound-consumer.service.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

const COMPANY_ID = crypto.randomUUID()
const CONTRACTOR_ID = crypto.randomUUID()
const PROVIDER_EMAIL_ID = 'evt_preview_0001'
const TOKEN = 'previewtoken234567abcdefgh'
const CONVERSATION_TOKEN = 'conversationtoken2345abcd'

const ENVELOPE: ContractorMailInboundEnvelopeV1 = {
  companyId: COMPANY_ID,
  correlationId: 'corr-preview-0001',
  eventId: crypto.randomUUID(),
  occurredAt: new Date(0).toISOString(),
  payload: { providerEmailId: PROVIDER_EMAIL_ID },
  type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
  version: 1,
}

type Probe = {
  fetches: number
  intakes: number
  hasIntake: boolean
  lastDelivery?: { readonly isLastAttempt: boolean }
  recordedMessages: number
  result: CargoPreviewEmailIntakeResult
  threads: readonly { readonly id: string }[]
  /** O que o Resend devolve em `to`/`cc`. */
  to: readonly string[]
  cc?: readonly string[]
}

function newProbe(overrides: Partial<Probe> & Pick<Probe, 'result'>): Probe {
  return {
    fetches: 0,
    hasIntake: false,
    intakes: 0,
    recordedMessages: 0,
    threads: [],
    to: [`${TOKEN}@entrada.example`],
    ...overrides,
  }
}

function buildDependencies(probe: Probe): RecordContractorMailInboundMessageDependencies {
  const previewIntake: CargoPreviewEmailIntakePort = {
    hasIntake: async () => probe.hasIntake,
    intake: async (input) => {
      probe.intakes += 1
      probe.lastDelivery = input.delivery
      return probe.result
    },
  }
  return {
    conversationAttachments: {
      discard: async () => undefined,
      store: async () => ({ skipped: 0, stored: [] }),
    },
    dkimVerifier: { verify: async () => 'aligned' },
    mailGateway: {
      downloadRawEmail: async () => {
        if (probe.threads.length === 0) {
          throw new Error('o trilho da conversa não deve baixar quando a prévia decide')
        }
        return Buffer.from('From: a@b.example\r\n\r\ncorpo secreto')
      },
      fetchReceivedEmail: async () => {
        probe.fetches += 1
        return {
          from: 'equipe@transportadora.example',
          headers: {},
          message_id: '<x@y>',
          raw: { download_url: 'https://cdn.resend.com/raw/x', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'assunto secreto',
          text: 'corpo secreto',
          ...(probe.cc === undefined ? {} : { cc: [...probe.cc] }),
          to: [...probe.to],
        }
      },
      sendEmail: async () => {
        throw new Error('not used')
      },
    },
    previewIntake,
    repository: {
      findMessageByProviderEmailId: async () => undefined,
      findSettingsByCompanyId: async () => ({
        id: crypto.randomUUID(),
        replyDomain: 'entrada.example',
        secretEnvelope: {},
      }),
      findThreadsByReplyTokenHashes: async () => probe.threads,
      recordInboundMessage: async () => {
        probe.recordedMessages += 1
        return { id: crypto.randomUUID(), linkedAttachments: 0 }
      },
      threadHasOccurrenceConversation: async () => false,
    },
    secretService: {
      decrypt: async () => ({
        apiKey: 'k',
        replyTokenSecret: 'a'.repeat(64),
        webhookSigningSecret: 'w',
      }),
    },
    storage: { storeObject: async () => undefined },
    storageBucket: 'b',
    storageProvider: 'minio',
  }
}

const accepted: CargoPreviewEmailIntakeResult = {
  contractorId: CONTRACTOR_ID,
  dkimResult: 'aligned',
  kind: 'accepted',
  previewId: 'preview-1',
}

const replayedExisting: CargoPreviewEmailIntakeResult = {
  contractorId: CONTRACTOR_ID,
  dkimResult: 'aligned',
  kind: 'replayed_existing',
  previewId: 'preview-0',
  previewStatus: 'failed',
}

describe('o ramo da prévia no e-mail de entrada (spec 237 T4.6)', () => {
  test('mensagem já registrada na tabela da prévia não baixa nada nem chama o Resend', async () => {
    const probe = newProbe({ hasIntake: true, result: accepted })
    expect(await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))).toEqual({
      outcome: 'already_recorded',
    })
    expect(probe.fetches).toBe(0)
    expect(probe.intakes).toBe(0)
  })

  test.each([
    accepted,
    replayedExisting,
    { contractorId: CONTRACTOR_ID, kind: 'rejected', reason: 'FORWARDER_NOT_ALLOWED' },
    { contractorId: CONTRACTOR_ID, kind: 'rate_limited' },
  ] as Extract<
    CargoPreviewEmailIntakeResult,
    { kind: 'accepted' | 'rate_limited' | 'rejected' | 'replayed_existing' }
  >[])('a prévia decide (%p) e nenhuma mensagem de conversa é gravada', async (result) => {
    const probe = newProbe({ result })
    expect(await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))).toEqual({
      outcome: 'preview',
      preview: result,
    })
    expect(probe.intakes).toBe(1)
    expect(probe.recordedMessages).toBe(0)
  })

  test('mensagem registrada por outra via na corrida vira already_recorded', async () => {
    const probe = newProbe({ result: { kind: 'already_recorded' } })
    expect(await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))).toEqual({
      outcome: 'already_recorded',
    })
  })

  test('sem conversa casada e sem prévia, a mensagem é descartada como token desconhecido', async () => {
    const probe = newProbe({ result: { kind: 'not_a_preview' } })
    expect(await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))).toEqual({
      outcome: 'discarded',
      reason: 'token_unknown',
    })
  })
})

describe('a conversa vence quando o e-mail tem os dois endereços (spec 237 T4.7a, achado 4)', () => {
  test.each([
    ['To e Cc', { cc: [`${CONVERSATION_TOKEN}@entrada.example`] }],
    [
      'os dois no To',
      { to: [`${TOKEN}@entrada.example`, `${CONVERSATION_TOKEN}@entrada.example`] },
    ],
    [
      'o da conversa no To e o da prévia no Cc',
      { cc: [`${TOKEN}@entrada.example`], to: [`${CONVERSATION_TOKEN}@entrada.example`] },
    ],
  ] as const)(
    '%s: a mensagem vira resposta da conversa e a prévia nem é consultada',
    async (_name, addresses) => {
      const probe = newProbe({
        result: accepted,
        threads: [{ id: crypto.randomUUID() }],
        ...addresses,
      })
      const result = await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))
      expect(result).toMatchObject({ outcome: 'recorded' })
      expect(probe.intakes).toBe(0)
      expect(probe.recordedMessages).toBe(1)
    },
  )
})

describe('o consumidor loga a prévia sem dado pessoal (spec 237 T4.6)', () => {
  async function run(result: CargoPreviewEmailIntakeResult) {
    const logs: { message: string; metadata: Record<string, unknown> | undefined }[] = []
    const logger: WorkerLogger = {
      error: (message, metadata) => void logs.push({ message, metadata }),
      info: (message, metadata) => void logs.push({ message, metadata }),
      warn: (message, metadata) => void logs.push({ message, metadata }),
    }
    let handler:
      | ((params: {
          payload: ContractorMailInboundEnvelopeV1
          retryCount?: number
        }) => Promise<{ type: string }>)
      | undefined
    const provider = {
      consume: async (input: { handler: typeof handler }) => {
        handler = input.handler
        return { cancel: async () => undefined } as RabbitMqConsumer
      },
    } as unknown as RabbitMqProvider
    const probe = newProbe({ result })
    await startContractorMailInboundConsumer({
      config: { prefetch: 1 } as never,
      dependencies: buildDependencies(probe),
      logger,
      maxRetries: 3,
      provider,
    })
    const outcome = await handler?.({ payload: ENVELOPE })
    return { logs, outcome, probe }
  }

  test('aceita: ack e um log com ids e o resultado do DKIM', async () => {
    const { logs, outcome } = await run(accepted)
    expect(outcome).toEqual({ type: 'ack' })
    expect(
      logs.find((entry) => entry.message === 'inbound_email_preview_accepted')?.metadata,
    ).toMatchObject({
      companyId: COMPANY_ID,
      contractorId: CONTRACTOR_ID,
      dkimResult: 'aligned',
      previewId: 'preview-1',
      replay: false,
    })
  })

  test('reenvio de arquivo que já era prévia: o log diz replay e o status, sem reabrir nada', async () => {
    const { logs, outcome } = await run(replayedExisting)
    expect(outcome).toEqual({ type: 'ack' })
    expect(
      logs.find((entry) => entry.message === 'inbound_email_preview_accepted')?.metadata,
    ).toMatchObject({ previewId: 'preview-0', previewStatus: 'failed', replay: true })
  })

  test('recusa: ack e o código estável, sem endereço', async () => {
    const { logs, outcome } = await run({
      contractorId: CONTRACTOR_ID,
      kind: 'rejected',
      reason: 'ORIGINAL_SENDER_NOT_ALLOWED',
    })
    expect(outcome).toEqual({ type: 'ack' })
    expect(
      logs.find((entry) => entry.message === 'inbound_email_preview_rejected')?.metadata,
    ).toMatchObject({
      contractorId: CONTRACTOR_ID,
      reason: 'ORIGINAL_SENDER_NOT_ALLOWED',
    })
    const serialized = JSON.stringify(logs)
    for (const sensitive of ['@', 'secreto', 'transportadora', 'previewtoken']) {
      expect(serialized).not.toContain(sensitive)
    }
  })

  test('excesso de e-mails: ack e um log próprio', async () => {
    const { logs, outcome } = await run({ contractorId: CONTRACTOR_ID, kind: 'rate_limited' })
    expect(outcome).toEqual({ type: 'ack' })
    expect(logs.some((entry) => entry.message === 'inbound_email_preview_rate_limited')).toBe(true)
  })
})

describe('o DKIM sem veredito repete a entrega até a última (spec 237 T4.7a, achado 7)', () => {
  const unverifiable = () => {
    throw new CargoPreviewEmailDkimUnverifiableError()
  }

  test('o erro do ramo vira retry, com um log próprio e sem dado pessoal', async () => {
    const { logs, outcome } = await runWithRetry(unverifiable, 0)
    expect(outcome).toEqual({ type: 'retry' })
    const entry = logs.find((item) => item.message === 'inbound_email_webhook_rejected')
    expect(entry?.metadata).toMatchObject({ reason: 'dkim_unverifiable' })
  })

  test.each([
    [0, false],
    [2, false],
    [3, true],
    [4, true],
  ])('na entrega %p (teto 3) a última tentativa é %p', async (retryCount, isLastAttempt) => {
    const { probe } = await runWithRetry(() => accepted, retryCount)
    expect(probe.lastDelivery).toEqual({ isLastAttempt })
  })

  test('sem contagem de entregas, a entrega é tratada como a primeira', async () => {
    const { probe } = await runWithRetry(() => accepted, undefined)
    expect(probe.lastDelivery).toEqual({ isLastAttempt: false })
  })

  async function runWithRetry(
    result: () => CargoPreviewEmailIntakeResult,
    retryCount: number | undefined,
  ) {
    const logs: { message: string; metadata: Record<string, unknown> | undefined }[] = []
    const logger: WorkerLogger = {
      error: (message, metadata) => void logs.push({ message, metadata }),
      info: (message, metadata) => void logs.push({ message, metadata }),
      warn: (message, metadata) => void logs.push({ message, metadata }),
    }
    let handler:
      | ((params: {
          payload: ContractorMailInboundEnvelopeV1
          retryCount?: number
        }) => Promise<{ type: string }>)
      | undefined
    const provider = {
      consume: async (input: { handler: typeof handler }) => {
        handler = input.handler
        return { cancel: async () => undefined } as RabbitMqConsumer
      },
    } as unknown as RabbitMqProvider
    const probe = newProbe({ result: accepted })
    const dependencies = buildDependencies(probe)
    const { intake } = dependencies.previewIntake
    dependencies.previewIntake.intake = async (input) => {
      const produced = await intake(input)
      return produced.kind === 'accepted' ? result() : produced
    }
    await startContractorMailInboundConsumer({
      config: { prefetch: 1 } as never,
      dependencies,
      logger,
      maxRetries: 3,
      provider,
    })
    const outcome = await handler?.({
      payload: ENVELOPE,
      ...(retryCount === undefined ? {} : { retryCount }),
    })
    return { logs, outcome, probe }
  }
})
