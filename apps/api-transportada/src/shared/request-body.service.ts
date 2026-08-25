/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from './api.constant.js'
import { ApiError } from './api.error.js'

const MAX_REQUEST_BODY_BYTES = 1_048_576

export function assertJsonContentType(value: string | null): void {
  if (value?.toLowerCase().split(';', 1)[0]?.trim() !== 'application/json') {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}

export async function readBoundedRequestBody(request: Request): Promise<string> {
  const reader = request.body?.getReader()
  if (reader === undefined) throw new ApiError(HTTP_ERROR.invalidRequest)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel()
      throw new ApiError(HTTP_ERROR.payloadTooLarge)
    }
    chunks.push(next.value)
  }
  return new TextDecoder().decode(concatenateChunks({ chunks, size }))
}

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}

type ConcatenateChunksParams = {
  readonly chunks: readonly Uint8Array[]
  readonly size: number
}

function concatenateChunks({ chunks, size }: ConcatenateChunksParams): Uint8Array {
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
