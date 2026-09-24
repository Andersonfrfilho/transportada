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

export type WhatsAppIncomingImage = {
  readonly mediaId: string
  readonly mimeType: string
}

/**
 * Spec 161 T14 (RF17/D16): o descritor da imagem recebida, para o despachante escrever no contexto
 * — nunca para trocar a assinatura de `extractWhatsAppAnswer`, que o `FlowInterpreter` tipa
 * `string | undefined` e cujo handler não recebe a mensagem inteira.
 */
export function extractWhatsAppIncomingImage(
  message: WhatsAppMessage,
): undefined | WhatsAppIncomingImage {
  const { image } = message
  if (image?.id === undefined || image.mime_type === undefined) return undefined

  return { mediaId: image.id, mimeType: image.mime_type }
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
