/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T407: a conversa da ocorrência como a API devolve (`GET /trip-occurrences/:id/
 * conversations`, T404/T406). O autor da recebida da contratante traz a identidade casada com o
 * cadastro **na leitura** (RF16) — o endereço como chegou fica sempre ao lado.
 */
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
    }>

export type OccurrenceConversationAuthor =
  | Readonly<{ kind: 'operation'; name: null | string; userId: string }>
  | Readonly<{
      identity: ContractorSenderIdentity | null
      kind: 'contractor'
      userId: null | string
    }>
  | Readonly<{ kind: 'driver'; name: null | string; userId: string }>

export type OccurrenceConversationMessage = Readonly<{
  author: OccurrenceConversationAuthor
  bodyText: string
  channel: OccurrenceConversationChannel
  createdAt: string
  direction: 'inbound' | 'outbound'
  id: string
  status: null | OccurrenceConversationMessageStatus
  statusTimes: Readonly<Record<string, string>>
}>

export type OccurrenceConversation = Readonly<{
  id: string
  messages: readonly OccurrenceConversationMessage[]
  participant: 'contractor' | 'driver'
  status: string
  unreadCount: number
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
export type OccurrenceMailPreview = Readonly<{
  bodyText: string
  contractorName: string
  recipients: readonly OccurrenceMailRecipient[]
  subject: string
  suggested: boolean
  text: string
}>

export type ContractorMailDraft = Readonly<{
  body: string
  contactIds: readonly string[]
  subject: string
}>

export type ContractorMailRequest = Readonly<{
  body: string
  channel: 'email'
  contactIds: readonly string[]
  subject: string
}>
