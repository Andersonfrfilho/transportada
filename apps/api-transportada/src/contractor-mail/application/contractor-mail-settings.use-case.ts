/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { ContractorMailSettingsStatus } from '../../database/contractor-mail.schema.js'
import {
  ContractorMailCredentialUnavailableError,
  ContractorMailSecretRequiredError,
} from '../domain/contractor-mail.error.js'
import type {
  ContractorMailCredentialSecret,
  ContractorMailCredentialSecretService,
} from './contractor-mail-credential-secret.service.js'
import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  ContractorMailSetupTestStatus,
} from './contractor-mail.port.js'
import type { MxLookupGateway, MxLookupResult } from '../infrastructure/mx-lookup.gateway.js'
import type { ResendAccountGateway } from '../infrastructure/resend-account.gateway.js'
import {
  ResendProviderUnauthorizedError,
  ResendProviderUnexpectedResponseError,
  ResendProviderUnreachableError,
} from '../domain/resend-provider.error.js'

const CONTRACTOR_MAIL_SETTINGS_ACTION = 'contractor-mail.settings.saved'

export const CONTRACTOR_MAIL_CHECK_KEYS = [
  'api_key',
  'sender_domain',
  'reply_mx',
  'webhook_received',
  'test_sent',
  'test_replied',
  'test_dkim',
] as const
export type ContractorMailCheckKey = (typeof CONTRACTOR_MAIL_CHECK_KEYS)[number]

export const CONTRACTOR_MAIL_CHECK_STATUSES = ['ok', 'pending', 'failed'] as const
export type ContractorMailCheckStatus = (typeof CONTRACTOR_MAIL_CHECK_STATUSES)[number]

/**
 * `not_configured` cobre a empresa sem `contractor_mail_settings`; os demais nomeiam a causa exata
 * de um item `pending`/`failed`, para o painel mostrar o que fazer em vez de só "não deu certo".
 */
export const CONTRACTOR_MAIL_CHECK_REASONS = [
  'not_configured',
  'ok',
  'credential_unavailable',
  'provider_unauthorized',
  'provider_unreachable',
  'provider_unexpected_response',
  'sender_domain_not_found',
  'sender_domain_not_verified',
  'mx_absent',
  'mx_unreachable',
  'webhook_never_received',
  'test_not_sent',
  'test_not_replied',
  'dkim_not_aligned',
  'dkim_unverifiable',
  'dkim_absent',
] as const
export type ContractorMailCheckReason = (typeof CONTRACTOR_MAIL_CHECK_REASONS)[number]

export type ContractorMailCheckItem = {
  readonly key: ContractorMailCheckKey
  readonly reason: ContractorMailCheckReason
  readonly status: ContractorMailCheckStatus
}

/**
 * Nunca carrega `apiKey`, `webhookSigningSecret` nem o envelope — só se os dois estão configurados,
 * porque os dois vivem selados juntos (T006) e nunca meio configurados.
 */
export type ContractorMailSettingsSummary = {
  readonly apiKeyConfigured: boolean
  readonly id: string
  readonly lastWebhookAt: string | null
  readonly replyDomain: string
  readonly senderAddress: string
  readonly senderName: string
  readonly status: ContractorMailSettingsStatus
  readonly version: string
  readonly webhookId: string
  readonly webhookSecretConfigured: boolean
}

type ContractorMailSettingsContext = {
  readonly companyId: string
}

type ContractorMailSettingsActorContext = ContractorMailSettingsContext & {
  readonly userId: string
}

export type ReadContractorMailSettingsInput = {
  readonly context: ContractorMailSettingsContext
}

export type RunContractorMailChecksInput = {
  readonly context: ContractorMailSettingsContext
}

export type SaveContractorMailSettingsUseCaseInput = {
  readonly apiKey: string | undefined
  readonly context: ContractorMailSettingsActorContext
  readonly correlationId: string
  /**
   * Revisão do `architect` (T008): ausente é a primeira configuração ("eu acho que não existe
   * ainda"); presente é a atualização otimista ("eu acho que a versão é esta"). Repassado como veio
   * até o repositório — é lá que a corrida de fato se decide, com uma consulta atômica.
   */
  readonly expectedVersion: string | undefined
  readonly replyDomain: string
  readonly senderAddress: string
  readonly senderName: string
  readonly webhookSigningSecret: string | undefined
}

export type ContractorMailSettingsUseCase = {
  read(input: ReadContractorMailSettingsInput): Promise<ContractorMailSettingsSummary | null>
  runChecks(input: RunContractorMailChecksInput): Promise<readonly ContractorMailCheckItem[]>
  save(input: SaveContractorMailSettingsUseCaseInput): Promise<ContractorMailSettingsSummary>
}

const NOT_CONFIGURED_CHECKS: readonly ContractorMailCheckItem[] = CONTRACTOR_MAIL_CHECK_KEYS.map(
  (key) => ({ key, reason: 'not_configured', status: 'pending' }),
)

export function createContractorMailSettingsUseCase(dependencies: {
  readonly mxLookupGateway: MxLookupGateway
  readonly repository: ContractorMailRepositoryPort
  readonly resendAccountGateway: ResendAccountGateway
  readonly secretService: ContractorMailCredentialSecretService
}): ContractorMailSettingsUseCase {
  const { mxLookupGateway, repository, resendAccountGateway, secretService } = dependencies

  return {
    async read({ context }) {
      const settings = await repository.findSettings({ companyId: context.companyId })
      return settings === undefined ? null : toSummary(settings)
    },

    /**
     * RF12: nenhuma falha de rede derruba a resposta — cada verificação externa é isolada e vira um
     * item `failed` com o motivo, nunca uma exceção que propaga.
     */
    async runChecks({ context }) {
      const settings = await repository.findSettings({ companyId: context.companyId })
      if (settings === undefined) return NOT_CONFIGURED_CHECKS

      const [providerChecks, mxResult, setupTestStatus] = await Promise.all([
        checkProvider({ resendAccountGateway, secretService, settings }),
        mxLookupGateway.lookupMx({ domain: settings.replyDomain }),
        repository.findSetupTestStatus({ companyId: context.companyId }),
      ])

      return [
        providerChecks.apiKey,
        providerChecks.senderDomain,
        mapMxCheck(mxResult),
        mapWebhookReceivedCheck(settings),
        mapTestSentCheck(setupTestStatus),
        mapTestRepliedCheck(setupTestStatus),
        mapTestDkimCheck(setupTestStatus),
      ]
    },

    /**
     * Revisão do `architect` (T008): `expectedVersion` decide a intenção, não a leitura anterior de
     * `existing` — essa leitura é só um palpite (informa o merge de segredo e o `changedFields`),
     * porque entre ela e a escrita outra requisição pode ter vencido. Quem decide de verdade se a
     * escrita acontece é `repository.saveSettings`, com uma consulta atômica: `INSERT ... ON
     * CONFLICT DO NOTHING` quando `expectedVersion` está ausente (a intenção é criar), `UPDATE ...
     * WHERE version = expectedVersion` quando está presente. As duas devolvem `undefined` quando
     * perdem a corrida, e o repositório vira isso em `ContractorMailSettingsVersionConflictError`
     * (`409`) — sem gravar nenhum envelope selado com o id errado.
     */
    async save({
      apiKey,
      context,
      correlationId,
      expectedVersion,
      replyDomain,
      senderAddress,
      senderName,
      webhookSigningSecret,
    }) {
      const existing = await repository.findSettings({ companyId: context.companyId })
      const isCreateIntent = expectedVersion === undefined
      const settingsId = isCreateIntent
        ? crypto.randomUUID()
        : (existing?.id ?? crypto.randomUUID())

      const secret = await resolveSecret({
        apiKey,
        existing: isCreateIntent ? undefined : existing,
        secretService,
        settingsId,
        webhookSigningSecret,
      })
      const secretEnvelope = await secretService.encrypt({
        apiKey: secret.apiKey,
        companyId: context.companyId,
        settingsId,
        webhookSigningSecret: secret.webhookSigningSecret,
      })

      const changedFields = buildChangedFields({
        apiKey,
        existing,
        replyDomain,
        senderAddress,
        senderName,
        webhookSigningSecret,
      })

      const saved = await repository.saveSettings({
        audit: {
          action: CONTRACTOR_MAIL_SETTINGS_ACTION,
          actorUserId: context.userId,
          afterSnapshot: { changedFields, id: settingsId },
          beforeSnapshot:
            existing === undefined
              ? null
              : { id: existing.id, version: existing.version.toString() },
          companyId: context.companyId,
          correlationId,
          entityId: settingsId,
        },
        companyId: context.companyId,
        expectedVersion,
        replyDomain,
        secretEnvelope,
        senderAddress,
        senderName,
        settingsId,
      })

      return toSummary(saved)
    },
  }
}

/**
 * `existing` chega `undefined` sempre que a intenção é criar (`expectedVersion` ausente) — mesmo
 * que uma leitura anterior tenha achado uma linha, porque essa leitura não é mais confiável na hora
 * de decidir *segredo*: criar exige os dois de uma vez, nunca "preservar" algo que a intenção
 * declarada diz que não existe. Quando existe de verdade, o `INSERT ... ON CONFLICT DO NOTHING` do
 * repositório recusa a escrita de qualquer forma (`409`), e o segredo aqui resolvido nunca chega a
 * ser persistido.
 */
async function resolveSecret(input: {
  readonly apiKey: string | undefined
  readonly existing: ContractorMailSettingsRecord | undefined
  readonly secretService: ContractorMailCredentialSecretService
  readonly settingsId: string
  readonly webhookSigningSecret: string | undefined
}): Promise<ContractorMailCredentialSecret> {
  if (input.apiKey !== undefined && input.webhookSigningSecret !== undefined) {
    return { apiKey: input.apiKey, webhookSigningSecret: input.webhookSigningSecret }
  }
  if (input.existing === undefined) throw new ContractorMailSecretRequiredError()

  const previous = await input.secretService.decrypt({
    companyId: input.existing.companyId,
    envelope: input.existing.secretEnvelope as SecretEnvelopeV1,
    settingsId: input.existing.id,
  })
  return {
    apiKey: input.apiKey ?? previous.apiKey,
    webhookSigningSecret: input.webhookSigningSecret ?? previous.webhookSigningSecret,
  }
}

/** Nunca leva o valor dos campos — só o nome de quem mudou (plan.md, "Segurança e tenant"). */
function buildChangedFields(input: {
  readonly apiKey: string | undefined
  readonly existing: ContractorMailSettingsRecord | undefined
  readonly replyDomain: string
  readonly senderAddress: string
  readonly senderName: string
  readonly webhookSigningSecret: string | undefined
}): readonly string[] {
  const { apiKey, existing, replyDomain, senderAddress, senderName, webhookSigningSecret } = input
  const changed: string[] = []
  if (existing === undefined || existing.senderAddress !== senderAddress) {
    changed.push('senderAddress')
  }
  if (existing === undefined || existing.senderName !== senderName) changed.push('senderName')
  if (existing === undefined || existing.replyDomain !== replyDomain) changed.push('replyDomain')
  if (apiKey !== undefined) changed.push('apiKey')
  if (webhookSigningSecret !== undefined) changed.push('webhookSigningSecret')
  return changed
}

function toSummary(record: ContractorMailSettingsRecord): ContractorMailSettingsSummary {
  return {
    apiKeyConfigured: true,
    id: record.id,
    lastWebhookAt: record.lastWebhookAt === undefined ? null : record.lastWebhookAt.toISOString(),
    replyDomain: record.replyDomain,
    senderAddress: record.senderAddress,
    senderName: record.senderName,
    status: record.status,
    version: record.version.toString(),
    webhookId: record.webhookId,
    webhookSecretConfigured: true,
  }
}

/**
 * Revisão do `architect` (T008): a falha de abrir o **nosso** cofre (chave do keyring girada ou
 * removida, envelope adulterado) é motivo diferente de o **Resend** recusar — misturar os dois sob
 * `provider_unreachable` mandava o administrador reconferir a chave de API quando o problema era o
 * keyring local. Por isso os dois `try` são separados: o de decriptar nunca chega a chamar o
 * gateway.
 */
async function checkProvider(input: {
  readonly resendAccountGateway: ResendAccountGateway
  readonly secretService: ContractorMailCredentialSecretService
  readonly settings: ContractorMailSettingsRecord
}): Promise<{
  readonly apiKey: ContractorMailCheckItem
  readonly senderDomain: ContractorMailCheckItem
}> {
  let secret: ContractorMailCredentialSecret
  try {
    secret = await input.secretService.decrypt({
      companyId: input.settings.companyId,
      envelope: input.settings.secretEnvelope as SecretEnvelopeV1,
      settingsId: input.settings.id,
    })
  } catch (error) {
    const reason: ContractorMailCheckReason =
      error instanceof ContractorMailCredentialUnavailableError
        ? 'credential_unavailable'
        : 'provider_unreachable'
    return {
      apiKey: { key: 'api_key', reason, status: 'failed' },
      senderDomain: { key: 'sender_domain', reason, status: 'failed' },
    }
  }

  try {
    const result = await input.resendAccountGateway.checkApiKeyAndSenderDomain({
      apiKey: secret.apiKey,
      senderDomain: senderDomainOf(input.settings.senderAddress),
    })
    return {
      apiKey: { key: 'api_key', reason: 'ok', status: 'ok' },
      senderDomain: {
        key: 'sender_domain',
        reason: result.reason,
        status: result.senderDomainVerified ? 'ok' : 'pending',
      },
    }
  } catch (error) {
    const reason = mapProviderErrorReason(error)
    return {
      apiKey: { key: 'api_key', reason, status: 'failed' },
      senderDomain: { key: 'sender_domain', reason, status: 'failed' },
    }
  }
}

function senderDomainOf(senderAddress: string): string {
  return senderAddress.slice(senderAddress.indexOf('@') + 1)
}

function mapProviderErrorReason(error: unknown): ContractorMailCheckReason {
  if (error instanceof ResendProviderUnauthorizedError) return 'provider_unauthorized'
  if (error instanceof ResendProviderUnexpectedResponseError) return 'provider_unexpected_response'
  if (error instanceof ResendProviderUnreachableError) return 'provider_unreachable'
  return 'provider_unreachable'
}

function mapMxCheck(result: MxLookupResult): ContractorMailCheckItem {
  if (result.kind === 'found') return { key: 'reply_mx', reason: 'ok', status: 'ok' }
  if (result.kind === 'absent') return { key: 'reply_mx', reason: 'mx_absent', status: 'pending' }
  return { key: 'reply_mx', reason: 'mx_unreachable', status: 'failed' }
}

function mapWebhookReceivedCheck(settings: ContractorMailSettingsRecord): ContractorMailCheckItem {
  return settings.lastWebhookAt === undefined
    ? { key: 'webhook_received', reason: 'webhook_never_received', status: 'pending' }
    : { key: 'webhook_received', reason: 'ok', status: 'ok' }
}

function mapTestSentCheck(
  status: ContractorMailSetupTestStatus | undefined,
): ContractorMailCheckItem {
  return status?.hasOutboundSent === true
    ? { key: 'test_sent', reason: 'ok', status: 'ok' }
    : { key: 'test_sent', reason: 'test_not_sent', status: 'pending' }
}

function mapTestRepliedCheck(
  status: ContractorMailSetupTestStatus | undefined,
): ContractorMailCheckItem {
  return status?.hasInboundReply === true
    ? { key: 'test_replied', reason: 'ok', status: 'ok' }
    : { key: 'test_replied', reason: 'test_not_replied', status: 'pending' }
}

function mapTestDkimCheck(
  status: ContractorMailSetupTestStatus | undefined,
): ContractorMailCheckItem {
  if (status?.hasInboundReply !== true) {
    return { key: 'test_dkim', reason: 'test_not_replied', status: 'pending' }
  }
  if (status.dkimResult === 'aligned') return { key: 'test_dkim', reason: 'ok', status: 'ok' }
  if (status.dkimResult === 'not_aligned') {
    return { key: 'test_dkim', reason: 'dkim_not_aligned', status: 'failed' }
  }
  if (status.dkimResult === 'unverifiable') {
    return { key: 'test_dkim', reason: 'dkim_unverifiable', status: 'failed' }
  }
  return { key: 'test_dkim', reason: 'dkim_absent', status: 'failed' }
}
