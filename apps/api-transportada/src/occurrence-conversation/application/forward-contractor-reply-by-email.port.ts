/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7: as portas do envio do boleto da contratante por e-mail a um terceiro (o cliente da nota
 * ou um endereço informado). Toda leitura e escrita leva `company_id`.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type {
  ContractorReplyDeliveryReason,
  ContractorReplyDeliveryStatus,
  ContractorReplyDeliveryTarget,
} from '../../shared/occurrence-contractor-reply.constant.js'
import type { OccurrenceMailSettings } from './occurrence-mail.port.js'

export type ContractorReplyEmailTarget = Extract<
  ContractorReplyDeliveryTarget,
  'informed_email' | 'note_recipient_email'
>

/** O retorno da ocorrência, travado para a transação; `config` é a cópia imutável, ainda não validada. */
export type ContractorReplyEmailReply = {
  readonly config: unknown
  readonly id: string
  readonly occurrenceKind: OccurrenceConversationKind
  readonly replyAttachmentId: null | string
}

export type ContractorReplyEmailAttachment = {
  readonly sizeBytes: number
}

export type ContractorReplyEmailDeliveryRecord = {
  readonly address: null | string
  readonly attachmentId: string
  readonly id: string
  readonly reason: ContractorReplyDeliveryReason | null
  readonly status: ContractorReplyDeliveryStatus
}

export type RecordContractorReplyEmailDeliveryParams = {
  readonly actorUserId: string
  readonly address: null | string
  readonly attachmentId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly mailMessageId: null | string
  readonly reason: ContractorReplyDeliveryReason | null
  readonly replyId: string
  readonly status: ContractorReplyDeliveryStatus
  readonly target: ContractorReplyEmailTarget
}

export type RecordContractorReplyMailParams = {
  readonly actorUserId: string
  readonly bodyHtml: string
  readonly bodyText: string
  readonly companyId: string
  readonly correlationId: string
  readonly fromAddress: string
  readonly subject: string
  readonly threadId: string
  readonly toAddress: string
}

export type ContractorReplyEmailTransactionPort = {
  countEmailDeliveries(params: {
    readonly companyId: string
    readonly replyId: string
  }): Promise<number>
  findAttachment(params: {
    readonly attachmentId: string
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyEmailAttachment | null>
  findCarrierName(params: { readonly companyId: string }): Promise<string | undefined>
  findDeliveryByKey(params: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<ContractorReplyEmailDeliveryRecord | null>
  findMailSettings(params: {
    readonly companyId: string
  }): Promise<OccurrenceMailSettings | undefined>
  findNoteRecipientEmail(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | string>
  /** A thread da 143 do objeto: serve só de âncora da mensagem, nunca de conversa (sem token de resposta). */
  findOccurrenceThreadId(params: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: OccurrenceConversationKind
  }): Promise<string | undefined>
  /** `FOR UPDATE` no retorno: serializa os envios da ocorrência, e é o que faz o teto valer. */
  lockReply(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyEmailReply | null>
  recordDelivery(params: RecordContractorReplyEmailDeliveryParams): Promise<{ readonly id: string }>
  recordMail(params: RecordContractorReplyMailParams): Promise<{ readonly messageId: string }>
}

export type ContractorReplyEmailUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: ContractorReplyEmailTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

/** O que o painel precisa para oferecer os botões: nunca o endereço em claro. */
export type ContractorReplyEmailOptions = {
  readonly deliveries: readonly {
    readonly addressMasked: null | string
    readonly createdAt: string
    readonly id: string
    readonly reason: ContractorReplyDeliveryReason | null
    readonly status: ContractorReplyDeliveryStatus
    readonly target: ContractorReplyEmailTarget
  }[]
  readonly forwardToInformedEmail: 'manual' | 'off'
  readonly forwardToNoteRecipient: 'automatic' | 'manual' | 'off'
  readonly noteRecipient: { readonly addressMasked: null | string; readonly isAvailable: boolean }
  readonly sentCount: number
  readonly sentLimit: number
}

export type ContractorReplyEmailReaderPort = {
  read(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyEmailOptions | null>
}
