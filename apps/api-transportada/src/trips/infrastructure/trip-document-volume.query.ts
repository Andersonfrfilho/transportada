/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 D5/T2.3: quantos volumes cada nota tem, em **uma consulta** para a viagem inteira.
 * `quantity` é o `qVol` de cada `<vol>` da NF-e, então a soma por nota é o número de volumes dela.
 * Nota sem linha de volume, ou com soma que não é inteira, não entra no mapa: o chamador lê
 * "desconhecido", nunca zero.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { nfeVolumes } from '../../database/nfe.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function loadTripDocumentVolumeCounts(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  },
): Promise<ReadonlyMap<string, number>> {
  if (input.nfeDocumentIds.length === 0) return new Map()

  const rows = await queryable
    .select({
      documentId: nfeVolumes.documentId,
      quantity: sql<null | string>`sum(${nfeVolumes.quantity})`,
    })
    .from(nfeVolumes)
    .where(
      and(
        eq(nfeVolumes.companyId, input.companyId),
        inArray(nfeVolumes.documentId, [...input.nfeDocumentIds]),
      ),
    )
    .groupBy(nfeVolumes.documentId)

  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.quantity === null) continue
    const volumeCount = Number(row.quantity)
    // qVol fracionário (granel) não é contagem de volumes: fica desconhecido, nunca arredondado.
    if (Number.isInteger(volumeCount) && volumeCount >= 0) counts.set(row.documentId, volumeCount)
  }
  return counts
}
