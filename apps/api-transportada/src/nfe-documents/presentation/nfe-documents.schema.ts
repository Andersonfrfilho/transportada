/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parseCursorPage } from '../../nfe-imports/presentation/nfe-imports.schema.js'
import { CHAVE_PATTERN } from '../../shared/tax-id.service.js'
import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const ACCESS_KEY_QUERY_KEY = 'accessKey'
const CURSOR_SEPARATOR = '::'
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const MILLISECOND_ISO_LENGTH = 23
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseDocumentList(url: URL): {
  readonly accessKey: string | null
  readonly cursor: string | null
  readonly limit: number
} {
  return {
    accessKey: parseAccessKey(url.searchParams.get(ACCESS_KEY_QUERY_KEY)),
    ...parseCursorPage(url, {
      extraKeys: [ACCESS_KEY_QUERY_KEY],
      validateCursor: parseDocumentListCursor,
    }),
  }
}

/**
 * `<atualização>::<emissão>::<id>`, as três chaves da ordem da listagem, com microssegundos — o
 * banco grava `updated_at` nessa precisão. O cursor de antes (`<emissão>::<id>`) cai aqui como `400`:
 * na ordem nova ele não aponta para lugar nenhum, e tratá-lo como primeira página esconderia o erro.
 */
function parseDocumentListCursor(value: string): void {
  const [updatedAt = '', issuedAt = '', id = '', ...rest] = value.split(CURSOR_SEPARATOR)
  if (rest.length > 0 || !isCursorTimestamp(updatedAt) || !isCursorTimestamp(issuedAt)) {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
  if (!UUID_PATTERN.test(id)) throw new ApiError(HTTP_ERROR.invalidRequest)
}

function isCursorTimestamp(value: string): boolean {
  if (!CURSOR_TIMESTAMP_PATTERN.test(value)) return false
  const millisecondIso = `${value.slice(0, MILLISECOND_ISO_LENGTH)}Z`
  const parsed = new Date(millisecondIso)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === millisecondIso
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
