/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.5: a resposta da contratante gravada na conversa move o retorno aberto dela, na mesma
 * transação da mensagem. Retorno em outro estado não muda; toda leitura e escrita leva `company_id`.
 * Nenhum log aqui: anexo e endereço nunca saem do banco.
 */
import { and, eq } from 'drizzle-orm'

import { occurrenceConversationAttachments } from '../../database/occurrence-conversation.schema.js'
import {
  occurrenceContractorReplies,
  occurrenceContractorReplyEvents,
} from '../../database/occurrence-contractor-reply.schema.js'
import type { ContractorReplyLogOutcome } from '../application/contractor-reply-log.port.js'
import { checkBoletoDocument } from '../domain/contractor-reply-document.policy.js'
import {
  decideContractorReply,
  requiresContractorReplyDocumentCheck,
  resolveContractorReplyEventReason,
  type ContractorReplyDecisionInput,
} from '../domain/contractor-reply.policy.js'
import { findContractorReplyDocumentNote } from './contractor-reply-document-note.support.js'
import {
  deliverContractorReplyToDriver,
  type DeliverContractorReplyToDriverResult,
} from './contractor-reply-driver-delivery.support.js'
import { queueContractorReplyAcknowledgement } from './contractor-reply-acknowledgement.support.js'
import { queueContractorReplyToClientEmails } from './contractor-reply-client-email-forward.support.js'
import { reserveContractorReplyToClientWhatsApp } from './contractor-reply-client-whatsapp-forward.support.js'
import { queueContractorReplyToNoteRecipient } from './contractor-reply-note-recipient-forward.support.js'
import type { OccurrenceConversationTransaction } from './drizzle-occurrence-conversation-mail.repository.js'

export type ContractorReplyAutomaticDelivery = Extract<
  DeliverContractorReplyToDriverResult,
  { readonly kind: 'delivered' }
>

/**
 * Returns the delivery only when this call wrote to the driver chat (T4.6b), so the caller notifies after the commit.
 */
export async function applyContractorReplyToMessage(
  transaction: OccurrenceConversationTransaction,
  params: {
    readonly companyId: string
    readonly conversationId: string
    readonly messageId: string
    readonly now: Date
    /**
     * Spec 276 T2: the text layer of a PDF of this message, by its stored object. Called only when the type
     * checks the boleto and one PDF was accepted; absent, or empty, means the document is not confirmed.
     */
    readonly readDocumentText?: (storedObjectId: string) => Promise<string>
    /** Spec 276: the outcome for the caller's log, called once. */
    readonly report?: (outcome: ContractorReplyLogOutcome) => void
  },
): Promise<ContractorReplyAutomaticDelivery | undefined> {
  const { companyId } = params
  const [reply] = await transaction
    .select({
      config: occurrenceContractorReplies.config,
      id: occurrenceContractorReplies.id,
      status: occurrenceContractorReplies.status,
    })
    .from(occurrenceContractorReplies)
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, companyId),
        eq(occurrenceContractorReplies.conversationId, params.conversationId),
      ),
    )
    .for('update')
    .limit(1)
  if (reply === undefined) {
    params.report?.({ kind: 'no_reply' })
    return undefined
  }

  const attachments = await transaction
    .select({
      contentType: occurrenceConversationAttachments.contentType,
      id: occurrenceConversationAttachments.id,
      storedObjectId: occurrenceConversationAttachments.storedObjectId,
    })
    .from(occurrenceConversationAttachments)
    .where(
      and(
        eq(occurrenceConversationAttachments.companyId, companyId),
        eq(occurrenceConversationAttachments.messageId, params.messageId),
      ),
    )
  const config = reply.config as ContractorReplyDecisionInput['reply']['config']
  const decisionInput = { attachments, reply: { config, status: reply.status } }
  /** As if the content were confirmed: says which single PDF the boleto check has to read, if any. */
  const firstDecision = decideContractorReply({ ...decisionInput, documentConfirmed: true })
  const documentChecked =
    firstDecision.kind === 'accept' && requiresContractorReplyDocumentCheck(config.attachmentKind)
  let documentTextRead = false
  const decision = documentChecked
    ? decideContractorReply({
        ...decisionInput,
        documentConfirmed: await isBoletoConfirmed(transaction, {
          companyId,
          onTextRead: (text) => {
            documentTextRead = text.trim() !== ''
          },
          readDocumentText: params.readDocumentText,
          replyId: reply.id,
          storedObjectId: attachments.find(
            (attachment) => attachment.id === firstDecision.attachmentId,
          )?.storedObjectId,
        }),
      })
    : firstDecision
  if (decision.kind === 'ignore') {
    params.report?.({ kind: 'ignored' })
    return undefined
  }

  const isAccepted = decision.kind === 'accept'
  const toStatus = isAccepted
    ? decision.nextStep === 'deliver'
      ? 'reply_received'
      : 'awaiting_operator'
    : 'needs_operator'
  const reason = isAccepted ? null : decision.reason
  await transaction
    .update(occurrenceContractorReplies)
    .set({
      reason,
      replyAttachmentId: isAccepted ? decision.attachmentId : null,
      replyMessageId: params.messageId,
      status: toStatus,
      updatedAt: params.now,
    })
    .where(
      and(
        eq(occurrenceContractorReplies.companyId, companyId),
        eq(occurrenceContractorReplies.id, reply.id),
      ),
    )
  await transaction.insert(occurrenceContractorReplyEvents).values({
    actorKind: 'system',
    companyId,
    fromStatus: reply.status,
    /** Spec 278 D1: o histórico guarda o resultado da conferência do boleto; o retorno, o motivo da decisão. */
    reason: resolveContractorReplyEventReason({ decision, documentChecked, documentTextRead }),
    replyId: reply.id,
    toStatus,
  })

  const report = (delivered: boolean) =>
    params.report?.({
      delivered,
      documentChecked,
      documentTextRead,
      kind: 'applied',
      reason,
      toStatus,
    })
  /** RF4/RF7: modo automático — a resposta aceita segue ao motorista na mesma transação (idempotente). */
  if (toStatus !== 'reply_received') {
    report(false)
    return undefined
  }
  const delivery = await deliverContractorReplyToDriver(transaction, {
    actorUserId: null,
    companyId,
    now: params.now,
    replyId: reply.id,
    trigger: 'automatic',
  })
  /** RF10: o mesmo boleto sai ao cliente da nota quando o tipo liga o envio automático; falha dele não desfaz nada acima. */
  await queueContractorReplyToNoteRecipient(transaction, { companyId, replyId: reply.id })
  /** Spec 279 RF10: e aos e-mails do cadastro do cliente, quando o tipo liga o envio automático; mesma regra de falha. */
  await queueContractorReplyToClientEmails(transaction, { companyId, replyId: reply.id })
  /**
   * Spec 286 T3 (RF3): e por WhatsApp a todos os números do cliente, quando a caixa do WhatsApp do tipo está em automático.
   * Aqui só a reserva; o Evolution é chamado depois do commit (`dispatchContractorReplyClientWhatsApp`).
   */
  await reserveContractorReplyToClientWhatsApp(transaction, {
    companyId,
    now: params.now,
    replyId: reply.id,
  })
  /** Spec 276 T5: entregue ao motorista, a contratante recebe a resposta rápida do tipo (uma por conversa), se ligada. */
  if (delivery.kind === 'delivered') {
    await queueContractorReplyAcknowledgement(transaction, { companyId, replyId: reply.id })
  }
  report(delivery.kind === 'delivered')
  return delivery.kind === 'delivered' ? delivery : undefined
}

/** Spec 276 T2: the accepted PDF names the note of the occurrence with a valid boleto line. */
async function isBoletoConfirmed(
  transaction: OccurrenceConversationTransaction,
  params: {
    readonly companyId: string
    readonly onTextRead: (text: string) => void
    readonly readDocumentText: ((storedObjectId: string) => Promise<string>) | undefined
    readonly replyId: string
    readonly storedObjectId: string | undefined
  },
): Promise<boolean> {
  const { readDocumentText, storedObjectId } = params
  const [note, text] = await Promise.all([
    findContractorReplyDocumentNote(transaction, params),
    storedObjectId === undefined || readDocumentText === undefined
      ? Promise.resolve('')
      : readDocumentText(storedObjectId),
  ])
  params.onTextRead(text)
  return checkBoletoDocument({ note, text }).confirmed
}
