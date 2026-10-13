/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Fio da ocorrência no `ConversationThread` do SDK (visão `operator`): o adaptador que liga as duas abas (Contratante e
 * Motorista) às rotas que já existem. Só traduz — a leitura passa pelo cache da aba, o envio sobe os anexos e manda a
 * mensagem pelo canal da aba (portal ou app) com a chave de idempotência derivada do `clientMessageId` do SDK.
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

import type { ConversationParticipant } from './conversationParticipant.constant'
import {
  conversationAttachmentKind,
  recoverFromSendFailure,
  uploadConversationAttachments,
} from './conversationAttachment.service'
import {
  createDriverMessageIdempotencyKey,
  createPortalMessageIdempotencyKey,
} from './occurrenceConversation.service'
import type { OccurrenceConversationClient } from './occurrenceConversationClient.service'
import type {
  OccurrenceConversation,
  OccurrenceConversationAttachment,
  OccurrenceConversationChannel,
  OccurrenceConversationMessage,
  OccurrenceConversationsView,
} from './occurrenceConversation.types'

export type OccurrenceThreadParticipant = 'contractor' | 'driver'

/** Os textos do autor no balão: o canal vai junto do nome, já que o SDK desenha um só rótulo por mensagem. */
export type OccurrenceThreadAuthorLabels = Readonly<{
  automatic: string
  channel: Readonly<Record<OccurrenceConversationChannel, string>>
  contractor: string
  contractorUser: string
  driver: string
  operation: string
  unverified: string
}>

const AUTHOR_SEPARATOR = ' · '

function describeAuthorName(
  message: OccurrenceConversationMessage,
  labels: OccurrenceThreadAuthorLabels,
): string {
  const { author } = message
  if (author.kind === 'automatic') return labels.automatic
  if (author.kind === 'operation') return author.name ?? labels.operation
  if (author.kind === 'driver') return author.name ?? labels.driver
  const { identity } = author
  if (identity === null) return labels.contractorUser
  /** Só o nome de quem respondeu: nunca o endereço de e-mail nem o cargo. Sem nome legível, "Contratante". */
  if (identity.kind === 'contact') {
    return identity.contact.name.trim() === '' ? labels.contractor : identity.contact.name
  }
  const name = identity.displayName?.trim() ?? ''
  const readable = name === '' || name.includes('@') ? labels.contractor : name
  return identity.unverified === true
    ? `${readable}${AUTHOR_SEPARATOR}${labels.unverified}`
    : readable
}

/** Quem fala na mensagem: a empresa (`outbound`) ou o participante da aba. */
export function resolveMessageSpeaker(
  message: OccurrenceConversationMessage,
  participant: OccurrenceThreadParticipant,
): ConversationParticipant {
  return message.direction === 'outbound' ? 'operator' : participant
}

function toThreadAttachment(attachment: OccurrenceConversationAttachment): ParticipantAttachment {
  return {
    filename: attachment.fileName,
    id: attachment.id,
    kind: conversationAttachmentKind(attachment.contentType),
    mimeType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
  }
}

/** O canal entra no nome (`Maria · E-mail`): quem lê vê por onde a mensagem foi ou veio. */
export function toThreadMessage(
  message: OccurrenceConversationMessage,
  labels: OccurrenceThreadAuthorLabels,
): ParticipantMessage {
  return {
    attachments: message.attachments.map(toThreadAttachment),
    authorName: `${describeAuthorName(message, labels)}${AUTHOR_SEPARATOR}${labels.channel[message.channel]}`,
    createdAt: message.createdAt,
    direction: message.direction,
    id: message.id,
    ...(message.status === null ? {} : { status: message.status }),
    text: message.bodyText,
  }
}

export type OccurrenceThreadClient = Pick<
  OccurrenceConversationClient,
  | 'markConversationRead'
  | 'putConversationUpload'
  | 'requestConversationUpload'
  | 'sendContractorPortalMessage'
  | 'sendDriverAppMessage'
>

export type OccurrenceThreadApiDependencies = Readonly<{
  client: OccurrenceThreadClient
  labels: OccurrenceThreadAuthorLabels
  /** Chamado depois de enviar ou de marcar como lida: a aba, a listagem e o feed releem. */
  onChanged: () => void
  occurrenceId: string
  /** Cada nome de autor lido e quem fala nele: o avatar do balão (ícone + cor) sai daqui. */
  onSpeaker?: (authorName: string, speaker: ConversationParticipant) => void
  participant: OccurrenceThreadParticipant
  /** A leitura da aba — o fio não faz uma segunda ida à API. */
  readConversations: () => Promise<OccurrenceConversationsView>
  subscribe: NonNullable<ConversationThreadApi['subscribe']>
}>

function findConversation(
  view: OccurrenceConversationsView,
  participant: OccurrenceThreadParticipant,
): OccurrenceConversation | undefined {
  return view.conversations.find((conversation) => conversation.participant === participant)
}

/** Precisa ser estável (um por ocorrência e aba): o SDK recria a revalidação a cada objeto novo. */
export function createOccurrenceThreadApi(
  dependencies: OccurrenceThreadApiDependencies,
): ConversationThreadApi {
  const {
    client,
    labels,
    occurrenceId,
    onChanged,
    onSpeaker,
    participant,
    readConversations,
    subscribe,
  } = dependencies
  const channel = participant === 'driver' ? 'app' : 'portal'
  const attachmentUrls = new Map<string, string>()
  const uploaded = new Map<File, string>()
  let conversationId: null | string = null
  let unreadCount = 0

  async function sendMessage(input: ParticipantSendInput): Promise<ParticipantSendResult> {
    try {
      const attachmentIds = await uploadConversationAttachments({
        files: input.files ?? [],
        putFile: (upload) => client.putConversationUpload(upload),
        requestUpload: (declared) =>
          client.requestConversationUpload({ ...declared, channel, occurrenceId, participant }),
        uploaded,
      })
      const body = input.text ?? ''
      const idempotencyKey =
        participant === 'driver'
          ? createDriverMessageIdempotencyKey(() => input.clientMessageId)
          : createPortalMessageIdempotencyKey(() => input.clientMessageId)
      const message = { attachmentIds, body, idempotencyKey, occurrenceId }
      if (participant === 'driver') await client.sendDriverAppMessage(message)
      else await client.sendContractorPortalMessage(message)
      uploaded.clear()
      onChanged()
      return {
        message: {
          attachments: [],
          clientMessageId: input.clientMessageId,
          createdAt: new Date().toISOString(),
          direction: 'outbound',
          id: input.clientMessageId,
          status: participant === 'driver' ? 'queued' : 'delivered',
          text: body,
        },
        outcome: 'sent',
      }
    } catch (error) {
      if (recoverFromSendFailure(error).clearUploads) uploaded.clear()
      throw error
    }
  }

  return {
    async fetchMessages(_subject, params) {
      if (params?.before !== undefined) return []
      const conversation = findConversation(await readConversations(), participant)
      conversationId = conversation?.id ?? null
      unreadCount = conversation?.unreadCount ?? 0
      const messages = conversation?.messages ?? []
      messages.forEach((message) =>
        message.attachments.forEach((attachment) =>
          attachmentUrls.set(attachment.id, attachment.url),
        ),
      )
      return messages.map((message) => {
        const threadMessage = toThreadMessage(message, labels)
        if (threadMessage.authorName != null) {
          onSpeaker?.(threadMessage.authorName, resolveMessageSpeaker(message, participant))
        }
        return threadMessage
      })
    },
    async markRead() {
      if (conversationId === null || unreadCount === 0) return
      await client.markConversationRead({ conversationId })
      unreadCount = 0
      onChanged()
    },
    resolveAttachmentUrl(attachment) {
      const url = attachmentUrls.get(attachment.id)
      return url === undefined
        ? Promise.reject(new Error('ATTACHMENT_URL_UNAVAILABLE'))
        : Promise.resolve(url)
    },
    sendMessage,
    subscribe,
  }
}
