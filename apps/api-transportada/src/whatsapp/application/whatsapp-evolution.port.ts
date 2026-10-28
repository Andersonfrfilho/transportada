/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type {
  WhatsAppDefaultProvider,
  WhatsAppEvolutionConnectionState,
  WhatsAppEvolutionStatus,
} from '../../database/whatsapp-evolution.schema.js'

/**
 * O que a tela vê. ⚠️ Sem campo de chave, nem mascarado: quem precisa saber se há chave pergunta
 * `apiKeyConfigured`. Lista fechada, para um campo novo não vazar por espalhamento.
 */
export type WhatsAppEvolutionSummary = {
  readonly apiKeyConfigured: boolean
  readonly baseUrl: string
  readonly connectionCheckedAt: string | null
  readonly connectionState: WhatsAppEvolutionConnectionState
  readonly createdAt: string
  readonly dailyCap: number
  readonly defaultProvider: WhatsAppDefaultProvider
  readonly id: string
  readonly instanceName: string
  readonly minIntervalSeconds: number
  readonly riskAcknowledgedAt: string | null
  readonly status: WhatsAppEvolutionStatus
  readonly updatedAt: string
  readonly version: string
}

export type SaveWhatsAppEvolutionValues = {
  readonly acknowledgeRisk: boolean
  /** Ausente na atualização: quem não manda chave nova mantém a que está selada. */
  readonly apiKey?: string | undefined
  readonly baseUrl: string
  readonly dailyCap: number
  readonly defaultProvider: WhatsAppDefaultProvider
  readonly instanceName: string
  readonly minIntervalSeconds: number
  readonly status: WhatsAppEvolutionStatus
}

export type WhatsAppEvolutionAudit = {
  readonly action: string
  readonly actorUserId: string
  readonly afterSnapshot: Record<string, unknown>
  readonly beforeSnapshot: Record<string, unknown> | null
  readonly correlationId: string
}

export type WhatsAppEvolutionSaveRecord = {
  readonly audit: WhatsAppEvolutionAudit
  readonly baseUrl: string
  readonly companyId: string
  readonly dailyCap: number
  readonly defaultProvider: WhatsAppDefaultProvider
  readonly instanceName: string
  readonly minIntervalSeconds: number
  /** A conexão volta a `unknown` quando endereço, instância ou chave mudam. */
  readonly resetConnection: boolean
  readonly riskAcknowledgedBy: string | undefined
  /** Só quando a chave mudou; ausente mantém o envelope gravado. */
  readonly secretEnvelope: SecretEnvelopeV1 | undefined
  readonly settingsId: string
  readonly status: WhatsAppEvolutionStatus
}

/** O que a chamada ao Evolution precisa: a chave selada, com a empresa que a nomeia no AAD. */
export type WhatsAppEvolutionCredential = {
  readonly baseUrl: string
  readonly companyId: string
  readonly envelope: SecretEnvelopeV1
  readonly instanceName: string
  readonly settingsId: string
  readonly status: WhatsAppEvolutionStatus
}

export type WhatsAppEvolutionRepositoryPort = {
  find(input: { readonly companyId: string }): Promise<WhatsAppEvolutionSummary | null>
  findCredential(input: { readonly companyId: string }): Promise<WhatsAppEvolutionCredential | null>
  /** Grava o último estado; audita só quando ele muda. */
  recordConnection(input: {
    readonly audit: Omit<WhatsAppEvolutionAudit, 'afterSnapshot' | 'beforeSnapshot'> | undefined
    readonly companyId: string
    readonly state: WhatsAppEvolutionConnectionState
  }): Promise<WhatsAppEvolutionSummary | null>
  /** Auditoria do pedido de QR, sem o QR. */
  recordQrRequest(input: {
    readonly audit: Omit<WhatsAppEvolutionAudit, 'afterSnapshot' | 'beforeSnapshot'>
    readonly companyId: string
    readonly settingsId: string
  }): Promise<void>
  save(input: WhatsAppEvolutionSaveRecord): Promise<WhatsAppEvolutionSummary>
}

export type EvolutionConnectionRequest = {
  readonly apiKey: string
  readonly baseUrl: string
  readonly instanceName: string
}

export type EvolutionQrResult = {
  /** PNG em base64 como o Evolution devolve (com ou sem prefixo `data:`); nulo quando não há QR. */
  readonly pairingCode: string | null
  readonly qrBase64: string | null
}

/** A porta para o provedor: a API fala com o Evolution só por aqui, e a chave nunca sai desta chamada. */
export type WhatsAppEvolutionGatewayPort = {
  getConnectionState(
    input: EvolutionConnectionRequest,
  ): Promise<Exclude<WhatsAppEvolutionConnectionState, 'unknown'>>
  getQrCode(input: EvolutionConnectionRequest): Promise<EvolutionQrResult>
}

/**
 * Spec 281 T4b: criar a instância do número pela API, com a chave **global** do Evolution (variável de
 * ambiente, nunca do banco nem do navegador). Devolve o token da instância, que passa a ser a chave da empresa.
 */
export type WhatsAppEvolutionProvisionerPort = {
  readonly baseUrl: string
  createInstance(input: { readonly instanceName: string }): Promise<{ readonly token: string }>
}
