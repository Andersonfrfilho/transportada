/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { invalidAccessKeys } from '../application/nfe-document-access-key-check.error.js'
import { ACCESS_KEY_CHECK_MAX_KEYS } from '../application/nfe-document-access-key-check.constant.js'
import { CHAVE_PATTERN, isChaveDvValid } from '../../shared/tax-id.service.js'

const requestBodySchema = z
  .object({ accessKeys: z.array(z.string()).min(1).max(ACCESS_KEY_CHECK_MAX_KEYS) })
  .strict()

/**
 * Canonicaliza como a busca por chave, confere todas e devolve as distintas na ordem de entrada:
 * a tela bipa a mesma etiqueta duas vezes e quer uma resposta por chave.
 */
export async function parseAccessKeyCheckRequest(
  request: Request,
): Promise<{ readonly accessKeys: readonly string[] }> {
  const body = await parseBody(requestBodySchema, request)
  const canonicalKeys = body.accessKeys.map((accessKey) => accessKey.trim().toUpperCase())
  const invalidKeys = canonicalKeys.flatMap((accessKey, index) =>
    CHAVE_PATTERN.test(accessKey) && isChaveDvValid(accessKey) ? [] : [{ accessKey, index }],
  )
  if (invalidKeys.length > 0) throw invalidAccessKeys(invalidKeys)
  return { accessKeys: [...new Set(canonicalKeys)] }
}
