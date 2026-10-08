/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'

const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

/** Configuração da empresa nunca fica em cache compartilhado. */
export function jsonData(input: { readonly data: unknown; readonly status?: number }): Response {
  return new Response(JSON.stringify({ data: input.data }), {
    headers: NO_STORE_HEADERS,
    status: input.status ?? 200,
  })
}

export function noContent(): Response {
  return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
}
