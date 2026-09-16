/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createResendEmailProvider, createSmtpEmailProvider } from '@adatechnology/email-provider'
import type { EmailDriverPort } from '@adatechnology/notification-contracts'

import type { EmailDeliveryEnvironment } from '../../shared/worker.types.js'

/**
 * Um lugar só decide o transporte: convite, recuperação de senha e notificação montavam o SMTP cada
 * um, e trocar de provedor exigia achar os três.
 */
export function createWorkerEmailDriver(delivery: EmailDeliveryEnvironment): EmailDriverPort {
  if (delivery.transport.kind === 'resend') {
    return createResendEmailProvider({ apiKey: delivery.transport.apiKey, from: delivery.from })
  }
  return createSmtpEmailProvider({ from: delivery.from, smtpUrl: delivery.transport.smtpUrl })
}
