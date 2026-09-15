/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ContractorMailSettingsStatus } from '../../database/contractor-mail.schema.js'
import type { AddressCorrectionRequest } from './address-correction.port.js'

export type AddressCorrectionMailContractor = {
  readonly displayName: string
  readonly id: string
}

export type AddressCorrectionMailSettings = {
  readonly id: string
  readonly secretEnvelope: unknown
  readonly senderAddress: string
  readonly status: ContractorMailSettingsStatus
}

export type AddressCorrectionMailContact = {
  readonly email: string
  readonly id: string
}

export type FindSendableAddressCorrectionRequestsResult = {
  /** Ids do body que não resolveram para um rascunho `draft` desta contratante. */
  readonly invalidRequestIds: readonly string[]
  readonly sendable: readonly AddressCorrectionRequest[]
}

export type AddressCorrectionMailIdempotencyRecord = {
  readonly fingerprint: string
  readonly response: SendAddressCorrectionMailResult
}

export type RecordAddressCorrectionMailInput = {
  readonly actorUserId: string
  readonly bodyHtml: string
  readonly bodyText: string
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  readonly fromAddress: string
  readonly replyTokenHash: string
  readonly subject: string
  readonly threadId: string
  readonly toAddresses: readonly string[]
}

export type SendAddressCorrectionMailResult = {
  readonly messageId: string
  readonly recipientCount: number
  readonly sentRequestIds: readonly string[]
  readonly threadId: string
}

/**
 * Métodos estreitos, cada um uma leitura ou escrita só — a orquestração (o que cada resultado
 * significa, qual erro lançar) vive no caso de uso, nunca aqui. `execute` roda tudo numa transação
 * só (RF6): a conversa, a mensagem, o outbox e o `status = 'sent'` dos pedidos comitam juntos, ou
 * nenhum comita.
 */
export type AddressCorrectionMailTransactionPort = {
  findActiveContactsByIds(params: {
    readonly companyId: string
    readonly contactIds: readonly string[]
    readonly contractorId: string
  }): Promise<readonly AddressCorrectionMailContact[]>
  findCarrierName(params: { readonly companyId: string }): Promise<string | undefined>
  findContractorByTaxId(params: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<AddressCorrectionMailContractor | undefined>
  findIdempotency(params: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<AddressCorrectionMailIdempotencyRecord | null>
  findMailSettings(params: {
    readonly companyId: string
  }): Promise<AddressCorrectionMailSettings | undefined>
  findOperatorName(params: {
    readonly companyId: string
    readonly userId: string
  }): Promise<string | undefined>
  findSendableRequests(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly requestIds: readonly string[] | undefined
  }): Promise<FindSendableAddressCorrectionRequestsResult>
  markRequestsSent(params: {
    readonly companyId: string
    readonly requestIds: readonly string[]
    readonly threadId: string
  }): Promise<void>
  recordMail(params: RecordAddressCorrectionMailInput): Promise<{ readonly messageId: string }>
  saveIdempotency(params: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly response: SendAddressCorrectionMailResult
  }): Promise<void>
}

export type AddressCorrectionMailUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: AddressCorrectionMailTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
