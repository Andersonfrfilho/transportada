/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T5 (D6): a resposta do painel ao cliente. Toda leitura e escrita vai por `company_id`. A mensagem é da
 * conversa do cliente, sem entrega (`client_delivery_id` nulo), com o destino em `recipient_address` e a
 * `Idempotency-Key` em `client_message_id` — o único de (`company_id`, `conversation_id`, `direction`,
 * `client_message_id`) segura a corrida de duas abas. O id do provedor entra na própria mensagem, e é por ele que o
 * webhook avança entregue → lida e casa a resposta citada.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  deliveryClientContacts,
  tripDocumentOccurrences,
  whatsappEvolutionSettings,
} from '../../database/database.schema.js'
import {
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../database/occurrence-conversation.schema.js'
import { CLIENT_CHANNEL } from '../../shared/delivery-client-email.constant.js'
import type {
  ClientReplyMessageStatus,
  ClientReplyRepositoryPort,
} from '../application/send-client-reply.port.js'
import {
  CLIENT_CONVERSATION_CHANNELS,
  CLIENT_CONVERSATION_PARTICIPANT,
} from '../domain/client-conversation.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

function nowIso(): string {
  return new Date().toISOString()
}

export function createDrizzleClientReplyRepository(database: Database): ClientReplyRepositoryPort {
  async function advance(params: {
    readonly companyId: string
    readonly messageId: string
    readonly providerMessageId?: null | string
    readonly status: 'failed' | 'sent'
  }): Promise<void> {
    await database
      .update(occurrenceConversationMessages)
      .set({
        ...(params.providerMessageId === undefined
          ? {}
          : { providerMessageId: params.providerMessageId }),
        status: params.status,
        statusTimes: sql`${occurrenceConversationMessages.statusTimes} || ${JSON.stringify({ [params.status]: nowIso() })}::jsonb`,
      })
      .where(
        and(
          eq(occurrenceConversationMessages.companyId, params.companyId),
          eq(occurrenceConversationMessages.id, params.messageId),
          eq(occurrenceConversationMessages.status, 'queued'),
        ),
      )
  }

  return {
    async readContext({ companyId, occurrenceId }) {
      const [conversation] = await database
        .select({
          clientChannel: companyOccurrenceTypes.clientChannel,
          clientTaxId: occurrenceConversations.clientTaxId,
          id: occurrenceConversations.id,
        })
        .from(occurrenceConversations)
        .innerJoin(
          tripDocumentOccurrences,
          and(
            eq(tripDocumentOccurrences.companyId, occurrenceConversations.companyId),
            eq(tripDocumentOccurrences.id, occurrenceConversations.occurrenceId),
          ),
        )
        .leftJoin(
          companyOccurrenceTypes,
          and(
            eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
            eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
          ),
        )
        .where(
          and(
            eq(occurrenceConversations.companyId, companyId),
            eq(occurrenceConversations.occurrenceKind, 'document'),
            eq(occurrenceConversations.occurrenceId, occurrenceId),
            eq(occurrenceConversations.participant, CLIENT_CONVERSATION_PARTICIPANT),
          ),
        )
        .limit(1)
      if (conversation?.clientTaxId === null || conversation === undefined) return null
      const taxId = conversation.clientTaxId

      const [settings, messages, contacts] = await Promise.all([
        database
          .select({ status: whatsappEvolutionSettings.status })
          .from(whatsappEvolutionSettings)
          .where(eq(whatsappEvolutionSettings.companyId, companyId))
          .limit(1),
        database
          .select({
            authorUserId: occurrenceConversationMessages.authorUserId,
            channel: occurrenceConversationMessages.channel,
            clientDeliveryId: occurrenceConversationMessages.clientDeliveryId,
            createdAt: occurrenceConversationMessages.createdAt,
            direction: occurrenceConversationMessages.direction,
            recipientAddress: occurrenceConversationMessages.recipientAddress,
            senderAddress: occurrenceConversationMessages.senderAddress,
            status: occurrenceConversationMessages.status,
          })
          .from(occurrenceConversationMessages)
          .where(
            and(
              eq(occurrenceConversationMessages.companyId, companyId),
              eq(occurrenceConversationMessages.conversationId, conversation.id),
            ),
          )
          .orderBy(
            asc(occurrenceConversationMessages.createdAt),
            asc(occurrenceConversationMessages.id),
          ),
        database
          .select({
            address: deliveryClientContacts.address,
            channel: deliveryClientContacts.channel,
          })
          .from(deliveryClientContacts)
          .where(
            and(
              eq(deliveryClientContacts.companyId, companyId),
              eq(deliveryClientContacts.taxId, taxId),
              inArray(deliveryClientContacts.channel, [...CLIENT_CONVERSATION_CHANNELS]),
            ),
          ),
      ])

      return {
        clientChannel: conversation.clientChannel ?? CLIENT_CHANNEL.OFF,
        contacts: contacts.flatMap((contact) =>
          contact.channel === 'email' || contact.channel === 'whatsapp'
            ? [{ address: contact.address, channel: contact.channel }]
            : [],
        ),
        conversationId: conversation.id,
        evolutionStatus: settings[0]?.status ?? null,
        messages: messages.flatMap((row) => {
          const address = row.direction === 'outbound' ? row.recipientAddress : row.senderAddress
          if (address === null || (row.channel !== 'email' && row.channel !== 'whatsapp')) return []
          return [
            {
              address,
              channel: row.channel,
              createdAt: row.createdAt.toISOString(),
              deliveryId: row.clientDeliveryId,
              direction: row.direction,
              panelReply:
                row.direction === 'outbound' &&
                row.clientDeliveryId === null &&
                row.authorUserId !== null,
              status: row.status,
            },
          ]
        }),
      }
    },

    async findByIdempotencyKey({ companyId, conversationId, idempotencyKey }) {
      const [row] = await database
        .select({
          id: occurrenceConversationMessages.id,
          status: occurrenceConversationMessages.status,
        })
        .from(occurrenceConversationMessages)
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.conversationId, conversationId),
            eq(occurrenceConversationMessages.direction, 'outbound'),
            eq(occurrenceConversationMessages.clientMessageId, idempotencyKey),
          ),
        )
        .limit(1)
      if (row === undefined) return null
      const status: ClientReplyMessageStatus =
        row.status === 'queued' || row.status === 'failed' ? row.status : 'sent'
      return { id: row.id, status }
    },

    async insertQueued(params) {
      const [row] = await database
        .insert(occurrenceConversationMessages)
        .values({
          authorUserId: params.actorUserId,
          automatic: false,
          bodyText: params.bodyText,
          channel: 'whatsapp',
          clientMessageId: params.idempotencyKey,
          companyId: params.companyId,
          conversationId: params.conversationId,
          direction: 'outbound',
          recipientAddress: params.recipientAddress,
          status: 'queued',
          statusTimes: { queued: nowIso() },
        })
        .onConflictDoNothing()
        .returning({ id: occurrenceConversationMessages.id })
      return row ?? null
    },

    markFailed: (params) => advance({ ...params, status: 'failed' }),

    markSent: (params) => advance({ ...params, status: 'sent' }),
  }
}
