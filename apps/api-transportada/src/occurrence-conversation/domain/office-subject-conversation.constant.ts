/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b: os números e a operação de idempotência da conversa por assunto vista pelo escritório.
 */

/** Uma viagem tem uma conversa por nota mais a da viagem; o teto só protege a consulta, não pagina. */
export const OFFICE_SUBJECT_LIST_LIMIT = 500
export const OFFICE_SUBJECT_MESSAGES_DEFAULT_LIMIT = 50
export const OFFICE_SUBJECT_MESSAGES_MAX_LIMIT = 100

/** A idempotência do envio do escritório em nota e viagem (api-contract); a de ocorrência é a antiga. */
export const SEND_SUBJECT_APP_MESSAGE_OPERATION = 'conversation.app.send'
