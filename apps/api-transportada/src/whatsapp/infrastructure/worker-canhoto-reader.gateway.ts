/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8: a foto do canhoto vai ao worker, dono do OCR local e dos modelos (ADR 0113 §5), pela rota interna
 * `POST /internal/bot-canhoto-reads`, com as notas abertas de quem mandou. Só o veredito volta (marcas e notas
 * casadas); nada é gravado. Mesma prova de origem da rota do áudio do bot (`BOT_AUDIO_TRANSCRIPTION_TOKEN`).
 *
 * ⚠️ Nada de foto, número de nota, token ou URL em log ou em mensagem de erro.
 */
import { z } from 'zod'

import type { WhatsAppCanhotoReaderPort } from '../../whatsapp-commands/application/whatsapp-canhoto-recognition.service.js'
import type { WorkerBotAudioTranscriberConfig } from './worker-bot-audio-transcriber.gateway.js'

const READ_PATH = '/internal/bot-canhoto-reads'
/** O prazo do worker (30 s com a carga dos modelos) mais a fila curta de uma leitura por vez. */
const DEFAULT_TIMEOUT_MS = 60_000

export class BotCanhotoReadError extends Error {
  override readonly name = 'BotCanhotoReadError'
  constructor(readonly reason: 'busy' | 'failed' | 'unreachable') {
    super(reason)
  }
}

const verdictSchema = z.object({
  data: z.object({
    ambiguous: z.boolean(),
    candidates: z.array(z.object({ documentId: z.string(), match: z.enum(['exact', 'near']) })),
    markers: z.number().int().min(0),
  }),
})

export function createWorkerCanhotoReader(
  config: WorkerBotAudioTranscriberConfig,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): WhatsAppCanhotoReaderPort {
  const url = `${config.baseUrl.replace(/\/+$/u, '')}${READ_PATH}`
  return {
    async read({ bytes, candidates }) {
      const form = new FormData()
      form.set('image', new Blob([new Uint8Array(bytes)]))
      form.set('candidates', JSON.stringify(candidates))
      let response: Response
      try {
        response = await fetchImpl(url, {
          body: form,
          headers: { authorization: `Bearer ${config.token}` },
          method: 'POST',
          signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        })
      } catch {
        throw new BotCanhotoReadError('unreachable')
      }
      if (response.status === 503) throw new BotCanhotoReadError('busy')
      if (!response.ok) {
        throw new BotCanhotoReadError(response.status === 404 ? 'unreachable' : 'failed')
      }
      const parsed = verdictSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) throw new BotCanhotoReadError('failed')
      return parsed.data.data
    },
  }
}
