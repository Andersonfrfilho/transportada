/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7: a unidade de trabalho do envio do boleto por e-mail a um terceiro. Toda leitura e escrita
 * leva `company_id`. A mensagem da 143 nasce presa à thread da ocorrência (a coluna `thread_id` é
 * obrigatória), mas sem mensagem de conversa e sem token: quem a distingue é a linha da entrega, que
 * aponta para ela por `mail_message_id` — o worker lê a entrega para saber que não há resposta a esperar.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import {
  CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES,
  auditLogs,
  companyFiscalProfiles,
  contractorMailMessages,
  contractorMailOutbox,
  contractorMailSettings,
  contractorMailThreads,
  deliveryClientEmails,
  deliveryClients,
  nfeDocuments,
  nfeParticipants,
  occurrenceContractorReplies,
  occurrenceContractorReplyDeliveries,
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversations,
  tripDocumentOccurrences,
  tripDocuments,
} from '../../database/database.schema.js'
import { DELIVERY_CLIENT_EMAIL_PURPOSE } from '../../shared/delivery-client-email.constant.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import {
  CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE,
  CONTRACTOR_REPLY_EMAIL_TARGETS,
} from '../../shared/occurrence-contractor-reply.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  ContractorReplyEmailReaderPort,
  ContractorReplyEmailTarget,
  ContractorReplyEmailTransactionPort,
  ContractorReplyEmailUnitOfWorkPort,
} from '../application/forward-contractor-reply-by-email.port.js'
import { resolveCompanyDisplayName } from '../../companies/domain/company-display-name.policy.js'
import { contractorReplyConfigurationSchema } from '../domain/contractor-reply-configuration.policy.js'
import { OCCURRENCE_THREAD_SUBJECT_TYPE } from '../domain/occurrence-conversation.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const [MESSAGE_SEND_REQUESTED_EVENT_TYPE] = CONTRACTOR_MAIL_OUTBOX_EVENT_TYPES
const COUNTED_STATUSES = ['queued', 'sent'] as const
const RECIPIENT_ROLE = 'recipient'
/** Spec 279 D7: o cadastro feito no envio grava a mesma trilha do cadastro pelo painel. */
const CLIENT_EMAIL_AUDIT_ACTION = 'delivery-client-email.created'
const CLIENT_EMAIL_AUDIT_ENTITY_TYPE = 'delivery-client-email'
const CLIENT_EMAIL_AUDIT_PERMISSION = 'occurrences.resolve'

function isEmailTarget(target: string): target is ContractorReplyEmailTarget {
  return (CONTRACTOR_REPLY_EMAIL_TARGETS as readonly string[]).includes(target)
}

function createTransactionPort(transaction: TripQueryable): ContractorReplyEmailTransactionPort {
  return {
    async countEmailDeliveries({ companyId, replyId }) {
      const rows = await transaction
        .select({ id: occurrenceContractorReplyDeliveries.id })
        .from(occurrenceContractorReplyDeliveries)
        .where(
          and(
            eq(occurrenceContractorReplyDeliveries.companyId, companyId),
            eq(occurrenceContractorReplyDeliveries.replyId, replyId),
            inArray(occurrenceContractorReplyDeliveries.target, [
              ...CONTRACTOR_REPLY_EMAIL_TARGETS,
            ]),
            inArray(occurrenceContractorReplyDeliveries.status, [...COUNTED_STATUSES]),
          ),
        )
      return rows.length
    },

    async findAttachment({ attachmentId, companyId, occurrenceId }) {
      const [row] = await transaction
        .select({ sizeBytes: occurrenceConversationAttachments.sizeBytes })
        .from(occurrenceConversationAttachments)
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

    async findCarrierName({ companyId }) {
      const [row] = await transaction
        .select({
          legalName: companyFiscalProfiles.legalName,
          tradeName: companyFiscalProfiles.tradeName,
          displayNameMode: companyFiscalProfiles.displayNameMode,
        })
        .from(companyFiscalProfiles)
        .where(eq(companyFiscalProfiles.companyId, companyId))
        .limit(1)
      if (row === undefined) return undefined
      return resolveCompanyDisplayName(row)
    },

    async findDeliveryClientTaxId({ companyId, occurrenceId }) {
      const [row] = await transaction
        .select({ taxId: deliveryClients.taxId })
        .from(tripDocumentOccurrences)
        .innerJoin(
          tripDocuments,
          and(
            eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
            eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
          ),
        )
        .innerJoin(
          nfeParticipants,
          and(
            eq(nfeParticipants.companyId, tripDocuments.companyId),
            eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
            eq(nfeParticipants.role, RECIPIENT_ROLE),
          ),
        )
        .innerJoin(
          deliveryClients,
          and(
            eq(deliveryClients.companyId, nfeParticipants.companyId),
            eq(deliveryClients.taxId, nfeParticipants.taxId),
          ),
        )
        .where(
          and(
            eq(tripDocumentOccurrences.companyId, companyId),
            eq(tripDocumentOccurrences.id, occurrenceId),
          ),
        )
        .limit(1)
      return row?.taxId ?? null
    },

    async findDeliveryByKey({ companyId, idempotencyKey }) {
      const [row] = await transaction
        .select({
          address: occurrenceContractorReplyDeliveries.address,
          attachmentId: occurrenceContractorReplyDeliveries.attachmentId,
          id: occurrenceContractorReplyDeliveries.id,
          reason: occurrenceContractorReplyDeliveries.reason,
          status: occurrenceContractorReplyDeliveries.status,
        })
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

    async findMailSettings({ companyId }) {
      const [row] = await transaction
        .select({
          id: contractorMailSettings.id,
          secretEnvelope: contractorMailSettings.secretEnvelope,
          senderAddress: contractorMailSettings.senderAddress,
          sendingVerifiedAt: contractorMailSettings.sendingVerifiedAt,
        })
        .from(contractorMailSettings)
        .where(eq(contractorMailSettings.companyId, companyId))
        .limit(1)
      return row
    },

    async findNoteRecipientEmail({ companyId, occurrenceId }) {
      const [row] = await transaction
        .select({ recipientEmail: nfeDocuments.recipientEmail })
        .from(tripDocumentOccurrences)
        .innerJoin(
          tripDocuments,
          and(
            eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
            eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
          ),
        )
        .innerJoin(
          nfeDocuments,
          and(
            eq(nfeDocuments.companyId, tripDocuments.companyId),
            eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
          ),
        )
        .where(
          and(
            eq(tripDocumentOccurrences.companyId, companyId),
            eq(tripDocumentOccurrences.id, occurrenceId),
          ),
        )
        .limit(1)
      const email = row?.recipientEmail?.trim() ?? ''
      return email === '' ? null : email
    },

    async findOccurrenceThreadId({ companyId, occurrenceId, occurrenceKind }) {
      const [row] = await transaction
        .select({ id: contractorMailThreads.id })
        .from(contractorMailThreads)
        .where(
          and(
            eq(contractorMailThreads.companyId, companyId),
            eq(contractorMailThreads.subjectType, OCCURRENCE_THREAD_SUBJECT_TYPE[occurrenceKind]),
            eq(contractorMailThreads.subjectId, occurrenceId),
          ),
        )
        .limit(1)
      return row?.id
    },

    async listClientEmails({ companyId, purpose, taxId }) {
      return transaction
        .select({
          address: deliveryClientEmails.address,
          id: deliveryClientEmails.id,
          label: deliveryClientEmails.label,
        })
        .from(deliveryClientEmails)
        .where(
          and(
            eq(deliveryClientEmails.companyId, companyId),
            eq(deliveryClientEmails.taxId, taxId),
            eq(deliveryClientEmails.purpose, purpose),
          ),
        )
        .orderBy(asc(deliveryClientEmails.createdAt), asc(deliveryClientEmails.id))
    },

    async lockReply({ companyId, occurrenceId }) {
      const [row] = await transaction
        .select({
          config: occurrenceContractorReplies.config,
          id: occurrenceContractorReplies.id,
          replyAttachmentId: occurrenceContractorReplies.replyAttachmentId,
        })
        .from(occurrenceContractorReplies)
        .where(
          and(
            eq(occurrenceContractorReplies.companyId, companyId),
            eq(occurrenceContractorReplies.occurrenceId, occurrenceId),
          ),
        )
        .limit(1)
        .for('update')
      /** O retorno aponta para `trip_document_occurrences` por FK: é sempre ocorrência de nota. */
      return row === undefined ? null : { ...row, occurrenceKind: 'document' as const }
    },

    async recordDelivery(params) {
      const [row] = await transaction
        .insert(occurrenceContractorReplyDeliveries)
        .values({
          actorUserId: params.actorUserId,
          address: params.address,
          attachmentId: params.attachmentId,
          companyId: params.companyId,
          idempotencyKey: params.idempotencyKey,
          mailMessageId: params.mailMessageId,
          reason: params.reason,
          replyId: params.replyId,
          status: params.status,
          target: params.target,
          trigger: 'operator',
        })
        .returning({ id: occurrenceContractorReplyDeliveries.id })
      if (row === undefined) throw new Error('CONTRACTOR_REPLY_EMAIL_DELIVERY_NOT_PERSISTED')
      return row
    },

    /** O único é sem caixa: um envio concorrente de outra ocorrência do mesmo cliente cai no `DO NOTHING`. */
    async saveClientEmail(params) {
      const [created] = await transaction
        .insert(deliveryClientEmails)
        .values({
          address: params.address,
          companyId: params.companyId,
          createdByKind: params.authorKind,
          createdByUserId: params.actorUserId,
          purpose: params.purpose,
          taxId: params.taxId,
        })
        .onConflictDoNothing()
        .returning({ id: deliveryClientEmails.id })
      if (created === undefined) {
        const [existing] = await transaction
          .select({ id: deliveryClientEmails.id })
          .from(deliveryClientEmails)
          .where(
            and(
              eq(deliveryClientEmails.companyId, params.companyId),
              eq(deliveryClientEmails.taxId, params.taxId),
              eq(deliveryClientEmails.purpose, params.purpose),
              sql`lower(${deliveryClientEmails.address}) = lower(${params.address})`,
            ),
          )
          .limit(1)
        if (existing === undefined) throw new Error('DELIVERY_CLIENT_EMAIL_NOT_PERSISTED')
        return existing
      }
      await transaction.insert(auditLogs).values({
        action: CLIENT_EMAIL_AUDIT_ACTION,
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        correlationId: params.correlationId,
        entityId: created.id,
        entityType: CLIENT_EMAIL_AUDIT_ENTITY_TYPE,
        metadata: {
          addressMasked: maskEmailAddress(params.address),
          authorKind: params.authorKind,
          occurrenceId: params.occurrenceId,
          purpose: params.purpose,
          source: 'occurrence_forward',
        },
        permission: CLIENT_EMAIL_AUDIT_PERMISSION,
        targetId: created.id,
        targetType: CLIENT_EMAIL_AUDIT_ENTITY_TYPE,
      })
      return created
    },

    async recordMail(params) {
      const [message] = await transaction
        .insert(contractorMailMessages)
        .values({
          actorUserId: params.actorUserId,
          bodyHtml: params.bodyHtml,
          bodyText: params.bodyText,
          companyId: params.companyId,
          deliveryStatus: 'queued',
          direction: 'outbound',
          fromAddress: params.fromAddress,
          subject: params.subject,
          threadId: params.threadId,
          toAddresses: [params.toAddress],
        })
        .returning({ id: contractorMailMessages.id })
      if (message === undefined) throw new Error('CONTRACTOR_REPLY_EMAIL_MESSAGE_NOT_PERSISTED')
      await transaction.insert(contractorMailOutbox).values({
        companyId: params.companyId,
        correlationId: params.correlationId,
        eventType: MESSAGE_SEND_REQUESTED_EVENT_TYPE,
        messageId: message.id,
        payload: {},
      })
      return { messageId: message.id }
    },
  }
}

export function createDrizzleContractorReplyEmailUnitOfWork(
  database: Database,
): ContractorReplyEmailUnitOfWorkPort {
  return {
    execute: (operation) =>
      database.transaction((transaction) => operation(createTransactionPort(transaction))),
  }
}

/** Leitura do painel: o retorno, a nota e as entregas por e-mail — endereço sempre mascarado. */
export function createDrizzleContractorReplyEmailReader(
  database: Database,
): ContractorReplyEmailReaderPort {
  const port = createTransactionPort(database)
  return {
    async read({ companyId, occurrenceId }) {
      const [reply] = await database
        .select({
          config: occurrenceContractorReplies.config,
          id: occurrenceContractorReplies.id,
        })
        .from(occurrenceContractorReplies)
        .where(
          and(
            eq(occurrenceContractorReplies.companyId, companyId),
            eq(occurrenceContractorReplies.occurrenceId, occurrenceId),
          ),
        )
        .limit(1)
      if (reply === undefined) return null
      const parsed = contractorReplyConfigurationSchema.safeParse(reply.config)
      const noteAddress = await port.findNoteRecipientEmail({ companyId, occurrenceId })
      const clientTaxId = await port.findDeliveryClientTaxId({ companyId, occurrenceId })
      const clientEmails =
        clientTaxId === null
          ? []
          : await port.listClientEmails({
              companyId,
              purpose: DELIVERY_CLIENT_EMAIL_PURPOSE.BOLETO,
              taxId: clientTaxId,
            })
      const deliveries = await database
        .select({
          address: occurrenceContractorReplyDeliveries.address,
          createdAt: occurrenceContractorReplyDeliveries.createdAt,
          id: occurrenceContractorReplyDeliveries.id,
          reason: occurrenceContractorReplyDeliveries.reason,
          status: occurrenceContractorReplyDeliveries.status,
          target: occurrenceContractorReplyDeliveries.target,
        })
        .from(occurrenceContractorReplyDeliveries)
        .where(
          and(
            eq(occurrenceContractorReplyDeliveries.companyId, companyId),
            eq(occurrenceContractorReplyDeliveries.replyId, reply.id),
            inArray(occurrenceContractorReplyDeliveries.target, [
              ...CONTRACTOR_REPLY_EMAIL_TARGETS,
            ]),
          ),
        )
        .orderBy(desc(occurrenceContractorReplyDeliveries.createdAt))
      return {
        clientEmails: clientEmails.map((email) => ({
          addressMasked: maskEmailAddress(email.address),
          emailId: email.id,
          label: email.label,
        })),
        deliveries: deliveries.flatMap((delivery) =>
          isEmailTarget(delivery.target)
            ? [
                {
                  addressMasked:
                    delivery.address === null ? null : maskEmailAddress(delivery.address),
                  createdAt: delivery.createdAt.toISOString(),
                  id: delivery.id,
                  reason: delivery.reason,
                  status: delivery.status,
                  target: delivery.target,
                },
              ]
            : [],
        ),
        forwardToInformedEmail: parsed.success ? parsed.data.forwardToInformedEmail : 'off',
        forwardToNoteRecipient: parsed.success ? parsed.data.forwardToNoteRecipient : 'off',
        noteRecipient: {
          addressMasked: noteAddress === null ? null : maskEmailAddress(noteAddress),
          isAvailable: noteAddress !== null,
        },
        sentCount: deliveries.filter(
          (delivery) => delivery.status === 'queued' || delivery.status === 'sent',
        ).length,
        sentLimit: CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE,
      }
    },
  }
}
