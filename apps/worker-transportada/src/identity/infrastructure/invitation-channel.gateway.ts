/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EmailDriverPort } from '@adatechnology/notification-contracts'

import type { InvitationContactChannel } from '../application/deliver-invitation-code.service.js'

export class InvitationChannelUnavailableError extends Error {
  constructor(channel: InvitationContactChannel) {
    super(`No driver configured for invitation channel ${channel}`)
    this.name = 'InvitationChannelUnavailableError'
  }
}

export class InvitationDeliveryFailedError extends Error {
  constructor(outcome: string, errorCode: string) {
    super(`Invitation delivery ${outcome}: ${errorCode}`)
    this.name = 'InvitationDeliveryFailedError'
  }
}

/**
 * Traduz `DeliveryAttemptResult` em exceção: `sent` retorna, todo o resto lança. Quem decide o
 * retry é o trilho — o serviço de entrega só precisa saber se deu certo, e nunca marca entregue
 * quando não deu.
 */
export function createInvitationChannelGateway(drivers: { readonly email?: EmailDriverPort }) {
  return {
    async send(input: {
      readonly address: string
      readonly body: string
      readonly channel: InvitationContactChannel
      readonly subject: string
    }): Promise<void> {
      if (input.channel !== 'email' || drivers.email === undefined) {
        throw new InvitationChannelUnavailableError(input.channel)
      }

      const result = await drivers.email.send({
        html: `<p>${input.body}</p>`,
        subject: input.subject,
        text: input.body,
        to: input.address,
      })

      if (result.outcome === 'sent') return

      throw new InvitationDeliveryFailedError(result.outcome, result.errorCode)
    },
  }
}
