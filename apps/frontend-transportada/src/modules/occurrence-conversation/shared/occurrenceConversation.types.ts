/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T407: a conversa da ocorrência como a API devolve (`GET /trip-occurrences/:id/
 * conversations`, T404/T406). O autor da recebida da contratante traz a identidade casada com o
 * cadastro **na leitura** (RF16) — o endereço como chegou fica sempre ao lado.
 */
import type { ParticipantTranscription } from '@adatechnology/conversation-contracts'
import type {
  ContractorContactChannel,
  ContractorContactStatus,
  ContractorContactType,
} from '@/modules/delivery-clients/shared/contractorContacts.types'

export const OCCURRENCE_CONVERSATION_CHANNELS = ['email', 'whatsapp', 'app', 'portal'] as const
export type OccurrenceConversationChannel = (typeof OCCURRENCE_CONVERSATION_CHANNELS)[number]

export const OCCURRENCE_CONVERSATION_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'bounced',
] as const
export type OccurrenceConversationMessageStatus =
  (typeof OCCURRENCE_CONVERSATION_MESSAGE_STATUSES)[number]

export type ContractorSenderContact = Readonly<{
  contractorId: string
  email: string
  id: string
  name: string
  phone: null | string
  preferredChannel: ContractorContactChannel
  roleLabel: string
  status: ContractorContactStatus
  types: readonly ContractorContactType[]
  whatsappOptInAt: null | string
}>

export type ContractorSenderSuggestion = Readonly<{
  email: null | string
  name: string
  phone: null | string
}>

export type ContractorSenderIdentity =
  /** Spec 267 RF9: um usuário da empresa (responsável em cópia) que respondeu por e-mail. */
  | Readonly<{
      arrivedAs: string
      kind: 'internal'
      name: string
      /** `false`: a contratante não estava no `To`/`Cc` — a mensagem é só para a equipe. */
      reachedContractor: boolean
      userId: string
    }>
  | Readonly<{
      arrivedAs: string
      contact: ContractorSenderContact
      inactive: boolean
      kind: 'contact'
      profileName: null | string
    }>
  | Readonly<{
      arrivedAs: string
      displayName: null | string
      kind: 'unknown'
      suggestion: ContractorSenderSuggestion
      /** Spec 183 T903 (S2): e-mail sem DKIM alinhado — o endereço não prova quem mandou. */
      unverified?: boolean
    }>

export type OccurrenceConversationAuthor =
  /** Spec 183 T802: o aviso que o tipo da ocorrência mandou sozinho — sem pessoa. */
  | Readonly<{ kind: 'automatic' }>
  | Readonly<{ kind: 'operation'; name: null | string; userId: string }>
  | Readonly<{
      identity: ContractorSenderIdentity | null
      kind: 'contractor'
      userId: null | string
    }>
  | Readonly<{ kind: 'driver'; name: null | string; userId: string }>
  /** Spec 283: o cliente que respondeu pelo WhatsApp; só o número mascarado. */
  | Readonly<{ addressMasked: string; kind: 'client' }>

/** Spec 183 T702b (RF10): o anexo da mensagem, com a URL temporária (cinco minutos) de leitura. */
export type OccurrenceConversationAttachment = Readonly<{
  contentType: string
  /** Só no áudio, quando a API mediu (spec 264). */
  durationMs?: number
  fileName: string
  id: string
  sizeBytes: number
  /** Só no áudio: o que foi dito, que o SDK mostra embaixo do player, copia e baixa (spec 264). */
  transcription?: ParticipantTranscription
  url: string
}>

export type OccurrenceConversationCopyEntry = Readonly<{
  maskedEmail: string
  name: null | string
}>

export type OccurrenceConversationMessage = Readonly<{
  attachments: readonly OccurrenceConversationAttachment[]
  author: OccurrenceConversationAuthor
  bodyText: string
  channel: OccurrenceConversationChannel
  /** Spec 267 RF8: quem foi em cópia no e-mail de saída; ausente quando ninguém foi. */
  copy?: readonly OccurrenceConversationCopyEntry[]
  createdAt: string
  direction: 'inbound' | 'outbound'
  /** A resposta por e-mail como chegou, com o histórico citado; ausente quando é igual ao texto da conversa. */
  emailFullText?: string
  id: string
  status: null | OccurrenceConversationMessageStatus
  statusTimes: Readonly<Record<string, string>>
  /** Spec 283 T1: o envio que a mensagem conta, na conversa do cliente; ausente nas demais. */
  clientDelivery?: OccurrenceClientDelivery
  /** Spec 283 T5: o destino mascarado da mensagem que o painel mandou (sem `clientDelivery`); ausente nas demais. */
  recipientMasked?: string
  /** Spec 279 T6b (RF12): presente só na mensagem do sistema ("Boleto enviado para o e-mail: …"). */
  systemNotice?: OccurrenceConversationSystemNotice
}>

/** Quem enviou o boleto: a empresa, o motorista pelo app ou o Sistema (envio automático, sem nome). */
export type OccurrenceConversationSystemNotice = Readonly<{
  actorKind: 'driver' | 'office' | 'system'
  actorName: null | string
  deliveryId: string
  kind: 'client_boleto_email_sent'
}>

export type OccurrenceClientDelivery = Readonly<{
  actorKind: 'driver' | 'office' | 'system'
  actorName: null | string
  deliveryId: string
  documentName: null | string
  recipientMasked: string
}>

/** Spec 283 D4: um canal aberto com o cliente — um número de WhatsApp ou um e-mail, com o destino já mascarado. */
export type OccurrenceClientChannel = Readonly<{
  kind: 'email' | 'whatsapp'
  maskedAddress: string
  /** Spec 283 T5: "Responder por". Só no WhatsApp; `null` no e-mail (o cliente não responde por e-mail). */
  replyTarget: null | OccurrenceClientReplyTarget
  status: OccurrenceClientChannelStatus
}>

/** O destino opaco da resposta: o painel nunca vê o número inteiro; `confirmed` é o D6 (primeiro envio confirma o número). */
export type OccurrenceClientReplyTarget = Readonly<{ confirmed: boolean; id: string }>

export const OCCURRENCE_CLIENT_CHANNEL_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
] as const
export type OccurrenceClientChannelStatus = (typeof OCCURRENCE_CLIENT_CHANNEL_STATUSES)[number]

export type OccurrenceConversation = Readonly<{
  /** Spec 283 D4: só na conversa do cliente (nome do cadastro e canais abertos); ausente nas demais. */
  client?: Readonly<{ channels: readonly OccurrenceClientChannel[]; name: null | string }>
  id: string
  messages: readonly OccurrenceConversationMessage[]
  participant: 'client' | 'client_email' | 'contractor' | 'driver'
  status: string
  unreadCount: number
}>

/**
 * Spec 183 T654 (RF21): a leitura das conversas da ocorrência. O canal Portal só abre quando o
 * portal mostra a ocorrência à contratante e alguém dela tem conta.
 */
export type OccurrenceConversationsView = Readonly<{
  contractorPortal: Readonly<{ available: boolean }>
  conversations: readonly OccurrenceConversation[]
}>

export type OccurrenceMailRecipient = Readonly<{
  approvesCharges: boolean
  contactId: string
  email: string
  name: string
  preselected: boolean
  roleLabel: string
}>

/** `POST …/conversations/contractor/mail-preview`: o e-mail que sai, e a quem pode sair. */
export type OccurrenceMailCopyEntry = Readonly<{
  maskedEmail: string
  name: string
  userId: string
}>

export type OccurrenceMailPreview = Readonly<{
  bodyText: string
  /** Spec 267 RF4 / 271: a cópia efetiva (responsáveis do tipo, da contratante ou da empresa). O operador só tira chips. */
  cc: readonly OccurrenceMailCopyEntry[]
  ccSource: 'company' | 'contractor' | 'occurrence_type' | null
  contractorName: string
  /** Spec 269 D8 / 271: sem modelo utilizável no tipo, o e-mail não sai. Ausente é API anterior. */
  missingNotificationTemplate: boolean
  /** Spec 271: a chave do modelo do módulo de notificação que o tipo escolheu. Ausente é API anterior. */
  notificationTemplateKey: null | string
  recipients: readonly OccurrenceMailRecipient[]
  subject: string
  suggested: boolean
  text: string
}>

export type ContractorMailDraft = Readonly<{
  body: string
  contactIds: readonly string[]
  /** Spec 267 RF4: quem o operador tirou da cópia neste envio. */
  excludedWatcherUserIds?: readonly string[]
  subject: string
}>

export type ContractorMailRequest = Readonly<{
  /** Spec 183 T702e: os arquivos já subidos pelo canal e-mail; vazio não vai no corpo. */
  attachmentIds?: readonly string[]
  body: string
  channel: 'email'
  contactIds: readonly string[]
  /** Spec 267 RF4: só quem saiu da cópia; ausente quando ninguém saiu. */
  excludedWatcherUserIds?: readonly string[]
  subject: string
}>

/** Spec 183 T505 (RF9): uma conversa em que a mensagem sem dono pode entrar. */
export type UnassignedCandidate = Readonly<{
  contractorName: string
  conversationId: string
  lastOutbound: null | Readonly<{ at: string; preview: string }>
  occurrenceId: string
  occurrenceKind: 'document' | 'stop'
  /** Spec 283: de quem é a conversa candidata — a contratante ou o cliente da entrega. */
  participant: 'client' | 'contractor'
}>

export type UnassignedMessage = Readonly<{
  bodyText: string
  candidates: readonly UnassignedCandidate[]
  channel: 'email' | 'whatsapp'
  contact: null | Readonly<{ contactId: string; name: string }>
  id: string
  receivedAt: string
  senderAddress: string
}>

/** Spec 183 T701 (RF12): para quem a resposta rápida é escrita — as mesmas abas da conversa; `driver_reply` (263 D11) é a do motorista ao escritório. */
export type QuickReplyAudience = 'contractor' | 'driver' | 'driver_reply'

export type QuickReply = Readonly<{
  active: boolean
  audience: QuickReplyAudience
  id: string
  position: number
  text: string
}>
