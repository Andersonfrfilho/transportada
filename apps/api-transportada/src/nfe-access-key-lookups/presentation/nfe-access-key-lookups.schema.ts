/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { CHAVE_PATTERN, isChaveDvValid } from '../../shared/tax-id.service.js'
import { invalidAccessKey } from '../application/nfe-access-key-lookup.error.js'

const requestBodySchema = z.object({ accessKey: z.string() }).strict()

/**
 * Canonicaliza antes de conferir, como o resto da API: o leitor entrega a caixa que a etiqueta
 * imprimiu. Formato e dígito verificador são recusados aqui, antes de qualquer consulta à SEFAZ.
 */
export async function parseAccessKeyLookupRequest(
  request: Request,
): Promise<{ readonly accessKey: string }> {
  const body = await parseBody(requestBodySchema, request)
  const accessKey = body.accessKey.trim().toUpperCase()
  if (!CHAVE_PATTERN.test(accessKey) || !isChaveDvValid(accessKey)) throw invalidAccessKey()
  return { accessKey }
}
