/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { createContractorMailCredentialSecretService } from '../../src/contractor-mail/application/contractor-mail-credential-secret.service'
import { createContractorMailSettingsUseCase } from '../../src/contractor-mail/application/contractor-mail-settings.use-case'
import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  ContractorMailSetupTestStatus,
  SaveContractorMailSettingsInput,
} from '../../src/contractor-mail/application/contractor-mail.port'
import {
  ContractorMailCredentialUnavailableError,
  ContractorMailSecretRequiredError,
  ContractorMailSettingsVersionConflictError,
  ContractorMailWebhookSecretFormatError,
} from '../../src/contractor-mail/domain/contractor-mail.error'
import type {
  MxLookupGateway,
  MxLookupResult,
} from '../../src/contractor-mail/infrastructure/mx-lookup.gateway'
import {
  ResendProviderUnauthorizedError,
  ResendProviderUnreachableError,
} from '../../src/contractor-mail/domain/resend-provider.error'
import type {
  ResendAccountCheckResult,
  ResendAccountGateway,
} from '../../src/contractor-mail/infrastructure/resend-account.gateway'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000d1'
const USER_ID = '00000000-0000-4000-8000-0000000000d2'
const API_KEY = 're_synthetic_resend_api_key'
const OTHER_API_KEY = 're_synthetic_resend_api_key_two'
const WEBHOOK_SIGNING_SECRET = 'whsec_synthetic_svix_secret'
const OTHER_WEBHOOK_SIGNING_SECRET = 'whsec_synthetic_svix_secret_two'
const REPLY_TOKEN_SECRET = 'd'.repeat(64)
const REPLY_DOMAIN = 'resposta.fernandes-transportadora.com.br'
const SENDER_ADDRESS = 'ocorrencias@fernandes-transportadora.com.br'
const SENDER_NAME = 'Fernandes Transportadora'
const DEFAULT_SETTINGS_ID = '00000000-0000-4000-8000-0000000000d4'

/**
 * `buildRecord` precisa de um envelope que a `secretService` de verdade consiga abrir — um
 * `ciphertext` inventado falharia na autenticação do AES-GCM antes mesmo de chegar ao gateway do
 * Resend, o que faria todo teste de `runChecks` medir a rejeição do envelope, não a do provedor.
 */
const DEFAULT_SECRET_SERVICE = createContractorMailCredentialSecretService({
  envelopeProvider: realEnvelopeProvider(),
})
const DEFAULT_ENVELOPE = await DEFAULT_SECRET_SERVICE.encrypt({
  apiKey: API_KEY,
  companyId: COMPANY_ID,
  replyTokenSecret: REPLY_TOKEN_SECRET,
  settingsId: DEFAULT_SETTINGS_ID,
  webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
})

describe('contractor mail settings use case (spec 143, T008)', () => {
  test('the first save requires both secrets at once', async () => {
    const { useCase } = createHarness({})

    await expect(
      useCase.save({
        apiKey: undefined,
        context: { companyId: COMPANY_ID, userId: USER_ID },
        correlationId: 'contractor-mail-uc-0001',
        expectedVersion: undefined,
        replyDomain: REPLY_DOMAIN,
        senderAddress: SENDER_ADDRESS,
        senderName: SENDER_NAME,
        webhookSigningSecret: undefined,
      }),
    ).rejects.toBeInstanceOf(ContractorMailSecretRequiredError)
  })

  test('the first save persists both secrets and audits every field as changed', async () => {
    const { savedSettingsCalls, useCase } = createHarness({})

    const summary = await useCase.save({
      apiKey: API_KEY,
      context: { companyId: COMPANY_ID, userId: USER_ID },
      correlationId: 'contractor-mail-uc-0002',
      expectedVersion: undefined,
      replyDomain: REPLY_DOMAIN,
      senderAddress: SENDER_ADDRESS,
      senderName: SENDER_NAME,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })

    expect(summary.apiKeyConfigured).toBe(true)
    expect(summary.webhookSecretConfigured).toBe(true)
    expect(summary.version).toBe('1')
    expect(savedSettingsCalls).toHaveLength(1)
    const call = savedSettingsCalls[0] as SaveContractorMailSettingsInput
    expect(call.expectedVersion).toBeUndefined()
    expect(call.audit.actorUserId).toBe(USER_ID)
    expect(call.audit.afterSnapshot).toMatchObject({
      changedFields: [
        'senderAddress',
        'senderName',
        'replyDomain',
        'apiKey',
        'webhookSigningSecret',
      ],
    })
    expect(call.audit.beforeSnapshot).toBeNull()
    expect(JSON.stringify(call.audit)).not.toContain(API_KEY)
    expect(JSON.stringify(call.audit)).not.toContain(WEBHOOK_SIGNING_SECRET)
  })

  test('omitting both secrets on an update keeps the previously sealed ones', async () => {
    const secretService = createContractorMailCredentialSecretService({
      envelopeProvider: realEnvelopeProvider(),
    })
    const settingsId = '00000000-0000-4000-8000-0000000000d3'
    const existingEnvelope = await secretService.encrypt({
      apiKey: API_KEY,
      companyId: COMPANY_ID,
      replyTokenSecret: REPLY_TOKEN_SECRET,
      settingsId,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    const existing = buildRecord({ id: settingsId, secretEnvelope: existingEnvelope })
    const { savedSettingsCalls, useCase } = createHarness({ existing, secretService })

    await useCase.save({
      apiKey: undefined,
      context: { companyId: COMPANY_ID, userId: USER_ID },
      correlationId: 'contractor-mail-uc-0003',
      expectedVersion: existing.version.toString(),
      replyDomain: 'resposta-nova.fernandes-transportadora.com.br',
      senderAddress: SENDER_ADDRESS,
      senderName: SENDER_NAME,
      webhookSigningSecret: undefined,
    })

    const call = savedSettingsCalls[0] as SaveContractorMailSettingsInput
    expect(call.expectedVersion).toBe('1')
    const preserved = await secretService.decrypt({
      companyId: COMPANY_ID,
      envelope: call.secretEnvelope as Parameters<typeof secretService.decrypt>[0]['envelope'],
      settingsId,
    })
    expect(preserved).toEqual({
      apiKey: API_KEY,
      replyTokenSecret: REPLY_TOKEN_SECRET,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(call.audit.afterSnapshot).toMatchObject({ changedFields: ['replyDomain'] })
  })

  /** Opcional da revisão do `architect`: um segredo só chega, o outro sai preservado. */
  test('sending only the api key preserves the previously sealed webhook secret', async () => {
    const secretService = createContractorMailCredentialSecretService({
      envelopeProvider: realEnvelopeProvider(),
    })
    const settingsId = '00000000-0000-4000-8000-0000000000d7'
    const existingEnvelope = await secretService.encrypt({
      apiKey: API_KEY,
      companyId: COMPANY_ID,
      replyTokenSecret: REPLY_TOKEN_SECRET,
      settingsId,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    const existing = buildRecord({ id: settingsId, secretEnvelope: existingEnvelope })
    const { savedSettingsCalls, useCase } = createHarness({ existing, secretService })

    await useCase.save({
      apiKey: OTHER_API_KEY,
      context: { companyId: COMPANY_ID, userId: USER_ID },
      correlationId: 'contractor-mail-uc-0007',
      expectedVersion: existing.version.toString(),
      replyDomain: REPLY_DOMAIN,
      senderAddress: SENDER_ADDRESS,
      senderName: SENDER_NAME,
      webhookSigningSecret: undefined,
    })

    const call = savedSettingsCalls[0] as SaveContractorMailSettingsInput
    const merged = await secretService.decrypt({
      companyId: COMPANY_ID,
      envelope: call.secretEnvelope as Parameters<typeof secretService.decrypt>[0]['envelope'],
      settingsId,
    })
    expect(merged).toEqual({
      apiKey: OTHER_API_KEY,
      replyTokenSecret: REPLY_TOKEN_SECRET,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(call.audit.afterSnapshot).toMatchObject({ changedFields: ['apiKey'] })
  })

  /**
   * Opcional da revisão: a chave do keyring foi removida (ou girada) entre o momento em que o
   * segredo foi selado e agora. O envelope não abre — o erro é o de credencial, nunca "segredo
   * obrigatório" nem um 500 genérico —, e reenviar os dois segredos recupera a configuração, porque
   * aí não há nada para decriptar.
   */
  test('a partial save whose envelope no longer opens fails with the credential error, and resending both secrets recovers', async () => {
    const rotatedKeyProvider = createSecretEnvelopeProvider({
      activeKeyId: 'rotated-v1',
      keys: { 'rotated-v1': Uint8Array.from({ length: 32 }, (_value, index) => 255 - index) },
    })
    const secretService = createContractorMailCredentialSecretService({
      envelopeProvider: rotatedKeyProvider,
    })
    const sealedWithOldKeyring = DEFAULT_ENVELOPE
    const existing = buildRecord({ secretEnvelope: sealedWithOldKeyring })
    const { savedSettingsCalls, useCase } = createHarness({ existing, secretService })

    await expect(
      useCase.save({
        apiKey: undefined,
        context: { companyId: COMPANY_ID, userId: USER_ID },
        correlationId: 'contractor-mail-uc-0008',
        expectedVersion: existing.version.toString(),
        replyDomain: REPLY_DOMAIN,
        senderAddress: SENDER_ADDRESS,
        senderName: SENDER_NAME,
        webhookSigningSecret: undefined,
      }),
    ).rejects.toBeInstanceOf(ContractorMailCredentialUnavailableError)
    expect(savedSettingsCalls).toHaveLength(0)

    const summary = await useCase.save({
      apiKey: OTHER_API_KEY,
      context: { companyId: COMPANY_ID, userId: USER_ID },
      correlationId: 'contractor-mail-uc-0009',
      expectedVersion: existing.version.toString(),
      replyDomain: REPLY_DOMAIN,
      senderAddress: SENDER_ADDRESS,
      senderName: SENDER_NAME,
      webhookSigningSecret: OTHER_WEBHOOK_SIGNING_SECRET,
    })
    expect(summary.apiKeyConfigured).toBe(true)
    expect(savedSettingsCalls).toHaveLength(1)
  })

  test('a webhook signing secret without whsec_ is refused with the T006 error, even on save', async () => {
    const { useCase } = createHarness({})

    await expect(
      useCase.save({
        apiKey: API_KEY,
        context: { companyId: COMPANY_ID, userId: USER_ID },
        correlationId: 'contractor-mail-uc-0004',
        expectedVersion: undefined,
        replyDomain: REPLY_DOMAIN,
        senderAddress: SENDER_ADDRESS,
        senderName: SENDER_NAME,
        webhookSigningSecret: 'not-the-svix-format',
      }),
    ).rejects.toBeInstanceOf(ContractorMailWebhookSecretFormatError)
  })

  /**
   * Revisão do `architect`: a intenção de criação (`expectedVersion` ausente) contra uma linha que
   * já existe — inclusive quando ela existe porque outra requisição venceu a corrida — é conflito,
   * nunca um `upsert` silencioso.
   */
  test('a create intent against an existing row is a version conflict', async () => {
    const { useCase } = createHarness({ existing: buildRecord({}) })

    await expect(
      useCase.save({
        apiKey: API_KEY,
        context: { companyId: COMPANY_ID, userId: USER_ID },
        correlationId: 'contractor-mail-uc-0005',
        expectedVersion: undefined,
        replyDomain: REPLY_DOMAIN,
        senderAddress: SENDER_ADDRESS,
        senderName: SENDER_NAME,
        webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
      }),
    ).rejects.toBeInstanceOf(ContractorMailSettingsVersionConflictError)
  })

  test('an update with a stale expectedVersion is a version conflict', async () => {
    const { useCase } = createHarness({ existing: buildRecord({ version: 5n }) })

    await expect(
      useCase.save({
        apiKey: undefined,
        context: { companyId: COMPANY_ID, userId: USER_ID },
        correlationId: 'contractor-mail-uc-0006',
        expectedVersion: '4',
        replyDomain: REPLY_DOMAIN,
        senderAddress: SENDER_ADDRESS,
        senderName: SENDER_NAME,
        webhookSigningSecret: undefined,
      }),
    ).rejects.toBeInstanceOf(ContractorMailSettingsVersionConflictError)
  })

  test('an unconfigured company gets every check pending as not_configured', async () => {
    const { useCase } = createHarness({})

    const checks = await useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(checks).toHaveLength(7)
    for (const item of checks) {
      expect(item.status).toBe('pending')
      expect(item.reason).toBe('not_configured')
    }
  })

  test('a healthy provider, a found MX and a fully answered test all read ok', async () => {
    const { useCase } = createHarness({
      existing: buildRecord({}),
      mxResult: { hosts: ['feedback-smtp.sa-east-1.amazonses.com'], kind: 'found' },
      resendResult: { apiKeyAccepted: true, reason: 'ok', senderDomainVerified: true },
      setupTestStatus: { dkimResult: 'aligned', hasInboundReply: true, hasOutboundSent: true },
    })

    const checks = await useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(checks, 'api_key')).toEqual({ key: 'api_key', reason: 'ok', status: 'ok' })
    expect(byKey(checks, 'sender_domain')).toEqual({
      key: 'sender_domain',
      reason: 'ok',
      status: 'ok',
    })
    expect(byKey(checks, 'reply_mx')).toEqual({ key: 'reply_mx', reason: 'ok', status: 'ok' })
    expect(byKey(checks, 'test_sent')).toEqual({ key: 'test_sent', reason: 'ok', status: 'ok' })
    expect(byKey(checks, 'test_replied')).toEqual({
      key: 'test_replied',
      reason: 'ok',
      status: 'ok',
    })
    expect(byKey(checks, 'test_dkim')).toEqual({ key: 'test_dkim', reason: 'ok', status: 'ok' })
  })

  test('a rejected api key fails both the key and the sender domain, never throwing', async () => {
    const { useCase } = createHarness({
      existing: buildRecord({}),
      resendError: new ResendProviderUnauthorizedError(),
    })

    const checks = await useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(checks, 'api_key')).toEqual({
      key: 'api_key',
      reason: 'provider_unauthorized',
      status: 'failed',
    })
    expect(byKey(checks, 'sender_domain')).toEqual({
      key: 'sender_domain',
      reason: 'provider_unauthorized',
      status: 'failed',
    })
  })

  /** RF12: nenhuma falha de rede derruba a resposta — cai em `failed`, nunca rejeita a Promise. */
  test('an unmapped network failure still answers as failed instead of rejecting', async () => {
    const { useCase } = createHarness({
      existing: buildRecord({}),
      resendError: new ResendProviderUnreachableError(new Error('ECONNRESET')),
    })

    const checks = await useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(checks, 'api_key').status).toBe('failed')
    expect(byKey(checks, 'api_key').reason).toBe('provider_unreachable')
  })

  /**
   * Revisão do `architect`: o cofre não abrir é motivo diferente de o Resend recusar. O gateway
   * nunca deveria ser chamado quando o segredo nem sai do envelope.
   */
  test('a vault that cannot decrypt fails with credential_unavailable and never calls the gateway', async () => {
    let gatewayCalls = 0
    const brokenSecretService = createContractorMailCredentialSecretService({
      envelopeProvider: {
        async decrypt() {
          throw new Error('key not found in ring')
        },
        async encrypt() {
          throw new Error('encrypt should not run in this test')
        },
      },
    })
    const { useCase } = createHarness({
      existing: buildRecord({}),
      onResendCall: () => {
        gatewayCalls += 1
      },
      secretService: brokenSecretService,
    })

    const checks = await useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(checks, 'api_key')).toEqual({
      key: 'api_key',
      reason: 'credential_unavailable',
      status: 'failed',
    })
    expect(byKey(checks, 'sender_domain')).toEqual({
      key: 'sender_domain',
      reason: 'credential_unavailable',
      status: 'failed',
    })
    expect(gatewayCalls).toBe(0)
  })

  test('an absent MX is pending, and an unreachable one is failed', async () => {
    const absent = await createHarness({
      existing: buildRecord({}),
      mxResult: { kind: 'absent' },
    }).useCase.runChecks({ context: { companyId: COMPANY_ID } })
    const unreachable = await createHarness({
      existing: buildRecord({}),
      mxResult: { kind: 'unreachable' },
    }).useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(absent, 'reply_mx')).toEqual({
      key: 'reply_mx',
      reason: 'mx_absent',
      status: 'pending',
    })
    expect(byKey(unreachable, 'reply_mx')).toEqual({
      key: 'reply_mx',
      reason: 'mx_unreachable',
      status: 'failed',
    })
  })

  test('the webhook_received check reads the last received timestamp', async () => {
    const checks = await createHarness({
      existing: buildRecord({ lastWebhookAt: new Date('2026-09-01T00:00:00.000Z') }),
    }).useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(checks, 'webhook_received')).toEqual({
      key: 'webhook_received',
      reason: 'ok',
      status: 'ok',
    })
  })

  test('the three test checks stay pending while the setup_test thread does not exist', async () => {
    const checks = await createHarness({
      existing: buildRecord({}),
      setupTestStatus: undefined,
    }).useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(checks, 'test_sent').status).toBe('pending')
    expect(byKey(checks, 'test_replied').status).toBe('pending')
    expect(byKey(checks, 'test_dkim').status).toBe('pending')
  })

  test('every dkim outcome that is not aligned fails the test_dkim check with its own reason', async () => {
    const notAligned = await createHarness({
      existing: buildRecord({}),
      setupTestStatus: { dkimResult: 'not_aligned', hasInboundReply: true, hasOutboundSent: true },
    }).useCase.runChecks({ context: { companyId: COMPANY_ID } })
    const unverifiable = await createHarness({
      existing: buildRecord({}),
      setupTestStatus: { dkimResult: 'unverifiable', hasInboundReply: true, hasOutboundSent: true },
    }).useCase.runChecks({ context: { companyId: COMPANY_ID } })
    const absent = await createHarness({
      existing: buildRecord({}),
      setupTestStatus: { dkimResult: 'absent', hasInboundReply: true, hasOutboundSent: true },
    }).useCase.runChecks({ context: { companyId: COMPANY_ID } })

    expect(byKey(notAligned, 'test_dkim')).toEqual({
      key: 'test_dkim',
      reason: 'dkim_not_aligned',
      status: 'failed',
    })
    expect(byKey(unverifiable, 'test_dkim')).toEqual({
      key: 'test_dkim',
      reason: 'dkim_unverifiable',
      status: 'failed',
    })
    expect(byKey(absent, 'test_dkim')).toEqual({
      key: 'test_dkim',
      reason: 'dkim_absent',
      status: 'failed',
    })
  })
})

function byKey<TItem extends { readonly key: string }>(
  items: readonly TItem[],
  key: string,
): TItem {
  const item = items.find((candidate) => candidate.key === key)
  if (item === undefined) throw new Error(`missing check ${key}`)
  return item
}

function realEnvelopeProvider() {
  return createSecretEnvelopeProvider({
    activeKeyId: 'test-v1',
    keys: { 'test-v1': Uint8Array.from({ length: 32 }, (_value, index) => index + 1) },
  })
}

function buildRecord(
  overrides: Partial<ContractorMailSettingsRecord>,
): ContractorMailSettingsRecord {
  return {
    companyId: COMPANY_ID,
    id: DEFAULT_SETTINGS_ID,
    lastWebhookAt: undefined,
    replyDomain: REPLY_DOMAIN,
    secretEnvelope: DEFAULT_ENVELOPE,
    senderAddress: SENDER_ADDRESS,
    senderName: SENDER_NAME,
    status: 'pending',
    version: 1n,
    webhookId: '00000000-0000-4000-8000-0000000000d5',
    ...overrides,
  }
}

function createHarness(input: {
  readonly existing?: ContractorMailSettingsRecord
  readonly mxResult?: MxLookupResult
  readonly onResendCall?: () => void
  readonly resendError?: Error
  readonly resendResult?: ResendAccountCheckResult
  readonly secretService?: ReturnType<typeof createContractorMailCredentialSecretService>
  readonly setupTestStatus?: ContractorMailSetupTestStatus | undefined
}): {
  readonly savedSettingsCalls: SaveContractorMailSettingsInput[]
  readonly useCase: ReturnType<typeof createContractorMailSettingsUseCase>
} {
  const savedSettingsCalls: SaveContractorMailSettingsInput[] = []
  let currentSettings = input.existing

  /**
   * Mimica o repositório real (revisão do `architect`): sem `expectedVersion` é criação, e recusa
   * se a linha já existir; com `expectedVersion`, recusa se a versão não bater. As duas convergem
   * em `ContractorMailSettingsVersionConflictError`, nunca num `upsert` silencioso.
   */
  const repository: ContractorMailRepositoryPort = {
    async findSettings() {
      return currentSettings
    },
    async findSettingsByWebhookId() {
      return currentSettings
    },
    async findSetupTestStatus() {
      return input.setupTestStatus
    },
    async findThreadByReplyTokenHash() {
      return undefined
    },
    async recordInboundWebhookEvent() {
      throw new Error('not used by this contract (spec 143, T010)')
    },
    async recordTestEmailMessage() {
      throw new Error('not used by this contract (spec 143, T009)')
    },
    async reserveSetupTestThread() {
      throw new Error('not used by this contract (spec 143, T009)')
    },
    async saveSettings(saveInput) {
      savedSettingsCalls.push(saveInput)
      const versionMatches =
        saveInput.expectedVersion === undefined
          ? currentSettings === undefined
          : currentSettings?.version.toString() === saveInput.expectedVersion
      if (!versionMatches) throw new ContractorMailSettingsVersionConflictError()

      currentSettings = {
        companyId: saveInput.companyId,
        id: saveInput.settingsId,
        lastWebhookAt: currentSettings?.lastWebhookAt,
        replyDomain: saveInput.replyDomain,
        secretEnvelope: saveInput.secretEnvelope,
        senderAddress: saveInput.senderAddress,
        senderName: saveInput.senderName,
        status: currentSettings?.status ?? 'pending',
        version: (currentSettings?.version ?? 0n) + 1n,
        webhookId: currentSettings?.webhookId ?? '00000000-0000-4000-8000-0000000000d6',
      }
      return currentSettings
    },
  }

  const resendAccountGateway: ResendAccountGateway = {
    async checkApiKeyAndSenderDomain() {
      input.onResendCall?.()
      if (input.resendError !== undefined) throw input.resendError
      return (
        input.resendResult ?? { apiKeyAccepted: true, reason: 'ok', senderDomainVerified: true }
      )
    },
  }

  const mxLookupGateway: MxLookupGateway = {
    async lookupMx() {
      return input.mxResult ?? { hosts: [], kind: 'found' }
    },
  }

  const secretService =
    input.secretService ??
    createContractorMailCredentialSecretService({ envelopeProvider: realEnvelopeProvider() })

  const useCase = createContractorMailSettingsUseCase({
    mxLookupGateway,
    repository,
    resendAccountGateway,
    secretService,
  })

  return { savedSettingsCalls, useCase }
}
