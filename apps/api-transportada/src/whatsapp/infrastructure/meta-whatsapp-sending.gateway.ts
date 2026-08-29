/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WhatsAppSendingChannel } from '@adatechnology/notification-contracts'
import { WhatsAppMessageProvider } from '@adatechnology/meta-whatsapp-provider'

export type MetaWhatsAppSendingParams = {
  readonly accessToken: string
  readonly apiVersion: string
  readonly baseUrl: string | undefined
  readonly phoneNumberId: string
}

/**
 * Spec 062 T004 — o gateway fino entre o provider da Meta e a forma que o `notification-contracts`
 * descreve. Ele existe porque os dois nomeiam a mesma coisa de jeitos diferentes: o provider devolve
 * `waMessageId` e o contrato lê `externalMessageId`. Traduzir aqui é o que mantém os dois pacotes
 * independentes — o de notificação não sabe o que é Meta, e o da Meta não sabe o que é entrega.
 *
 * ⚠️ O gateway **não engole erro**: quem classifica falha da Graph API é
 * `createWhatsAppDriverFromChannel`, que lê `code` e `statusCode` da exceção para decidir entre
 * tentar de novo, desistir e apagar o destino. Um `try/catch` aqui apagaria essa informação e todo
 * erro viraria "desconhecido, tente de novo".
 */
export function createMetaWhatsAppSendingChannel(
  params: MetaWhatsAppSendingParams,
): WhatsAppSendingChannel {
  const provider = new WhatsAppMessageProvider({
    accessToken: params.accessToken,
    apiVersion: params.apiVersion,
    phoneNumberId: params.phoneNumberId,
    ...(params.baseUrl === undefined ? {} : { baseUrl: params.baseUrl }),
  })

  return {
    async sendText(to: string, body: string) {
      const result = await provider.sendText(toMetaRecipient(to), body)

      return { externalMessageId: result.waMessageId }
    },
    async sendTemplate(request) {
      const result = await provider.sendTemplate({
        languageCode: request.languageCode,
        templateName: request.templateName,
        to: toMetaRecipient(request.to),
        ...(request.bodyParameters === undefined ? {} : { bodyParameters: request.bodyParameters }),
      })

      return { externalMessageId: result.waMessageId }
    },
  }
}

/**
 * A Meta quer o número em E.164 **sem o `+`** e sem pontuação. O telefone do cadastro é digitado por
 * gente — `+55 (16) 99999-1234` é a forma normal —, e mandá-lo cru faz a Graph API recusar com um
 * erro que parece de credencial. Normalizar aqui, no último ponto antes do fio, é o que garante que
 * nenhum caminho de envio escape da regra.
 */
function toMetaRecipient(phone: string): string {
  return phone.replaceAll(/[^0-9]/gu, '')
}
