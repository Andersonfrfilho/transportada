/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os itens da nota que uma mesma ocorrência aponta — sempre por `companyId`, em cada junção, nunca
 * só na tabela de cima (`test/trip-schema/tenant-safety.contract.ts`).
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { tripDocumentOccurrenceProducts } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type InsertOccurrenceProductsInput = {
  readonly companyId: string
  readonly occurrenceId: string
  readonly productCodes: readonly string[]
}

/**
 * ⚠️ **Nenhuma linha para a ocorrência da nota inteira.** Gravar uma linha vazia faria a leitura
 * confundir "a nota toda" com "um item de código vazio", e o unique do código não teria o que
 * proteger.
 *
 * `position` é a ordem em que o conferente marcou os itens, atribuída aqui de uma vez — o e-mail os
 * cita nessa ordem, e sem ela o texto mudaria de uma leitura para a outra.
 */
export async function insertOccurrenceProductRows(
  queryable: TripQueryable,
  input: InsertOccurrenceProductsInput,
): Promise<void> {
  if (input.productCodes.length === 0) return

  await queryable.insert(tripDocumentOccurrenceProducts).values(
    input.productCodes.map((productCode, index) => ({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
      position: index + 1,
      productCode,
    })),
  )
}

/**
 * Os itens de várias ocorrências numa consulta só — a listagem da nota não pode virar uma consulta
 * por ocorrência. Ocorrência sem linha nenhuma simplesmente não aparece no mapa, e quem lê deriva
 * da coluna antiga (`resolveOccurrenceProductCodes`).
 */
export async function listOccurrenceProductCodes(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly string[]>> {
  const codesByOccurrence = new Map<string, string[]>()
  if (input.occurrenceIds.length === 0) return codesByOccurrence

  const rows = await queryable
    .select({
      occurrenceId: tripDocumentOccurrenceProducts.occurrenceId,
      productCode: tripDocumentOccurrenceProducts.productCode,
    })
    .from(tripDocumentOccurrenceProducts)
    .where(
      and(
        eq(tripDocumentOccurrenceProducts.companyId, input.companyId),
        inArray(tripDocumentOccurrenceProducts.occurrenceId, [...input.occurrenceIds]),
      ),
    )
    .orderBy(
      asc(tripDocumentOccurrenceProducts.occurrenceId),
      asc(tripDocumentOccurrenceProducts.position),
    )

  for (const row of rows) {
    const codes = codesByOccurrence.get(row.occurrenceId)
    if (codes === undefined) codesByOccurrence.set(row.occurrenceId, [row.productCode])
    else codes.push(row.productCode)
  }

  return codesByOccurrence
}
