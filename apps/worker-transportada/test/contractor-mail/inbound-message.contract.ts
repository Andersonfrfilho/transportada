/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, generateKeyPairSync } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { dkimSign } from 'mailauth'

import {
  recordContractorMailInboundMessage,
  type RecordContractorMailInboundMessageDependencies,
} from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import { createDkimVerifierGateway } from '../../src/contractor-mail/infrastructure/dkim-verifier.gateway.js'
import { ContractorMailInboundSettingsMissingError } from '../../src/contractor-mail/domain/contractor-mail-inbound.error.js'
import {
  ResendDownloadHostNotAllowedError,
  ResendProviderUnauthorizedError,
  ResendProviderUnreachableError,
} from '../../src/contractor-mail/domain/resend-provider.error.js'
import { hashReplyToken } from '../../src/contractor-mail/domain/reply-token.policy.js'
import { CONTRACTOR_MAIL_INBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import type { ContractorMailInboundEnvelopeV1 } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import type {
  ContractorMailInboundSettingsRecord,
  ContractorMailInboundThreadRecord,
  RecordContractorMailInboundMessageInput,
} from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-inbound-worker.repository.js'

const COMPANY_ID = crypto.randomUUID()
const OTHER_COMPANY_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()
const SETTINGS_ID = crypto.randomUUID()
const REPLY_DOMAIN = 'resposta.fernandes-transportadora.com.br'
/** 26 caracteres, só `[a-z2-7]` — o formato real de um token derivado (128 bits em base32). */
const REPLY_TOKEN = 'replytoken234567abcdefghij'
const OTHER_REPLY_TOKEN = 'anothertoken234567abcdefgh'
const PROVIDER_EMAIL_ID = 'evt_inbound_0001'
const SELECTOR = 'teste'

const SETTINGS: ContractorMailInboundSettingsRecord = {
  id: SETTINGS_ID,
  replyDomain: REPLY_DOMAIN,
  secretEnvelope: { algorithm: 'A256GCM', ciphertext: 'x', keyId: 'k', nonce: 'n', version: 1 },
}

function buildEnvelope(): ContractorMailInboundEnvelopeV1 {
  return {
    companyId: COMPANY_ID,
    correlationId: 'contractor-mail-inbound-message-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { providerEmailId: PROVIDER_EMAIL_ID },
    type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
    version: 1,
  }
}

function generateTestKeyPair(): { readonly privateKey: string; readonly publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  })
  return { privateKey, publicKey }
}

function dkimTxtRecord(publicKey: string): string {
  const body = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '')
  return `v=DKIM1; k=rsa; p=${body}`
}

function buildSyntheticMessage(input: { readonly from: string; readonly to: string }): string {
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    'Subject: APROVADO',
    'Date: Sun, 13 Sep 2026 12:00:00 +0000',
    '',
    'APROVADO',
    '',
  ].join('\r\n')
}

async function signSyntheticMessage(input: {
  readonly message: string
  readonly privateKey: string
  readonly signingDomain: string
}): Promise<string> {
  const { signatures } = await dkimSign(Buffer.from(input.message), {
    privateKey: input.privateKey,
    selector: SELECTOR,
    signatureData: [
      { privateKey: input.privateKey, selector: SELECTOR, signingDomain: input.signingDomain },
    ],
    signingDomain: input.signingDomain,
  })
  return signatures + input.message
}

type Deps = RecordContractorMailInboundMessageDependencies

function buildRepository(input: {
  readonly existingMessageId?: string
  readonly recordCalls: RecordContractorMailInboundMessageInput[]
  readonly threads?: readonly (ContractorMailInboundThreadRecord & {
    readonly companyId: string
    readonly replyTokenHash: string
  })[]
}): Deps['repository'] {
  const threads = input.threads ?? [
    { companyId: COMPANY_ID, id: THREAD_ID, replyTokenHash: hashReplyToken(REPLY_TOKEN) },
  ]

  return {
    async findMessageByProviderEmailId({ companyId, providerEmailId }) {
      if (input.existingMessageId === undefined) return undefined
      return companyId === COMPANY_ID && providerEmailId === PROVIDER_EMAIL_ID
        ? { id: input.existingMessageId }
        : undefined
    },
    async findSettingsByCompanyId({ companyId }) {
      return companyId === COMPANY_ID ? SETTINGS : undefined
    },
    async findThreadsByReplyTokenHashes({ companyId, replyTokenHashes }) {
      return threads
        .filter(
          (thread) =>
            thread.companyId === companyId && replyTokenHashes.includes(thread.replyTokenHash),
        )
        .map((thread) => ({ id: thread.id }))
    },
    async recordInboundMessage(recordInput) {
      input.recordCalls.push(recordInput)
      return { id: crypto.randomUUID() }
    },
  }
}

describe('record contractor mail inbound message (spec 143, T010 — revisão do architect)', () => {
  test('records the message with the DKIM result when the token matches a known thread', async () => {
    const { privateKey, publicKey } = generateTestKeyPair()
    const fromDomain = 'contratante.com.br'
    const message = buildSyntheticMessage({
      from: `financeiro@${fromDomain}`,
      to: `${REPLY_TOKEN}@${REPLY_DOMAIN}`,
    })
    const signedMessage = await signSyntheticMessage({
      message,
      privateKey,
      signingDomain: fromDomain,
    })
    const rawBytes = Buffer.from(signedMessage)
    const storedBodies: Uint8Array[] = []

    const recordCalls: RecordContractorMailInboundMessageInput[] = []
    const dependencies: Deps = {
      dkimVerifier: createDkimVerifierGateway({
        resolveDns: async (name) => {
          if (name === `${SELECTOR}._domainkey.${fromDomain}`) return [[dkimTxtRecord(publicKey)]]
          throw new Error(`unexpected DNS lookup: ${name}`)
        },
      }),
      mailGateway: {
        downloadRawEmail: async () => rawBytes,
        fetchReceivedEmail: async () => ({
          from: `financeiro@${fromDomain}`,
          headers: { 'In-Reply-To': '<previous@example.com.br>' },
          message_id: '<abc@contratante.com.br>',
          raw: { download_url: 'https://cdn.resend.com/raw/1', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'APROVADO',
          text: 'APROVADO',
          to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
        }),
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ recordCalls }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
        },
      },
      storage: {
        async storeObject(input) {
          storedBodies.push(input.body)
          return undefined
        },
      },
      storageBucket: 'transportada-private',
      storageProvider: 'minio',
    }

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ dkimResult: 'aligned', outcome: 'recorded', threadId: THREAD_ID })
    expect(recordCalls).toHaveLength(1)
    expect(recordCalls[0]).toMatchObject({
      bodyText: 'APROVADO',
      companyId: COMPANY_ID,
      dkimResult: 'aligned',
      fromAddress: `financeiro@${fromDomain}`,
      inReplyTo: 'previous@example.com.br',
      providerEmailId: PROVIDER_EMAIL_ID,
      rfcMessageId: '<abc@contratante.com.br>',
      subject: 'APROVADO',
      threadId: THREAD_ID,
      toAddresses: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
    })
    expect(recordCalls[0]?.raw.sha256).toBe(createHash('sha256').update(rawBytes).digest('hex'))
    expect(recordCalls[0]?.raw.sizeBytes).toBe(rawBytes.byteLength)
    expect(storedBodies).toHaveLength(1)
    expect(Buffer.from(storedBodies[0] ?? new Uint8Array())).toEqual(rawBytes)
  })

  /** Sem `In-Reply-To` no e-mail recebido: `inReplyTo` sai `undefined`, não o `message_id` próprio. */
  test('records inReplyTo as undefined when the header is absent, never the message own id', async () => {
    const recordCalls: RecordContractorMailInboundMessageInput[] = []
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          return 'absent'
        },
      },
      mailGateway: {
        downloadRawEmail: async () => Buffer.from('conteudo'),
        fetchReceivedEmail: async () => ({
          from: 'financeiro@contratante.com.br',
          headers: {},
          message_id: '<own-message-id@contratante.com.br>',
          raw: { download_url: 'https://cdn.resend.com/raw/9', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'APROVADO',
          text: 'APROVADO',
          to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
        }),
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ recordCalls }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
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

    await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(recordCalls).toHaveLength(1)
    expect(recordCalls[0]?.inReplyTo).toBeUndefined()
    expect(recordCalls[0]?.rfcMessageId).toBe('<own-message-id@contratante.com.br>')
  })

  test('discards without recording when the token is unknown', async () => {
    const recordCalls: RecordContractorMailInboundMessageInput[] = []
    let downloadCalled = false
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not verify DKIM without a thread')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => {
          downloadCalled = true
          return Buffer.alloc(0)
        },
        fetchReceivedEmail: async () => ({
          from: 'financeiro@contratante.com.br',
          headers: {},
          message_id: '<x@contratante.com.br>',
          raw: { download_url: 'https://cdn.resend.com/raw/2', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'APROVADO',
          text: 'APROVADO',
          to: [`unknowntoken234567abcdefgh@${REPLY_DOMAIN}`],
        }),
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ recordCalls }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
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

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'discarded', reason: 'token_unknown' })
    expect(recordCalls).toEqual([])
    expect(downloadCalled).toBe(false)
  })

  /**
   * plan.md § Segurança e tenant: o hash é global, mas a consulta sempre exige `(companyId, hash)`
   * juntos — o token de uma conversa de **outra** empresa não acha nada aqui, exatamente como se
   * fosse desconhecido.
   */
  test('discards without recording when the token belongs to a thread of a different company', async () => {
    const recordCalls: RecordContractorMailInboundMessageInput[] = []
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not verify DKIM without a thread')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => Buffer.alloc(0),
        fetchReceivedEmail: async () => ({
          from: 'financeiro@contratante.com.br',
          headers: {},
          message_id: '<x@contratante.com.br>',
          raw: { download_url: 'https://cdn.resend.com/raw/3', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'APROVADO',
          text: 'APROVADO',
          to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
        }),
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({
        recordCalls,
        threads: [
          {
            companyId: OTHER_COMPANY_ID,
            id: crypto.randomUUID(),
            replyTokenHash: hashReplyToken(REPLY_TOKEN),
          },
        ],
      }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
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

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'discarded', reason: 'token_unknown' })
    expect(recordCalls).toEqual([])
  })

  /** Revisão do `architect`: dois candidatos batem em duas conversas distintas — descarta, com contador. */
  test('discards with a distinct reason when more than one conversation matches', async () => {
    const recordCalls: RecordContractorMailInboundMessageInput[] = []
    const otherThreadId = crypto.randomUUID()
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not verify DKIM when ambiguous')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => {
          throw new Error('should not download when ambiguous')
        },
        fetchReceivedEmail: async () => ({
          from: 'financeiro@contratante.com.br',
          headers: {},
          message_id: '<x@contratante.com.br>',
          raw: { download_url: 'https://cdn.resend.com/raw/4', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'APROVADO',
          text: 'APROVADO',
          to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
          cc: [`${OTHER_REPLY_TOKEN}@${REPLY_DOMAIN}`],
        }),
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({
        recordCalls,
        threads: [
          { companyId: COMPANY_ID, id: THREAD_ID, replyTokenHash: hashReplyToken(REPLY_TOKEN) },
          {
            companyId: COMPANY_ID,
            id: otherThreadId,
            replyTokenHash: hashReplyToken(OTHER_REPLY_TOKEN),
          },
        ],
      }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
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

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'discarded', reason: 'multiple_matches' })
    expect(recordCalls).toEqual([])
  })

  test('converges without touching any gateway when the message was already recorded', async () => {
    const recordCalls: RecordContractorMailInboundMessageInput[] = []
    let fetchCalled = false
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not run')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => {
          throw new Error('should not download')
        },
        fetchReceivedEmail: async () => {
          fetchCalled = true
          throw new Error('should not fetch')
        },
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ existingMessageId: crypto.randomUUID(), recordCalls }),
      secretService: {
        async decrypt() {
          throw new Error('should not open the vault')
        },
      },
      storage: {
        async storeObject() {
          throw new Error('should not store')
        },
      },
      storageBucket: 'transportada-private',
      storageProvider: 'minio',
    }

    const result = await recordContractorMailInboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'already_recorded' })
    expect(fetchCalled).toBe(false)
    expect(recordCalls).toEqual([])
  })

  /** Revisão do `architect`: permanente — reentregar não faz a configuração aparecer. */
  test('throws a typed permanent error when the company has no contractor mail settings', async () => {
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not run')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => Buffer.alloc(0),
        fetchReceivedEmail: async () => {
          throw new Error('should not fetch without settings')
        },
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ recordCalls: [] }),
      secretService: {
        async decrypt() {
          throw new Error('should not open the vault')
        },
      },
      storage: {
        async storeObject() {
          throw new Error('should not store')
        },
      },
      storageBucket: 'transportada-private',
      storageProvider: 'minio',
    }

    await expect(
      recordContractorMailInboundMessage(
        { ...buildEnvelope(), companyId: crypto.randomUUID() },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ContractorMailInboundSettingsMissingError)
  })

  test('propagates a permanent provider error (unauthorized key) for the consumer to classify', async () => {
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not run')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => Buffer.alloc(0),
        fetchReceivedEmail: async () => {
          throw new ResendProviderUnauthorizedError()
        },
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ recordCalls: [] }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
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

    await expect(
      recordContractorMailInboundMessage(buildEnvelope(), dependencies),
    ).rejects.toBeInstanceOf(ResendProviderUnauthorizedError)
  })

  test('propagates a transient network error for the consumer to retry', async () => {
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not run')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => Buffer.alloc(0),
        fetchReceivedEmail: async () => {
          throw new ResendProviderUnreachableError(new Error('ECONNRESET'))
        },
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ recordCalls: [] }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
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

    await expect(
      recordContractorMailInboundMessage(buildEnvelope(), dependencies),
    ).rejects.toBeInstanceOf(ResendProviderUnreachableError)
  })

  /** Objetivo item 5: `download_url` fora da allowlist é permanente — o próprio gateway já recusa. */
  test('propagates a permanent error when the download host is not on the allowlist', async () => {
    const dependencies: Deps = {
      dkimVerifier: {
        async verify() {
          throw new Error('should not run')
        },
      },
      mailGateway: {
        downloadRawEmail: async () => {
          throw new ResendDownloadHostNotAllowedError()
        },
        fetchReceivedEmail: async () => ({
          from: 'financeiro@contratante.com.br',
          headers: {},
          message_id: '<x@contratante.com.br>',
          raw: {
            download_url: 'https://attacker.example.com/raw',
            expires_at: '2099-01-01T00:00:00Z',
          },
          subject: 'APROVADO',
          text: 'APROVADO',
          to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
        }),
        sendEmail: async () => {
          throw new Error('not used by this contract')
        },
      },
      repository: buildRepository({ recordCalls: [] }),
      secretService: {
        async decrypt() {
          return {
            apiKey: 're_test_key',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }
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

    await expect(
      recordContractorMailInboundMessage(buildEnvelope(), dependencies),
    ).rejects.toBeInstanceOf(ResendDownloadHostNotAllowedError)
  })
})
