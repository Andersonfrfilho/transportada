/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionWhatsAppChannel } from '@adatechnology/evolution-whatsapp-provider'

import type { LazyEvolutionConnection } from '../application/evolution-group-identity.service.js'

/**
 * Pedida só pelo id, a mídia depende de o Evolution ter gravado a mensagem no banco dele. Logo depois
 * do aviso ela pode não estar lá ainda; tenta de novo nestes intervalos antes de desistir.
 */
const RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000]
const TIMEOUT_MS = 30_000

type Media = { readonly data: string; readonly mimeType: string }
type RawMessage = { readonly key: unknown; readonly message: unknown }

/**
 * Spec 292 T9: baixa a mídia de uma mensagem (o áudio do bot) pelo Evolution da empresa.
 *
 * Com a mensagem do webhook (`rawMessage`), manda ela inteira: o Evolution baixa e decifra direto do
 * WhatsApp, sem procurar no banco. É o caminho que funciona com o Evolution que não grava mensagens
 * (o de staging, medido em 04/11/2026: "Message not found" em todas as tentativas por id). Só se
 * esse pedido falhar cai no pedido por id, com as novas tentativas.
 */
export async function downloadEvolutionMedia(input: {
  readonly connection: LazyEvolutionConnection
  readonly providerMessageId: string
  readonly rawMessage?: RawMessage
  /** Para testes. */
  readonly sleep?: (ms: number) => Promise<void>
  readonly fetchMedia?: (providerMessageId: string) => Promise<Media>
  readonly fetchRawMedia?: (message: RawMessage) => Promise<Media>
}): Promise<Media> {
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  if (input.rawMessage !== undefined) {
    const fetchRawMedia =
      input.fetchRawMedia ??
      (async (message: RawMessage) => fetchMediaFromMessage(await input.connection(), message))
    try {
      return await fetchRawMedia(input.rawMessage)
    } catch {
      // segue para o pedido por id
    }
  }
  const fetchMedia =
    input.fetchMedia ??
    (async (id: string) => {
      const target = await input.connection()
      return new EvolutionWhatsAppChannel({
        apiKey: target.apiKey,
        baseUrl: target.baseUrl,
        instance: target.instanceName,
        timeoutMs: TIMEOUT_MS,
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

/** `POST /chat/getBase64FromMediaMessage` com a mensagem inteira (o SDK 0.3.0 só manda o id). */
export async function fetchMediaFromMessage(
  target: { readonly apiKey: string; readonly baseUrl: string; readonly instanceName: string },
  message: RawMessage,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Media> {
  const url = `${target.baseUrl.replace(/\/+$/u, '')}/chat/getBase64FromMediaMessage/${encodeURIComponent(target.instanceName)}`
  const response = await fetchImpl(url, {
    body: JSON.stringify({ message }),
    headers: { apikey: target.apiKey, 'content-type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`evolution responded ${response.status}`)
  const body = (await response.json().catch(() => null)) as {
    readonly base64?: unknown
    readonly mimetype?: unknown
  } | null
  if (typeof body?.base64 !== 'string' || body.base64 === '') {
    throw new Error('unexpected media response')
  }
  return {
    data: body.base64,
    mimeType: typeof body.mimetype === 'string' ? body.mimetype : 'application/octet-stream',
  }
}
