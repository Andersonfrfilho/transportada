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

/**
 * Spec 183 T654 (RF21, D9): o portal não mostra esta ocorrência à contratante — a tratativa ainda é
 * interna, a nota não tem contratante casada ou ninguém dela tem conta no portal. Escrever ali seria
 * mensagem que ninguém lê.
 */
export class OccurrenceConversationPortalUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_PORTAL_UNAVAILABLE',
      message: 'The contractor portal does not show this occurrence',
      status: 409,
    })
  }
}

/** Spec 183 T701 (RF12): o texto da resposta rápida em branco ou acima de 500 caracteres. */
export class QuickReplyInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'QUICK_REPLY_INVALID',
      message: 'A quick reply needs 1 to 500 characters',
      status: 422,
    })
  }
}

/** Spec 183 T701: a resposta rápida não existe nesta empresa (ou é de outra — a resposta é a mesma). */
export class QuickReplyNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'QUICK_REPLY_NOT_FOUND', message: 'Quick reply was not found', status: 404 })
  }
}

/** Spec 183 T701: a nova ordem tem de trazer exatamente as respostas daquele público, uma vez cada. */
export class QuickReplyOrderInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'QUICK_REPLY_ORDER_INVALID',
      message: 'The order must list every quick reply of the audience exactly once',
      status: 422,
    })
  }
}

/**
 * Spec 183 T702a (RF10): o anexo fora do tipo aceito ou acima do teto do canal — recusado antes de
 * subir, pelo declarado, ou no envio, pelos bytes. O motivo e o teto vão nos detalhes, para a tela
 * dizer o limite; o nome do arquivo nunca.
 */
export class OccurrenceConversationAttachmentRejectedError extends ApiError {
  public constructor(input: { readonly maxBytes?: number; readonly reason: 'size' | 'type' }) {
    super({
      code: 'OCCURRENCE_CONVERSATION_ATTACHMENT_REJECTED',
      details: [
        {
          field: `attachment.${input.reason}`,
          message:
            input.reason === 'type'
              ? 'this file type is not accepted'
              : `the file must have from 1 to ${String(input.maxBytes ?? 0)} bytes`,
        },
      ],
      message: 'The attachment was rejected',
      status: 422,
    })
  }
}

/**
 * Spec 183 T702a: o pedido de upload não serve para esta mensagem — não existe, é de outra pessoa ou
 * conversa, venceu, já foi usado, se repete, passa de cinco ou o arquivo nunca subiu. A resposta é a
 * mesma para todos: distinguir diria o que existe.
 */
export class OccurrenceConversationUploadInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
      message: 'The attachment upload is not available for this message',
      status: 422,
    })
  }
}
