/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  WHATSAPP_BUTTON_OPTION_LIMIT,
  WHATSAPP_LIST_BUTTON_LABEL,
  WHATSAPP_LIST_OPTION_LIMIT,
} from '../domain/whatsapp-command.constant.js'
import type {
  WhatsAppChoiceOption,
  WhatsAppMessageSenderPort,
} from './whatsapp-command-driver.port.js'

export type WhatsAppChoiceRenderer = (input: {
  readonly body: string
  readonly options: readonly WhatsAppChoiceOption[]
  readonly sender: WhatsAppMessageSenderPort
  readonly to: string
}) => Promise<void>

/**
 * Provisória e substituível: o despachante recebe o renderizador por dependência, e a T007 entrega
 * a política definitiva (teto de 20/24 caracteres, emoji obrigatório, paginação acima de 10).
 * ⚠️ Até lá, acima de 10 opções só as 10 primeiras são oferecidas.
 */
export const renderWhatsAppChoice: WhatsAppChoiceRenderer = async ({
  body,
  options,
  sender,
  to,
}) => {
  if (options.length <= WHATSAPP_BUTTON_OPTION_LIMIT) {
    await sender.sendButtons({ body, buttons: options, to })
    return
  }

  await sender.sendList({
    body,
    buttonLabel: WHATSAPP_LIST_BUTTON_LABEL,
    rows: options.slice(0, WHATSAPP_LIST_OPTION_LIMIT),
    to,
  })
}
