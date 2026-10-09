/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 260 T5.2-B (D10): o adaptador que liga o `ConversationThread` do SDK (visão `operator`) às rotas do
 * escritório por assunto que já existem. Só traduz: os tipos de mensagem são os do `-contracts`, a chave
 * de idempotência é a do painel (`subject-message:<clientMessageId>`) e os anexos sobem como antes.
 */
import type {
  ParticipantAttachment,
  ParticipantMessage,
} from '@adatechnology/conversation-contracts'
import type {
  ConversationThreadApi,
  ParticipantSendInput,
  ParticipantSendResult,
} from '@adatechnology/conversations-ui/participant'

import { SUBJECT_CONVERSATION_REFETCH_MS } from '../queries/subjectConversation.query'
import {
  conversationAttachmentKind,
  recoverFromSendFailure,
  uploadConversationAttachments,
} from './conversationAttachment.service'
import type {
  OccurrenceConversationAttachment,
  OccurrenceConversationMessage,
} from './occurrenceConversation.types'
import { createSubjectMessageIdempotencyKey } from './subjectConversation.service'
import type { SubjectConversationClient } from './subjectConversationClient.service'
import type { SubjectConversationRef } from './subjectConversation.types'

export type SubjectThreadApiDependencies = Readonly<{
  client: SubjectConversationClient
  subject: SubjectConversationRef
}>

function toParticipantAttachment(
  attachment: OccurrenceConversationAttachment,
): ParticipantAttachment {
  return {
    filename: attachment.fileName,
    id: attachment.id,
    kind: conversationAttachmentKind(attachment.contentType),
    mimeType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
  }
}

/** A mensagem do painel no formato do SDK; `outbound` é a empresa e `inbound` é o motorista nos dois. */
export function toParticipantMessage(message: OccurrenceConversationMessage): ParticipantMessage {
  const { author } = message
  return {
    attachments: message.attachments.map(toParticipantAttachment),
    authorName: author.kind === 'operation' || author.kind === 'driver' ? author.name : null,
    createdAt: message.createdAt,
    direction: message.direction,
    id: message.id,
    ...(message.status === null ? {} : { status: message.status }),
    text: message.bodyText,
  }
}

function toEchoMessage(input: ParticipantSendInput): ParticipantMessage {
  return {
    attachments: [],
    clientMessageId: input.clientMessageId,
    createdAt: new Date().toISOString(),
    direction: 'outbound',
    id: input.clientMessageId,
    status: 'sent',
    text: input.text ?? '',
  }
}

/** Sem `subscribe` o SDK só relê ao voltar o foco; o painel também relê a cada 15 s com a aba visível. */
function createRefreshSubscription(
  subject: SubjectConversationRef,
): NonNullable<ConversationThreadApi['subscribe']> {
  return (listener) => {
    const notify = (): void => {
      if (document.visibilityState === 'visible') {
        listener({
          subject: { subjectId: subject.subjectId, subjectType: subject.subjectType },
          type: 'conversation-changed',
        })
      }
    }
    const intervalId = window.setInterval(notify, SUBJECT_CONVERSATION_REFETCH_MS)
    window.addEventListener('focus', notify)
    document.addEventListener('visibilitychange', notify)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', notify)
      document.removeEventListener('visibilitychange', notify)
    }
  }
}

/** Precisa ser estável (um por assunto): o SDK recria a revalidação a cada objeto novo. */
export function createSubjectThreadApi({
  client,
  subject,
}: SubjectThreadApiDependencies): ConversationThreadApi {
  const attachmentUrls = new Map<string, string>()
  const uploaded = new Map<File, string>()

  async function sendMessage(input: ParticipantSendInput): Promise<ParticipantSendResult> {
    try {
      const attachmentIds = await uploadConversationAttachments({
        files: input.files ?? [],
        putFile: (upload) => client.putUpload(upload),
        requestUpload: (declared) => client.requestUpload({ ...subject, ...declared }),
        uploaded,
      })
      const sent = await client.sendMessage({
        ...subject,
        attachmentIds,
        body: input.text ?? '',
        idempotencyKey: createSubjectMessageIdempotencyKey(() => input.clientMessageId),
      })
      uploaded.clear()
      sent?.attachments.forEach((attachment) => attachmentUrls.set(attachment.id, attachment.url))
      const message = sent === null ? toEchoMessage(input) : toParticipantMessage(sent)
      return { message: { ...message, clientMessageId: input.clientMessageId }, outcome: 'sent' }
    } catch (error) {
      if (recoverFromSendFailure(error).clearUploads) uploaded.clear()
      throw error
    }
  }

  return {
    async fetchMessages(_ref, params) {
      if (params?.before !== undefined) return []
      const messages = await client.listMessages(subject)
      messages.forEach((message) =>
        message.attachments.forEach((attachment) =>
          attachmentUrls.set(attachment.id, attachment.url),
        ),
      )
      return messages.map(toParticipantMessage)
    },
    markRead: () => client.markRead(subject),
    resolveAttachmentUrl(attachment) {
      const url = attachmentUrls.get(attachment.id)
      return url === undefined
        ? Promise.reject(new Error('ATTACHMENT_URL_UNAVAILABLE'))
        : Promise.resolve(url)
    },
    sendMessage,
    subscribe: createRefreshSubscription(subject),
  }
}
