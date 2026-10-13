/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ParticipantAttachment,
  ParticipantConversationsApi,
  ParticipantConversationSummary,
  ParticipantMessage,
  ParticipantSubjectGroup,
  ParticipantSubjectRef,
} from '@adatechnology/conversations-ui/participant'

import type { PortalClient } from '@/modules/shared/portalClient.service'
import type {
  Occurrence,
  PortalConversationAttachment,
  PortalConversationMessage,
} from '@/modules/shared/portal.types'

import { portalAttachmentKind, uploadPortalAttachments } from './conversationAttachment.service'

export const PORTAL_OCCURRENCE_SUBJECT_TYPE = 'occurrence'

export const PORTAL_SUBJECT_GROUPS: readonly ParticipantSubjectGroup[] = [
  { label: 'Ocorrências', subjectType: PORTAL_OCCURRENCE_SUBJECT_TYPE },
]

export function toParticipantSummary(
  occurrence: Occurrence,
): ParticipantConversationSummary | undefined {
  if (occurrence.conversationRef === null) return undefined
  return {
    awaitingParticipant: occurrence.conversationUnreadCount > 0,
    channels: ['portal'],
    lastMessageAt: null,
    status: 'open',
    subjectId: occurrence.conversationRef,
    subjectLabel: occurrence.occurrenceTypeName,
    subjectType: PORTAL_OCCURRENCE_SUBJECT_TYPE,
    unreadCount: occurrence.conversationUnreadCount,
  }
}

/** A URL assinada já é a autorização: o id do anexo no pacote é a própria URL. */
function toParticipantAttachment(attachment: PortalConversationAttachment): ParticipantAttachment {
  return {
    filename: attachment.fileName,
    id: attachment.url,
    kind: portalAttachmentKind(attachment.contentType),
    mimeType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
  }
}

export function toParticipantMessage(
  message: PortalConversationMessage,
  index: number,
): ParticipantMessage {
  return {
    attachments: message.attachments.map(toParticipantAttachment),
    authorName: message.mine ? null : message.side === 'carrier' ? 'Transportadora' : null,
    createdAt: message.createdAt,
    direction: message.mine ? 'outbound' : 'inbound',
    id: `${message.createdAt}-${index}`,
    text: message.body,
  }
}

export function createPortalParticipantApi(client: PortalClient): ParticipantConversationsApi {
  return {
    async fetchMessages(subject: ParticipantSubjectRef) {
      const conversation = await client.readConversation(subject.subjectId)
      return conversation.messages.map(toParticipantMessage)
    },
    async listConversations() {
      const occurrences = await client.listOccurrences()
      const data = occurrences.flatMap((occurrence) => toParticipantSummary(occurrence) ?? [])
      return { data }
    },
    markRead: (subject) => client.markConversationRead(subject.subjectId),
    resolveAttachmentUrl: (attachment) => Promise.resolve(attachment.id),
    async sendMessage({ clientMessageId, files, subject, text }) {
      const attachmentIds = await uploadPortalAttachments({
        files: files ?? [],
        putFile: (upload) => client.putConversationUpload(upload),
        requestUpload: (declared) =>
          client.requestConversationUpload({ ...declared, ref: subject.subjectId }),
        uploaded: new Map(),
      })
      await client.sendConversationMessage({
        attachmentIds,
        body: text ?? '',
        idempotencyKey: clientMessageId,
        ref: subject.subjectId,
      })
      const conversation = await client.readConversation(subject.subjectId)
      const lastIndex = conversation.messages.length - 1
      const last = conversation.messages[lastIndex]
      if (last === undefined) return { outcome: 'queued' }
      return {
        message: { ...toParticipantMessage(last, lastIndex), clientMessageId },
        outcome: 'sent',
      }
    },
  }
}
