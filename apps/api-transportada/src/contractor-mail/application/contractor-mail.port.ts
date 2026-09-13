/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ContractorMailSettingsStatus,
  ContractorMailThreadStatus,
  ContractorMailThreadSubjectType,
} from '../../database/contractor-mail.schema.js'

/**
 * `secretEnvelope` é o jsonb como veio do banco, sem abrir: quem sela e quem lê o conteúdo é a
 * T006. Este repositório só transporta.
 */
export type ContractorMailSettingsRecord = {
  readonly companyId: string
  readonly id: string
  readonly lastWebhookAt: Date | undefined
  readonly replyDomain: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
  readonly status: ContractorMailSettingsStatus
  readonly version: bigint
  readonly webhookId: string
}

export type UpsertContractorMailSettingsInput = {
  readonly companyId: string
  readonly replyDomain: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
}

export type ContractorMailThreadRecord = {
  readonly companyId: string
  readonly contractorId: string | undefined
  readonly createdAt: Date
  readonly id: string
  readonly replyTokenHash: string
  readonly status: ContractorMailThreadStatus
  readonly subjectId: string
  readonly subjectType: ContractorMailThreadSubjectType
}

export type ContractorMailRepositoryPort = {
  readonly findSettings: (input: {
    readonly companyId: string
  }) => Promise<ContractorMailSettingsRecord | undefined>
  /**
   * Única busca sem `companyId` de entrada: o webhook só carrega o `webhookId` opaco da URL, e é
   * esta busca que **descobre** a empresa (`webhook_id` é único no banco inteiro). Mesma forma de
   * `findByCodeHash` em `identity/infrastructure/drizzle-password-reset.repository.ts` — a própria
   * linha encontrada é quem estabelece o tenant, não o contrário.
   */
  readonly findSettingsByWebhookId: (input: {
    readonly webhookId: string
  }) => Promise<ContractorMailSettingsRecord | undefined>
  /** plan.md § Segurança e tenant: o hash acha a conversa, e `companyId` confere que é a do webhook. */
  readonly findThreadByReplyTokenHash: (input: {
    readonly companyId: string
    readonly replyTokenHash: string
  }) => Promise<ContractorMailThreadRecord | undefined>
  /** Grava o envelope como veio — abrir e selar é da T006. */
  readonly upsertSettings: (input: UpsertContractorMailSettingsInput) => Promise<void>
}
