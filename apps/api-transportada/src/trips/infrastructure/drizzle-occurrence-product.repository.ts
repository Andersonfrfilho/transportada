/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os itens da nota que uma mesma ocorrência aponta — sempre por `companyId`, em cada junção, nunca
 * só na tabela de cima (`test/trip-schema/tenant-safety.contract.ts`).
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { tripDocumentOccurrenceProducts } from '../../database/trip.schema.js'
import type { OccurrenceItemQuantityUnit } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceItemQuantity } from '../domain/occurrence-item-quantity.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type InsertOccurrenceProductsInput = {
  readonly companyId: string
  readonly occurrenceId: string
  /** O item marcado, com a quantidade/unidade já resolvidas pela política (spec 166). */
  readonly items: readonly OccurrenceItemQuantity[]
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
  if (input.items.length === 0) return

  await queryable.insert(tripDocumentOccurrenceProducts).values(
    input.items.map((item, index) => ({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
      position: index + 1,
      productCode: item.code,
      quantity: item.quantity,
      quantityUnit: item.unit,
    })),
  )
}

export type OccurrenceProductRow = {
  readonly code: string
  readonly quantity: null | string
  readonly unit: null | OccurrenceItemQuantityUnit
}

/**
 * Os itens de várias ocorrências numa consulta só — a listagem da nota não pode virar uma consulta
 * por ocorrência. Ocorrência sem linha nenhuma simplesmente não aparece no mapa, e quem lê deriva
 * da coluna antiga (`resolveOccurrenceProductCodes`).
 */
export async function listOccurrenceProducts(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly OccurrenceProductRow[]>> {
  const productsByOccurrence = new Map<string, OccurrenceProductRow[]>()
  if (input.occurrenceIds.length === 0) return productsByOccurrence

  const rows = await queryable
    .select({
      occurrenceId: tripDocumentOccurrenceProducts.occurrenceId,
      productCode: tripDocumentOccurrenceProducts.productCode,
      quantity: tripDocumentOccurrenceProducts.quantity,
      quantityUnit: tripDocumentOccurrenceProducts.quantityUnit,
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
    const item: OccurrenceProductRow = {
      code: row.productCode,
      quantity: row.quantity,
      unit: row.quantityUnit,
    }
    const items = productsByOccurrence.get(row.occurrenceId)
    if (items === undefined) productsByOccurrence.set(row.occurrenceId, [item])
    else items.push(item)
  }

  return productsByOccurrence
}

/** Compatibilidade: só os códigos, para quem ainda não precisa de quantidade/unidade. */
export async function listOccurrenceProductCodes(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceIds: readonly string[] },
): Promise<ReadonlyMap<string, readonly string[]>> {
  const productsByOccurrence = await listOccurrenceProducts(queryable, input)
  const codesByOccurrence = new Map<string, readonly string[]>()
  for (const [occurrenceId, items] of productsByOccurrence) {
    codesByOccurrence.set(
      occurrenceId,
      items.map((item) => item.code),
    )
  }
  return codesByOccurrence
}
