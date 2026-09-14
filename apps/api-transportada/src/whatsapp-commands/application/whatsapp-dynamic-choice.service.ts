/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T020 — a lista dinâmica (viagens, notas, emitentes, tipos de ocorrência) enviada pelas
 * FlowActions. Era copiada em três arquivos; a correção do B3 teria de entrar nas três cópias.
 *
 * ⚠️ `ChannelAdapterInterface` desta instalação é a 0.1.0 (`meta-whatsapp-message-sender.gateway.ts`
 * já registra isso): sem `sendInteractiveButtons`. Toda lista dinâmica sai como lista — inclusive
 * quando `planChoiceMessage` classificaria como botão — porque é o único formato interativo que o
 * canal de uma `FlowAction` sabe enviar.
 */
import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'

import { WHATSAPP_LIST_BUTTON_TEXT } from '../domain/whatsapp-menu.constant.js'
import { planChoiceMessage, type WhatsAppMenuOption } from '../domain/whatsapp-menu.policy.js'

/**
 * `false` quando a lista relida veio vazia: o texto de "nada a mostrar" já saiu, e quem chamou
 * volta ao menu anterior em vez de esperar um toque numa lista que não existe (B3).
 */
export async function sendDynamicChoice(input: {
  readonly body: string
  readonly channel: ChannelAdapterInterface
  readonly options: readonly WhatsAppMenuOption[]
  readonly page: number
  readonly to: string
}): Promise<boolean> {
  const plan = planChoiceMessage({
    body: input.body,
    options: input.options,
    page: input.page,
    source: 'dynamic',
  })
  if (plan.kind === 'empty') {
    await input.channel.sendText(input.to, plan.body)
    return false
  }
  await input.channel.sendInteractiveList({
    body: plan.body,
    buttonLabel: plan.kind === 'buttons' ? WHATSAPP_LIST_BUTTON_TEXT : plan.buttonText,
    rows: [...(plan.kind === 'buttons' ? plan.buttons : plan.rows)],
    to: input.to,
  })
  return true
}
