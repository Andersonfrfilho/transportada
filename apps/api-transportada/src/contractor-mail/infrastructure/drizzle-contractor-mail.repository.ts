/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, type SQL, sql } from 'drizzle-orm'

import {
  auditLogs,
  contractorMailMessages,
  contractorMailSettings,
  contractorMailThreads,
} from '../../database/database.schema.js'
import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  ContractorMailSetupTestStatus,
  ContractorMailThreadRecord,
  SaveContractorMailSettingsInput,
} from '../application/contractor-mail.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const SETTINGS_COLUMNS = {
  companyId: contractorMailSettings.companyId,
  id: contractorMailSettings.id,
  lastWebhookAt: contractorMailSettings.lastWebhookAt,
  replyDomain: contractorMailSettings.replyDomain,
  secretEnvelope: contractorMailSettings.secretEnvelope,
  senderAddress: contractorMailSettings.senderAddress,
  senderName: contractorMailSettings.senderName,
  status: contractorMailSettings.status,
  version: contractorMailSettings.version,
  webhookId: contractorMailSettings.webhookId,
}

const THREAD_COLUMNS = {
  companyId: contractorMailThreads.companyId,
  contractorId: contractorMailThreads.contractorId,
  createdAt: contractorMailThreads.createdAt,
  id: contractorMailThreads.id,
  replyTokenHash: contractorMailThreads.replyTokenHash,
  status: contractorMailThreads.status,
  subjectId: contractorMailThreads.subjectId,
  subjectType: contractorMailThreads.subjectType,
}

/**
 * plan.md § Segurança e tenant: "O tenant sai do token, conferido contra o webhook." O hash é
 * único no banco inteiro (`contractor_mail_threads_reply_token_hash_unique`), mas a consulta nunca
 * confia nisso sozinha — `company_id` entra na mesma condição, e não como conferência depois. Um
 * token de conversa de outra empresa não acha nada, porque a linha buscada exige as duas coisas
 * ao mesmo tempo.
 */
export const buildContractorMailThreadByReplyTokenFilters = (input: {
  readonly companyId: string
  readonly replyTokenHash: string
}): readonly SQL[] => [
  eq(contractorMailThreads.companyId, input.companyId),
  eq(contractorMailThreads.replyTokenHash, input.replyTokenHash),
]

export class DrizzleContractorMailRepository implements ContractorMailRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async findSettings({
    companyId,
  }: {
    readonly companyId: string
  }): Promise<ContractorMailSettingsRecord | undefined> {
    const [row] = await this.database
      .select(SETTINGS_COLUMNS)
      .from(contractorMailSettings)
      .where(eq(contractorMailSettings.companyId, companyId))
      .limit(1)

    return row === undefined ? undefined : { ...row, lastWebhookAt: row.lastWebhookAt ?? undefined }
  }

  /**
   * Única busca sem `companyId` de entrada: o webhook só carrega o `webhookId` opaco da URL, e é
   * esta busca que **descobre** a empresa — `webhook_id` é único no banco inteiro
   * (`contractor_mail_settings_webhook_id_unique`), mesma forma de `findByCodeHash` em
   * `identity/infrastructure/drizzle-password-reset.repository.ts`.
   */
  public async findSettingsByWebhookId({
    webhookId,
  }: {
    readonly webhookId: string
  }): Promise<ContractorMailSettingsRecord | undefined> {
    const [row] = await this.database
      .select(SETTINGS_COLUMNS)
      .from(contractorMailSettings)
      .where(eq(contractorMailSettings.webhookId, webhookId))
      .limit(1)

    return row === undefined ? undefined : { ...row, lastWebhookAt: row.lastWebhookAt ?? undefined }
  }

  public async findThreadByReplyTokenHash(input: {
    readonly companyId: string
    readonly replyTokenHash: string
  }): Promise<ContractorMailThreadRecord | undefined> {
    const [row] = await this.database
      .select(THREAD_COLUMNS)
      .from(contractorMailThreads)
      .where(and(...buildContractorMailThreadByReplyTokenFilters(input)))
      .limit(1)

    return row === undefined ? undefined : { ...row, contractorId: row.contractorId ?? undefined }
  }

  /**
   * Spec 143 T008: lê a conversa `setup_test` da empresa (RF13) e, se existir, o estado das
   * mensagens dela — `undefined` quando ela ainda não existe (T009/T010 não fecharam), o que o
   * caso de uso lê como "pendente".
   */
  public async findSetupTestStatus({
    companyId,
  }: {
    readonly companyId: string
  }): Promise<ContractorMailSetupTestStatus | undefined> {
    const [thread] = await this.database
      .select({ id: contractorMailThreads.id })
      .from(contractorMailThreads)
      .where(
        and(
          eq(contractorMailThreads.companyId, companyId),
          eq(contractorMailThreads.subjectType, 'setup_test'),
        ),
      )
      .limit(1)
    if (thread === undefined) return undefined

    const messages = await this.database
      .select({
        deliveryStatus: contractorMailMessages.deliveryStatus,
        direction: contractorMailMessages.direction,
        dkimResult: contractorMailMessages.dkimResult,
      })
      .from(contractorMailMessages)
      .where(
        and(
          eq(contractorMailMessages.companyId, companyId),
          eq(contractorMailMessages.threadId, thread.id),
        ),
      )

    const inboundMessage = messages.find((message) => message.direction === 'inbound')
    return {
      dkimResult: inboundMessage?.dkimResult ?? undefined,
      hasInboundReply: inboundMessage !== undefined,
      hasOutboundSent: messages.some(
        (message) => message.direction === 'outbound' && message.deliveryStatus === 'sent',
      ),
    }
  }

  /**
   * Upsert do envelope selado (abrir/selar é da T006) e a trilha de auditoria, na mesma transação:
   * a linha e o registro de "o que mudou" nascem ou não nascem juntos. `id` é passado pelo caso de
   * uso (nunca `defaultRandom()`) porque o AAD do envelope amarra a este id, e ele precisa existir
   * **antes** da chamada a `secretService.encrypt` — não depois, quando o banco o gerasse sozinho.
   */
  public async saveSettings(
    input: SaveContractorMailSettingsInput,
  ): Promise<ContractorMailSettingsRecord> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .insert(contractorMailSettings)
        .values({
          id: input.settingsId,
          companyId: input.companyId,
          replyDomain: input.replyDomain,
          secretEnvelope: input.secretEnvelope,
          senderAddress: input.senderAddress,
          senderName: input.senderName,
        })
        .onConflictDoUpdate({
          set: {
            replyDomain: input.replyDomain,
            secretEnvelope: input.secretEnvelope,
            senderAddress: input.senderAddress,
            senderName: input.senderName,
            updatedAt: sql`now()`,
            version: sql`${contractorMailSettings.version} + 1`,
          },
          target: contractorMailSettings.companyId,
        })

      await transaction.insert(auditLogs).values({
        action: input.audit.action,
        actorUserId: input.audit.actorUserId,
        afterSnapshot: input.audit.afterSnapshot,
        beforeSnapshot: input.audit.beforeSnapshot,
        companyId: input.companyId,
        correlationId: input.audit.correlationId,
        entityId: input.audit.entityId,
        entityType: 'contractor_mail_settings',
      })

      const [row] = await transaction
        .select(SETTINGS_COLUMNS)
        .from(contractorMailSettings)
        .where(eq(contractorMailSettings.companyId, input.companyId))
        .limit(1)
      if (row === undefined) {
        throw new Error('contractor mail settings row vanished inside its own transaction')
      }

      return { ...row, lastWebhookAt: row.lastWebhookAt ?? undefined }
    })
  }
}
