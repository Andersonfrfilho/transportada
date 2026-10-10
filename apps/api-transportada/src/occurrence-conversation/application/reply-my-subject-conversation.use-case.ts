/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (ADR-0101 §7, api-contract): o motorista responde na conversa de uma ocorrência, de uma nota
 * ou da viagem. Ocorrência usa a operação de idempotência e a impressão digital da rota antiga — a mensagem
 * que entrou na fila offline por uma rota e é reenviada pela outra volta como já enviada. Nota e viagem
 * usam a operação nova. A repetição relê a mensagem pelo id: o `idempotency_records` guarda só os ids.
 */
import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import { deriveOwnMessageStatus } from '../domain/driver-own-message-status.policy.js'
import { resolveEffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import {
  isOpenableSubjectType,
  REPLY_SUBJECT_APP_MESSAGE_OPERATION,
} from '../domain/driver-subject-conversation.constant.js'
import {
  ConversationClosedError,
  ConversationNotFoundError,
  OccurrenceConversationDriverChangedError,
} from '../domain/occurrence-conversation.error.js'
import type { ConversationAttachmentStoragePort } from './conversation-attachment.port.js'
import {
  attachConversationUploads,
  normalizeConversationMessageBody,
  signConversationAttachments,
} from './conversation-attachment.service.js'
import type { MyConversationSubject } from './driver-conversation-subject.port.js'
import {
  buildFingerprintFields,
  buildUploadTarget,
  isOccurrenceSubject,
} from './reply-my-subject-conversation.support.js'
import { REPLY_DRIVER_APP_MESSAGE_OPERATION, replayOrRun } from './driver-conversation.use-case.js'
import { findMySubjectOrFail, isSubjectReachable } from './driver-subject-access.service.js'
import type { MySubjectInput } from './driver-subject-access.service.js'
import type { DriverSubjectMessage } from './driver-subject-conversation.types.js'
import type {
  DriverSubjectWriteTransactionPort,
  DriverSubjectWriteUnitOfWorkPort,
} from './driver-subject-write.port.js'

export type ReplyMySubjectInput = MySubjectInput & {
  readonly attachmentIds?: readonly string[]
  readonly bodyText: string
  readonly idempotencyKey: string
}

export type ReplyMySubjectResult = {
  readonly message: DriverSubjectMessage
  readonly replayed: boolean
}

type StoredReply = { readonly conversationId: string; readonly messageId: string }

async function resolveConversationId(
  transaction: DriverSubjectWriteTransactionPort,
  input: ReplyMySubjectInput,
  subject: MyConversationSubject,
): Promise<string> {
  if (subject.occurrenceKind !== null) {
    /** T903 (C1): o principal de agora assume a conversa; outro da tripulação só responde se já for o destinatário. */
    const conversation = await transaction.findOrCreateDriverConversation({
      companyId: input.companyId,
      driverUserId: input.driverUserId,
      occurrenceId: input.subjectId,
      occurrenceKind: subject.occurrenceKind,
      retarget: subject.isPrincipal,
    })
    if (conversation.driverUserId !== input.driverUserId) {
      throw new OccurrenceConversationDriverChangedError()
    }
    return conversation.id
  }
  const status = resolveEffectiveConversationStatus({
    documentReleasedAt: subject.documentReleasedAt,
    storedStatus: subject.conversation?.storedStatus ?? 'open',
    subjectType: subject.subjectType,
    tripStatus: subject.tripStatus,
  })
  if (status === 'closed') throw new ConversationClosedError()
  if (!isSubjectReachable(subject, input.driverUserId)) {
    throw new OccurrenceConversationDriverChangedError()
  }
  if (!isOpenableSubjectType(subject.subjectType)) throw new ConversationNotFoundError()
  const conversation = await transaction.findOrCreateSubjectConversation({
    companyId: input.companyId,
    driverUserId: input.driverUserId,
    retarget: subject.isPrincipal,
    subjectId: input.subjectId,
    subjectType: subject.subjectType,
    tripId: subject.tripId,
  })
  return conversation.id
}

export function createReplyMySubjectConversationUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: DriverSubjectWriteUnitOfWorkPort
}) {
  async function store(
    transaction: DriverSubjectWriteTransactionPort,
    input: ReplyMySubjectInput,
    bodyText: string,
    subject: MyConversationSubject,
  ): Promise<StoredReply> {
    const now = dependencies.clock()
    const conversationId = await resolveConversationId(transaction, input, subject)
    const message = await transaction.insertMessage({
      authorUserId: null,
      bodyText,
      companyId: input.companyId,
      conversationId,
      createdAt: now,
      direction: 'inbound',
      driverUserId: input.driverUserId,
      idempotencyKey: input.idempotencyKey,
      status: null,
      statusTimes: {},
    })
    await attachConversationUploads({
      messageId: message.id,
      now,
      storage: dependencies.storage,
      target: buildUploadTarget(input, subject, conversationId),
      transaction: transaction.attachments,
      uploadIds: input.attachmentIds ?? [],
    })
    return { conversationId, messageId: message.id }
  }

  async function readMessage(
    transaction: DriverSubjectWriteTransactionPort,
    input: ReplyMySubjectInput,
    stored: StoredReply,
  ): Promise<DriverSubjectMessage> {
    const message = await transaction.findSubjectMessage({
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
      status: deriveOwnMessageStatus(message, null),
    }
  }

  return {
    async reply(input: ReplyMySubjectInput): Promise<ReplyMySubjectResult> {
      const bodyText = normalizeConversationMessageBody(input.bodyText, input.attachmentIds ?? [])
      return dependencies.unitOfWork.execute(async (transaction) => {
        const subject = await findMySubjectOrFail(transaction, input)
        const executed = await replayOrRun<StoredReply>({
          companyId: input.companyId,
          fields: buildFingerprintFields(input, bodyText),
          fingerprintService: dependencies.fingerprintService,
          idempotencyKey: input.idempotencyKey,
          operation: isOccurrenceSubject(input.subjectType)
            ? REPLY_DRIVER_APP_MESSAGE_OPERATION
            : REPLY_SUBJECT_APP_MESSAGE_OPERATION,
          run: () => store(transaction, input, bodyText, subject),
          transaction,
        })
        return {
          message: await readMessage(transaction, input, executed.result),
          replayed: executed.replayed,
        }
      })
    },
  }
}
