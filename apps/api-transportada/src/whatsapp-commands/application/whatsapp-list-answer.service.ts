/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T020 (B5) — a resposta a uma lista dinâmica que não está na lista relida. Cumpre a D8
 * dentro da FlowAction: o `entrada_choice` não sabe o que foi oferecido, e o despachante, que conta
 * a resposta fora do menu, zera a contagem dele antes de a FlowAction rodar.
 */
import type { FlowActionHandler, FlowActionResult } from '@adatechnology/meta-whatsapp-contracts'

import {
  WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF,
  WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY,
  WHATSAPP_LIST_ANSWER_FALLBACK,
} from '../domain/whatsapp-command.constant.js'
import { WhatsAppCommandHandoffRequestedError } from '../domain/whatsapp-command.error.js'

/** Mostrar a lista de novo é recomeçar a contagem: só respostas seguidas no mesmo nó somam. */
export const WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET = {
  [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: undefined,
} as const

type FlowActionInput = Parameters<FlowActionHandler>[0]

/**
 * Primeira vez: o `fallbackMessage` e a mesma entrada, esperando o toque. Segunda seguida: o
 * despachante chama uma pessoa (T006) — nada do texto digitado vira id nem estado.
 */
export async function rejectListAnswer(
  input: Pick<FlowActionInput, 'channel' | 'context' | 'node' | 'session'> & {
    readonly entryNode: string
  },
): Promise<FlowActionResult> {
  const previous = input.context[WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]
  const attempts = (typeof previous === 'number' ? previous : 0) + 1
  if (attempts >= WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF) {
    throw new WhatsAppCommandHandoffRequestedError()
  }
  await input.channel.sendText(
    input.session.whatsappNumber,
    input.node.fallbackMessage ?? WHATSAPP_LIST_ANSWER_FALLBACK,
  )
  return {
    context: { [WHATSAPP_LIST_ANSWER_ATTEMPTS_CONTEXT_KEY]: attempts },
    next: input.entryNode,
  }
}
