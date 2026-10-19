/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  contractorMailMessages,
  contractorMailSettings,
} from '../../database/contractor-mail.schema.js'
import type { ContractorMailTransport } from '../domain/contractor-mail.constant.js'
import { applyOccurrenceConversationMailStatus } from '../../occurrence-conversation/infrastructure/drizzle-occurrence-conversation-mail.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Correção pós-entrega da T009 (spec 143): `subject`/`toAddresses` chegam pela própria mensagem —
 * a fila deixou de carregar qualquer coisa além do `messageId` (§6 do baseline de segurança).
 */
export type ContractorMailOutboundMessageRecord = {
  /** Spec 150 T302: o HTML que a API gravou; `null` em mensagem antiga, que sai só em texto. */
  readonly bodyHtml: string | null
  readonly bodyText: string
  /** Spec 267: a cópia que a API resolveu; vazia na mensagem antiga e no que não leva cópia. */
  readonly ccAddresses: readonly string[]
  readonly direction: string
  /** Spec 268: o remetente gravado pela API; só o `sandbox_smtp` o usa (o Resend usa o da configuração). */
  readonly fromAddress: string | null
  /** Spec 272: o nome do "De" que a API gravou (saneado); só vale em `outbound`, nulo mantém o comportamento de antes. */
  readonly fromDisplayName: string | null
  /** Spec 272: o HTML usa `cid:company-logo`; o worker anexa o logo da empresa da mensagem. */
  readonly hasInlineLogo: boolean
  readonly subject: string
  readonly threadId: string
  readonly toAddresses: readonly string[]
  /** Spec 268: por onde a API mandou enviar. */
  readonly transport: ContractorMailTransport
}

export type ContractorMailOutboundSettingsRecord = {
  readonly id: string
  readonly replyDomain: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly senderName: string
}

/**
 * Spec 248 T4.7: a mensagem é o boleto levado a um terceiro (a linha da entrega aponta para ela). O
 * `Reply-To` é o primeiro e-mail de contato da empresa, quando houver; nunca o endereço com token.
 */
export type ContractorReplyForwardRecord = {
  readonly replyToAddress: null | string
}

const FORWARD_TARGETS_SQL = sql`('note_recipient_email', 'informed_email')`

/**
 * O consumidor carrega a mensagem e a configuração — não mais a conversa (correção pós-entrega da
 * T009: nem o assunto nem o token de resposta dependem dela agora). Toda leitura e escrita filtra
 * por `company_id` na mesma condição, nunca como conferência depois.
 */
export type ContractorMailOutboundWorkerRepository = {
  findContractorReplyForward(input: {
    readonly companyId: string
    readonly messageId: string
  }): Promise<ContractorReplyForwardRecord | undefined>
  /** Spec 274 D7: os `rfc_message_id` da thread (entrada e saída, sem encaminhamento), do mais antigo ao mais novo. */
  listThreadReferenceIds(input: {
    readonly companyId: string
    /** A própria mensagem em envio nunca entra na linha. */
    readonly messageId: string
    readonly threadId: string
  }): Promise<readonly string[]>
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
    async findContractorReplyForward({ companyId, messageId }) {
      const deliveries = (await database.execute(
        sql`select id from occurrence_contractor_reply_deliveries
            where company_id = ${companyId}::uuid
              and mail_message_id = ${messageId}::uuid
              and target in ${FORWARD_TARGETS_SQL}
            limit 1`,
      )) as readonly Record<string, unknown>[]
      if (deliveries.length === 0) return undefined
      const contacts = (await database.execute(
        sql`select value from company_contacts
            where company_id = ${companyId}::uuid and kind = 'email'
            order by position asc, created_at asc, id asc
            limit 1`,
      )) as readonly Record<string, unknown>[]
      const value = contacts[0]?.value
      return { replyToAddress: typeof value === 'string' && value !== '' ? value : null }
    },

    async findMessageById({ companyId, messageId }) {
      const [row] = await database
        .select({
          bodyHtml: contractorMailMessages.bodyHtml,
          bodyText: contractorMailMessages.bodyText,
          ccAddresses: contractorMailMessages.ccAddresses,
          direction: contractorMailMessages.direction,
          fromAddress: contractorMailMessages.fromAddress,
          fromDisplayName: contractorMailMessages.fromDisplayName,
          hasInlineLogo: contractorMailMessages.hasInlineLogo,
          subject: contractorMailMessages.subject,
          threadId: contractorMailMessages.threadId,
          toAddresses: contractorMailMessages.toAddresses,
          transport: contractorMailMessages.transport,
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

    /**
     * Spec 274 D7: a linha da conversa inteira; o encaminhamento da 248 fica de fora, e a mensagem sem
     * `rfc_message_id` (o `email.sent` ainda não chegou) simplesmente não entra.
     */
    async listThreadReferenceIds({ companyId, messageId, threadId }) {
      const rows = (await database.execute(
        sql`select m.rfc_message_id from contractor_mail_messages m
            where m.company_id = ${companyId}::uuid
              and m.thread_id = ${threadId}::uuid
              and m.id <> ${messageId}::uuid
              and m.rfc_message_id is not null and m.rfc_message_id <> ''
              and not exists (
                select 1 from occurrence_contractor_reply_deliveries d
                where d.company_id = m.company_id
                  and d.mail_message_id = m.id
                  and d.target in ${FORWARD_TARGETS_SQL}
              )
            order by m.created_at asc, m.id asc`,
      )) as readonly Record<string, unknown>[]
      return rows.flatMap((row) =>
        typeof row.rfc_message_id === 'string' ? [row.rfc_message_id] : [],
      )
    },

    /** Spec 183 T405: a mensagem da conversa (se houver) acompanha, na mesma transação. */
    async markMessageSent({ companyId, messageId, providerEmailId }) {
      await database.transaction(async (transaction) => {
        await transaction
          .update(contractorMailMessages)
          .set({ deliveryStatus: 'sent', providerEmailId })
          .where(
            and(
              eq(contractorMailMessages.companyId, companyId),
              eq(contractorMailMessages.id, messageId),
            ),
          )
        await applyOccurrenceConversationMailStatus(transaction, {
          at: new Date(),
          companyId,
          incoming: 'sent',
          mailMessageId: messageId,
          providerMessageId: providerEmailId,
        })
        await transaction.execute(
          sql`update occurrence_contractor_reply_deliveries
              set status = 'sent', sent_at = now()
              where company_id = ${companyId}::uuid
                and mail_message_id = ${messageId}::uuid
                and target in ${FORWARD_TARGETS_SQL}
                and status = 'queued'`,
        )
      })
    },

    async markMessageFailed({ companyId, messageId }) {
      await database.transaction(async (transaction) => {
        await transaction
          .update(contractorMailMessages)
          .set({ deliveryStatus: 'failed' })
          .where(
            and(
              eq(contractorMailMessages.companyId, companyId),
              eq(contractorMailMessages.id, messageId),
            ),
          )
        await applyOccurrenceConversationMailStatus(transaction, {
          at: new Date(),
          companyId,
          incoming: 'failed',
          mailMessageId: messageId,
        })
        await transaction.execute(
          sql`update occurrence_contractor_reply_deliveries
              set status = 'failed', reason = 'send_failed'
              where company_id = ${companyId}::uuid
                and mail_message_id = ${messageId}::uuid
                and target in ${FORWARD_TARGETS_SQL}
                and status = 'queued'`,
        )
      })
    },
  }
}
