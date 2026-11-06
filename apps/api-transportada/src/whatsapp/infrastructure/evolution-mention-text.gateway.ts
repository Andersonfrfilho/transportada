/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { EvolutionError } from '@adatechnology/evolution-whatsapp-provider'

const TIMEOUT_MS = 15_000

/**
 * `POST /message/sendText` com `mentioned` (o SDK 0.3.0 só manda `number` e `text`). O Evolution marca o número, mas só o
 * WhatsApp desenha a marca se o texto também trouxer o `@número`: quem chama já o põe no corpo. Erro do provedor sobe como
 * `EvolutionError`, o mesmo do SDK, para o envio classificar igual aos outros.
 */
export async function sendEvolutionTextWithMention(
  target: { readonly apiKey: string; readonly baseUrl: string; readonly instanceName: string },
  message: { readonly body: string; readonly mentionNumber: string; readonly number: string },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ readonly providerMessageId: null | string }> {
  const url = `${target.baseUrl.replace(/\/+$/u, '')}/message/sendText/${encodeURIComponent(target.instanceName)}`
  let response: Response
  try {
    response = await fetchImpl(url, {
      body: JSON.stringify({
        mentioned: [message.mentionNumber],
        number: message.number,
        text: message.body,
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
