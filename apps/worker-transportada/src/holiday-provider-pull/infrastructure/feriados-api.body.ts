/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura defensiva da resposta da FeriadosAPI: o corpo tem teto (declarado e lido por stream, nunca
 * `response.json()` cru) e o `Retry-After` do fornecedor é domado — número enorme, negativo ou data no
 * passado não podem virar espera de uma eternidade, nem `RangeError` na hora de somar a data.
 */
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  HolidayProviderError,
} from '../domain/holiday-provider.error.js'
import {
  FERIADOS_API_MAX_BODY_BYTES,
  FERIADOS_API_MAX_RETRY_AFTER_SECONDS,
  FERIADOS_API_MIN_RETRY_AFTER_SECONDS,
} from '../domain/holiday-provider-pull.constant.js'

const MILLISECONDS_PER_SECOND = 1000

function malformedResponse(): HolidayProviderError {
  return new HolidayProviderError({ code: HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE })
}

function clampRetryAfter(seconds: number): number {
  if (!Number.isFinite(seconds)) return FERIADOS_API_MAX_RETRY_AFTER_SECONDS
  return Math.min(
    FERIADOS_API_MAX_RETRY_AFTER_SECONDS,
    Math.max(FERIADOS_API_MIN_RETRY_AFTER_SECONDS, seconds),
  )
}

/** `Retry-After` em segundos ou data HTTP, sempre entre 60 s e 24 h; ausente ou ilegível fica sem valor. */
export function readRetryAfterSeconds(input: {
  readonly header: string | null
  readonly now: Date
}): number | undefined {
  const header = input.header?.trim()
  if (header === undefined || header.length === 0) return undefined
  if (/^-?\d+$/u.test(header)) return clampRetryAfter(Number(header))

  const retryAt = Date.parse(header)
  if (Number.isNaN(retryAt)) return undefined
  return clampRetryAfter(Math.ceil((retryAt - input.now.getTime()) / MILLISECONDS_PER_SECOND))
}

async function readBoundedBytes(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (reader === undefined) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    total += value.byteLength
    if (total > FERIADOS_API_MAX_BODY_BYTES) {
      await reader.cancel()
      throw malformedResponse()
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Recusa o corpo declarado ou lido acima de 512 KB; JSON torto também é `malformed_response`. */
export async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > FERIADOS_API_MAX_BODY_BYTES) throw malformedResponse()

  try {
    const bytes = await readBoundedBytes(response)
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch (error: unknown) {
    if (error instanceof HolidayProviderError) throw error
    throw malformedResponse()
  }
}
