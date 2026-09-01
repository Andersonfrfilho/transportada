/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Chave que o catálogo não conhece. É 404 e não 400 porque o alvo é um recurso — e a mensagem não
 * lista as chaves válidas: quem edita template já as vê na tela.
 */
export class UnknownNotificationTemplateError extends ApiError {
  public constructor() {
    super({
      code: 'NOTIFICATION_TEMPLATE_NOT_FOUND',
      message: 'Notification template was not found.',
      status: 404,
    })
    this.name = 'UnknownNotificationTemplateError'
  }
}
