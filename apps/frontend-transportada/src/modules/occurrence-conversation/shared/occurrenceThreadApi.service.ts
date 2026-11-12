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
  createEmailMessageIdempotencyKey,
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
  /** Spec 267 RF8: o prefixo da linha da cópia (Cópia: Ana, Bruno). */
  copy: string
  driver: string
  operation: string
  /** Spec 279 T6b (RF12): "Sistema" — o autor da linha "Boleto enviado para o e-mail: …"; com pessoa, "Sistema · Marta". */
  system: string
  /** Spec 267 RF9: a marca do responsável que respondeu, e o selo de quando a contratante não recebeu. */
  team: string
  teamOnly: string
  unverified: string
}>

const AUTHOR_SEPARATOR = ' · '

function describeAuthorName(
  message: OccurrenceConversationMessage,
  labels: OccurrenceThreadAuthorLabels,
): string {
  const { author } = message
  if (message.systemNotice !== undefined) {
    const { actorName } = message.systemNotice
    return actorName === null ? labels.system : `${labels.system}${AUTHOR_SEPARATOR}${actorName}`
  }
  if (author.kind === 'automatic') return labels.automatic
  if (author.kind === 'operation') return author.name ?? labels.operation
  if (author.kind === 'driver') return author.name ?? labels.driver
  if (author.kind === 'client') return author.addressMasked
  const { identity } = author
  if (identity === null) return labels.contractorUser
  if (identity.kind === 'internal') {
    const team = `${identity.name}${AUTHOR_SEPARATOR}${labels.team}`
    return identity.reachedContractor ? team : `${team}${AUTHOR_SEPARATOR}${labels.teamOnly}`
  }
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

export function toThreadAttachment(
  attachment: OccurrenceConversationAttachment,
): ParticipantAttachment {
  return {
    filename: attachment.fileName,
    id: attachment.id,
    kind: conversationAttachmentKind(attachment.contentType),
    mimeType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    ...(attachment.durationMs === undefined ? {} : { durationMs: attachment.durationMs }),
    ...(attachment.transcription === undefined ? {} : { transcription: attachment.transcription }),
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
    /** O SDK mostra o e-mail inteiro recolhido no balão, atrás do "ver histórico". */
    ...(message.emailFullText === undefined ? {} : { originalText: message.emailFullText }),
    ...(message.status === null ? {} : { status: message.status }),
    /** "Dados da mensagem" do SDK: quando a outra ponta leu o que o escritório mandou. */
    ...(message.direction === 'outbound' && message.statusTimes.read !== undefined
      ? { readAt: message.statusTimes.read }
      : {}),
    text: withCopyLine(message, labels),
  }
}

/** Spec 267 RF8: o SDK só desenha o texto — a cópia vai numa linha antes dele, só na mensagem de saída. */
function withCopyLine(
  message: OccurrenceConversationMessage,
  labels: OccurrenceThreadAuthorLabels,
): string {
  const copy = message.copy ?? []
  if (message.direction !== 'outbound' || copy.length === 0) return message.bodyText
  const names = copy.map((entry) => entry.name ?? entry.maskedEmail).join(', ')
  return `${labels.copy}: ${names}\n\n${message.bodyText}`
}

export type OccurrenceThreadClient = Pick<
  OccurrenceConversationClient,
  | 'markConversationRead'
  | 'putConversationUpload'
  | 'requestConversationUpload'
  | 'sendContractorChatMessage'
  | 'sendDriverAppMessage'
>

export type OccurrenceThreadSendError = Readonly<{ code: string; text: string }>

export type OccurrenceThreadApiDependencies = Readonly<{
  client: OccurrenceThreadClient
  labels: OccurrenceThreadAuthorLabels
  /** Chamado depois de enviar ou de marcar como lida: a aba, a listagem e o feed releem. */
  onChanged: () => void
  occurrenceId: string
  /** Cada nome de autor lido e quem fala nele: o avatar do balão (ícone + cor) sai daqui. */
  /** Spec 274 D10: a falha do envio (código da API + o texto) para o painel dizer o motivo; `null` limpa. */
  onSendError?: (error: null | OccurrenceThreadSendError) => void
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
    onSendError,
    onSpeaker,
    participant,
    readConversations,
    subscribe,
  } = dependencies
  const channel = participant === 'driver' ? 'app' : 'email'
  const attachmentUrls = new Map<string, string>()
  const uploaded = new Map<File, string>()
  /**
   * O SDK mantém o balão enviado até a leitura trazer a mensagem com o mesmo `clientMessageId`. A API não devolve esse
   * eco na leitura, mas devolve o id gravado no envio: guardamos o par e carimbamos a mensagem lida. Sem isso o balão
   * otimista (`queued`) ficava para sempre ao lado da mensagem real — a mensagem aparecia duplicada.
   * O eco devolvido ao SDK também leva o id gravado: o SDK une as mensagens por id e nunca descarta uma, então um eco
   * com o id do cliente ficaria na tela para sempre, mesmo depois de a mensagem real chegar (ou falhar).
   */
  const clientMessageIds = new Map<string, string>()
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
          : createEmailMessageIdempotencyKey(() => input.clientMessageId)
      const message = { attachmentIds, body, idempotencyKey, occurrenceId }
      const receipt =
        participant === 'driver'
          ? await client.sendDriverAppMessage(message)
          : await client.sendContractorChatMessage(message)
      if (receipt.conversationMessageId !== null) {
        clientMessageIds.set(receipt.conversationMessageId, input.clientMessageId)
      }
      uploaded.clear()
      onSendError?.(null)
      onChanged()
      return {
        message: {
          attachments: [],
          clientMessageId: input.clientMessageId,
          createdAt: new Date().toISOString(),
          direction: 'outbound',
          id: receipt.conversationMessageId ?? input.clientMessageId,
          status: 'queued',
          text: body,
        },
        outcome: 'sent',
      }
    } catch (error) {
      if (recoverFromSendFailure(error).clearUploads) uploaded.clear()
      if (participant === 'contractor') {
        const code = (error as { code?: unknown } | null)?.code
        onSendError?.({ code: typeof code === 'string' ? code : '', text: input.text ?? '' })
      }
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
    sendMessage,
    subscribe,
  }
}
