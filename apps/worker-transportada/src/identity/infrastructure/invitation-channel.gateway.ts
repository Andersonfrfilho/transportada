/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EmailDriverPort } from '@adatechnology/notification-contracts'

import type { EmailBrandPort } from '../application/email-brand.port.js'
import type { InvitationContactChannel } from '../application/deliver-invitation-code.service.js'
import { renderCodeEmail } from '../domain/code-email-template.service.js'
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
/**
 * `brand` é opcional por ausência, nunca por flag: sem ela o e-mail sai com a marca do produto, que
 * é o mesmo caminho de instalação recém-provisionada — e é assim que o teste substitui a ida à API.
 */
export function createInvitationChannelGateway(drivers: {
  readonly brand?: EmailBrandPort
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
      /**
       * O que o e-mail diz em volta do código, separado do `body` que o WhatsApp manda em uma linha.
       * Ausente, o template usa o `body` como parágrafo — nenhum trilho fica sem mensagem.
       */
      readonly email?: { readonly intro: string; readonly note: string }
      /**
       * Quem recebe. O e-mail é endereçado a uma pessoa, e a identidade dele mostra a foto de perfil
       * quando ela existe — o WhatsApp ignora, porque lá a conversa já é com a pessoa.
       */
      readonly recipient?: { readonly name: string; readonly pictureToken: string | undefined }
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
       * O corpo do e-mail é template, não interpolação: antes o `body` inteiro entrava cru dentro de
       * um `<p>`, e o que o operador digita no cadastro da marca chegaria ao HTML do mesmo jeito.
       * Marca ausente ou API fora do ar caem na marca do produto — o código de acesso não espera
       * cadastro nenhum para sair.
       */
      const brand = (await drivers.brand?.read()) ?? {
        accentColor: undefined,
        apiBaseUrl: undefined,
        appBaseUrl: undefined,
        contactEmail: undefined,
        contactPhone: undefined,
        logoUrl: undefined,
        name: undefined,
      }
      const document = renderCodeEmail({
        brand,
        ...(input.recipient === undefined ? {} : { recipient: input.recipient }),
        content: {
          code: input.code,
          headline: input.subject,
          intro: input.email?.intro ?? input.body,
          note: input.email?.note ?? '',
        },
        year: new Date().getFullYear(),
      })

      const result = await drivers.email.send({
        html: document.html,
        subject: input.subject,
        text: document.text,
        to: input.address,
      })

      if (result.outcome === 'sent') return

      throw new InvitationDeliveryFailedError(result.outcome, result.errorCode)
    },
  }
}
