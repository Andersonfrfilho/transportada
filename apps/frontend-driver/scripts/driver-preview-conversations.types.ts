/* Copyright (c) 2026 Ada Technology. MIT License. */
/** Forma de `participantTranscriptionSchema` (spec 264): a demonstração a serve como a API serviria. */
export type PreviewTranscription =
  | { readonly status: 'pending' }
  | {
      readonly engine?: string
      readonly generatedAt: string
      readonly language?: string
      readonly status: 'ready'
      readonly text: string
    }
  | { readonly maxDurationMs?: number; readonly reason?: 'too_long'; readonly status: 'failed' }
  | { readonly status: 'disabled' }

export type PreviewAttachment = {
  readonly contentType: string
  readonly durationMs?: number
  readonly fileName: string
  readonly id: string
  readonly sizeBytes: number
  /** Só áudio; a transcrição muda de `pending` a `ready` pelo debug, então o campo não é `readonly`. */
  transcription?: PreviewTranscription
}

export type PreviewSubjectType = 'document' | 'occurrence' | 'trip'

export type PreviewChannel = 'app' | 'whatsapp'

export type PreviewMessage = {
  readonly attachments: readonly PreviewAttachment[]
  readonly authorName: string
  readonly bodyText: string
  /** Eco da `Idempotency-Key` do envio do motorista; a mensagem do escritório não tem. */
  readonly clientMessageId?: string
  readonly createdAt: string
  readonly direction: 'inbound' | 'outbound'
  readonly id: string
  /** Só mensagem do escritório fica não lida; a do motorista nasce lida. */
  isUnread: boolean
  /** A do motorista nasce `delivered` (✓✓ cinza) e vira `read` (azul) quando o escritório lê; a do escritório fica `sent`. */
  status: 'delivered' | 'read' | 'sent'
}

export type PreviewConversation = {
  readonly channels: readonly PreviewChannel[]
  readonly iconName?: string
  readonly messages: PreviewMessage[]
  /** Quando o escritório leu pela última vez; o resumo o devolve e o app compara no refresh. */
  officeReadAt?: string
  readonly occurrenceId: string
  readonly occurrenceLabel: string
  /** Formato `AAMMDD-XXXX`, alfabeto sem 0, 1, I, L e O. */
  readonly protocol: string
  readonly subjectType: PreviewSubjectType
  /** `max(updated_at)` das transcrições da conversa; o resumo o devolve e o app compara no refresh. */
  transcriptionUpdatedAt?: string
}
