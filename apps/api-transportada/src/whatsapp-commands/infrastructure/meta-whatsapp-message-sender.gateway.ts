/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'

import type { WhatsAppMessageSenderPort } from '../application/whatsapp-command-driver.port.js'

/** Texto, lista e botões saem pelo mesmo adaptador de canal do módulo: mesmo token, mesmo número. */
export function createMetaWhatsAppMessageSender(input: {
  readonly channel: Pick<
    ChannelAdapterInterface,
    'sendInteractiveButtons' | 'sendInteractiveList' | 'sendText'
  >
}): WhatsAppMessageSenderPort {
  return {
    async sendButtons({ body, buttons, to }) {
      if (input.channel.sendInteractiveButtons === undefined) {
        throw new Error('The WhatsApp channel adapter does not support interactive buttons')
      }
      await input.channel.sendInteractiveButtons({ body, buttons: [...buttons], to })
    },
    async sendList({ body, buttonLabel, rows, to }) {
      await input.channel.sendInteractiveList({ body, buttonLabel, rows: [...rows], to })
    },
    async sendText({ body, to }) {
      await input.channel.sendText(to, body)
    },
  }
}
