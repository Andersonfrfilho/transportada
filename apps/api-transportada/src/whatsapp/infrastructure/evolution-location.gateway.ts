/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionError } from '@adatechnology/evolution-whatsapp-provider'

const TIMEOUT_MS = 15_000

/**
 * `POST /message/sendLocation` (Evolution 2.x): o pino de localização do WhatsApp, que abre no mapa do aparelho
 * (Google Maps no Android). O SDK 0.3.0 não tem o método, então a chamada é direta, como a marca em
 * `evolution-mention-text.gateway.ts`; erro do provedor sobe como `EvolutionError`, para o envio classificar igual aos outros.
 */
export async function sendEvolutionLocation(
  target: { readonly apiKey: string; readonly baseUrl: string; readonly instanceName: string },
  message: {
    readonly address: string
    readonly latitude: number
    readonly longitude: number
    readonly name: string
    readonly number: string
  },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ readonly providerMessageId: null | string }> {
  const url = `${target.baseUrl.replace(/\/+$/u, '')}/message/sendLocation/${encodeURIComponent(target.instanceName)}`
  let response: Response
  try {
    response = await fetchImpl(url, {
      body: JSON.stringify({
        address: message.address,
        latitude: message.latitude,
        longitude: message.longitude,
        name: message.name,
        number: message.number,
      }),
      headers: { apikey: target.apiKey, 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    throw new EvolutionError('evolution request failed', undefined, { cause })
  }
  if (!response.ok)
    throw new EvolutionError(`evolution responded ${response.status}`, response.status)
  const answer = (await response.json().catch(() => null)) as {
    readonly key?: { readonly id?: unknown }
  } | null
  const id = answer?.key?.id
  return { providerMessageId: typeof id === 'string' ? id : null }
}
