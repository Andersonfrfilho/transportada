/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7d (terceira revisão de segurança, pendência 9): o trilho da CONVERSA gravava o DKIM pela `mailauth`
 * e identificava o remetente pelo `from` do Resend. A API mostra o nome e os selos do contato cadastrado quando
 * `dkim_result = 'aligned'`; se o `From` assinado e o `from` do Resend divergem, quem tem o endereço de resposta
 * aparecia como contato confirmado da contratante. Agora o `aligned` só vale quando o `From` que a `mailauth`
 * alinhou é UM só e é o mesmo endereço do remetente gravado; a mensagem continua na conversa, sem o selo.
 */
import { describe, expect, test } from 'bun:test'

import { NOT_A_PREVIEW_INTAKE } from '../cargo-preview-email/not-a-preview.fixture.js'
import {
  recordContractorMailInboundMessage,
  type RecordContractorMailInboundMessageDependencies,
} from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import type { DkimAlignmentResult } from '../../src/contractor-mail/domain/dkim-alignment.policy.js'
import type { RecordContractorMailInboundMessageInput } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-inbound-worker.repository.js'
import {
  CONTRACTOR_MAIL_INBOUND_EVENT_TYPE,
  type ContractorMailInboundEnvelopeV1,
} from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'

const COMPANY_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()
const REPLY_DOMAIN = 'resposta.fernandes-transportadora.com.br'
const REPLY_TOKEN = 'replytoken234567abcdefghij'
const PROVIDER_EMAIL_ID = 'evt_identity_0001'
const MINIMAL_MIME = Buffer.from('From: a@b.example\r\n\r\ncorpo')

const envelope: ContractorMailInboundEnvelopeV1 = {
  companyId: COMPANY_ID,
  correlationId: 'inbound-identity-0001',
  eventId: crypto.randomUUID(),
  occurredAt: new Date(0).toISOString(),
  payload: { providerEmailId: PROVIDER_EMAIL_ID },
  type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
  version: 1,
}

async function recordWith(input: {
  readonly alignment: DkimAlignmentResult
  readonly from: string
  readonly headerFrom: readonly string[]
}): Promise<RecordContractorMailInboundMessageInput> {
  const recordCalls: RecordContractorMailInboundMessageInput[] = []
  const dkimVerifier = {
    verifyWithHeaderFrom: async () => ({
      alignment: input.alignment,
      headerFrom: input.headerFrom,
    }),
  }
  const dependencies: RecordContractorMailInboundMessageDependencies = {
    conversationAttachments: {
      discard: async () => undefined,
      store: async () => ({ skipped: 0, stored: [] }),
    },
    dkimVerifier,
    mailGateway: {
      downloadRawEmail: async () => MINIMAL_MIME,
      fetchReceivedEmail: async () => ({
        from: input.from,
        headers: {},
        message_id: '<id@contratante.com.br>',
        raw: { download_url: 'https://cdn.resend.com/raw/1', expires_at: '2099-01-01T00:00:00Z' },
        subject: 'Re',
        text: 'Segue.',
        to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
      }),
      sendEmail: async () => {
        throw new Error('not used by this contract')
      },
    },
    previewIntake: NOT_A_PREVIEW_INTAKE,
    repository: {
      findMessageByProviderEmailId: async () => undefined,
      findSettingsByCompanyId: async () => ({
        id: crypto.randomUUID(),
        replyDomain: REPLY_DOMAIN,
        secretEnvelope: {
          algorithm: 'A256GCM',
          ciphertext: 'x',
          keyId: 'k',
          nonce: 'n',
          version: 1,
        },
      }),
      findThreadsByReplyTokenHashes: async () => [{ id: THREAD_ID }],
      recordInboundMessage: async (record) => {
        recordCalls.push(record)
        return { id: crypto.randomUUID(), linkedAttachments: 0 }
      },
      threadHasOccurrenceConversation: async () => false,
    },
    secretService: {
      decrypt: async () => ({
        apiKey: 're_test_key',
        replyTokenSecret: 'a'.repeat(64),
        webhookSigningSecret: 'whsec_test',
      }),
    },
    storage: { storeObject: async () => undefined },
    storageBucket: 'transportada-private',
    storageProvider: 'minio',
  }
  await recordContractorMailInboundMessage(envelope, dependencies)
  const [recorded] = recordCalls
  if (recorded === undefined) throw new Error('a mensagem deveria ter sido gravada')
  return recorded
}

describe('o selo de verificada exige que o From assinado seja o remetente gravado (spec 237 T4.7d, pendência 9)', () => {
  test('o legítimo — os dois iguais, ignorando a caixa e o nome de exibição — mantém aligned', async () => {
    const recorded = await recordWith({
      alignment: 'aligned',
      from: 'Financeiro Alfa <Financeiro@Contratante.com.br>',
      headerFrom: ['financeiro@contratante.com.br'],
    })
    expect(recorded.dkimResult).toBe('aligned')
    expect(recorded.fromAddress).toBe('Financeiro@Contratante.com.br')
  })

  test('o From assinado é de outro endereço do mesmo domínio: not_aligned, e a mensagem é gravada', async () => {
    const recorded = await recordWith({
      alignment: 'aligned',
      from: 'Financeiro Alfa <financeiro@contratante.com.br>',
      headerFrom: ['ex-funcionario@contratante.com.br'],
    })
    expect(recorded.dkimResult).toBe('not_aligned')
    expect(recorded.fromAddress).toBe('financeiro@contratante.com.br')
    expect(recorded.bodyText).toBe('Segue.')
  })

  test('dois From assinados ou nenhum: not_aligned', async () => {
    for (const headerFrom of [[], ['a@x.example', 'financeiro@contratante.com.br']]) {
      const recorded = await recordWith({
        alignment: 'aligned',
        from: 'financeiro@contratante.com.br',
        headerFrom,
      })
      expect(recorded.dkimResult).toBe('not_aligned')
    }
  })

  test.each(['absent', 'not_aligned', 'unverifiable'] as const)(
    'o resultado %s não muda com a divergência',
    async (alignment) => {
      const recorded = await recordWith({
        alignment,
        from: 'financeiro@contratante.com.br',
        headerFrom: ['outro@contratante.com.br'],
      })
      expect(recorded.dkimResult).toBe(alignment)
    },
  )
})
