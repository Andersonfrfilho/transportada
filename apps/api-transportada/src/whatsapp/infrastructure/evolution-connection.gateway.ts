/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionWhatsAppChannel } from '@adatechnology/evolution-whatsapp-provider'

import type { WhatsAppEvolutionGatewayPort } from '../application/whatsapp-evolution.port.js'

/**
 * Spec 281 T4: a única porta da API para o Evolution. O canal do SDK é criado por chamada, com a
 * chave aberta só durante ela; nada é guardado em campo, log ou métrica.
 */
export function createEvolutionConnectionGateway(
  dependencies: { readonly fetch?: typeof fetch } = {},
): WhatsAppEvolutionGatewayPort {
  const open = (input: { apiKey: string; baseUrl: string; instanceName: string }) =>
    new EvolutionWhatsAppChannel({
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      instance: input.instanceName,
      ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
    })

  return {
    getConnectionState: (input) => open(input).getConnectionState(),
    async getQrCode(input) {
      const qr = await open(input).getQrCode()
      return { pairingCode: qr.pairingCode, qrBase64: qr.base64 }
    },
  }
}
