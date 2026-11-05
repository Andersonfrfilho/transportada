/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8: a foto que o motorista (ou o atendente) manda ao bot sem uma entrega em preparo é lida
 * aqui, porque o OCR e os modelos moram só na imagem do worker (ADR 0113 §5, nada de serviço pago nem
 * externo). A API baixa a foto do provedor e manda os bytes com as notas abertas de quem mandou; a
 * resposta é só o veredito (marcas e notas casadas). Nada é gravado e o texto lido nunca sai da thread.
 *
 * Mesma prova de origem da rota do áudio do bot (`BOT_AUDIO_TRANSCRIPTION_TOKEN`, comparado em tempo
 * constante; sem ele, 404). Uma leitura por vez; fila curta cheia, 503.
 *
 * ⚠️ Nunca loga foto, texto nem número de nota: só tamanho, duração e código de falha.
 */
import { timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import {
  CanhotoOcrError,
  type CanhotoOcrReaderPort,
} from '../canhoto-ocr/application/canhoto-ocr-reader.port.js'
import { CANHOTO_OCR_MAX_IMAGE_BYTES } from '../canhoto-ocr/domain/canhoto-ocr.constant.js'
import { safeLogInfo, safeLogWarn } from '../logging/safe-logger.service.js'
import type { RequestTimeoutPort, WorkerLogger } from '../shared/worker.types.js'

export const BOT_CANHOTO_READ_PATH = '/internal/bot-canhoto-reads'
/** O teto do Bun é 255 s; a leitura tem o próprio prazo (`CANHOTO_OCR_TIMEOUT_MS`). */
const REQUEST_TIMEOUT_SECONDS = 120
const MAX_CANDIDATES = 60

const candidatesSchema = z
  .array(
    z.object({ documentId: z.string().min(1).max(64), number: z.string().regex(/^\d{1,20}$/u) }),
  )
  .max(MAX_CANDIDATES)

export type BotCanhotoReadHandler = (
  request: Request,
  server: RequestTimeoutPort,
) => Promise<Response>

export function createBotCanhotoReadHandler(
  dependencies: Readonly<{ logger: WorkerLogger; reader: CanhotoOcrReaderPort; token: string }>,
): BotCanhotoReadHandler {
  const { logger, reader } = dependencies
  const expected = Buffer.from(`Bearer ${dependencies.token}`)

  function isAuthorized(request: Request): boolean {
    const received = Buffer.from(request.headers.get('authorization') ?? '')
    return received.length === expected.length && timingSafeEqual(received, expected)
  }

  return async (request, server) => {
    if (!isAuthorized(request)) return json({ error: { code: 'NOT_FOUND' } }, 404)
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405)
    const form = await request.formData().catch(() => null)
    const image = form?.get('image')
    if (!(image instanceof Blob)) return json({ error: { code: 'INVALID_REQUEST' } }, 400)
    const candidates = candidatesSchema.safeParse(
      safeJson(typeof form?.get('candidates') === 'string' ? String(form?.get('candidates')) : ''),
    )
    if (!candidates.success) return json({ error: { code: 'INVALID_REQUEST' } }, 400)
    if (image.size === 0) return json({ error: { code: 'EMPTY_IMAGE' } }, 400)
    if (image.size > CANHOTO_OCR_MAX_IMAGE_BYTES) return json({ error: { code: 'TOO_LARGE' } }, 413)

    server.timeout(request, REQUEST_TIMEOUT_SECONDS)
    const startedAt = Date.now()
    try {
      const result = await reader.read({
        bytes: new Uint8Array(await image.arrayBuffer()),
        candidates: candidates.data,
      })
      safeLogInfo({
        logger,
        message: 'bot_canhoto_read.completed',
        metadata: {
          ambiguous: result.ambiguous,
          bytes: image.size,
          durationMs: Date.now() - startedAt,
          markers: result.markers,
          matched: result.candidates.length,
        },
      })
      return json({ data: result }, 200)
    } catch (error) {
      const reason = error instanceof CanhotoOcrError ? error.reason : 'engine_failed'
      safeLogWarn({
        logger,
        message: 'bot_canhoto_read.failed',
        metadata: { bytes: image.size, durationMs: Date.now() - startedAt, reason },
      })
      return reason === 'busy'
        ? json({ error: { code: 'BUSY' } }, 503)
        : json({ error: { code: 'READ_FAILED', reason } }, 502)
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    status,
  })
}
