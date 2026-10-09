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
import type { CargoWeightSource } from '../../nfe-documents/domain/cargo-weight.policy.js'
import { resolveDocumentCargoWeight } from '../../nfe-documents/domain/document-cargo-weight.policy.js'
import type { TripCargoWeightView } from '../application/trip.port.js'
import { resolveTripCargoWeight } from '../domain/trip-cargo-weight.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type DocumentCargoWeight = {
  readonly grossWeightKilograms: string | null
  /** A origem do peso (`declared` ou `estimated`); `null` quando a nota não tem peso conhecido. */
  readonly source: CargoWeightSource | null
}

const NO_DOCUMENT_CARGO_WEIGHT: DocumentCargoWeight = { grossWeightKilograms: null, source: null }

/**
 * O peso e a origem de **cada nota** de uma lista, em duas consultas — a soma em SQL é equivalente à
 * soma volume a volume, e é por isso que a linha agregada pode atravessar a política por nota como se
 * fosse um volume só: o ramo declarado soma `pesoB` (e volume sem massa contribui zero de qualquer
 * modo), e o estimado é `qVol total × padrão`. Quem decide a origem continua sendo um lugar só.
 *
 * Spec 259: o mapa cobre toda nota pedida (nota sem volume é `{ null, null }`), e a lista de viagens
 * o lê para a página inteira de uma vez.
 */
export async function loadDocumentCargoWeights(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  },
): Promise<ReadonlyMap<string, DocumentCargoWeight>> {
  if (input.nfeDocumentIds.length === 0) return new Map()

  // Em série: o `queryable` pode ser transação, e consulta concorrente nela pode nunca voltar.
  const volumes = await queryable
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
    .groupBy(nfeVolumes.documentId)
  const [settings] = await queryable
    .select({ defaultVolumeWeight: companyCargoSettings.defaultVolumeWeight })
    .from(companyCargoSettings)
    .where(eq(companyCargoSettings.companyId, input.companyId))
    .limit(1)

  const defaultWeightPerVolume = settings?.defaultVolumeWeight ?? null
  const byDocument = new Map(volumes.map((row) => [row.documentId, row]))

  return new Map(
    input.nfeDocumentIds.map((documentId) => {
      const row = byDocument.get(documentId)
      if (row === undefined) return [documentId, NO_DOCUMENT_CARGO_WEIGHT] as const

      const resolved = resolveDocumentCargoWeight({
        defaultWeightPerVolume,
        volumes: [{ grossWeight: row.grossWeight, quantity: row.quantity }],
      })
      return [
        documentId,
        {
          grossWeightKilograms: resolved?.grossWeight ?? null,
          source: resolved?.source ?? null,
        },
      ] as const
    }),
  )
}

export async function loadTripCargoWeight(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  },
): Promise<{
  readonly view: null | TripCargoWeightView
  /** Spec 085 G006: o peso por nota, para o alerta de concentração somar por parada. */
  readonly weightByDocument: ReadonlyMap<string, string | null>
}> {
  if (input.nfeDocumentIds.length === 0) return { view: null, weightByDocument: new Map() }

  const weights = await loadDocumentCargoWeights(queryable, input)
  const documents = input.nfeDocumentIds.map(
    (documentId) => weights.get(documentId) ?? NO_DOCUMENT_CARGO_WEIGHT,
  )

  return {
    view: resolveTripCargoWeight({ documents }),
    weightByDocument: new Map(
      input.nfeDocumentIds.map((documentId, index) => [
        documentId,
        documents[index]?.grossWeightKilograms ?? null,
      ]),
    ),
  }
}
