/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5: a unidade de trabalho do envio do boleto por WhatsApp ao cliente. Toda leitura e escrita leva
 * `company_id`. A entrega mora em `occurrence_contractor_reply_deliveries` (alvo `client_boleto_whatsapp`, número em
 * E.164 no `address`); o aviso na conversa do motorista nasce no fechamento, na mesma transação que marca `sent`.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import {
  auditLogs,
  companyOccurrenceTypes,
  deliveryClientContacts,
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversations,
  storedObjects,
  tripDocumentOccurrences,
  whatsappEvolutionSettings,
} from '../../database/database.schema.js'
import {
  CLIENT_CHANNEL,
  DELIVERY_CLIENT_CONTACT_CHANNEL,
  DELIVERY_CLIENT_EMAIL_PURPOSE,
} from '../../shared/delivery-client-email.constant.js'
import { CONTRACTOR_REPLY_WHATSAPP_TARGET } from '../../shared/occurrence-contractor-reply.constant.js'
import { CONTRACTOR_REPLY_WHATSAPP_MAX_PER_OCCURRENCE } from '../application/forward-contractor-reply-by-whatsapp.use-case.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  ContractorReplyWhatsAppCompletionPort,
  ContractorReplyWhatsAppReaderPort,
  ContractorReplyWhatsAppTransactionPort,
  ContractorReplyWhatsAppUnitOfWorkPort,
} from '../application/forward-contractor-reply-by-whatsapp.port.js'
import { maskClientWhatsAppNumber } from '../domain/contractor-reply-whatsapp-number.policy.js'
import { createContractorReplyEmailTransactionPort } from './drizzle-contractor-reply-email.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const COUNTED_STATUSES = ['queued', 'sent'] as const
const AUDIT_PERMISSION = 'occurrences.resolve'
/** RF6: cada envio fica em `audit_logs`, com o número mascarado. */
const DELIVERY_AUDIT_ACTION = 'contractor-reply.whatsapp-delivery.requested'
const DELIVERY_AUDIT_ENTITY_TYPE = 'occurrence-contractor-reply-delivery'
const CONTACT_AUDIT_ACTION = 'delivery-client-contact.created'
const CONTACT_AUDIT_ENTITY_TYPE = 'delivery-client-contact'
const NOTICE_KIND = 'client_boleto_whatsapp_sent'
/** O texto que o app e o painel mostram; o `system_notice` guarda o resto (quem enviou e qual entrega). */
const NOTICE_BODY_PREFIX = 'Boleto enviado por WhatsApp: '

const DELIVERY_COLUMNS = {
  address: occurrenceContractorReplyDeliveries.address,
  attachmentId: occurrenceContractorReplyDeliveries.attachmentId,
  id: occurrenceContractorReplyDeliveries.id,
  reason: occurrenceContractorReplyDeliveries.reason,
  status: occurrenceContractorReplyDeliveries.status,
  target: occurrenceContractorReplyDeliveries.target,
} as const

function createTransactionPort(transaction: TripQueryable): ContractorReplyWhatsAppTransactionPort {
  const email = createContractorReplyEmailTransactionPort(transaction)
  const whatsappDeliveries = (companyId: string) =>
    and(
      eq(occurrenceContractorReplyDeliveries.companyId, companyId),
      eq(occurrenceContractorReplyDeliveries.target, CONTRACTOR_REPLY_WHATSAPP_TARGET),
      inArray(occurrenceContractorReplyDeliveries.status, [...COUNTED_STATUSES]),
    )

  return {
    async countCompanyDeliveriesSince({ companyId, since }) {
      const [row] = await transaction
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(occurrenceContractorReplyDeliveries)
        .where(
          and(
            whatsappDeliveries(companyId),
            gte(occurrenceContractorReplyDeliveries.createdAt, since),
          ),
        )
      return row?.total ?? 0
    },

    async countDeliveries({ address, companyId, replyId }) {
      const [row] = await transaction
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(occurrenceContractorReplyDeliveries)
        .where(
          // Com número, conta toda tentativa (a falha também gasta uma); sem ele, só o que saiu ou está saindo.
          address === undefined
            ? and(
                whatsappDeliveries(companyId),
                eq(occurrenceContractorReplyDeliveries.replyId, replyId),
              )
            : and(
                eq(occurrenceContractorReplyDeliveries.companyId, companyId),
                eq(occurrenceContractorReplyDeliveries.target, CONTRACTOR_REPLY_WHATSAPP_TARGET),
                eq(occurrenceContractorReplyDeliveries.replyId, replyId),
                eq(occurrenceContractorReplyDeliveries.address, address),
              ),
        )
      return row?.total ?? 0
    },

    async findAttachment({ attachmentId, companyId, occurrenceId }) {
      const [row] = await transaction
        .select({
          bucket: storedObjects.bucket,
          contentType: occurrenceConversationAttachments.contentType,
          fileName: occurrenceConversationAttachments.fileName,
          objectKey: storedObjects.objectKey,
          sizeBytes: occurrenceConversationAttachments.sizeBytes,
        })
        .from(occurrenceConversationAttachments)
        .innerJoin(
          storedObjects,
          and(
            eq(storedObjects.companyId, occurrenceConversationAttachments.companyId),
            eq(storedObjects.id, occurrenceConversationAttachments.storedObjectId),
            sql`${storedObjects.status} <> 'deleted'`,
          ),
        )
        .innerJoin(
          occurrenceConversationMessages,
          and(
            eq(
              occurrenceConversationMessages.companyId,
              occurrenceConversationAttachments.companyId,
            ),
            eq(occurrenceConversationMessages.id, occurrenceConversationAttachments.messageId),
          ),
        )
        .innerJoin(
          occurrenceConversations,
          and(
            eq(occurrenceConversations.companyId, occurrenceConversationMessages.companyId),
            eq(occurrenceConversations.id, occurrenceConversationMessages.conversationId),
          ),
        )
        .where(
          and(
            eq(occurrenceConversationAttachments.companyId, companyId),
            eq(occurrenceConversationAttachments.id, attachmentId),
            eq(occurrenceConversations.occurrenceId, occurrenceId),
            eq(occurrenceConversations.participant, 'contractor'),
          ),
        )
        .limit(1)
      return row ?? null
    },

    async findClientChannel({ companyId, occurrenceId }) {
      const [row] = await transaction
        .select({ clientChannel: companyOccurrenceTypes.clientChannel })
        .from(tripDocumentOccurrences)
        .innerJoin(
          companyOccurrenceTypes,
          and(
            eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
            eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
          ),
        )
        .where(
          and(
            eq(tripDocumentOccurrences.companyId, companyId),
            eq(tripDocumentOccurrences.id, occurrenceId),
          ),
        )
        .limit(1)
      return row?.clientChannel ?? CLIENT_CHANNEL.OFF
    },

    findDeliveryClientTaxId: (params) => email.findDeliveryClientTaxId(params),

    async findDeliveryById({ companyId, deliveryId, replyId }) {
      const [row] = await transaction
        .select(DELIVERY_COLUMNS)
        .from(occurrenceContractorReplyDeliveries)
        .where(
          and(
            eq(occurrenceContractorReplyDeliveries.companyId, companyId),
            eq(occurrenceContractorReplyDeliveries.id, deliveryId),
            eq(occurrenceContractorReplyDeliveries.replyId, replyId),
          ),
        )
        .limit(1)
      return row ?? null
    },

    async findDeliveryByKey({ companyId, idempotencyKey }) {
      const [row] = await transaction
        .select(DELIVERY_COLUMNS)
        .from(occurrenceContractorReplyDeliveries)
        .where(
          and(
            eq(occurrenceContractorReplyDeliveries.companyId, companyId),
            eq(occurrenceContractorReplyDeliveries.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1)
      return row ?? null
    },

    async findEvolutionSettings({ companyId }) {
      const [row] = await transaction
        .select({
          dailyCap: whatsappEvolutionSettings.dailyCap,
          status: whatsappEvolutionSettings.status,
        })
        .from(whatsappEvolutionSettings)
        .where(eq(whatsappEvolutionSettings.companyId, companyId))
        .limit(1)
      return row ?? null
    },

    async listClientWhatsAppContacts({ companyId, taxId }) {
      return transaction
        .select({
          address: deliveryClientContacts.address,
          id: deliveryClientContacts.id,
          label: deliveryClientContacts.label,
        })
        .from(deliveryClientContacts)
        .where(
          and(
            eq(deliveryClientContacts.companyId, companyId),
            eq(deliveryClientContacts.taxId, taxId),
            eq(deliveryClientContacts.channel, DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP),
            eq(deliveryClientContacts.purpose, DELIVERY_CLIENT_EMAIL_PURPOSE.BOLETO),
          ),
        )
        .orderBy(asc(deliveryClientContacts.createdAt), asc(deliveryClientContacts.id))
    },

    lockReply: (params) => email.lockReply(params),

    async recordDelivery(params) {
      const [row] = await transaction
        .insert(occurrenceContractorReplyDeliveries)
        .values({
          actorUserId: params.actorUserId,
          address: params.address,
          attachmentId: params.attachmentId,
          companyId: params.companyId,
          idempotencyKey: params.idempotencyKey,
          mailMessageId: null,
          reason: params.reason,
          replyId: params.replyId,
          status: params.status,
          target: CONTRACTOR_REPLY_WHATSAPP_TARGET,
          trigger: 'operator',
        })
        .returning({ id: occurrenceContractorReplyDeliveries.id })
      if (row === undefined) throw new Error('CONTRACTOR_REPLY_WHATSAPP_DELIVERY_NOT_PERSISTED')
      await transaction.insert(auditLogs).values({
        action: DELIVERY_AUDIT_ACTION,
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        correlationId: params.correlationId,
        entityId: row.id,
        entityType: DELIVERY_AUDIT_ENTITY_TYPE,
        metadata: {
          numberMasked: maskClientWhatsAppNumber(params.address),
          occurrenceId: params.occurrenceId,
          reason: params.reason,
          status: params.status,
        },
        permission: AUDIT_PERMISSION,
        targetId: row.id,
        targetType: DELIVERY_AUDIT_ENTITY_TYPE,
      })
      return row
    },

    /** O único é por (cliente, tipo, endereço): um envio concorrente de outra ocorrência cai no `DO NOTHING`. */
    async saveClientWhatsAppContact(params) {
      const [created] = await transaction
        .insert(deliveryClientContacts)
        .values({
          address: params.address,
          channel: DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP,
          companyId: params.companyId,
          createdByKind: params.authorKind,
          createdByUserId: params.actorUserId,
          purpose: DELIVERY_CLIENT_EMAIL_PURPOSE.BOLETO,
          sourceOccurrenceId: params.occurrenceId,
          taxId: params.taxId,
        })
        .onConflictDoNothing()
        .returning({ id: deliveryClientContacts.id })
      if (created === undefined) {
        const [existing] = await transaction
          .select({ id: deliveryClientContacts.id })
          .from(deliveryClientContacts)
          .where(
            and(
              eq(deliveryClientContacts.companyId, params.companyId),
              eq(deliveryClientContacts.taxId, params.taxId),
              eq(deliveryClientContacts.channel, DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP),
              eq(deliveryClientContacts.purpose, DELIVERY_CLIENT_EMAIL_PURPOSE.BOLETO),
              eq(deliveryClientContacts.address, params.address),
            ),
          )
          .limit(1)
        if (existing === undefined) throw new Error('DELIVERY_CLIENT_CONTACT_NOT_PERSISTED')
        return existing
      }
      await transaction.insert(auditLogs).values({
        action: CONTACT_AUDIT_ACTION,
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        correlationId: params.correlationId,
        entityId: created.id,
        entityType: CONTACT_AUDIT_ENTITY_TYPE,
        metadata: {
          authorKind: params.authorKind,
          channel: DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP,
          numberMasked: maskClientWhatsAppNumber(params.address),
          occurrenceId: params.occurrenceId,
          purpose: DELIVERY_CLIENT_EMAIL_PURPOSE.BOLETO,
          source: 'occurrence_forward',
        },
        permission: AUDIT_PERMISSION,
        targetId: created.id,
        targetType: CONTACT_AUDIT_ENTITY_TYPE,
      })
      return created
    },
  }
}

export function createDrizzleContractorReplyWhatsAppUnitOfWork(
  database: Database,
): ContractorReplyWhatsAppUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}

/**
 * O fechamento. Só a entrega ainda `queued` muda (o `where` é a trava contra fechar duas vezes). O aviso entra na
 * conversa do motorista da ocorrência, como o da 279, mas no canal `whatsapp` e com o id do provedor: é por ele que o
 * webhook (T6) avança enviada → entregue → lida. Sem conversa do motorista não há aviso; nunca a cria.
 */
export function createDrizzleContractorReplyWhatsAppCompletion(
  database: Database,
): ContractorReplyWhatsAppCompletionPort {
  return {
    async markFailed({ companyId, deliveryId, reason }) {
      await database
        .update(occurrenceContractorReplyDeliveries)
        .set({ reason, status: 'failed' })
        .where(
          and(
            eq(occurrenceContractorReplyDeliveries.companyId, companyId),
            eq(occurrenceContractorReplyDeliveries.id, deliveryId),
            eq(occurrenceContractorReplyDeliveries.status, 'queued'),
          ),
        )
    },

    async markSent({ companyId, deliveryId, providerMessageId }) {
      await database.transaction(async (transaction) => {
        const [closed] = await transaction
          .update(occurrenceContractorReplyDeliveries)
          .set({ providerMessageId, reason: null, sentAt: sql`now()`, status: 'sent' })
          .where(
            and(
              eq(occurrenceContractorReplyDeliveries.companyId, companyId),
              eq(occurrenceContractorReplyDeliveries.id, deliveryId),
              eq(occurrenceContractorReplyDeliveries.status, 'queued'),
            ),
          )
          .returning({ id: occurrenceContractorReplyDeliveries.id })
        if (closed === undefined) return
        await transaction.execute(
          sql`insert into occurrence_conversation_messages
                (company_id, conversation_id, channel, direction, automatic, body_text, status, status_times,
                 provider_message_id, system_notice)
              select d.company_id, c.id, 'whatsapp', 'outbound', true,
                     ${NOTICE_BODY_PREFIX} || d.address,
                     'sent',
                     jsonb_build_object('sent', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
                     d.provider_message_id,
                     jsonb_build_object(
                       'kind', ${NOTICE_KIND}::text,
                       'deliveryId', d.id::text,
                       'actorKind', case
                         when d.actor_user_id is null then 'system'
                         when d.actor_user_id = c.driver_user_id then 'driver'
                         else 'office' end,
                       'actorName', case when d.actor_user_id is null then null else profile.name end)
                from occurrence_contractor_reply_deliveries d
                join occurrence_contractor_replies r
                  on r.company_id = d.company_id and r.id = d.reply_id
                join occurrence_conversations c
                  on c.company_id = r.company_id and c.occurrence_kind = 'document'
                 and c.occurrence_id = r.occurrence_id and c.participant = 'driver'
                left join identity_user_profiles profile on profile.user_id = d.actor_user_id
               where d.company_id = ${companyId}::uuid
                 and d.id = ${deliveryId}::uuid
                 and d.target = ${CONTRACTOR_REPLY_WHATSAPP_TARGET}
                 and d.status = 'sent'
              on conflict do nothing`,
        )
      })
    },
  }
}

/** As opções do envio por WhatsApp da ocorrência; `null` quando o retorno não existe. */
export function createDrizzleContractorReplyWhatsAppReader(
  database: Database,
): ContractorReplyWhatsAppReaderPort {
  return {
    async read({ companyId, occurrenceId }) {
      const [reply] = await database
        .select({ id: occurrenceContractorReplies.id })
        .from(occurrenceContractorReplies)
        .where(
          and(
            eq(occurrenceContractorReplies.companyId, companyId),
            eq(occurrenceContractorReplies.occurrenceId, occurrenceId),
          ),
        )
        .limit(1)
      if (reply === undefined) return null
      const port = createTransactionPort(database)
      const [clientChannel, taxId, settings, deliveries] = await Promise.all([
        port.findClientChannel({ companyId, occurrenceId }),
        port.findDeliveryClientTaxId({ companyId, lock: false, occurrenceId }),
        database
          .select({
            connectionState: whatsappEvolutionSettings.connectionState,
            status: whatsappEvolutionSettings.status,
          })
          .from(whatsappEvolutionSettings)
          .where(eq(whatsappEvolutionSettings.companyId, companyId))
          .limit(1),
        database
          .select({
            address: occurrenceContractorReplyDeliveries.address,
            createdAt: occurrenceContractorReplyDeliveries.createdAt,
            id: occurrenceContractorReplyDeliveries.id,
            reason: occurrenceContractorReplyDeliveries.reason,
            sentAt: occurrenceContractorReplyDeliveries.sentAt,
            status: occurrenceContractorReplyDeliveries.status,
          })
          .from(occurrenceContractorReplyDeliveries)
          .where(
            and(
              eq(occurrenceContractorReplyDeliveries.companyId, companyId),
              eq(occurrenceContractorReplyDeliveries.replyId, reply.id),
              eq(occurrenceContractorReplyDeliveries.target, CONTRACTOR_REPLY_WHATSAPP_TARGET),
            ),
          )
          .orderBy(
            desc(occurrenceContractorReplyDeliveries.createdAt),
            desc(occurrenceContractorReplyDeliveries.id),
          ),
      ])
      const contacts =
        taxId === null ? [] : await port.listClientWhatsAppContacts({ companyId, taxId })
      const evolution = settings[0]
      return {
        clientChannel,
        contacts: contacts.map((contact) => ({
          contactId: contact.id,
          label: contact.label,
          numberMasked: maskClientWhatsAppNumber(contact.address),
        })),
        deliveries: deliveries.map((delivery) => ({
          createdAt: delivery.createdAt.toISOString(),
          id: delivery.id,
          numberMasked:
            delivery.address === null ? null : maskClientWhatsAppNumber(delivery.address),
          reason: delivery.reason,
          sentAt: delivery.sentAt?.toISOString() ?? null,
          status: delivery.status,
        })),
        evolution: {
          connectionState: evolution?.connectionState ?? null,
          ready: evolution?.status === 'active' && evolution.connectionState === 'open',
          status: evolution?.status ?? null,
        },
        sentCount: deliveries.filter(
          (delivery) => delivery.status === 'queued' || delivery.status === 'sent',
        ).length,
        sentLimit: CONTRACTOR_REPLY_WHATSAPP_MAX_PER_OCCURRENCE,
      }
    },
  }
}
