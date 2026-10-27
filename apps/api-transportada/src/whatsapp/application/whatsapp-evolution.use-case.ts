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
  WhatsAppEvolutionProviderNotEnabledError,
  WhatsAppEvolutionRiskNotAcknowledgedError,
  WhatsAppEvolutionUnreachableError,
} from '../domain/whatsapp-evolution.error.js'
import type {
  SaveWhatsAppEvolutionValues,
  WhatsAppEvolutionGatewayPort,
  WhatsAppEvolutionRepositoryPort,
  WhatsAppEvolutionSummary,
} from './whatsapp-evolution.port.js'
import type { WhatsAppEvolutionSecretService } from './whatsapp-evolution-secret.service.js'

const SETTINGS_SAVED_ACTION = 'whatsapp-evolution.settings.saved'
const CONNECTION_CHANGED_ACTION = 'whatsapp-evolution.connection.changed'
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
  readonly newSettingsId: () => string
  readonly now: () => Date
  readonly repository: WhatsAppEvolutionRepositoryPort
  readonly secrets: WhatsAppEvolutionSecretService
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

  return {
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
      if (state === 'open') {
        return { pairingCode: null, qrCode: null, refreshAfterSeconds: 0, state }
      }

      let qr
      try {
        qr = await gateway.getQrCode(request)
      } catch {
        throw new WhatsAppEvolutionUnreachableError()
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

function toDataUrl(base64: string | null): string | null {
  if (base64 === null || base64 === '') return null
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
}
