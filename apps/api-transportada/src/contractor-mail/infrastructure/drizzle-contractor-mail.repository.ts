/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, type SQL, sql } from 'drizzle-orm'

import { contractorMailSettings, contractorMailThreads } from '../../database/database.schema.js'
import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
  ContractorMailThreadRecord,
  UpsertContractorMailSettingsInput,
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

  /** Grava o envelope como veio — abrir e selar é da T006. */
  public async upsertSettings(input: UpsertContractorMailSettingsInput): Promise<void> {
    await this.database
      .insert(contractorMailSettings)
      .values({
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
        },
        target: contractorMailSettings.companyId,
      })
  }
}
