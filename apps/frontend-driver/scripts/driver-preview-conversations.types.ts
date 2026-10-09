/* Copyright (c) 2026 Ada Technology. MIT License. */
export type PreviewAttachment = {
  readonly contentType: string
  readonly fileName: string
  readonly id: string
  readonly sizeBytes: number
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
  readonly status: 'sent'
}

export type PreviewConversation = {
  readonly channels: readonly PreviewChannel[]
  readonly iconName?: string
  readonly messages: PreviewMessage[]
  readonly occurrenceId: string
  readonly occurrenceLabel: string
  /** Formato `AAMMDD-XXXX`, alfabeto sem 0, 1, I, L e O. */
  readonly protocol: string
  readonly subjectType: PreviewSubjectType
}
