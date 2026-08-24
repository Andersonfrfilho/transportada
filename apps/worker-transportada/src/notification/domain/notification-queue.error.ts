/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A fila é o único ponto do módulo de notificação que fala com o broker, e é lá que o erro ganha
 * nome. Sem esta classe a rotina teria de adivinhar "fila fora do ar" pela mensagem do erro — texto
 * de biblioteca, que muda numa atualização de dependência e leva o código do cartão junto.
 */
export class NotificationQueueUnreachableError extends Error {
  constructor(cause?: unknown) {
    super('notification queue is unreachable', cause === undefined ? undefined : { cause })
    this.name = 'NotificationQueueUnreachableError'
  }
}
