/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiError } from '../../src/shared/api.error'
import {
  VALID_HTTP_SETTINGS_BODY,
  VALID_IDEMPOTENCY_KEY,
} from './company-settings-http-payload.fixture'

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const COMPANY_SETTINGS_PATH = '/company-settings'

export function getSettingsRequest(
  params: {
    readonly origin?: string
    readonly query?: string
  } = {},
): Request {
  return new Request(`http://localhost${COMPANY_SETTINGS_PATH}${params.query ?? ''}`, {
    headers: {
      authorization: 'Bearer header.payload.signature',
      ...(params.origin ? { origin: params.origin } : {}),
    },
  })
}

export function patchSettingsRequest(
  params: {
    readonly body?: unknown
    readonly contentType?: string
    readonly correlationId?: string
    readonly idempotencyKey?: string
    readonly origin?: string
    readonly query?: string
  } = {},
): Request {
  const body = params.body ?? VALID_HTTP_SETTINGS_BODY
  return new Request(`http://localhost${COMPANY_SETTINGS_PATH}${params.query ?? ''}`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      authorization: 'Bearer header.payload.signature',
      'content-type': params.contentType ?? 'application/json',
      ...(params.correlationId ? { 'x-correlation-id': params.correlationId } : {}),
      ...(params.idempotencyKey === undefined
        ? { 'idempotency-key': VALID_IDEMPOTENCY_KEY }
        : params.idempotencyKey
          ? { 'idempotency-key': params.idempotencyKey }
          : {}),
      ...(params.origin ? { origin: params.origin } : {}),
    },
    method: 'PATCH',
  })
}

export async function responseApiError(response: Response): Promise<ApiErrorShape> {
  return (await response.json()) as ApiErrorShape
}

export function streamingPatchSettingsRequest(byteLength: number): Request {
  const bytes = new Uint8Array(byteLength).fill(0x78)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Request(`http://localhost${COMPANY_SETTINGS_PATH}`, {
    body,
    headers: {
      authorization: 'Bearer header.payload.signature',
      'content-type': 'application/json',
      'idempotency-key': VALID_IDEMPOTENCY_KEY,
    },
    method: 'PATCH',
  })
}

type ApiErrorShape = {
  readonly error: Pick<ApiError, 'code' | 'message'> & { readonly correlationId: string }
}
