/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionWhatsAppChannel } from '@adatechnology/evolution-whatsapp-provider'

import type { LazyEvolutionConnection } from '../application/evolution-group-identity.service.js'

/**
 * O Evolution avisa o webhook antes de gravar a mensagem: pedida na hora, a mídia volta "Message not
 * found" (medido em staging, 04/11/2026, áudio pedido 40 ms depois do aviso). Tenta de novo nestes
 * intervalos antes de desistir.
 */
const RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000]

/** Spec 292 T9: baixa a mídia de uma mensagem (o áudio do bot) pelo Evolution da empresa. */
export async function downloadEvolutionMedia(input: {
  readonly connection: LazyEvolutionConnection
  readonly providerMessageId: string
  /** Para testes. */
  readonly sleep?: (ms: number) => Promise<void>
  readonly fetchMedia?: (providerMessageId: string) => Promise<{
    readonly data: string
    readonly mimeType: string
  }>
}): Promise<{ readonly data: string; readonly mimeType: string }> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const fetchMedia =
    input.fetchMedia ??
    (async (id: string) => {
      const target = await input.connection()
      return new EvolutionWhatsAppChannel({
        apiKey: target.apiKey,
        baseUrl: target.baseUrl,
        instance: target.instanceName,
        timeoutMs: 30_000,
      }).fetchMediaAsBase64(id)
    })
  for (const delay of RETRY_DELAYS_MS) {
    try {
      return await fetchMedia(input.providerMessageId)
    } catch {
      await sleep(delay)
    }
  }
  return fetchMedia(input.providerMessageId)
}
