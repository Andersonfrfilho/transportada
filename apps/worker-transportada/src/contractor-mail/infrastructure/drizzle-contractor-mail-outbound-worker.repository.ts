/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  contractorMailMessages,
  contractorMailSettings,
} from '../../database/contractor-mail.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Correção pós-entrega da T009 (spec 143): `subject`/`toAddresses` chegam pela própria mensagem —
 * a fila deixou de carregar qualquer coisa além do `messageId` (§6 do baseline de segurança).
 */
export type ContractorMailOutboundMessageRecord = {
  readonly bodyText: string
  readonly subject: string
  readonly threadId: string
  readonly toAddresses: readonly string[]
}

export type ContractorMailOutboundSettingsRecord = {
  readonly id: string
  readonly replyDomain: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
}

export type ContractorMailReferenceHeaders = {
  readonly rfcMessageId: string
}

/**
 * O consumidor carrega a mensagem e a configuração — não mais a conversa (correção pós-entrega da
 * T009: nem o assunto nem o token de resposta dependem dela agora). Toda leitura e escrita filtra
 * por `company_id` na mesma condição, nunca como conferência depois.
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
          subject: contractorMailMessages.subject,
          threadId: contractorMailMessages.threadId,
          toAddresses: contractorMailMessages.toAddresses,
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

    async findSettingsByCompanyId({ companyId }) {
      const [row] = await database
        .select({
          id: contractorMailSettings.id,
          replyDomain: contractorMailSettings.replyDomain,
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
