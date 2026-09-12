/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowNodeData, WhatsAppMessage } from '@adatechnology/meta-whatsapp-contracts'

/** O id do botão ou da linha tocada; sem toque, o texto digitado. Texto em branco é ausência. */
export function extractWhatsAppAnswer(message: WhatsAppMessage): string | undefined {
  const interactiveId = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id
  if (interactiveId !== undefined) return interactiveId

  const body = message.text?.body?.trim()
  return body === undefined || body === '' ? undefined : body
}

export function isChoiceNode(node: FlowNodeData): boolean {
  return node.type === 'menu' || node.questionType === 'choice'
}

/**
 * ⚠️ O `FlowInterpreter` **não valida** resposta: id desconhecido cai no `byAnswer.default` e o
 * fluxo anda. Esta é a guarda que faz texto livre em nó de escolha nunca avançar (D8).
 */
export function isOfferedOption(node: FlowNodeData, answer: string | undefined): boolean {
  if (answer === undefined) return false

  return (node.options ?? []).some(([optionId]) => optionId === answer)
}
