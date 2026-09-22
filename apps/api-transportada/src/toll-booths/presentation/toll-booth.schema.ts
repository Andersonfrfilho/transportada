/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `perPage` acima do teto nunca é `400` — vira `100` (spec 154 D2), mesmo teto que
 * `toll-booth-catalog.constant.ts` já aplica no repositório. O Zod aqui só valida a forma (inteiro
 * positivo); quem corta o teto é o use case, no mesmo lugar que já decide os outros padrões.
 */
import { z } from 'zod'

import { invalidRequest } from '../../http/request-parsing.service.js'

const tollBoothCatalogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).optional(),
  search: z.string().trim().min(1).optional(),
})

export type TollBoothCatalogQuery = Readonly<{
  page?: number
  perPage?: number
  search?: string
}>

const ALLOWED_QUERY_KEYS = new Set(['page', 'perPage', 'search'])

export function parseTollBoothCatalogQuery(url: URL): TollBoothCatalogQuery {
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw invalidRequest()
  }

  const result = tollBoothCatalogQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    perPage: url.searchParams.get('perPage') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
  })
  if (!result.success) {
    throw invalidRequest(
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    )
  }

  const { page, perPage, search } = result.data
  return {
    ...(page === undefined ? {} : { page }),
    ...(perPage === undefined ? {} : { perPage }),
    ...(search === undefined ? {} : { search }),
  }
}
