/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183: os erros estáveis da conversa da ocorrência. Nenhum ecoa e-mail, telefone, assunto ou
 * corpo — o código diz o motivo, e o dado fica fora da resposta e do log.
 */
import { ApiError } from '../../shared/api.error.js'

/** P4: a conversa por e-mail é de ocorrência com nota; sem nota (ou sem cadastro), não há contratante. */
export class OccurrenceConversationContractorUnknownError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_CONTRACTOR_UNKNOWN',
      message: 'The occurrence has no contracting party to talk to',
      status: 422,
    })
  }
}

/** Contato fora desta contratante, inativo, que não recebe ocorrências ou com e-mail inseguro. */
export class OccurrenceConversationNoRecipientError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_NO_RECIPIENT',
      message:
        'At least one recipient is not an active occurrence contact of this contracting party',
      status: 422,
    })
  }
}

export class OccurrenceConversationMailInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_MAIL_INVALID',
      message: 'Subject and message are required and within their limits',
      status: 422,
    })
  }
}

export class OccurrenceConversationIdempotencyKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
      message: 'The idempotency key was already used for a different message',
      status: 409,
    })
  }
}
