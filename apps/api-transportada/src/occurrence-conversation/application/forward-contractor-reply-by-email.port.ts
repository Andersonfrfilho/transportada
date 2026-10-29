/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7: as portas do envio do boleto da contratante por e-mail a um terceiro (o cliente da nota
 * ou um endereço informado). Toda leitura e escrita leva `company_id`.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type {
  ClientEmailSendMode,
  ClientEmailType,
  DeliveryClientEmailAuthorKind,
  DeliveryClientEmailPurpose,
} from '../../shared/delivery-client-email.constant.js'
import type {
  ContractorReplyDeliveryReason,
  ContractorReplyDeliveryStatus,
  ContractorReplyDeliveryTarget,
  ContractorReplyDeliveryTrigger,
} from '../../shared/occurrence-contractor-reply.constant.js'
import type { OccurrenceMailSettings } from './occurrence-mail.port.js'

export type ContractorReplyEmailTarget = Extract<
  ContractorReplyDeliveryTarget,
  'client_boleto_emails' | 'informed_email' | 'note_recipient_email'
>

/** Spec 279 T3: um e-mail do cadastro do cliente de entrega; o endereço em claro nunca sai da transação. */
export type ContractorReplyClientEmail = {
  readonly address: string
  readonly id: string
  readonly label: string
}

export type SaveContractorReplyClientEmailParams = {
  readonly actorUserId: string
  readonly address: string
  readonly authorKind: DeliveryClientEmailAuthorKind
  readonly companyId: string
  readonly correlationId: string
  readonly occurrenceId: string
  readonly purpose: DeliveryClientEmailPurpose
  readonly taxId: string
}

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

/** Spec 286 T3: o texto do boleto ao cliente no canal, do modelo do módulo escolhido no tipo (ou o texto livre antigo). */
export type ContractorReplyClientTextsLookup =
  /** `legacy`: o tipo não escolheu modelo e o texto livre antigo está vazio (o alvo segue "desligado", como na 248). */
  | { readonly kind: 'template_missing'; readonly legacy: boolean }
  | {
      readonly kind: 'texts'
      readonly texts: { readonly body: string; readonly subject: string }
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
  /** Spec 279 RF9: o `client_email_type` do tipo da ocorrência (`off` quando o tipo não existe mais). */
  findClientEmailType(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ClientEmailType>
  /**
   * Spec 279 T3: o documento do destinatário da nota da ocorrência, só quando ele tem cadastro em
   * `delivery_clients` da mesma empresa (é a chave dos e-mails guardados). Com `lock`, trava a linha do cliente
   * (`FOR UPDATE`, a mesma trava do cadastro pelo painel), e é o que faz o limite de 10 por tipo valer sob concorrência.
   */
  findDeliveryClientTaxId(params: {
    readonly companyId: string
    readonly lock: boolean
    readonly occurrenceId: string
  }): Promise<null | string>
  /** Spec 279 T6b: a entrega pelo id, só dentro do retorno travado; é de onde o "Tentar de novo" lê o endereço. */
  findDeliveryById(params: {
    readonly companyId: string
    readonly deliveryId: string
    readonly replyId: string
  }): Promise<(ContractorReplyEmailDeliveryRecord & { readonly target: string }) | null>
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
  /** Spec 286 T3: no WhatsApp o assunto vem vazio e o corpo é a legenda inteira. */
  resolveClientTexts(params: {
    readonly channel: 'email' | 'whatsapp'
    readonly companyId: string
    readonly config: unknown
    readonly occurrenceId: string
  }): Promise<ContractorReplyClientTextsLookup>
  /** Spec 279 T3: os e-mails do cliente de um tipo (no máximo 10, D2), na ordem do cadastro. */
  listClientEmails(params: {
    readonly companyId: string
    readonly purpose: DeliveryClientEmailPurpose
    readonly taxId: string
  }): Promise<readonly ContractorReplyClientEmail[]>
  recordDelivery(params: RecordContractorReplyEmailDeliveryParams): Promise<{ readonly id: string }>
  recordMail(params: RecordContractorReplyMailParams): Promise<{ readonly messageId: string }>
  /**
   * Spec 279 D4/D7: guarda o endereço no cadastro do cliente e grava `audit_logs` na mesma transação.
   * Endereço já guardado no tipo (sem distinguir caixa) não duplica: devolve o id que já existe.
   */
  saveClientEmail(params: SaveContractorReplyClientEmailParams): Promise<{ readonly id: string }>
}

export type ContractorReplyEmailUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: ContractorReplyEmailTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

/** O que o painel precisa para oferecer os botões: nunca o endereço em claro. */
export type ContractorReplyEmailOptions = {
  /** Spec 279 RF9: o tipo de e-mail do cliente que o tipo da ocorrência usa; `off` não oferece o envio ao cliente. */
  readonly clientEmailType: ClientEmailType
  /** Spec 279 RF10: `automatic` manda o boleto aceito sozinho aos e-mails do cliente; `manual` só pelo botão. */
  readonly clientEmailSendMode: ClientEmailSendMode
  /** Spec 279 T3 (RF4): os e-mails do cadastro do cliente daquele tipo, mascarados, escolhidos por `emailId`. */
  readonly clientEmails: readonly {
    readonly addressMasked: string
    readonly emailId: string
    readonly label: string
  }[]
  readonly deliveries: readonly {
    /**
     * Spec 279 T6b (RF12): o endereço por inteiro, só no envio ao cliente — a tela da própria empresa mostra o
     * estado Enviado/Falhou por endereço. Os outros alvos seguem mascarados; `null` fora do envio ao cliente.
     */
    readonly address: null | string
    readonly addressMasked: null | string
    readonly createdAt: string
    readonly id: string
    readonly reason: ContractorReplyDeliveryReason | null
    readonly sentAt: null | string
    readonly status: ContractorReplyDeliveryStatus
    readonly target: ContractorReplyEmailTarget
    /** Spec 286 T4 (RF4b): `automatic` ou `operator` — a lista "Envios ao cliente" diz quem disparou. */
    readonly trigger: ContractorReplyDeliveryTrigger
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
