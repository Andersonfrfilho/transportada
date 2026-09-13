/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  contractorMailMessages,
  contractorMailSettings,
  contractorMailThreads,
} from '../../database/contractor-mail.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type ContractorMailOutboundMessageRecord = {
  readonly bodyText: string
  readonly threadId: string
}

export type ContractorMailOutboundThreadRecord = {
  readonly subjectType: string
}

export type ContractorMailOutboundSettingsRecord = {
  readonly id: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
}

export type ContractorMailReferenceHeaders = {
  readonly rfcMessageId: string
}

/**
 * Objetivo item 5 (T009): o consumidor "carrega a mensagem, a conversa e a configuração" — as três
 * leituras seguintes — e depois grava o resultado do envio. Toda leitura e escrita filtra por
 * `company_id` na mesma condição, nunca como conferência depois (o mesmo molde do repositório da
 * API).
 */
export type ContractorMailOutboundWorkerRepository = {
  findLastInboundReferenceHeaders(input: {
    readonly companyId: string
    readonly threadId: string
  }): Promise<ContractorMailReferenceHeaders | undefined>
  findMessageById(input: {
    readonly companyId: string
    readonly messageId: string
  }): Promise<ContractorMailOutboundMessageRecord | undefined>
  findSettingsByCompanyId(input: {
    readonly companyId: string
  }): Promise<ContractorMailOutboundSettingsRecord | undefined>
  findThreadById(input: {
    readonly companyId: string
    readonly threadId: string
  }): Promise<ContractorMailOutboundThreadRecord | undefined>
  markMessageFailed(input: {
    readonly companyId: string
    readonly messageId: string
  }): Promise<void>
  markMessageSent(input: {
    readonly companyId: string
    readonly messageId: string
    readonly providerEmailId: string
  }): Promise<void>
}

export function createDrizzleContractorMailOutboundWorkerRepository(
  database: Database,
): ContractorMailOutboundWorkerRepository {
  return {
    async findMessageById({ companyId, messageId }) {
      const [row] = await database
        .select({
          bodyText: contractorMailMessages.bodyText,
          threadId: contractorMailMessages.threadId,
        })
        .from(contractorMailMessages)
        .where(
          and(
            eq(contractorMailMessages.companyId, companyId),
            eq(contractorMailMessages.id, messageId),
          ),
        )
        .limit(1)
      return row
    },

    async findThreadById({ companyId, threadId }) {
      const [row] = await database
        .select({ subjectType: contractorMailThreads.subjectType })
        .from(contractorMailThreads)
        .where(
          and(
            eq(contractorMailThreads.companyId, companyId),
            eq(contractorMailThreads.id, threadId),
          ),
        )
        .limit(1)
      return row
    },

    async findSettingsByCompanyId({ companyId }) {
      const [row] = await database
        .select({
          id: contractorMailSettings.id,
          secretEnvelope: contractorMailSettings.secretEnvelope,
          senderAddress: contractorMailSettings.senderAddress,
          senderName: contractorMailSettings.senderName,
        })
        .from(contractorMailSettings)
        .where(eq(contractorMailSettings.companyId, companyId))
        .limit(1)
      return row
    },

    /** A última mensagem **recebida** da conversa dá o `In-Reply-To`/`References` (RF7). */
    async findLastInboundReferenceHeaders({ companyId, threadId }) {
      const [row] = await database
        .select({ rfcMessageId: contractorMailMessages.rfcMessageId })
        .from(contractorMailMessages)
        .where(
          and(
            eq(contractorMailMessages.companyId, companyId),
            eq(contractorMailMessages.threadId, threadId),
            eq(contractorMailMessages.direction, 'inbound'),
          ),
        )
        .orderBy(desc(contractorMailMessages.createdAt))
        .limit(1)

      if (row === undefined || row.rfcMessageId === null || row.rfcMessageId === '')
        return undefined
      return { rfcMessageId: row.rfcMessageId }
    },

    async markMessageSent({ companyId, messageId, providerEmailId }) {
      await database
        .update(contractorMailMessages)
        .set({ deliveryStatus: 'sent', providerEmailId })
        .where(
          and(
            eq(contractorMailMessages.companyId, companyId),
            eq(contractorMailMessages.id, messageId),
          ),
        )
    },

    async markMessageFailed({ companyId, messageId }) {
      await database
        .update(contractorMailMessages)
        .set({ deliveryStatus: 'failed' })
        .where(
          and(
            eq(contractorMailMessages.companyId, companyId),
            eq(contractorMailMessages.id, messageId),
          ),
        )
    },
  }
}
