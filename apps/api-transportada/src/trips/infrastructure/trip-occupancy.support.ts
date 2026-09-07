/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { LoadingAccess } from '../../shared/loading-access.constant.js'
import type { MeasuredCargoItem } from '../../nfe-documents/domain/cargo-volume.policy.js'

import { companyCargoVolumeFactors } from '../../database/company-cargo-volume-factor.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import {
  nfeDocuments,
  nfePackageBoxes,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import { vehicleVolumeReferences } from '../../database/vehicle-volume-reference.schema.js'
import {
  countMeasuredBoxes,
  medianBoxVolumeM3,
  resolveCargoVolume,
  resolveMeasuredCargoVolume,
} from '../../nfe-documents/domain/cargo-volume.policy.js'
import type { CargoPlanBox } from '../domain/cargo-plan.policy.js'
import { resolveVehicleCapacity } from '../../fleet/domain/vehicle-capacity.policy.js'
import type { TripOccupancyView } from '../application/trip.port.js'
import { resolveTripOccupancy } from '../domain/trip-occupancy.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Spec 075: a ocupação do baú, montada em **três consultas** — o veículo, os fatores da empresa e
 * os volumes das notas. Nunca uma consulta por nota: o detalhe da viagem já é a tela mais pesada do
 * módulo, e o N+1 aqui multiplicaria por vinte (`code-standart.md` §15).
 *
 * ⚠️ A capacidade sai do veículo **que carrega**. Hoje a viagem tem um veículo só e ele é o de
 * tração; quando o implemento entrar, a chave da referência passa a ser a dele (D2b), e é
 * `resolveVolumeReferenceKey` que decide — não este arquivo.
 */
export async function loadTripOccupancy(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  },
): Promise<{
  readonly occupancy: TripOccupancyView | null
  /** Spec 076: o volume por nota, para o layout agrupar por parada sem uma consulta nova. */
  readonly volumeByDocument: ReadonlyMap<string, string | null>
  /**
   * Spec 088 G003: as caixas por nota, na mesma viagem da consulta acima. Quem conhece as paradas
   * agrupa por parada — aqui só há `nfeDocumentIds`, e inventar a parada seria um segundo critério
   * de agrupamento ao lado do `buildStopAddressKey` que o vínculo já usa.
   */
  readonly boxesByDocument: ReadonlyMap<string, readonly CargoPlanBox[]>
  readonly capacityM3: string | null
  /** Spec 085: por onde a carga entra — o layout decide com ela se a ordem e obrigacao. */
  readonly loadingAccess: LoadingAccess
}> {
  const [vehicle] = await queryable
    .select({
      bodyType: fleetVehicles.bodyType,
      loadingAccess: fleetVehicles.loadingAccess,
      capacityM3: fleetVehicles.capacityM3,
      cargoHeightM: fleetVehicles.cargoHeightM,
      cargoLengthM: fleetVehicles.cargoLengthM,
      cargoWidthM: fleetVehicles.cargoWidthM,
      vehicleType: fleetVehicles.vehicleType,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)))
    .limit(1)
  if (vehicle === undefined) {
    return {
      boxesByDocument: new Map(),
      capacityM3: null,
      /** Veiculo desconhecido assume o mais restritivo, como a ausencia de acesso declarado. */
      loadingAccess: 'rear',
      occupancy: null,
      volumeByDocument: new Map(),
    }
  }

  const [reference] = await queryable
    .select({
      cargoHeightM: vehicleVolumeReferences.cargoHeightM,
      cargoLengthM: vehicleVolumeReferences.cargoLengthM,
      cargoWidthM: vehicleVolumeReferences.cargoWidthM,
    })
    .from(vehicleVolumeReferences)
    .where(
      and(
        eq(vehicleVolumeReferences.vehicleType, vehicle.vehicleType),
        eq(vehicleVolumeReferences.bodyType, vehicle.bodyType),
      ),
    )
    .limit(1)

  const referenceM3 =
    reference === undefined
      ? null
      : (resolveVehicleCapacity({ ...reference, capacityM3: null, referenceM3: null })
          ?.capacityM3 ?? null)

  const capacity = resolveVehicleCapacity({
    capacityM3: vehicle.capacityM3,
    cargoHeightM: vehicle.cargoHeightM,
    cargoLengthM: vehicle.cargoLengthM,
    cargoWidthM: vehicle.cargoWidthM,
    referenceM3,
  })
  if (capacity === null) {
    return {
      boxesByDocument: new Map(),
      capacityM3: null,
      loadingAccess: vehicle.loadingAccess,
      occupancy: null,
      volumeByDocument: new Map(),
    }
  }

  const factors = await queryable
    .select({
      species: companyCargoVolumeFactors.species,
      volumePerUnitM3: companyCargoVolumeFactors.volumePerUnitM3,
    })
    .from(companyCargoVolumeFactors)
    .where(eq(companyCargoVolumeFactors.companyId, input.companyId))
  const factorBySpecies = new Map(factors.map((row) => [row.species, row.volumePerUnitM3]))
  const defaultFactor = factorBySpecies.get('') ?? null

  const volumes =
    input.nfeDocumentIds.length === 0
      ? []
      : await queryable
          .select({
            documentId: nfeVolumes.documentId,
            quantity: sql<string>`sum(${nfeVolumes.quantity})`,
            species: sql<string>`coalesce(min(nullif(trim(${nfeVolumes.species}), '')), '')`,
          })
          .from(nfeVolumes)
          .where(
            and(
              eq(nfeVolumes.companyId, input.companyId),
              inArray(nfeVolumes.documentId, [...input.nfeDocumentIds]),
            ),
          )
          .groupBy(nfeVolumes.documentId)

  const measured = await loadMeasuredItems(queryable, input)
  const byDocument = new Map(volumes.map((row) => [row.documentId, row]))
  const documents = input.nfeDocumentIds.map((documentId) => {
    /**
     * Spec 085 G006: a caixa medida vence a estimativa por espécie. A estimativa continua sendo a
     * resposta de quem ainda não mediu nada — ela não sai, ela deixa de ser a única.
     */
    const fromBoxes = resolveMeasuredCargoVolume({
      fallbackBoxVolumeM3: measured.medianM3,
      items: measured.itemsByDocument.get(documentId) ?? [],
    })
    if (fromBoxes !== null) return fromBoxes

    const row = byDocument.get(documentId)
    if (row === undefined) return { source: null, volumeM3: null }
    const resolved = resolveCargoVolume({
      volumeFactor: factorBySpecies.get(row.species) ?? defaultFactor,
      volumeQuantity: row.quantity,
    })
    return { source: resolved?.source ?? null, volumeM3: resolved?.volumeM3 ?? null }
  })

  const volumeByDocument = new Map(
    input.nfeDocumentIds.map((documentId, index) => [
      documentId,
      documents[index]?.volumeM3 ?? null,
    ]),
  )

  const occupancy = resolveTripOccupancy({ capacityM3: capacity.capacityM3, documents })
  if (occupancy === null) {
    return {
      boxesByDocument: measured.boxesByDocument,
      capacityM3: capacity.capacityM3,
      loadingAccess: vehicle.loadingAccess,
      occupancy: null,
      volumeByDocument,
    }
  }

  return {
    boxesByDocument: measured.boxesByDocument,
    capacityM3: capacity.capacityM3,
    loadingAccess: vehicle.loadingAccess,
    occupancy: {
      ...occupancy,
      capacityDimensions: resolveDimensions({ reference, vehicle }, capacity.source),
      capacityM3: capacity.capacityM3,
      capacitySource: capacity.source,
    },
    volumeByDocument,
  }
}

type Dimensions = {
  readonly cargoHeightM: string
  readonly cargoLengthM: string
  readonly cargoWidthM: string
}

/**
 * As medidas que produziram o m³ — da ficha quando ele foi medido, da referência quando foi
 * herdado. No degrau `declared` não há medidas: alguém digitou o volume, e inventar dimensões que
 * multiplicassem até ele seria fabricar procedência.
 */
function resolveDimensions(
  input: { readonly reference: Dimensions | undefined; readonly vehicle: Dimensions },
  source: 'measured' | 'declared' | 'reference',
): { readonly heightM: string; readonly lengthM: string; readonly widthM: string } | null {
  const from =
    source === 'measured' ? input.vehicle : source === 'reference' ? input.reference : undefined
  if (from === undefined) return null

  return { heightM: from.cargoHeightM, lengthM: from.cargoLengthM, widthM: from.cargoWidthM }
}

/**
 * As linhas da nota com a caixa que o conferente mediu, mais a mediana da empresa para as que ele
 * ainda não alcançou (spec 085 G006).
 *
 * ⚠️ Duas consultas, nunca uma por nota: o detalhe da viagem já é a tela mais pesada do módulo
 * (`code-standart.md` §15). A mediana é da empresa inteira, não da viagem — a viagem tem poucas
 * caixas medidas e a mediana delas oscilaria de viagem para viagem.
 */
async function loadMeasuredItems(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly nfeDocumentIds: readonly string[] },
): Promise<{
  /** Spec 088 G003: a mesma linha, agora com a caixa que a planta conta em camadas. */
  readonly boxesByDocument: ReadonlyMap<string, readonly CargoPlanBox[]>
  readonly itemsByDocument: ReadonlyMap<string, readonly MeasuredCargoItem[]>
  readonly medianM3: string | null
}> {
  if (input.nfeDocumentIds.length === 0) {
    return { boxesByDocument: new Map(), itemsByDocument: new Map(), medianM3: null }
  }

  const boxVolume = sql<string | null>`
    case
      when ${nfePackageBoxes.lengthMm} is null then null
      else round(
        (${nfePackageBoxes.lengthMm}::numeric * ${nfePackageBoxes.widthMm}::numeric *
          ${nfePackageBoxes.heightMm}::numeric) / 1000000000,
        6
      )
    end
  `

  const [rows, measuredBoxes] = await Promise.all([
    queryable
      .select({
        boxHeightMm: nfePackageBoxes.heightMm,
        boxLengthMm: nfePackageBoxes.lengthMm,
        boxVolumeM3: boxVolume,
        boxWidthMm: nfePackageBoxes.widthMm,
        documentId: nfeProducts.documentId,
        quantity: nfeProducts.quantity,
        unitsPerBox: nfePackageBoxes.unitsPerBox,
      })
      .from(nfeProducts)
      .innerJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.id, nfeProducts.documentId),
          eq(nfeDocuments.companyId, nfeProducts.companyId),
        ),
      )
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.documentId, nfeDocuments.id),
          eq(nfeParticipants.companyId, nfeDocuments.companyId),
          eq(nfeParticipants.role, 'emitter'),
        ),
      )
      .leftJoin(
        nfePackageBoxes,
        and(
          eq(nfePackageBoxes.companyId, nfeProducts.companyId),
          eq(nfePackageBoxes.emitterTaxId, nfeParticipants.taxId),
          eq(nfePackageBoxes.productCode, nfeProducts.code),
          eq(nfePackageBoxes.commercialUnit, nfeProducts.commercialUnit),
        ),
      )
      .where(
        and(
          eq(nfeProducts.companyId, input.companyId),
          inArray(nfeProducts.documentId, [...input.nfeDocumentIds]),
        ),
      ),
    queryable
      .select({ boxVolumeM3: boxVolume })
      .from(nfePackageBoxes)
      .where(
        and(eq(nfePackageBoxes.companyId, input.companyId), isNotNull(nfePackageBoxes.measuredAt)),
      ),
  ])

  const itemsByDocument = new Map<string, MeasuredCargoItem[]>()
  const boxesByDocument = new Map<string, CargoPlanBox[]>()
  for (const row of rows) {
    const item: MeasuredCargoItem = {
      boxVolumeM3: row.boxVolumeM3,
      quantity: row.quantity,
      /** Caixa ainda não medida não tem coluna: a reserva conta a linha como uma caixa por unidade. */
      unitsPerBox: row.unitsPerBox ?? 1,
    }
    itemsByDocument.set(row.documentId, [...(itemsByDocument.get(row.documentId) ?? []), item])
    /**
     * ⚠️ A contagem de caixas é a **mesma** de `resolveMeasuredCargoVolume` — arredondada para
     * cima, porque cinco unidades de um produto que vem de doze ainda viajam dentro de uma caixa.
     * Duas contagens diferentes fariam o m³ da faixa e as camadas dentro dela discordarem.
     */
    boxesByDocument.set(row.documentId, [
      ...(boxesByDocument.get(row.documentId) ?? []),
      {
        count: countMeasuredBoxes(item),
        heightMm: row.boxHeightMm,
        lengthMm: row.boxLengthMm,
        widthMm: row.boxWidthMm,
      },
    ])
  }

  return {
    boxesByDocument,
    itemsByDocument,
    medianM3: medianBoxVolumeM3(
      measuredBoxes.flatMap((row) => (row.boxVolumeM3 === null ? [] : [row.boxVolumeM3])),
    ),
  }
}
