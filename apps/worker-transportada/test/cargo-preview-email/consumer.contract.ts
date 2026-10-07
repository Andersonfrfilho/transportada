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
import { recordContractorMailInboundMessage } from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import type { RecordContractorMailInboundMessageDependencies } from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import { CONTRACTOR_MAIL_INBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import type { ContractorMailInboundEnvelopeV1 } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import { startContractorMailInboundConsumer } from '../../src/runtime/contractor-mail-inbound-consumer.service.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

const COMPANY_ID = crypto.randomUUID()
const CONTRACTOR_ID = crypto.randomUUID()
const PROVIDER_EMAIL_ID = 'evt_preview_0001'

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
  result: CargoPreviewEmailIntakeResult
}

function buildDependencies(probe: Probe): RecordContractorMailInboundMessageDependencies {
  const previewIntake: CargoPreviewEmailIntakePort = {
    hasIntake: async () => probe.hasIntake,
    intake: async () => {
      probe.intakes += 1
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
        throw new Error('o trilho da conversa não deve baixar quando a prévia decide')
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
          to: ['previewtoken234567abcdefgh@entrada.example'],
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
      findThreadsByReplyTokenHashes: async () => {
        throw new Error('a prévia decide antes de procurar conversa')
      },
      recordInboundMessage: async () => {
        throw new Error('a prévia não grava mensagem de conversa')
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
  isReplay: false,
  kind: 'accepted',
  previewId: 'preview-1',
}

describe('o ramo da prévia no e-mail de entrada (spec 237 T4.6)', () => {
  test('mensagem já registrada na tabela da prévia não baixa nada nem chama o Resend', async () => {
    const probe: Probe = { fetches: 0, hasIntake: true, intakes: 0, result: accepted }
    expect(await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))).toEqual({
      outcome: 'already_recorded',
    })
    expect(probe.fetches).toBe(0)
    expect(probe.intakes).toBe(0)
  })

  test.each([
    accepted,
    { contractorId: CONTRACTOR_ID, kind: 'rejected', reason: 'FORWARDER_NOT_ALLOWED' },
    { contractorId: CONTRACTOR_ID, kind: 'rate_limited' },
  ] as CargoPreviewEmailIntakeResult[])(
    'a prévia decide (%p) e o trilho da conversa não é tocado',
    async (result) => {
      const probe: Probe = { fetches: 0, hasIntake: false, intakes: 0, result }
      expect(await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))).toEqual({
        outcome: 'preview',
        preview: result,
      })
      expect(probe.intakes).toBe(1)
    },
  )

  test('mensagem registrada por outra via na corrida vira already_recorded', async () => {
    const probe: Probe = {
      fetches: 0,
      hasIntake: false,
      intakes: 0,
      result: { kind: 'already_recorded' },
    }
    expect(await recordContractorMailInboundMessage(ENVELOPE, buildDependencies(probe))).toEqual({
      outcome: 'already_recorded',
    })
  })
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
      | ((params: { payload: ContractorMailInboundEnvelopeV1 }) => Promise<{ type: string }>)
      | undefined
    const provider = {
      consume: async (input: { handler: typeof handler }) => {
        handler = input.handler
        return { cancel: async () => undefined } as RabbitMqConsumer
      },
    } as unknown as RabbitMqProvider
    const probe: Probe = { fetches: 0, hasIntake: false, intakes: 0, result }
    await startContractorMailInboundConsumer({
      config: { prefetch: 1 } as never,
      dependencies: buildDependencies(probe),
      logger,
      provider,
    })
    const outcome = await handler?.({ payload: ENVELOPE })
    return { logs, outcome }
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
      isReplay: false,
      previewId: 'preview-1',
    })
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
