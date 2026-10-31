/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 283 + o chat do cliente: a conversa do cliente no `ConversationThread` do SDK (visão `operator`), o mesmo fio das
 * abas Contratante e Motorista. Só traduz: a leitura passa pelo cache da aba, o envio é a resposta por WhatsApp que a
 * rota do cliente já aceita (número escolhido em "Responder por", chave de idempotência do `clientMessageId` do SDK).
 */
import type { ParticipantMessage } from '@adatechnology/conversation-contracts'
import type {
  ConversationThreadApi,
  ParticipantSendResult,
} from '@adatechnology/conversations-ui/participant'

import { createClientReplyIdempotencyKey, type ClientReplyTarget } from './clientReply.service'
import type { ConversationParticipant } from './conversationParticipant.constant'
import type { OccurrenceConversationClient } from './occurrenceConversationClient.service'
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationMessage,
  OccurrenceConversationsView,
} from './occurrenceConversation.types'
import { toThreadAttachment } from './occurrenceThreadApi.service'

const AUTHOR_SEPARATOR = ' · '

export type ClientThreadLabels = Readonly<{
  bySystem: string
  channel: Readonly<Record<OccurrenceConversationChannel, string>>
  fromUs: string
  sentDocument: (name: string) => string
  sentNoText: string
}>

function describeAuthorName(
  message: OccurrenceConversationMessage,
  labels: ClientThreadLabels,
): string {
  const { author, clientDelivery, systemNotice } = message
  if (author.kind === 'client') return author.addressMasked
  if (systemNotice !== undefined) return systemNotice.actorName ?? labels.bySystem
  if (clientDelivery !== undefined) return clientDelivery.actorName ?? labels.bySystem
  if (author.kind === 'operation') return author.name ?? labels.fromUs
  return labels.fromUs
}

/** O texto do balão: o que se escreveu; sem texto, o arquivo que o envio levou (o anexo aparece no próprio balão). */
function describeBody(message: OccurrenceConversationMessage, labels: ClientThreadLabels): string {
  if (message.bodyText.trim() !== '') return message.bodyText
  if (message.attachments.length > 0) return ''
  const documentName = message.clientDelivery?.documentName
  return documentName == null ? labels.sentNoText : labels.sentDocument(documentName)
}

export function toClientThreadMessage(
  message: OccurrenceConversationMessage,
  labels: ClientThreadLabels,
): ParticipantMessage {
  return {
    attachments: message.attachments.map(toThreadAttachment),
    authorName: `${describeAuthorName(message, labels)}${AUTHOR_SEPARATOR}${labels.channel[message.channel]}`,
    createdAt: message.createdAt,
    direction: message.direction,
    id: message.id,
    ...(message.status === null ? {} : { status: message.status }),
    ...(message.direction === 'outbound' && message.statusTimes.read !== undefined
      ? { readAt: message.statusTimes.read }
      : {}),
    text: describeBody(message, labels),
  }
}

export type ClientThreadClient = Pick<
  OccurrenceConversationClient,
  'markConversationRead' | 'sendClientReply'
>

export type ClientThreadApiDependencies = Readonly<{
  client: ClientThreadClient
  labels: ClientThreadLabels
  occurrenceId: string
  onChanged: () => void
  /** A falha do envio, para o painel dizer o motivo; `null` limpa. */
  onSendError: (error: unknown) => void
  onSpeaker?: (authorName: string, speaker: ConversationParticipant) => void
  readConversations: () => Promise<OccurrenceConversationsView>
  /** Lido no momento do envio: o número escolhido em "Responder por" e se o operador já o confirmou. */
  readReplyTarget: () => Readonly<{ confirmed: boolean; target: ClientReplyTarget | undefined }>
  subscribe: NonNullable<ConversationThreadApi['subscribe']>
}>

/** Precisa ser estável (um por ocorrência): o SDK recria a revalidação a cada objeto novo. */
export function createClientThreadApi(
  dependencies: ClientThreadApiDependencies,
): ConversationThreadApi {
  const {
    client,
    labels,
    occurrenceId,
    onChanged,
    onSendError,
    onSpeaker,
    readConversations,
    readReplyTarget,
    subscribe,
  } = dependencies
  const attachmentUrls = new Map<string, string>()
  /** O par id gravado → id do SDK: sem ele o balão otimista ficaria duplicado ao lado da mensagem lida. */
  const clientMessageIds = new Map<string, string>()
  let conversationId: null | string = null
  let unreadCount = 0

  return {
    async fetchMessages(_subject, params) {
      if (params?.before !== undefined) return []
      const conversation = (await readConversations()).conversations.find(
        (item) => item.participant === 'client',
      )
      conversationId = conversation?.id ?? null
      unreadCount = conversation?.unreadCount ?? 0
      const messages = conversation?.messages ?? []
      for (const message of messages) {
        for (const attachment of message.attachments) {
          attachmentUrls.set(attachment.id, attachment.url)
        }
      }
      return messages.map((message) => {
        const threadMessage = toClientThreadMessage(message, labels)
        if (threadMessage.authorName != null) {
          onSpeaker?.(
            threadMessage.authorName,
            message.direction === 'outbound' ? 'operator' : 'client',
          )
        }
        const clientMessageId = clientMessageIds.get(message.id)
        return clientMessageId === undefined ? threadMessage : { ...threadMessage, clientMessageId }
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
    async sendMessage(input): Promise<ParticipantSendResult> {
      const { confirmed, target } = readReplyTarget()
      try {
        if (target === undefined) throw new Error('NOT_FOUND')
        const body = (input.text ?? '').trim()
        const receipt = await client.sendClientReply({
          body,
          ...(!target.confirmed && confirmed ? { confirmNumber: true as const } : {}),
          idempotencyKey: createClientReplyIdempotencyKey(() => input.clientMessageId),
          occurrenceId,
          replyTargetId: target.id,
        })
        onChanged()
        if (receipt.status === 'failed') throw new Error('WHATSAPP_EVOLUTION_UNAVAILABLE')
        onSendError(null)
        const recordedId = receipt.messageId
        clientMessageIds.set(recordedId, input.clientMessageId)
        return {
          message: {
            attachments: [],
            clientMessageId: input.clientMessageId,
            createdAt: new Date().toISOString(),
            direction: 'outbound',
            id: recordedId,
            status: 'queued',
            text: body,
          },
          outcome: 'sent',
        }
      } catch (error) {
        onSendError(error)
        throw error
      }
    },
    subscribe,
  }
}
