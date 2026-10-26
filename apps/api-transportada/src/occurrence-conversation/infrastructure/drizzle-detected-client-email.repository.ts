/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF8 (T4b): as leituras e escritas do e-mail que o motorista escreve na conversa da ocorrência. O endereço
 * fica em `occurrence_conversation_messages.detected_email` e nunca sai daqui para log; tudo pela empresa do contexto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  occurrenceContractorReplies,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocumentOccurrences,
} from '../../database/database.schema.js'
import {
  CLIENT_EMAIL_SEND_MODES,
  CLIENT_EMAIL_TYPE_OFF,
  CLIENT_EMAIL_TYPES,
  type ClientEmailSendMode,
  type ClientEmailType,
} from '../../shared/delivery-client-email.constant.js'
import type {
  DetectedClientEmailRecord,
  DetectedClientEmailStorePort,
} from '../application/detected-client-email.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const OCCURRENCE_SUBJECT = 'occurrence'
const DRIVER_PARTICIPANT = 'driver'

function toClientEmailType(value: null | string): ClientEmailType {
  return (CLIENT_EMAIL_TYPES as readonly string[]).includes(value ?? '')
    ? (value as ClientEmailType)
    : CLIENT_EMAIL_TYPE_OFF
}

function toSendMode(value: null | string): ClientEmailSendMode {
  return (CLIENT_EMAIL_SEND_MODES as readonly string[]).includes(value ?? '')
    ? (value as ClientEmailSendMode)
    : 'manual'
}

export function createDrizzleDetectedClientEmailRepository(
  database: Database,
): DetectedClientEmailStorePort {
  async function findRecord(params: {
    readonly companyId: string
    readonly messageId?: string
    readonly occurrenceId: string
    readonly pendingOnly: boolean
  }): Promise<DetectedClientEmailRecord | null> {
    const [row] = await database
      .select({
        address: occurrenceConversationMessages.detectedEmail,
        conversationId: occurrenceConversationMessages.conversationId,
        createdAt: occurrenceConversationMessages.createdAt,
        messageId: occurrenceConversationMessages.id,
        sentAt: occurrenceConversationMessages.detectedEmailSentAt,
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
          eq(occurrenceConversationMessages.companyId, params.companyId),
          eq(occurrenceConversations.subjectType, OCCURRENCE_SUBJECT),
          eq(occurrenceConversations.participant, DRIVER_PARTICIPANT),
          eq(occurrenceConversations.occurrenceId, params.occurrenceId),
          isNotNull(occurrenceConversationMessages.detectedEmail),
          params.messageId === undefined
            ? undefined
            : eq(occurrenceConversationMessages.id, params.messageId),
          params.pendingOnly
            ? isNull(occurrenceConversationMessages.detectedEmailSentAt)
            : undefined,
        ),
      )
      .orderBy(
        desc(occurrenceConversationMessages.createdAt),
        desc(occurrenceConversationMessages.id),
      )
      .limit(1)
    if (row?.address === undefined || row.address === null) return null
    return { ...row, address: row.address }
  }

  return {
    async findDriverOccurrence({ companyId, conversationId }) {
      const [row] = await database
        .select({ occurrenceId: occurrenceConversations.occurrenceId })
        .from(occurrenceConversations)
        .where(
          and(
            eq(occurrenceConversations.companyId, companyId),
            eq(occurrenceConversations.id, conversationId),
            eq(occurrenceConversations.subjectType, OCCURRENCE_SUBJECT),
            eq(occurrenceConversations.participant, DRIVER_PARTICIPANT),
          ),
        )
        .limit(1)
      return row?.occurrenceId ?? null
    },

    async readSendState({ companyId, occurrenceId }) {
      const [row] = await database
        .select({
          clientEmailSendMode: companyOccurrenceTypes.clientEmailSendMode,
          clientEmailType: companyOccurrenceTypes.clientEmailType,
          replyAttachmentId: occurrenceContractorReplies.replyAttachmentId,
        })
        .from(tripDocumentOccurrences)
        .leftJoin(
          companyOccurrenceTypes,
          and(
            eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
            eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
          ),
        )
        .leftJoin(
          occurrenceContractorReplies,
          and(
            eq(occurrenceContractorReplies.companyId, tripDocumentOccurrences.companyId),
            eq(occurrenceContractorReplies.occurrenceId, tripDocumentOccurrences.id),
          ),
        )
        .where(
          and(
            eq(tripDocumentOccurrences.companyId, companyId),
            eq(tripDocumentOccurrences.id, occurrenceId),
          ),
        )
        .limit(1)
      if (row === undefined) return null
      return {
        boletoAccepted: row.replyAttachmentId !== null,
        clientEmailSendMode: toSendMode(row.clientEmailSendMode),
        clientEmailType: toClientEmailType(row.clientEmailType),
      }
    },

    async markDetected({ address, companyId, messageId }) {
      await database
        .update(occurrenceConversationMessages)
        .set({ detectedEmail: address })
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.id, messageId),
            eq(occurrenceConversationMessages.direction, 'inbound'),
            isNull(occurrenceConversationMessages.detectedEmail),
          ),
        )
    },

    async markSent({ companyId, messageId, sentAt }) {
      await database
        .update(occurrenceConversationMessages)
        .set({ detectedEmailSentAt: sentAt })
        .where(
          and(
            eq(occurrenceConversationMessages.companyId, companyId),
            eq(occurrenceConversationMessages.id, messageId),
            isNotNull(occurrenceConversationMessages.detectedEmail),
            isNull(occurrenceConversationMessages.detectedEmailSentAt),
          ),
        )
    },

    findPending: ({ companyId, occurrenceId }) =>
      findRecord({ companyId, occurrenceId, pendingOnly: true }),

    findDetected: ({ companyId, messageId, occurrenceId }) =>
      findRecord({ companyId, messageId, occurrenceId, pendingOnly: false }),

    async recordWhatsAppPrompt({ bodyText, companyId, conversationId, providerMessageId, sentAt }) {
      await database
        .insert(occurrenceConversationMessages)
        .values({
          authorUserId: null,
          automatic: true,
          bodyText,
          channel: 'whatsapp',
          companyId,
          conversationId,
          createdAt: sentAt,
          direction: 'outbound',
          providerMessageId,
          status: 'sent',
          statusTimes: { sent: sentAt.toISOString() },
        })
        .onConflictDoNothing({
          target: [
            occurrenceConversationMessages.companyId,
            occurrenceConversationMessages.channel,
            occurrenceConversationMessages.providerMessageId,
          ],
        })
    },
  }
}
