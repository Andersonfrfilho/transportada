/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7: os erros estáveis do envio do boleto por e-mail a um terceiro. Nenhum ecoa o endereço:
 * o código diz o motivo, e o e-mail fica fora da resposta e do log.
 */
import { ApiError } from '../../shared/api.error.js'

/** RF11: vazio, vários endereços, quebra de linha, `Bcc:` ou acima de 254 — nada sai. */
export class ContractorReplyEmailAddressInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_REPLY_EMAIL_ADDRESS_INVALID',
      details: [{ field: 'address', message: 'Enter a single valid e-mail address' }],
      message: 'The address must be a single valid e-mail address',
      status: 400,
    })
  }
}

/** O alvo está desligado na cópia da configuração do retorno (ou o texto do e-mail não existe). */
export class ContractorReplyEmailForwardDisabledError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_REPLY_EMAIL_FORWARD_DISABLED',
      message: 'Forwarding the contractor reply by e-mail is off for this target',
      status: 409,
    })
  }
}

/** Teto de envios por ocorrência: 5 e-mails a terceiros, contados os que saíram ou estão na fila. */
export class ContractorReplyEmailLimitReachedError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_REPLY_EMAIL_LIMIT_REACHED',
      message: 'The limit of e-mails sent for this occurrence was reached',
      status: 409,
    })
  }
}

/** Anexo ausente, de outra ocorrência ou de outra conversa: responde como inexistente. */
export class ContractorReplyEmailAttachmentNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_REPLY_EMAIL_ATTACHMENT_NOT_FOUND',
      message: 'The attachment was not found in the contracting party conversation',
      status: 404,
    })
  }
}

/**
 * Spec 279 T3: um `emailId` que não é e-mail para boleto do cliente desta nota (outro cliente, outra empresa,
 * outro tipo ou removido) responde como inexistente, e nada sai.
 */
export class ContractorReplyClientEmailNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERY_CLIENT_EMAIL_NOT_FOUND',
      details: [{ field: 'emailIds', message: 'The e-mail was not found for this client' }],
      message: 'The client e-mail was not found',
      status: 404,
    })
  }
}

/** Spec 279 D2: guardar o endereço passaria de 10 e-mails do cliente no tipo; nada sai nem é guardado. */
export class ContractorReplyClientEmailLimitReachedError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED',
      message: 'The client already has the maximum number of e-mails of this type',
      status: 422,
    })
  }
}

/** Spec 279 T4b (RF8): a mensagem não é da conversa do motorista nesta ocorrência ou não tem e-mail detectado. */
export class DetectedClientEmailNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DETECTED_CLIENT_EMAIL_NOT_FOUND',
      message: 'No detected e-mail was found in this message',
      status: 404,
    })
  }
}

/** Spec 279 T6b: a entrega a tentar de novo não existe nesta ocorrência (ou não é do envio ao cliente). */
export class ContractorReplyEmailDeliveryNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_REPLY_EMAIL_DELIVERY_NOT_FOUND',
      message: 'The e-mail delivery was not found for this occurrence',
      status: 404,
    })
  }
}

/** Spec 279 T6b: só a entrega que o provedor recusou tenta de novo; as outras já saíram ou nunca sairiam. */
export class ContractorReplyEmailRetryNotAllowedError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_REPLY_EMAIL_RETRY_NOT_ALLOWED',
      message: 'Only a delivery the provider refused can be retried',
      status: 409,
    })
  }
}
