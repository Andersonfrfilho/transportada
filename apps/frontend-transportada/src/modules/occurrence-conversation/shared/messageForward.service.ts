/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Os passos de encaminhar uma mensagem de um chat da ocorrência ao outro, sem efeito colateral. */
export type MessageForwardStep =
  | { readonly attachmentId: string; readonly kind: 'deliver-attachment-to-driver' }
  | {
      readonly body: string
      readonly forwardAttachmentIds: readonly string[]
      readonly idempotencyKey: string
      readonly kind: 'contractor-portal'
    }
  | { readonly body: string; readonly idempotencyKey: string; readonly kind: 'contractor-chat' }
  | { readonly body: string; readonly idempotencyKey: string; readonly kind: 'driver-text' }

type ForwardableMessage = Readonly<{
  attachments: readonly Readonly<{ id: string }>[]
  id: string
  text: null | string
}>

export function copyableMessageText(message: Readonly<{ text: null | string }>): null | string {
  const text = message.text?.trim() ?? ''
  return text === '' ? null : text
}

/**
 * Da contratante ao motorista, cada arquivo vai pela entrega do boleto — o servidor a guarda uma vez por
 * anexo e põe o texto "Segue a requisição: <tipo>" — e o texto vai como mensagem do app. Do motorista à
 * contratante, texto e arquivos vão numa mensagem só pelo portal; sem portal, só o texto sai, pelo chat por
 * e-mail (que não encaminha anexo), e a mensagem com arquivo não tem como ir. A chave é da mensagem de origem.
 */
export function planMessageForward(input: {
  readonly from: 'contractor' | 'driver'
  readonly message: ForwardableMessage
  /** Do motorista à contratante: o portal leva os arquivos; sem ele, só o texto vai por e-mail. */
  readonly portalAvailable?: boolean
}): readonly MessageForwardStep[] {
  const body = copyableMessageText(input.message) ?? ''
  const attachmentIds = input.message.attachments.map((attachment) => attachment.id)
  const idempotencyKey = `message-forward:${input.message.id}`
  if (input.from === 'driver') {
    if (body === '' && attachmentIds.length === 0) return []
    if (input.portalAvailable === true) {
      return [
        { body, forwardAttachmentIds: attachmentIds, idempotencyKey, kind: 'contractor-portal' },
      ]
    }
    if (attachmentIds.length > 0) return []
    return [{ body, idempotencyKey, kind: 'contractor-chat' }]
  }
  return [
    ...attachmentIds.map((attachmentId) => ({
      attachmentId,
      kind: 'deliver-attachment-to-driver' as const,
    })),
    ...(body === '' ? [] : [{ body, idempotencyKey, kind: 'driver-text' as const }]),
  ]
}
