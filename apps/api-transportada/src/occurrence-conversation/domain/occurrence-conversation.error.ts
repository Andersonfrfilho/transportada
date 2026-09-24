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

/** Conversa inexistente ou de outra empresa respondem igual: a diferença confirmaria a existência. */
export class OccurrenceConversationNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_NOT_FOUND',
      message: 'Occurrence conversation not found',
      status: 404,
    })
  }
}

/** O canal ou o participante que ainda não tem envio nesta instalação (Fases 5–6b). */
export class OccurrenceConversationChannelUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_CHANNEL_UNAVAILABLE',
      message: 'This channel cannot send messages in this conversation yet',
      status: 422,
    })
  }
}

/** T505: a mensagem da fila não existe nesta empresa (ou é de outra — a resposta é a mesma). */
export class OccurrenceConversationUnassignedNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_UNASSIGNED_NOT_FOUND',
      message: 'Unassigned message not found',
      status: 404,
    })
  }
}

/** T505: atribuir é uma vez só; a segunda tentativa não move a mensagem. */
export class OccurrenceConversationAlreadyAssignedError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_ALREADY_ASSIGNED',
      message: 'The message was already assigned to a conversation',
      status: 409,
    })
  }
}

/** T505 (RF9): só as conversas abertas da contratante daquele remetente são escolha válida. */
export class OccurrenceConversationAssignmentInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_ASSIGNMENT_INVALID',
      message: 'The conversation is not a candidate for this message',
      status: 422,
    })
  }
}

/** T601: a viagem da ocorrência não tem motorista com vínculo ativo — não há a quem escrever. */
export class OccurrenceConversationDriverUnknownError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_DRIVER_UNKNOWN',
      message: 'The occurrence trip has no active driver to talk to',
      status: 422,
    })
  }
}

/** Mensagem em branco ou acima do teto da conversa. */
export class OccurrenceConversationMessageInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_MESSAGE_INVALID',
      message: 'The message is required and within its limit',
      status: 422,
    })
  }
}
