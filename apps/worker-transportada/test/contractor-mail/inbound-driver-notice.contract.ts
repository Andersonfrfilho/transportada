/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6b: o boleto entregue sozinho ao motorista (resposta da contratante por e-mail) avisa o sino
 * dele depois da gravação, com a mesma chave de aviso do app; a falha do aviso nunca desfaz a gravação nem
 * faz o e-mail ser reentregue; sem entrega (nada no repositório), não há aviso.
 */
import { describe, expect, test } from 'bun:test'

import { NOT_A_PREVIEW_INTAKE } from '../cargo-preview-email/not-a-preview.fixture.js'

import {
  recordContractorMailInboundMessage,
  type RecordContractorMailInboundMessageDependencies,
} from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import { hashReplyToken } from '../../src/contractor-mail/domain/reply-token.policy.js'
import type { DriverReplyNotice } from '../../src/occurrence-conversation/application/driver-reply-notice.port.js'
import { CONTRACTOR_MAIL_INBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000248001'
const THREAD_ID = '00000000-0000-4000-8000-000000248002'
const REPLY_DOMAIN = 'resposta.transportadora.example.test'
const REPLY_TOKEN = 'replytoken234567abcdefghij'

const NOTICE: DriverReplyNotice = {
  companyId: COMPANY_ID,
  driverMessageId: '00000000-0000-4000-8000-000000248003',
  driverUserId: '00000000-0000-4000-8000-000000248004',
  occurrenceId: '00000000-0000-4000-8000-000000248005',
  occurrenceLabel: 'NF 123/1',
  protocol: '261012-AB12',
}

function buildScenario(options: {
  readonly driverNotice?: DriverReplyNotice
  readonly notifierFails?: boolean
}) {
  const events: string[] = []
  const notices: DriverReplyNotice[] = []
  const dependencies: RecordContractorMailInboundMessageDependencies = {
    conversationAttachments: {
      discard: async () => undefined,
      store: async () => ({ skipped: 0, stored: [] }),
    },
    dkimVerifier: {
      async verifyWithHeaderFrom() {
        return { alignment: 'absent' as const, headerFrom: [] }
      },
    },
    driverNotifier: {
      async notify(notice) {
        events.push('notify')
        if (options.notifierFails === true) throw new Error('queue down')
        notices.push(notice)
      },
    },
    mailGateway: {
      downloadRawEmail: async () => Buffer.from('From: a@b.example\r\n\r\ncorpo'),
      fetchReceivedEmail: async () => ({
        from: 'financeiro@contratante.example.test',
        headers: {},
        message_id: '<boleto@contratante.example.test>',
        raw: { download_url: 'https://cdn.resend.com/raw/1', expires_at: '2099-01-01T00:00:00Z' },
        subject: 'Re: ocorrência',
        text: 'Segue o boleto.',
        to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
      }),
      sendEmail: async () => {
        throw new Error('not used by this contract')
      },
    },
    previewIntake: NOT_A_PREVIEW_INTAKE,
    repository: {
      async findMessageByProviderEmailId() {
        return undefined
      },
      async findSettingsByCompanyId() {
        return {
          id: '00000000-0000-4000-8000-000000248006',
          replyDomain: REPLY_DOMAIN,
          secretEnvelope: {
            algorithm: 'A256GCM',
            ciphertext: 'x',
            keyId: 'k',
            nonce: 'n',
            version: 1,
          },
        }
      },
      async findThreadsByReplyTokenHashes({ replyTokenHashes }) {
        return replyTokenHashes.includes(hashReplyToken(REPLY_TOKEN)) ? [{ id: THREAD_ID }] : []
      },
      async recordInboundMessage() {
        events.push('record')
        return {
          driverNotice: options.driverNotice,
          id: '00000000-0000-4000-8000-000000248007',
          linkedAttachments: 1,
        }
      },
      async threadHasOccurrenceConversation() {
        return true
      },
    },
    secretService: {
      async decrypt() {
        return {
          apiKey: 're_test_key',
          replyTokenSecret: 'a'.repeat(64),
          webhookSigningSecret: 'whsec',
        }
      },
    },
    storage: { storeObject: async () => undefined },
    storageBucket: 'transportada-private',
    storageProvider: 'minio',
  }
  return { dependencies, events, notices }
}

function buildEnvelope() {
  return {
    companyId: COMPANY_ID,
    correlationId: 'contractor-mail-inbound-driver-notice',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { providerEmailId: 'evt_inbound_driver_notice' },
    type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
    version: 1,
  } as const
}

describe('o aviso do sino do motorista no e-mail da contratante (spec 248 T4.6b)', () => {
  test('avisa o motorista com o que a entrega gravou, só depois de gravar', async () => {
    const { dependencies, events, notices } = buildScenario({ driverNotice: NOTICE })

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('recorded')
    expect(events).toEqual(['record', 'notify'])
    expect(notices).toEqual([NOTICE])
  })

  test('sem entrega ao motorista, não avisa ninguém', async () => {
    const { dependencies, events, notices } = buildScenario({})

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('recorded')
    expect(events).toEqual(['record'])
    expect(notices).toEqual([])
  })

  test('a falha do aviso nunca derruba a gravação já feita', async () => {
    const { dependencies, events } = buildScenario({ driverNotice: NOTICE, notifierFails: true })

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result.outcome).toBe('recorded')
    expect(events).toEqual(['record', 'notify'])
  })
})
