/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'
import type { WhatsAppMessageProvider } from '@adatechnology/meta-whatsapp-provider'

import type { WhatsAppMessageSenderPort } from '../application/whatsapp-command-driver.port.js'

/**
 * Texto e lista saem pelo adaptador de canal do módulo; botões, pelo provider, porque o
 * `ChannelAdapterInterface` da 0.1.0 não tem botão. Os dois usam o mesmo token e o mesmo número.
 */
export function createMetaWhatsAppMessageSender(input: {
  readonly buttons: Pick<WhatsAppMessageProvider, 'sendInteractiveButtons'>
  readonly channel: Pick<ChannelAdapterInterface, 'sendInteractiveList' | 'sendText'>
}): WhatsAppMessageSenderPort {
  return {
    async sendButtons({ body, buttons, to }) {
      await input.buttons.sendInteractiveButtons({ bodyText: body, buttons, to })
    },
    async sendList({ body, buttonLabel, rows, to }) {
      await input.channel.sendInteractiveList({ body, buttonLabel, rows: [...rows], to })
    },
    async sendText({ body, to }) {
      await input.channel.sendText(to, body)
    },
  }
}
