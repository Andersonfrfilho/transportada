/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T407 (P4, RF14, RF16): a leitura da conversa para a tela, em serviço puro. O balão sabe o
 * lado e o tom (os tokens de balão da T704), quem escreveu vem do cadastro na leitura, e o selo mostra
 * só o que o e-mail consegue confirmar (D7: nunca "lida").
 */
import type {
  ContractorMailDraft,
  ContractorMailRequest,
  ContractorSenderContact,
  ContractorSenderSuggestion,
  OccurrenceConversationMessage,
  OccurrenceConversationMessageStatus,
  OccurrenceMailRecipient,
} from './occurrenceConversation.types'

export type ConversationMessageAuthorView =
  | Readonly<{ kind: 'operation'; name: string }>
  | Readonly<{ kind: 'driver'; name: string }>
  | Readonly<{
      approvesCharges: boolean
      arrivedAs: string
      contact: ContractorSenderContact
      inactive: boolean
      kind: 'contact'
      name: string
      roleLabel: string
    }>
  | Readonly<{
      arrivedAs: string
      kind: 'unknown'
      name: string
      suggestion: ContractorSenderSuggestion
    }>
  /** Portal: o usuário da contratante (Fase 6b). */
  | Readonly<{ kind: 'contractorUser' }>

export type ConversationMessageView = Readonly<{
  author: ConversationMessageAuthorView
  side: 'mine' | 'theirs'
  status: null | Readonly<{ at: null | string; value: OccurrenceConversationMessageStatus }>
  tone: 'contractor' | 'driver' | 'outbound'
}>

function describeAuthor(message: OccurrenceConversationMessage): ConversationMessageAuthorView {
  const { author } = message
  if (author.kind === 'operation') return { kind: 'operation', name: author.name ?? '' }
  if (author.kind === 'driver') return { kind: 'driver', name: author.name ?? '' }
  const { identity } = author
  if (identity === null) return { kind: 'contractorUser' }
  if (identity.kind === 'contact') {
    const { contact } = identity
    return {
      approvesCharges: contact.types.includes('approves_charges'),
      arrivedAs: identity.arrivedAs,
      contact,
      inactive: identity.inactive,
      kind: 'contact',
      name: contact.name.trim() === '' ? contact.email : contact.name,
      roleLabel: contact.roleLabel,
    }
  }
  return {
    arrivedAs: identity.arrivedAs,
    kind: 'unknown',
    name: identity.displayName ?? identity.arrivedAs,
    suggestion: identity.suggestion,
  }
}

export function describeConversationMessage(
  message: OccurrenceConversationMessage,
): ConversationMessageView {
  const isMine = message.direction === 'outbound'
  return {
    author: describeAuthor(message),
    side: isMine ? 'mine' : 'theirs',
    status:
      message.status === null
        ? null
        : { at: message.statusTimes[message.status] ?? null, value: message.status },
    tone: isMine ? 'outbound' : message.author.kind === 'driver' ? 'driver' : 'contractor',
  }
}

export type ConversationDayGroup = Readonly<{
  day: string
  messages: readonly OccurrenceConversationMessage[]
}>

/** `dayOf` recebe o ISO e devolve a chave do dia no fuso de quem vê (a tela injeta o formatador). */
export function groupConversationByDay(
  messages: readonly OccurrenceConversationMessage[],
  dayOf: (iso: string) => string,
): readonly ConversationDayGroup[] {
  const groups: { day: string; messages: OccurrenceConversationMessage[] }[] = []
  for (const message of messages) {
    const day = dayOf(message.createdAt)
    const last = groups.at(-1)
    if (last?.day === day) last.messages.push(message)
    else groups.push({ day, messages: [message] })
  }
  return groups
}

export function initialRecipientIds(recipients: readonly OccurrenceMailRecipient[]): string[] {
  return recipients.filter((recipient) => recipient.preselected).map((item) => item.contactId)
}

export type ContractorMailDraftErrors = Readonly<
  Partial<Record<'body' | 'recipients' | 'subject', 'required'>>
>

export function validateContractorMailDraft(draft: ContractorMailDraft): ContractorMailDraftErrors {
  return {
    ...(draft.body.trim() === '' ? { body: 'required' } : {}),
    ...(draft.contactIds.length === 0 ? { recipients: 'required' } : {}),
    ...(draft.subject.trim() === '' ? { subject: 'required' } : {}),
  }
}

export function buildContractorMailRequest(draft: ContractorMailDraft): ContractorMailRequest {
  return {
    body: draft.body.trim(),
    channel: 'email',
    contactIds: [...draft.contactIds],
    subject: draft.subject.trim(),
  }
}

/** Uma chave por abertura do diálogo: reenviar o mesmo pedido (rede caiu) não duplica o e-mail. */
export function createOccurrenceMailIdempotencyKey(randomId: () => string): string {
  return `occurrence-mail:${randomId()}`
}
