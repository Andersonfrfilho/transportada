/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os itens de uma ocorrência de nota (specs 166/172) como quem lê precisa deles: código, descrição
 * na própria nota, quantidade e unidade. Um ponto só para o portal do contratante e o detalhe do
 * escritório (spec 183 T207) — duas cópias desta regra divergiriam na primeira mudança.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { nfeProducts } from '../../database/nfe.schema.js'
import type { OccurrenceItemQuantityUnit } from '../../shared/trip-occurrence.constant.js'
import { resolveOccurrenceProductCodes } from '../domain/occurrence-scope.policy.js'
import { listOccurrenceProducts } from './drizzle-occurrence-product.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type OccurrenceItemView = {
  readonly code: string
  readonly description: string
  /** String decimal (`numeric(12,3)`), nunca `number`. */
  readonly quantity: string | null
  readonly unit: OccurrenceItemQuantityUnit | null
}

/**
 * Junta o código legado (`productCode`) com a tabela nova (spec 166) para chegar à lista de itens, e
 * resolve a descrição de cada um na `nfe_products` da própria nota — uma consulta em lote para todas
 * as ocorrências da página, nunca uma por linha.
 */
export async function resolveOccurrenceItems(
  database: TripQueryable,
  input: {
    readonly companyId: string
    readonly rows: readonly {
      readonly nfeDocumentId: string
      readonly occurrenceId: string
      readonly productCode: string
    }[]
  },
): Promise<ReadonlyMap<string, readonly OccurrenceItemView[]>> {
  const result = new Map<string, readonly OccurrenceItemView[]>()
  if (input.rows.length === 0) return result

  const storedByOccurrence = await listOccurrenceProducts(database, {
    companyId: input.companyId,
    occurrenceIds: input.rows.map((row) => row.occurrenceId),
  })

  const documentIds = [...new Set(input.rows.map((row) => row.nfeDocumentId))]
  const descriptionRows = await database
    .select({
      code: nfeProducts.code,
      description: nfeProducts.description,
      documentId: nfeProducts.documentId,
    })
    .from(nfeProducts)
    .where(
      and(eq(nfeProducts.companyId, input.companyId), inArray(nfeProducts.documentId, documentIds)),
    )

  const descriptionByDocumentAndCode = new Map<string, string>()
  for (const row of descriptionRows) {
    descriptionByDocumentAndCode.set(`${row.documentId}:${row.code}`, row.description)
  }

  for (const row of input.rows) {
    const storedProducts = storedByOccurrence.get(row.occurrenceId) ?? []
    const codes = resolveOccurrenceProductCodes({
      productCode: row.productCode,
      productCodes: storedProducts.map((product) => product.code),
    })

    result.set(
      row.occurrenceId,
      codes.map((code) => {
        const stored = storedProducts.find((product) => product.code === code)
        return {
          code,
          description: descriptionByDocumentAndCode.get(`${row.nfeDocumentId}:${code}`) ?? '',
          quantity: stored?.quantity ?? null,
          unit: stored?.unit ?? null,
        }
      }),
    )
  }

  return result
}
