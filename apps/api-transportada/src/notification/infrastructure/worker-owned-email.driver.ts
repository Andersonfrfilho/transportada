/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EmailDriverPort } from '@adatechnology/notification-contracts'

export const WORKER_OWNED_EMAIL_ERROR_CODE = 'email_delivery_is_worker_owned'

/**
 * A API não envia e-mail: ela enfileira, e o worker — dono do remetente e da chave do provedor —
 * envia. O módulo só oferece um canal que tenha driver, então este existe para anunciar o canal.
 *
 * Com o broker configurado, `send` nunca roda aqui. Sem broker o módulo cai na fila em memória e
 * chamaria este driver: a recusa é permanente e nomeada, em vez de uma tentativa que ninguém atende.
 */
export function createWorkerOwnedEmailDriver(): EmailDriverPort {
  return {
    driver: 'worker-queue',
    send: () =>
      Promise.resolve({ errorCode: WORKER_OWNED_EMAIL_ERROR_CODE, outcome: 'permanent' as const }),
  }
}
