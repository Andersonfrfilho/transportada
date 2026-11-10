/* Copyright (c) 2026 Ada Technology. MIT License. */
import { uploadConversationAttachments } from '@/modules/occurrence-conversation/shared/conversationAttachment.service'
import type { OccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

/**
 * Spec 317 (E13, T10): o comprovante do PIX do motorista. A API só aceita, ao concluir, o anexo de uma mensagem
 * **já enviada** ao motorista na conversa desta ocorrência — então o painel envia o arquivo pelo chat que já existe
 * (a mesma subida e o mesmo envio da mensagem comum) e entrega o id do anexo gerado à conclusão.
 *
 * Devolve `null` quando o envio não achou o anexo na conversa: o chamador conclui sem comprovante, porque concluir
 * nunca é bloqueado por ele.
 */
export async function sendDriverPayoutReceipt(
  input: Readonly<{
    body: string
    client: Pick<
      OccurrenceConversationClient,
      | 'listConversations'
      | 'putConversationUpload'
      | 'requestConversationUpload'
      | 'sendDriverAppMessage'
    >
    file: File
    idempotencyKey: string
    occurrenceId: string
  }>,
): Promise<null | string> {
  const attachmentIds = await uploadConversationAttachments({
    files: [input.file],
    putFile: (upload) => input.client.putConversationUpload(upload),
    requestUpload: (declared) =>
      input.client.requestConversationUpload({
        ...declared,
        channel: 'app',
        occurrenceId: input.occurrenceId,
        participant: 'driver',
      }),
  })
  const receipt = await input.client.sendDriverAppMessage({
    attachmentIds,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    occurrenceId: input.occurrenceId,
  })

  const view = await input.client.listConversations({ occurrenceId: input.occurrenceId })
  const messages = view.conversations
    .filter((conversation) => conversation.participant === 'driver')
    .flatMap((conversation) => conversation.messages)
    .filter((message) => message.direction === 'outbound' && message.attachments.length > 0)
  const sent =
    receipt.conversationMessageId === null
      ? messages.at(-1)
      : messages.find((message) => message.id === receipt.conversationMessageId)
  return sent?.attachments[0]?.id ?? null
}
