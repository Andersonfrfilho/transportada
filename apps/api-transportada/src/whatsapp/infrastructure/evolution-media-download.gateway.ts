/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionWhatsAppChannel } from '@adatechnology/evolution-whatsapp-provider'

import type { LazyEvolutionConnection } from '../application/evolution-group-identity.service.js'

/** Spec 292 T9: baixa a mídia de uma mensagem (o áudio do bot) pelo Evolution da empresa. */
export async function downloadEvolutionMedia(input: {
  readonly connection: LazyEvolutionConnection
  readonly providerMessageId: string
}): Promise<{ readonly data: string; readonly mimeType: string }> {
  const target = await input.connection()
  return new EvolutionWhatsAppChannel({
    apiKey: target.apiKey,
    baseUrl: target.baseUrl,
    instance: target.instanceName,
    timeoutMs: 30_000,
  }).fetchMediaAsBase64(input.providerMessageId)
}
