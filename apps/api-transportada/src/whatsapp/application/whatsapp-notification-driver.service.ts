/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeliveryAttemptResult,
  WhatsAppDriverPort,
  WhatsAppSendingChannel,
} from '@adatechnology/notification-contracts'
import { createWhatsAppDriverFromChannel } from '@adatechnology/notification-contracts'

import type {
  WhatsAppChannelCredential,
  WhatsAppChannelRepositoryPort,
} from './whatsapp-channel.port.js'
import type { WhatsAppChannelSecretService } from './whatsapp-channel-secret.service.js'

export type WhatsAppNotificationDriverLogger = {
  warn(message: string, meta?: Readonly<Record<string, unknown>>): void
}

export type CreateWhatsAppNotificationDriverParams = {
  readonly buildChannel: (params: {
    readonly accessToken: string
    readonly phoneNumberId: string
  }) => WhatsAppSendingChannel
  readonly logger: WhatsAppNotificationDriverLogger
  readonly repository: Pick<WhatsAppChannelRepositoryPort, 'findActiveCredentials'>
  readonly secretService: WhatsAppChannelSecretService
}

/**
 * Spec 062 T004 — **um caminho de envio, não dois**: quem manda WhatsApp é o módulo de notificação,
 * como já é com e-mail. Este driver é o que ele injeta em `channels.whatsapp`.
 *
 * A credencial é resolvida **a cada envio**, e não uma vez no boot: token rotacionado no painel da
 * Meta passa a valer na próxima mensagem, e canal desligado para de enviar na mesma hora. Cobrar um
 * restart por isso transformaria "desligar o canal" num pedido de manutenção.
 */
export function createWhatsAppNotificationDriver(
  params: CreateWhatsAppNotificationDriverParams,
): WhatsAppDriverPort {
  return {
    async send(request) {
      const credential = await resolveCredential(params)
      if (credential.outcome !== undefined) return credential.outcome

      let accessToken: string
      try {
        const secret = await params.secretService.decrypt({
          channelId: credential.value.channelId,
          companyId: credential.value.companyId,
          envelope: credential.value.envelope,
        })
        accessToken = secret.accessToken
      } catch {
        /**
         * Envelope que não abre é quase sempre chaveiro fora do ar, e isso passa. `permanent` aqui
         * queimaria a notificação por uma indisponibilidade de minutos — e notificação queimada não
         * volta, porque a fila já a deu por resolvida.
         */
        params.logger.warn('whatsapp.driver.envelope_unreadable', {
          channelId: credential.value.channelId,
        })

        return { errorCode: 'channel_unavailable', outcome: 'retriable' }
      }

      const channel = params.buildChannel({
        accessToken,
        phoneNumberId: credential.value.phoneNumberId,
      })

      return createWhatsAppDriverFromChannel(channel).send(request)
    },
  }
}

/**
 * ⚠️ **O driver não recebe empresa, e é por isso que "mais de um canal" é recusa.**
 *
 * `WhatsAppDriverPort.send` recebe `{to, body, template}` — o `notification-module` estreita a
 * `delivery` antes de chamar o driver, mesmo tendo `job.companyId` na mão. Com uma empresa só na
 * instalação a escolha é única e não há o que errar; com duas, escolher qualquer uma mandaria a
 * mensagem do cliente **pelo número da outra filial** — e o cliente responderia para lá. Silêncio
 * declarado é melhor que a conversa no telefone errado, então aqui é `permanent`, com o log dizendo
 * quantos canais havia. Fechar isso é acrescentar `companyId` a `SendWhatsAppParams` no
 * `notification-contracts`; está escrito na evidência da T004.
 */
async function resolveCredential(
  params: CreateWhatsAppNotificationDriverParams,
): Promise<
  | { readonly outcome: DeliveryAttemptResult; readonly value?: undefined }
  | { readonly outcome?: undefined; readonly value: WhatsAppChannelCredential }
> {
  const credentials = await params.repository.findActiveCredentials()

  const [credential] = credentials
  if (credential === undefined) {
    return { outcome: { errorCode: 'channel_not_configured', outcome: 'permanent' } }
  }
  if (credentials.length > 1) {
    params.logger.warn('whatsapp.driver.channel_ambiguous', { channels: credentials.length })

    return { outcome: { errorCode: 'channel_ambiguous', outcome: 'permanent' } }
  }

  return { value: credential }
}
