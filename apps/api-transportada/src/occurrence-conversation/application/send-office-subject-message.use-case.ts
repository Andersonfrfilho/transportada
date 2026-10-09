/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b (D4, RF12, ADR-0101 §3): o escritório escreve ao motorista na conversa de uma nota ou da
 * viagem. A mensagem sai pelo app, e a conversa passa ao motorista principal de agora (`retarget`). Conversa
 * encerrada é 409. A repetição da `Idempotency-Key` devolve a mensagem gravada, sem avisar de novo; o aviso
 * vem depois da transação e nunca desfaz a mensagem. O texto livre não decide nada (183 D4).
 */
import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import { buildNoticeLabel } from '../domain/conversation-subject-label.policy.js'
import { initialOutboundStatus } from '../domain/message-status.policy.js'
import { SEND_SUBJECT_APP_MESSAGE_OPERATION } from '../domain/office-subject-conversation.constant.js'
import { ConversationNotFoundError } from '../domain/occurrence-conversation.error.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import {
  attachConversationUploads,
  normalizeConversationMessageBody,
  signConversationAttachments,
} from './conversation-attachment.service.js'
import { replayOrRun } from './driver-conversation.use-case.js'
import { notifyOfficeDriver, type OfficeDelivery } from './send-office-subject-message.support.js'
import type { OfficeSubjectInput } from './office-subject-access.service.js'
import {
  findOfficeSubjectOrFail,
  readOfficeSummary,
  requireWritableRecipient,
} from './office-subject-access.service.js'
import type {
  OfficeSubjectNotifierPort,
  OfficeSubjectTransactionPort,
  OfficeSubjectUnitOfWorkPort,
} from './office-subject-conversation.port.js'
import type { OfficeSubjectMessage } from './office-subject-conversation.types.js'

export type SendOfficeSubjectInput = OfficeSubjectInput & {
  readonly actorUserId: string
  readonly attachmentIds?: readonly string[]
  readonly bodyText: string
  readonly idempotencyKey: string
}

export type SendOfficeSubjectResult = {
  readonly message: OfficeSubjectMessage
  readonly replayed: boolean
}

type StoredSend = { readonly conversationId: string; readonly messageId: string }

export function createSendOfficeSubjectMessageUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly notifier: OfficeSubjectNotifierPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: OfficeSubjectUnitOfWorkPort
}) {
  async function insertOutbound(
    transaction: OfficeSubjectTransactionPort,
    input: SendOfficeSubjectInput,
    bodyText: string,
    conversationId: string,
  ): Promise<string> {
    const now = dependencies.clock()
    const status = initialOutboundStatus('app')
    const message = await transaction.insertMessage({
      authorUserId: input.actorUserId,
      bodyText,
      companyId: input.companyId,
      conversationId,
      createdAt: now,
      direction: 'outbound',
      driverUserId: null,
      idempotencyKey: input.idempotencyKey,
      status,
      statusTimes: { [status]: now.toISOString() },
    })
    await attachConversationUploads({
      messageId: message.id,
      now,
      storage: dependencies.storage,
      target: {
        channel: 'app',
        companyId: input.companyId,
        conversationId,
        participant: 'driver',
        requestedByUserId: input.actorUserId,
      },
      transaction: transaction.attachments,
      uploadIds: input.attachmentIds ?? [],
    })
    return message.id
  }

  async function store(
    transaction: OfficeSubjectTransactionPort,
    input: SendOfficeSubjectInput,
    bodyText: string,
  ): Promise<{ readonly delivery: OfficeDelivery; readonly stored: StoredSend }> {
    const subject = await findOfficeSubjectOrFail(transaction, input)
    const driverUserId = await requireWritableRecipient(transaction, input, subject)
    const conversation = await transaction.findOrCreateSubjectConversation({
      companyId: input.companyId,
      driverUserId,
      retarget: true,
      subjectId: input.subjectId,
      subjectType: input.subjectType,
      tripId: input.tripId,
    })
    const messageId = await insertOutbound(transaction, input, bodyText, conversation.id)
    const summary = await readOfficeSummary(
      transaction,
      { ...input, userId: input.actorUserId },
      conversation.id,
    )
    return {
      delivery: {
        driverUserId,
        protocol: summary.protocol,
        subjectLabel: buildNoticeLabel(subject.labelFacts),
      },
      stored: { conversationId: conversation.id, messageId },
    }
  }

  async function readMessage(
    transaction: OfficeSubjectTransactionPort,
    input: SendOfficeSubjectInput,
    stored: StoredSend,
  ): Promise<OfficeSubjectMessage> {
    const message = await transaction.findOfficeMessage({
      companyId: input.companyId,
      conversationId: stored.conversationId,
      messageId: stored.messageId,
    })
    if (message === null) throw new ConversationNotFoundError()
    const attachments = await signConversationAttachments(
      dependencies.storage,
      await transaction.listAttachments({ companyId: input.companyId, messageIds: [message.id] }),
    )
    return {
      ...message,
      attachments: attachments.get(message.id) ?? [],
      createdAt: message.createdAt.toISOString(),
    }
  }

  return {
    async send(input: SendOfficeSubjectInput): Promise<SendOfficeSubjectResult> {
      const bodyText = normalizeConversationMessageBody(input.bodyText, input.attachmentIds ?? [])
      const outcome = await dependencies.unitOfWork.execute(async (transaction) => {
        let delivery: OfficeDelivery | undefined
        const executed = await replayOrRun<StoredSend>({
          companyId: input.companyId,
          fields: [
            input.companyId,
            input.actorUserId,
            input.subjectType,
            input.subjectId,
            bodyText,
            (input.attachmentIds ?? []).join(','),
          ],
          fingerprintService: dependencies.fingerprintService,
          idempotencyKey: input.idempotencyKey,
          operation: SEND_SUBJECT_APP_MESSAGE_OPERATION,
          run: async () => {
            const result = await store(transaction, input, bodyText)
            delivery = result.delivery
            return result.stored
          },
          transaction,
        })
        return {
          delivery,
          message: await readMessage(transaction, input, executed.result),
          replayed: executed.replayed,
        }
      })
      if (!outcome.replayed && outcome.delivery !== undefined) {
        await notifyOfficeDriver(dependencies.notifier, input, outcome.delivery, outcome.message.id)
      }
      return { message: outcome.message, replayed: outcome.replayed }
    },
  }
}
