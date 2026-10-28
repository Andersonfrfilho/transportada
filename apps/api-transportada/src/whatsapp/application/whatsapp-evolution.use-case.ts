/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WhatsAppEvolutionConnectionState } from '../../database/whatsapp-evolution.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { normalizeEvolutionBaseUrl } from '../domain/evolution-base-url.policy.js'
import {
  WhatsAppEvolutionApiKeyRequiredError,
  WhatsAppEvolutionDisabledError,
  WhatsAppEvolutionNotConfiguredError,
  WhatsAppEvolutionProvisioningUnavailableError,
  WhatsAppEvolutionProviderNotEnabledError,
  WhatsAppEvolutionRiskNotAcknowledgedError,
  WhatsAppEvolutionUnreachableError,
} from '../domain/whatsapp-evolution.error.js'
import type {
  SaveWhatsAppEvolutionValues,
  WhatsAppEvolutionGatewayPort,
  WhatsAppEvolutionProvisionerPort,
  WhatsAppEvolutionRepositoryPort,
  WhatsAppEvolutionSummary,
} from './whatsapp-evolution.port.js'
import type { WhatsAppEvolutionSecretService } from './whatsapp-evolution-secret.service.js'

const SETTINGS_SAVED_ACTION = 'whatsapp-evolution.settings.saved'
const CONNECTION_CHANGED_ACTION = 'whatsapp-evolution.connection.changed'
const QR_EMPTY_ATTEMPTS = 3
const QR_EMPTY_RETRY_MILLISECONDS = 2000
const QR_REQUESTED_ACTION = 'whatsapp-evolution.qr.requested'

/** O QR do WhatsApp vale poucas dezenas de segundos; a tela pede outro nesse ritmo até conectar. */
export const WHATSAPP_EVOLUTION_QR_REFRESH_SECONDS = 20

export type WhatsAppEvolutionConnection = {
  readonly checkedAt: string
  readonly state: WhatsAppEvolutionConnectionState
}

export type WhatsAppEvolutionQr = {
  /** `data:image/png;base64,…` pronto para `<img>`; nulo com a instância já conectada. */
  readonly pairingCode: string | null
  readonly qrCode: string | null
  readonly refreshAfterSeconds: number
  readonly state: WhatsAppEvolutionConnectionState
}

export type WhatsAppEvolutionUseCase = {
  connection(input: {
    readonly context: CompanyContext
    readonly correlationId: string
  }): Promise<WhatsAppEvolutionConnection>
  /** Cria a instância pelo Evolution do ambiente e liga o canal, sem digitar endereço nem chave (T4b). */
  provision(input: {
    readonly acknowledgeRisk: boolean
    readonly context: CompanyContext
    readonly correlationId: string
  }): Promise<WhatsAppEvolutionSummary>
  /** A tela só oferece "Criar e conectar" quando o ambiente tem como criar. */
  readonly provisioningAvailable: boolean
  qr(input: {
    readonly context: CompanyContext
    readonly correlationId: string
  }): Promise<WhatsAppEvolutionQr>
  read(input: { readonly context: CompanyContext }): Promise<WhatsAppEvolutionSummary | null>
  save(input: {
    readonly context: CompanyContext
    readonly correlationId: string
    readonly values: SaveWhatsAppEvolutionValues
  }): Promise<WhatsAppEvolutionSummary>
}

export function createWhatsAppEvolutionUseCase(dependencies: {
  readonly gateway: WhatsAppEvolutionGatewayPort
  readonly logger?: { warn(message: string, meta?: Record<string, unknown>): void }
  readonly newSettingsId: () => string
  /** Pausa entre tentativas do QR; os testes a trocam por uma instantânea. */
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly provisioner?: WhatsAppEvolutionProvisionerPort
  readonly now: () => Date
  readonly repository: WhatsAppEvolutionRepositoryPort
  readonly secrets: WhatsAppEvolutionSecretService
  /**
   * Spec 281 T6: quem pede o QR está conectando o número, e é a hora de apontar o webhook (uma vez;
   * falha só vai ao log). Ausente, o QR segue como na T4.
   */
  readonly webhook?: {
    ensureRegistered(input: {
      readonly actorUserId: string
      readonly companyId: string
      readonly correlationId: string
    }): Promise<void>
  }
}): WhatsAppEvolutionUseCase {
  const { gateway, repository, secrets } = dependencies

  /** Abre a chave e devolve o pedido ao gateway; a chave não sai desta função para nenhum retorno. */
  async function openCredential(companyId: string) {
    const credential = await repository.findCredential({ companyId })
    if (credential === null) throw new WhatsAppEvolutionNotConfiguredError()
    const { apiKey } = await secrets.decrypt({
      companyId,
      envelope: credential.envelope,
      settingsId: credential.settingsId,
    })
    return {
      credential,
      request: { apiKey, baseUrl: credential.baseUrl, instanceName: credential.instanceName },
    }
  }

  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))

  const useCase: WhatsAppEvolutionUseCase = {
    provisioningAvailable: dependencies.provisioner !== undefined,

    async provision({ acknowledgeRisk, context, correlationId }) {
      const provisioner = dependencies.provisioner
      if (provisioner === undefined) throw new WhatsAppEvolutionProvisioningUnavailableError()
      const existing = await repository.find({ companyId: context.companyId })
      if (existing?.apiKeyConfigured === true && existing.baseUrl === provisioner.baseUrl) {
        // Já criada: religar não cria outra instância nem troca a chave.
        return useCase.save({
          context,
          correlationId,
          values: {
            acknowledgeRisk,
            baseUrl: existing.baseUrl,
            dailyCap: existing.dailyCap,
            defaultProvider: existing.defaultProvider,
            instanceName: existing.instanceName,
            minIntervalSeconds: existing.minIntervalSeconds,
            status: 'active',
          },
        })
      }
      if (!acknowledgeRisk && existing?.riskAcknowledgedAt == null) {
        throw new WhatsAppEvolutionRiskNotAcknowledgedError()
      }
      const instanceName = `transportada-${context.companyId.replaceAll('-', '').slice(0, 12)}`
      let token: string
      try {
        ;({ token } = await provisioner.createInstance({ instanceName }))
      } catch {
        throw new WhatsAppEvolutionUnreachableError()
      }
      return useCase.save({
        context,
        correlationId,
        values: {
          acknowledgeRisk,
          apiKey: token,
          baseUrl: provisioner.baseUrl,
          dailyCap: existing?.dailyCap ?? 50,
          defaultProvider: existing?.defaultProvider ?? 'meta',
          instanceName,
          minIntervalSeconds: existing?.minIntervalSeconds ?? 15,
          status: 'active',
        },
      })
    },

    async connection({ context, correlationId }) {
      const { request } = await openCredential(context.companyId)
      const state = await readState(gateway, request)
      await repository.recordConnection({
        audit: {
          action: CONNECTION_CHANGED_ACTION,
          actorUserId: context.userId,
          correlationId,
        },
        companyId: context.companyId,
        state,
      })
      return { checkedAt: dependencies.now().toISOString(), state }
    },

    async qr({ context, correlationId }) {
      const { credential, request } = await openCredential(context.companyId)
      if (credential.status !== 'active') throw new WhatsAppEvolutionDisabledError()

      const state = await readState(gateway, request)
      await repository.recordConnection({
        audit: {
          action: CONNECTION_CHANGED_ACTION,
          actorUserId: context.userId,
          correlationId,
        },
        companyId: context.companyId,
        state,
      })
      await dependencies.webhook?.ensureRegistered({
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
      })
      if (state === 'open') {
        return { pairingCode: null, qrCode: null, refreshAfterSeconds: 0, state }
      }

      let qr
      try {
        qr = await gateway.getQrCode(request)
        // O Evolution gera o primeiro QR de forma assíncrona: o pedido que acorda a instância pode voltar vazio.
        for (let attempt = 1; attempt < QR_EMPTY_ATTEMPTS && isEmptyQr(qr); attempt += 1) {
          await sleep(QR_EMPTY_RETRY_MILLISECONDS)
          qr = await gateway.getQrCode(request)
        }
      } catch {
        throw new WhatsAppEvolutionUnreachableError()
      }
      if (isEmptyQr(qr)) {
        dependencies.logger?.warn('whatsapp_evolution.qr_empty', {
          companyId: context.companyId,
          correlationId,
        })
      }
      await repository.recordQrRequest({
        audit: { action: QR_REQUESTED_ACTION, actorUserId: context.userId, correlationId },
        companyId: context.companyId,
        settingsId: credential.settingsId,
      })
      return {
        pairingCode: qr.pairingCode,
        qrCode: toDataUrl(qr.qrBase64),
        refreshAfterSeconds: WHATSAPP_EVOLUTION_QR_REFRESH_SECONDS,
        state,
      }
    },

    async read({ context }) {
      return repository.find({ companyId: context.companyId })
    },

    async save({ context, correlationId, values }) {
      const existing = await repository.find({ companyId: context.companyId })
      const baseUrl = normalizeEvolutionBaseUrl(values.baseUrl)
      const hasNewKey = (values.apiKey ?? '') !== ''

      if (existing === null && !hasNewKey) throw new WhatsAppEvolutionApiKeyRequiredError()

      const alreadyAcknowledged = existing?.riskAcknowledgedAt != null
      if (values.status === 'active' && !alreadyAcknowledged && !values.acknowledgeRisk) {
        throw new WhatsAppEvolutionRiskNotAcknowledgedError()
      }
      if (values.defaultProvider === 'evolution' && values.status !== 'active') {
        throw new WhatsAppEvolutionProviderNotEnabledError()
      }

      const settingsId = existing?.id ?? dependencies.newSettingsId()
      const secretEnvelope = hasNewKey
        ? await secrets.encrypt({
            apiKey: values.apiKey as string,
            companyId: context.companyId,
            settingsId,
          })
        : undefined

      const changedFields = [
        ...(existing === null || existing.baseUrl !== baseUrl ? ['baseUrl'] : []),
        ...(existing === null || existing.instanceName !== values.instanceName
          ? ['instanceName']
          : []),
        ...(hasNewKey ? ['apiKey'] : []),
        ...(existing === null || existing.status !== values.status ? ['status'] : []),
        ...(existing === null || existing.defaultProvider !== values.defaultProvider
          ? ['defaultProvider']
          : []),
        ...(existing === null || existing.dailyCap !== values.dailyCap ? ['dailyCap'] : []),
        ...(existing === null || existing.minIntervalSeconds !== values.minIntervalSeconds
          ? ['minIntervalSeconds']
          : []),
      ]

      return repository.save({
        audit: {
          action: SETTINGS_SAVED_ACTION,
          actorUserId: context.userId,
          // Nunca o valor dos campos, só o nome de quem mudou.
          afterSnapshot: { changedFields, id: settingsId },
          beforeSnapshot:
            existing === null
              ? null
              : { id: existing.id, status: existing.status, version: existing.version },
          correlationId,
        },
        baseUrl,
        companyId: context.companyId,
        dailyCap: values.dailyCap,
        defaultProvider: values.defaultProvider,
        instanceName: values.instanceName,
        minIntervalSeconds: values.minIntervalSeconds,
        resetConnection:
          existing === null ||
          hasNewKey ||
          existing.baseUrl !== baseUrl ||
          existing.instanceName !== values.instanceName,
        riskAcknowledgedBy:
          !alreadyAcknowledged && values.acknowledgeRisk ? context.userId : undefined,
        secretEnvelope,
        settingsId,
        status: values.status,
      })
    },
  }
  return useCase
}

async function readState(
  gateway: WhatsAppEvolutionGatewayPort,
  request: Parameters<WhatsAppEvolutionGatewayPort['getConnectionState']>[0],
) {
  try {
    return await gateway.getConnectionState(request)
  } catch {
    throw new WhatsAppEvolutionUnreachableError()
  }
}

function isEmptyQr(qr: { pairingCode: string | null; qrBase64: string | null }): boolean {
  return (qr.qrBase64 ?? '') === '' && (qr.pairingCode ?? '') === ''
}

function toDataUrl(base64: string | null): string | null {
  if (base64 === null || base64 === '') return null
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
}
