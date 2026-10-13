/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_CONVERSATION_ERROR, RETRYABLE_CLIENT_STATUSES } from './driverConversation.constant'
import { DriverConversationRequestError } from './driverConversationsHttp.service'

export type DeliveryFailureKind = 'permanent' | 'retry'

const NETWORK_ERROR_CODES: readonly string[] = [
  DRIVER_CONVERSATION_ERROR.REQUEST_FAILED,
  DRIVER_CONVERSATION_ERROR.UPLOAD_FAILED,
]

/**
 * `retry` é o que mudar de rede, de sessão ou de carga do servidor resolve (a mensagem fica na fila);
 * `permanent` é recusa do servidor, que repetir não conserta — espera o motorista.
 */
export function classifyDeliveryFailure(error: unknown): DeliveryFailureKind {
  if (!(error instanceof DriverConversationRequestError)) return 'retry'
  if (error.status === undefined) {
    return NETWORK_ERROR_CODES.includes(error.code) ? 'retry' : 'permanent'
  }
  if (error.status >= 500 || RETRYABLE_CLIENT_STATUSES.includes(error.status)) return 'retry'
  return 'permanent'
}
