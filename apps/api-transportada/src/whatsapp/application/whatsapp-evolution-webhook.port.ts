/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type {
  WhatsAppEvolutionConnectionState,
  WhatsAppEvolutionStatus,
} from '../../database/whatsapp-evolution.schema.js'
import type {
  EvolutionConnectionRequest,
  WhatsAppEvolutionAudit,
} from './whatsapp-evolution.port.js'

/** O que a entrega anônima precisa para se provar: a empresa da URL e o segredo dela, selado. */
export type WhatsAppEvolutionWebhookTarget = {
  readonly companyId: string
  readonly instanceName: string
  readonly settingsId: string
  readonly status: WhatsAppEvolutionStatus
  readonly webhookEnvelope: SecretEnvelopeV1 | null
}

/** O que apontar o webhook precisa: a chave da instância (para falar com o Evolution) e o segredo. */
export type WhatsAppEvolutionWebhookRegistration = {
  readonly apiKeyEnvelope: SecretEnvelopeV1
  readonly baseUrl: string
  readonly instanceName: string
  readonly registeredAt: Date | null
  readonly settingsId: string
  readonly status: WhatsAppEvolutionStatus
  readonly webhookEnvelope: SecretEnvelopeV1 | null
  readonly webhookId: string
}

export type WhatsAppEvolutionWebhookRepositoryPort = {
  findByWebhookId(input: {
    readonly webhookId: string
  }): Promise<WhatsAppEvolutionWebhookTarget | null>
  findRegistration(input: {
    readonly companyId: string
  }): Promise<WhatsAppEvolutionWebhookRegistration | null>
  /** Marca o webhook como apontado para nós, com auditoria sem segredo nem URL. */
  markRegistered(input: {
    readonly audit: Omit<WhatsAppEvolutionAudit, 'afterSnapshot' | 'beforeSnapshot'>
    readonly companyId: string
    readonly rotated: boolean
    readonly settingsId: string
  }): Promise<Date>
  /** A entrega autenticada: o horário dela e, quando é de conexão, o estado novo. */
  recordDelivery(input: {
    readonly companyId: string
    readonly connectionState?: Exclude<WhatsAppEvolutionConnectionState, 'unknown'>
  }): Promise<void>
  /**
   * Grava o segredo novo **antes** de o Evolution passar a mandá-lo; o registro volta a pendente até
   * `markRegistered`. Assim nunca há segredo no Evolution que a API não conheça.
   */
  storeSecret(input: {
    readonly companyId: string
    readonly envelope: SecretEnvelopeV1
    readonly settingsId: string
  }): Promise<void>
}

export type WhatsAppEvolutionWebhookGatewayPort = {
  setWebhook(
    input: EvolutionConnectionRequest & {
      readonly headers: Readonly<Record<string, string>>
      readonly url: string
    },
  ): Promise<void>
}
