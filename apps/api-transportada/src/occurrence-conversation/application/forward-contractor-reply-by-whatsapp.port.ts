/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5: as portas do envio do boleto por WhatsApp (Evolution) ao cliente. A reserva da entrega acontece numa
 * transação (o retorno travado serializa os envios da ocorrência, como na 248/279); a chamada ao Evolution fica fora
 * dela, e o fechamento (`sent`/`failed`) é outra transação curta. O número em claro só existe no banco e na chamada.
 */
import type { WhatsAppEvolutionStatus } from '../../database/whatsapp-evolution.schema.js'
import type {
  ClientChannel,
  DeliveryClientEmailAuthorKind,
} from '../../shared/delivery-client-email.constant.js'
import type {
  ContractorReplyDeliveryReason,
  ContractorReplyDeliveryStatus,
  ContractorReplyDeliveryTrigger,
} from '../../shared/occurrence-contractor-reply.constant.js'
import type {
  ContractorReplyEmailReply,
  ContractorReplyEmailTransactionPort,
} from './forward-contractor-reply-by-email.port.js'

export type ContractorReplyWhatsAppContact = {
  /** E.164, como o CHECK de `delivery_client_contacts` guarda. */
  readonly address: string
  readonly id: string
  readonly label: string
}

export type ContractorReplyWhatsAppAttachment = {
  readonly bucket: string
  readonly contentType: string
  readonly fileName: string
  readonly objectKey: string
  readonly sizeBytes: number
}

export type ContractorReplyWhatsAppDeliveryRecord = {
  readonly address: null | string
  readonly attachmentId: string
  readonly id: string
  readonly reason: ContractorReplyDeliveryReason | null
  readonly status: ContractorReplyDeliveryStatus
  readonly target: string
}

export type ContractorReplyWhatsAppSettings = {
  readonly dailyCap: number
  readonly status: WhatsAppEvolutionStatus
}

export type RecordContractorReplyWhatsAppDeliveryParams = {
  readonly actorUserId: string
  readonly address: string
  readonly attachmentId: string
  readonly companyId: string
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly occurrenceId: string
  readonly reason: ContractorReplyDeliveryReason | null
  readonly replyId: string
  readonly status: Extract<ContractorReplyDeliveryStatus, 'failed' | 'queued'>
}

export type SaveContractorReplyWhatsAppContactParams = {
  readonly actorUserId: string
  readonly address: string
  readonly authorKind: DeliveryClientEmailAuthorKind
  readonly companyId: string
  readonly correlationId: string
  readonly occurrenceId: string
  readonly taxId: string
}

export type ContractorReplyWhatsAppTransactionPort = {
  /** Entregas por WhatsApp do retorno que saíram ou estão saindo; com `address`, toda tentativa a esse número. */
  countDeliveries(params: {
    readonly address?: string
    readonly companyId: string
    readonly replyId: string
  }): Promise<number>
  /** D9: as entregas por WhatsApp da empresa desde `since` (o começo do dia), que saíram ou estão saindo. */
  countCompanyDeliveriesSince(params: {
    readonly companyId: string
    readonly since: Date
  }): Promise<number>
  findAttachment(params: {
    readonly attachmentId: string
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyWhatsAppAttachment | null>
  /** Spec 281 T3b: o `client_channel` do tipo da ocorrência (`off` quando o tipo não existe mais). */
  findClientChannel(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ClientChannel>
  /** Igual à 279: o documento do destinatário da nota, só com cadastro em `delivery_clients`; `lock` trava a linha. */
  findDeliveryClientTaxId(params: {
    readonly companyId: string
    readonly lock: boolean
    readonly occurrenceId: string
  }): Promise<null | string>
  findDeliveryById(params: {
    readonly companyId: string
    readonly deliveryId: string
    readonly replyId: string
  }): Promise<ContractorReplyWhatsAppDeliveryRecord | null>
  findDeliveryByKey(params: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<ContractorReplyWhatsAppDeliveryRecord | null>
  /** A configuração do Evolution da empresa (T4), sem a chave. */
  findEvolutionSettings(params: {
    readonly companyId: string
  }): Promise<ContractorReplyWhatsAppSettings | null>
  /** Os números de WhatsApp para boleto do cliente, na ordem do cadastro. */
  listClientWhatsAppContacts(params: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<readonly ContractorReplyWhatsAppContact[]>
  lockReply(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyEmailReply | null>
  /** Spec 286 T3: a legenda do canal `whatsapp`, do modelo do módulo escolhido no tipo (ou o texto livre antigo). */
  resolveClientTexts: ContractorReplyEmailTransactionPort['resolveClientTexts']
  /** Grava a entrega e o `audit_logs` (RF6, número mascarado) na mesma transação. */
  recordDelivery(
    params: RecordContractorReplyWhatsAppDeliveryParams,
  ): Promise<{ readonly id: string }>
  /** Guarda o número no cadastro do cliente (canal `whatsapp`, tipo `boleto`) e audita; número já guardado não duplica. */
  saveClientWhatsAppContact(
    params: SaveContractorReplyWhatsAppContactParams,
  ): Promise<{ readonly id: string }>
}

export type ContractorReplyWhatsAppUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: ContractorReplyWhatsAppTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

/** O fechamento da entrega, depois da chamada ao Evolution. Só muda uma entrega que ainda está `queued`. */
export type ContractorReplyWhatsAppCompletionPort = {
  markFailed(params: {
    readonly companyId: string
    readonly deliveryId: string
    readonly reason: ContractorReplyDeliveryReason
  }): Promise<void>
  /**
   * `sent`, `sent_at` e o id do provedor na entrega e, na mesma transação, o aviso do sistema na conversa do motorista
   * da ocorrência ("Boleto enviado por WhatsApp: …", canal `whatsapp`, com o id do provedor para o webhook da T6).
   */
  markSent(params: {
    /** O texto que saiu: vai ao balão da conversa do cliente (o que foi enviado, não só o anexo). */
    readonly caption: string
    readonly companyId: string
    readonly deliveryId: string
    readonly providerMessageId: null | string
  }): Promise<void>
}

export type ContractorReplyWhatsAppAttachmentReaderPort = {
  read(params: { readonly bucket: string; readonly key: string }): Promise<Uint8Array>
}

/** Por que o Evolution não levou a mensagem; quem chama decide o motivo gravado e se "Tentar de novo" vale. */
export type ContractorReplyWhatsAppSendFailure = 'disconnected' | 'failed' | 'number_not_found'

export class ContractorReplyWhatsAppSendError extends Error {
  public constructor(public readonly failure: ContractorReplyWhatsAppSendFailure) {
    super(`whatsapp send failed: ${failure}`)
    this.name = 'ContractorReplyWhatsAppSendError'
  }
}

/**
 * O Evolution da empresa. A implementação abre a chave da instância só durante a chamada; nada daqui vai a log. Erro
 * de envio sai como `ContractorReplyWhatsAppSendError`.
 */
export type ContractorReplyWhatsAppSenderPort = {
  isConnected(params: { readonly companyId: string }): Promise<boolean>
  sendDocument(params: {
    readonly bytes: Uint8Array
    readonly caption: string
    readonly companyId: string
    readonly fileName: string
    readonly mimeType: string
    readonly number: string
  }): Promise<{ readonly providerMessageId: null | string }>
}

/** O que a tela precisa para oferecer o envio por WhatsApp: tudo mascarado, nada do Evolution além do estado. */
export type ContractorReplyWhatsAppOptions = {
  readonly clientChannel: ClientChannel
  readonly contacts: readonly {
    readonly contactId: string
    readonly label: string
    readonly numberMasked: string
  }[]
  readonly deliveries: readonly {
    readonly createdAt: string
    readonly id: string
    readonly numberMasked: null | string
    readonly reason: ContractorReplyDeliveryReason | null
    readonly sentAt: null | string
    readonly status: ContractorReplyDeliveryStatus
    /** Spec 286 T3 (RF4b): `automatic` é o envio sozinho do Sistema; `operator`, o botão do painel ou do app. */
    readonly trigger: ContractorReplyDeliveryTrigger
  }[]
  /** `ready` só com o Evolution ligado e o último estado lido `open`; senão a tela oferece o e-mail (RF5). */
  readonly evolution: {
    readonly connectionState: 'close' | 'connecting' | 'open' | 'unknown' | null
    readonly ready: boolean
    readonly status: WhatsAppEvolutionStatus | null
  }
  readonly sentCount: number
  readonly sentLimit: number
}

export type ContractorReplyWhatsAppReaderPort = {
  read(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyWhatsAppOptions | null>
}
