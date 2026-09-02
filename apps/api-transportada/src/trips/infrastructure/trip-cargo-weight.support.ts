/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O peso da carga da viagem, em **duas consultas** — os volumes das notas e o padrão da empresa.
 * Nunca uma por nota: o detalhe da viagem já é a tela mais pesada do módulo (`code-standart.md` §15).
 *
 * ⚠️ Vive fora de `trip-occupancy.support.ts` de propósito. Lá o caminho sai cedo quando a
 * capacidade do veículo é desconhecida, e o peso **não depende de capacidade** — veículo sem
 * cubagem cadastrada é o caso comum, e o peso da carga continua sendo o que se quer ler.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { companyCargoSettings } from '../../database/company-cargo-settings.schema.js'
import { nfeVolumes } from '../../database/nfe.schema.js'
import { resolveDocumentCargoWeight } from '../../nfe-documents/domain/document-cargo-weight.policy.js'
import type { TripCargoWeightView } from '../application/trip.port.js'
import { resolveTripCargoWeight } from '../domain/trip-cargo-weight.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * A soma em SQL é equivalente à soma volume a volume, e é por isso que a linha agregada pode
 * atravessar a política por nota como se fosse um volume só: o ramo declarado soma `pesoB` (e
 * volume sem massa contribui zero de qualquer modo), e o estimado é `qVol total × padrão`. Quem
 * decide a origem continua sendo um lugar só.
 */
export async function loadTripCargoWeight(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  },
): Promise<null | TripCargoWeightView> {
  if (input.nfeDocumentIds.length === 0) return null

  const [volumes, [settings]] = await Promise.all([
    queryable
      .select({
        documentId: nfeVolumes.documentId,
        grossWeight: sql<string>`sum(${nfeVolumes.grossWeight})`,
        quantity: sql<string>`sum(${nfeVolumes.quantity})`,
      })
      .from(nfeVolumes)
      .where(
        and(
          eq(nfeVolumes.companyId, input.companyId),
          inArray(nfeVolumes.documentId, [...input.nfeDocumentIds]),
        ),
      )
      .groupBy(nfeVolumes.documentId),
    queryable
      .select({ defaultVolumeWeight: companyCargoSettings.defaultVolumeWeight })
      .from(companyCargoSettings)
      .where(eq(companyCargoSettings.companyId, input.companyId))
      .limit(1),
  ])

  const defaultWeightPerVolume = settings?.defaultVolumeWeight ?? null
  const byDocument = new Map(volumes.map((row) => [row.documentId, row]))

  const documents = input.nfeDocumentIds.map((documentId) => {
    const row = byDocument.get(documentId)
    if (row === undefined) return { grossWeightKilograms: null, source: null }

    const resolved = resolveDocumentCargoWeight({
      defaultWeightPerVolume,
      volumes: [{ grossWeight: row.grossWeight, quantity: row.quantity }],
    })
    return {
      grossWeightKilograms: resolved?.grossWeight ?? null,
      source: resolved?.source ?? null,
    }
  })

  return resolveTripCargoWeight({ documents })
}
