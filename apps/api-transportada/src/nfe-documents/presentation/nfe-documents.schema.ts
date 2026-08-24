/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parseCursorPage } from '../../nfe-imports/presentation/nfe-imports.schema.js'
import { CHAVE_PATTERN } from '../../shared/tax-id.service.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const ACCESS_KEY_QUERY_KEY = 'accessKey'

export function parseDocumentList(url: URL): {
  readonly accessKey: string | null
  readonly cursor: string | null
  readonly limit: number
} {
  return {
    accessKey: parseAccessKey(url.searchParams.get(ACCESS_KEY_QUERY_KEY)),
    ...parseCursorPage(url, { extraKeys: [ACCESS_KEY_QUERY_KEY] }),
  }
}

/**
 * Canonicaliza antes de conferir, como `buildTaxIdSchema` faz com o documento: a leitura da câmera
 * chega na caixa que a etiqueta imprimiu, e recusar a minúscula seria recusá-la antes de ela ter
 * chance de subir a caixa. Depois disso, o que não casa o padrão é `400` — não lista vazia.
 */
function parseAccessKey(value: string | null): string | null {
  if (value === null) return null
  const canonical = value.trim().toUpperCase()
  if (!CHAVE_PATTERN.test(canonical)) throw new ApiError(HTTP_ERROR.invalidRequest)
  return canonical
}
