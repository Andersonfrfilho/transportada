/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6: as leituras e escritas do recebimento pelo Evolution. Tudo o que a Meta já faz
 * (contatos, motorista, conversa citada, gravação idempotente) é o mesmo repositório da spec 183; o
 * que se soma é o número a que a mensagem citada foi entregue.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  occurrenceContractorReplyDeliveries,
  occurrenceConversationMessages,
} from '../../database/database.schema.js'
import type { EvolutionConversationInboundPort } from '../application/evolution-conversation-inbound.service.js'
import { createDrizzleWhatsAppConversationInboundRepository } from './drizzle-whatsapp-conversation-inbound.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Spec 283: a mensagem da conversa do cliente que conta a mesma entrega do aviso citado. */
const clientMessage = alias(occurrenceConversationMessages, 'evolution_client_delivery_message')

/** O `deliveryId` do aviso vem de jsonb: só vira `uuid` no SQL quando tem a forma de um. */
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

export function createDrizzleEvolutionConversationInboundRepository(
  database: Database,
): EvolutionConversationInboundPort {
  return {
    ...createDrizzleWhatsAppConversationInboundRepository(database),

    /**
     * O aviso de sistema que a T5 grava na conversa ("Boleto enviado por WhatsApp") leva o id do
     * Evolution em `provider_message_id` e a entrega em `system_notice.deliveryId`; a entrega guarda o
     * número. Mensagem sem aviso, ou aviso sem entrega, não tem destinatário a comparar. Spec 283 (RF3): sai junto a
     * conversa do cliente da mesma entrega, para onde a resposta de quem recebeu vai.
     */
    async findReplyRecipient({ companyId, replyToProviderMessageId }) {
      const deliveryId = sql`(${occurrenceConversationMessages.systemNotice} ->> 'deliveryId')`
      const [row] = await database
        .select({
          address: occurrenceContractorReplyDeliveries.address,
          clientConversationId: clientMessage.conversationId,
        })
        .from(occurrenceConversationMessages)
        .innerJoin(
          occurrenceContractorReplyDeliveries,
          and(
            eq(
              occurrenceContractorReplyDeliveries.companyId,
              occurrenceConversationMessages.companyId,
            ),
            sql`${deliveryId} ~ ${UUID_PATTERN}`,
            sql`${occurrenceContractorReplyDeliveries.id} = ${deliveryId}::uuid`,
          ),
        )
        .leftJoin(
          clientMessage,
          and(
            eq(clientMessage.companyId, occurrenceContractorReplyDeliveries.companyId),
            eq(clientMessage.clientDeliveryId, occurrenceContractorReplyDeliveries.id),
          ),
        )
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.channel, 'whatsapp'),
            eq(occurrenceConversationMessages.direction, 'outbound'),
            eq(occurrenceConversationMessages.providerMessageId, replyToProviderMessageId),
          ),
        )
        .limit(1)
      if (row?.address === null || row?.address === undefined) return null
      return { address: row.address, clientConversationId: row.clientConversationId }
    },
  }
}
