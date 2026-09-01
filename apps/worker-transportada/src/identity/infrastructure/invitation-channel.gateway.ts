/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EmailDriverPort } from '@adatechnology/notification-contracts'

import { buildEmailHtml } from '../domain/email-layout.policy.js'
import type { InvitationContactChannel } from '../application/deliver-invitation-code.service.js'
import type { WhatsAppCodeSender } from '../../whatsapp/infrastructure/whatsapp-code-sender.gateway.js'

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
export function createInvitationChannelGateway(drivers: {
  readonly email?: EmailDriverPort
  readonly whatsapp?: WhatsAppCodeSender
}) {
  return {
    async send(input: {
      readonly address: string
      readonly body: string
      readonly channel: InvitationContactChannel
      readonly code: string
      readonly companyId: string
      readonly subject: string
    }): Promise<void> {
      /**
       * Spec 062 T005 — o WhatsApp entra pelo mesmo trilho, e a **empresa vem na mensagem**: é ela
       * que escolhe a linha do canal, sem a ambiguidade que o driver de notificação enfrenta.
       *
       * ⚠️ Canal sem driver **lança**, e é assim que tem de ser: o código continua válido e
       * reenviável, porque quem falhou foi o transporte. Marcar entregue aqui deixaria o convite
       * dado como enviado sem ter saído.
       */
      if (input.channel === 'whatsapp') {
        if (drivers.whatsapp === undefined) {
          throw new InvitationChannelUnavailableError(input.channel)
        }

        await drivers.whatsapp.send({
          address: input.address,
          body: input.body,
          code: input.code,
          companyId: input.companyId,
        })

        return
      }

      if (input.channel !== 'email' || drivers.email === undefined) {
        throw new InvitationChannelUnavailableError(input.channel)
      }

      /**
       * O corpo entrava cru em `<p>`: sem moldura, sem marca, e sem escapar — com o texto do
       * template editável no painel, um `<` digitado quebrava o documento e uma tag colada de outro
       * lugar viajava para a caixa de todo mundo. `text` continua sendo o corpo original: é o que o
       * cliente sem HTML mostra.
       */
      const result = await drivers.email.send({
        html: buildEmailHtml({ body: input.body, subject: input.subject }),
        subject: input.subject,
        text: input.body,
        to: input.address,
      })

      if (result.outcome === 'sent') return

      throw new InvitationDeliveryFailedError(result.outcome, result.errorCode)
    },
  }
}
