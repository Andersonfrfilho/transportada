/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { WHATSAPP_CHOICE_LIMIT } from '../domain/whatsapp-menu.constant.js'
import { planChoiceMessage } from '../domain/whatsapp-menu.policy.js'
import type {
  WhatsAppChoiceOption,
  WhatsAppMessageSenderPort,
} from './whatsapp-command-driver.port.js'

export type WhatsAppChoiceRenderer = (input: {
  readonly body: string
  readonly options: readonly WhatsAppChoiceOption[]
  readonly page?: number
  readonly sender: WhatsAppMessageSenderPort
  readonly to: string
}) => Promise<void>

/**
 * Spec 144 T007 — traduz `planChoiceMessage` para `sendButtons`/`sendList`. A origem nunca vem de
 * fora: um nó estático do grafo é validado na publicação e nunca passa de
 * `WHATSAPP_CHOICE_LIMIT.listRows`; se algo chegar acima disso aqui, só pode ter vindo de uma lista
 * dinâmica (viagens, notas, emitentes), que é a única que pagina.
 */
export const renderWhatsAppChoice: WhatsAppChoiceRenderer = async ({
  body,
  options,
  page,
  sender,
  to,
}) => {
  const source = options.length > WHATSAPP_CHOICE_LIMIT.listRows ? 'dynamic' : 'graph'
  const plan = planChoiceMessage({
    body,
    options,
    source,
    ...(page === undefined ? {} : { page }),
  })

  if (plan.kind === 'empty') {
    await sender.sendText({ body: plan.body, to })
    return
  }
  if (plan.kind === 'buttons') {
    await sender.sendButtons({ body: plan.body, buttons: plan.buttons, to })
    return
  }

  await sender.sendList({ body: plan.body, buttonLabel: plan.buttonText, rows: plan.rows, to })
}
