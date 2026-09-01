/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

/**
 * ⚠️ O AAD é palavra por palavra o da API
 * (`whatsapp/application/whatsapp-channel-secret.service.ts`). Divergiu de um lado, o envelope não
 * abre do outro — e as duas apps não importam código uma da outra. O contrato de paridade compara os
 * dois arquivos.
 *
 * Aqui só existe `decrypt`: quem **sela** o token é a API, na rota de configuração. O worker lê.
 */
export function createWhatsAppChannelSecretGateway(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}) {
  return {
    async decrypt(request: {
      readonly channelId: string
      readonly companyId: string
      readonly envelope: unknown
    }): Promise<string> {
      const additionalAuthenticatedData = TEXT_ENCODER.encode(
        `transportada:whatsapp-channel:v1:${request.companyId}:${request.channelId}`,
      )
      let plaintext: Uint8Array | undefined

      try {
        plaintext = await input.envelopeProvider.decrypt({
          additionalAuthenticatedData,
          envelope: request.envelope as SecretEnvelopeV1,
        })
        const secret: unknown = JSON.parse(TEXT_DECODER.decode(plaintext))
        if (
          typeof secret !== 'object' ||
          secret === null ||
          typeof (secret as { accessToken?: unknown }).accessToken !== 'string'
        ) {
          throw new Error('Malformed WhatsApp channel secret')
        }

        return (secret as { accessToken: string }).accessToken
      } finally {
        plaintext?.fill(0)
        additionalAuthenticatedData.fill(0)
      }
    },
  }
}
