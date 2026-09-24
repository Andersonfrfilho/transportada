/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T502 (RF9, D6): as leituras e escritas do hook da conversa no WhatsApp. O número casa pela
 * chave do WhatsApp (`55` + DDD + oito últimos dígitos, a mesma de `user_whatsapp_phones`), então as
 * duas grafias do nono dígito são o mesmo número. Tudo pela empresa da sessão do módulo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import {
  contractorContacts,
  occurrenceConversationMessages,
  occurrenceConversations,
  occurrenceConversationUnassigned,
  userCompanyMemberships,
  userWhatsAppPhones,
} from '../../database/database.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import type { WhatsAppConversationInboundPort } from '../application/whatsapp-conversation-inbound.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTIVE_CONTACT_STATUS = 'active'
const OPEN_CONVERSATION_STATUS = 'open'

export function createDrizzleWhatsAppConversationInboundRepository(
  database: Database,
): WhatsAppConversationInboundPort {
  return {
    async loadAttributionContext({ companyId, phone, replyToProviderMessageId }) {
      const phoneKey = toWhatsAppPhoneKey(phone.replace(/\D/gu, ''))

      const [contacts, drivers, replies] = await Promise.all([
        database
          .select({
            contactId: contractorContacts.id,
            contractorId: contractorContacts.contractorId,
            optInAt: contractorContacts.whatsappOptInAt,
          })
          .from(contractorContacts)
          .where(
            and(
              eq(contractorContacts.companyId, companyId),
              eq(contractorContacts.status, ACTIVE_CONTACT_STATUS),
              isNotNull(contractorContacts.phone),
              sql`left(${contractorContacts.phone}, 4) || right(${contractorContacts.phone}, 8) = ${phoneKey}`,
            ),
          ),
        database
          .select({ userId: userWhatsAppPhones.userId })
          .from(userWhatsAppPhones)
          .innerJoin(
            userCompanyMemberships,
            and(
              eq(userCompanyMemberships.userId, userWhatsAppPhones.userId),
              eq(userCompanyMemberships.companyId, companyId),
              eq(userCompanyMemberships.status, ACTIVE_MEMBERSHIP_STATUS),
            ),
          )
          .where(
            and(
              eq(userWhatsAppPhones.phoneKey, phoneKey),
              isNotNull(userWhatsAppPhones.verifiedAt),
            ),
          )
          .limit(1),
        replyToProviderMessageId === null
          ? Promise.resolve([])
          : database
              .select({
                contractorId: occurrenceConversations.contractorId,
                conversationId: occurrenceConversations.id,
                driverUserId: occurrenceConversations.driverUserId,
                participant: occurrenceConversations.participant,
              })
              .from(occurrenceConversationMessages)
              .innerJoin(
                occurrenceConversations,
                and(
                  eq(occurrenceConversations.companyId, occurrenceConversationMessages.companyId),
                  eq(occurrenceConversations.id, occurrenceConversationMessages.conversationId),
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
              .limit(1),
      ])

      const optedInContractorIds = [
        ...new Set(
          contacts.filter((contact) => contact.optInAt !== null).map((c) => c.contractorId),
        ),
      ]
      const openContractorConversations =
        optedInContractorIds.length === 0
          ? []
          : (
              await database
                .select({
                  contractorId: occurrenceConversations.contractorId,
                  conversationId: occurrenceConversations.id,
                })
                .from(occurrenceConversations)
                .where(
                  and(
                    eq(occurrenceConversations.companyId, companyId),
                    eq(occurrenceConversations.participant, 'contractor'),
                    eq(occurrenceConversations.status, OPEN_CONVERSATION_STATUS),
                    inArray(occurrenceConversations.contractorId, optedInContractorIds),
                  ),
                )
            ).flatMap((row) =>
              row.contractorId === null
                ? []
                : [{ contractorId: row.contractorId, conversationId: row.conversationId }],
            )

      const [reply] = replies
      return {
        openContractorConversations,
        replyTo: reply ?? null,
        sender: {
          contractorContacts: contacts.map((contact) => ({
            contactId: contact.contactId,
            contractorId: contact.contractorId,
            optedIn: contact.optInAt !== null,
          })),
          driverUserId: drivers[0]?.userId ?? null,
        },
      }
    },

    async recordConversationMessage(input) {
      await database
        .insert(occurrenceConversationMessages)
        .values({
          bodyText: input.bodyText,
          channel: 'whatsapp',
          companyId: input.companyId,
          conversationId: input.conversationId,
          createdAt: input.receivedAt,
          direction: 'inbound',
          driverUserId: input.driverUserId,
          providerMessageId: input.providerMessageId,
          senderAddress: input.senderAddress,
        })
        .onConflictDoNothing({
          target: [
            occurrenceConversationMessages.companyId,
            occurrenceConversationMessages.channel,
            occurrenceConversationMessages.providerMessageId,
          ],
        })
    },

    async recordUnassigned(input) {
      await database
        .insert(occurrenceConversationUnassigned)
        .values({
          bodyText: input.bodyText,
          channel: 'whatsapp',
          companyId: input.companyId,
          contractorContactId: input.contractorContactId,
          providerMessageId: input.providerMessageId,
          receivedAt: input.receivedAt,
          senderAddress: input.senderAddress,
        })
        .onConflictDoNothing({
          target: [
            occurrenceConversationUnassigned.companyId,
            occurrenceConversationUnassigned.channel,
            occurrenceConversationUnassigned.providerMessageId,
          ],
        })
    },
  }
}
