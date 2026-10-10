/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type {
  CargoBedDimensions,
  CargoPlanBox,
  MeasuredBoxShape,
} from '@adatechnology/cargo-placement'
import type { LoadingAccess } from '../../shared/loading-access.constant.js'
import type {
  MeasuredCargoItem,
  ResolvedDocumentCargoEstimate,
} from '../../nfe-documents/domain/cargo-volume.policy.js'

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
  resolveDocumentCargoEstimate,
} from '../../nfe-documents/domain/cargo-volume.policy.js'
import {
  resolveVehicleCapacity,
  resolveVolumeReferenceKey,
} from '../../fleet/domain/vehicle-capacity.policy.js'
import {
  resolveBoxDimensionsForCubage,
  type PackageBoxDimensionsSource,
} from '../../nfe-documents/domain/package-box-cubage-dimensions.policy.js'
import type { TripOccupancyView } from '../application/trip.port.js'
import type { CapacityUnknownReason } from '../domain/capacity-unknown-reason.policy.js'
import { resolveCapacityUnknownReason } from '../domain/capacity-unknown-reason.policy.js'
import { resolveTripOccupancy } from '../domain/trip-occupancy.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

type FleetVehicleRow = typeof fleetVehicles.$inferSelect

/** A ficha de quem tem relação com a capacidade: a mesma seleção para o veículo, a carreta e o lote. */
export type OccupancyVehicleFacts = Pick<
  FleetVehicleRow,
  | 'bodyType'
  | 'capacityKg'
  | 'capacityM3'
  | 'cargoHeightM'
  | 'cargoLengthM'
  | 'cargoWidthM'
  | 'id'
  | 'loadingAccess'
  | 'vehicleType'
>

export const OCCUPANCY_VEHICLE_COLUMNS = {
  bodyType: fleetVehicles.bodyType,
  /** Spec 093: o `capKG` do MDF-e, que aqui vira o teto de peso da montagem. */
  capacityKg: fleetVehicles.capacityKg,
  capacityM3: fleetVehicles.capacityM3,
  cargoHeightM: fleetVehicles.cargoHeightM,
  cargoLengthM: fleetVehicles.cargoLengthM,
  cargoWidthM: fleetVehicles.cargoWidthM,
  id: fleetVehicles.id,
  loadingAccess: fleetVehicles.loadingAccess,
  vehicleType: fleetVehicles.vehicleType,
} as const

export type OccupancyCargoFacts = {
  /** Spec 075: o fator de volume por espécie da empresa (`''` é o padrão). */
  readonly factorBySpecies: ReadonlyMap<string, string>
  readonly measured: MeasuredItems
  /** A soma de volumes e a espécie de cada nota — só as notas com `nfe_volumes`. */
  readonly volumeByDocument: ReadonlyMap<
    string,
    { readonly quantity: string; readonly species: string }
  >
}

/**
 * Tudo que a conta da ocupação lê do banco, já lido. `reference` é a medida do catálogo para o tipo do
 * veículo; `cargo` só é necessário quando a capacidade é conhecida (`hasKnownTripCapacity`).
 */
export type TripOccupancyFacts = {
  readonly cargo: OccupancyCargoFacts
  readonly reference: Dimensions | undefined
  readonly trailer: OccupancyVehicleFacts | undefined
  readonly vehicle: OccupancyVehicleFacts | undefined
}

export const EMPTY_OCCUPANCY_CARGO_FACTS: OccupancyCargoFacts = {
  factorBySpecies: new Map(),
  measured: {
    boxesByDocument: new Map(),
    documentsWithEstimatedBoxes: new Set(),
    itemsByDocument: new Map(),
    measuredShapes: [],
    medianM3: null,
  },
  volumeByDocument: new Map(),
}

export type TripOccupancyResult = {
  readonly occupancy: TripOccupancyView | null
  /**
   * Spec 147 D2/RF4: o motivo de `capacityM3`/`occupancy` estarem nulos, para o painel nomear o
   * que falta em vez de dizer só "capacidade desconhecida". `null` quando a capacidade é conhecida.
   */
  readonly capacityUnknownReason: CapacityUnknownReason | null
  /**
   * T18 (revisão, item 10): o veículo cuja ficha resolve `capacityUnknownReason` — a carreta em
   * `bodyTypeMissing` (é a ficha dela que falta), o próprio veículo da viagem nos outros motivos
   * (`trailerMissing`, `referenceMissing`, sem veículo a apontar). `null` só quando o motivo também é.
   */
  readonly capacityUnknownVehicleId: string | null
  /** Spec 076: o volume por nota, para o layout agrupar por parada sem uma consulta nova. */
  readonly volumeByDocument: ReadonlyMap<string, string | null>
  /**
   * Spec 088 G003: as caixas por nota, na mesma viagem da consulta acima. Quem conhece as paradas
   * agrupa por parada — aqui só há `nfeDocumentIds`, e inventar a parada seria um segundo critério
   * de agrupamento ao lado do `buildStopAddressKey` que o vínculo já usa.
   */
  readonly boxesByDocument: ReadonlyMap<string, readonly CargoPlanBox[]>
  /**
   * Spec 088 D2: a medida do baú vem da **ficha do veículo** quando preenchida. Sem ficha, usa a
   * referência do catálogo com origem marcada (`bedSource: 'reference'` — commit `c02325b6`). Viaja
   * fora de `occupancy` porque a origem importa (ficha vs. referência), e devolvê-la do campo de
   * ocupação jogava a medida fora quando **nenhuma nota tinha cubagem** — a planta sumia por falta
   * de um dado que não é dela, e o aviso mandava preencher um campo que já estava preenchido.
   */
  readonly bedDimensions: CargoBedDimensions | null
  readonly capacityM3: string | null
  /**
   * Spec 094: o volume típico de uma caixa da empresa e as formas medidas — é deles que a caixa
   * presumida tira tamanho e proporção. Sem eles ela não é desenhada, e sim nomeada.
   */
  readonly fallbackBoxVolumeM3: number | null
  readonly measuredShapes: readonly MeasuredBoxShape[]
  /**
   * Spec 093: o teto de peso da ficha (`capacity_kg`, o `capKG` do MDF-e). Viaja daqui porque o
   * veículo já foi lido: pedi-lo de novo no suporte de peso serializaria duas consultas paralelas.
   * `null` quando o veículo não existe — zero, que é ausência, quem trata é a política.
   */
  readonly maxPayloadKg: string | null
  /** Spec 085: por onde a carga entra — o layout decide com ela se a ordem e obrigacao. */
  readonly loadingAccess: LoadingAccess
  /** Spec 145 D21: a carroceria do mesmo veículo — baú fechado segura a carga sem cinta. */
  readonly bodyType: string | null
}

/**
 * Spec 075: a ocupação do baú, montada em **três consultas** — o veículo, os fatores da empresa e
 * os volumes das notas — mais uma quarta, condicional, só quando a viagem tem carreta. Nunca uma
 * consulta por nota: o detalhe da viagem já é a tela mais pesada do módulo, e o N+1 aqui
 * multiplicaria por vinte (`code-standart.md` §15).
 *
 * ⚠️ **A capacidade sai do veículo que carrega, e é `resolveVolumeReferenceKey` quem decide qual é
 * (spec 075 D2b).** Com carreta atrelada, a ficha dela (medidas → `capacity_m3`) vence a referência
 * de catálogo — a ficha do cavalo nunca entra na conta de volume, porque quem carrega é o
 * implemento.
 *
 * Spec 259: a leitura é esta; a **conta** é `resolveTripOccupancyFromFacts`, a mesma que o lote da
 * listagem (`loadTripOccupancies`) chama. As leituras de carga só acontecem quando a capacidade é
 * conhecida — o mesmo corte de antes.
 */
export async function loadTripOccupancy(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    /** Spec 216: `null` é viagem `awaiting_crew` — mesma lacuna que veículo não encontrado. */
    readonly vehicleId: string | null
    /** Feature 147 D3/T12: `null` quando o cavalo (ou qualquer outro veículo) não tem carreta. */
    readonly trailerVehicleId: string | null
  },
): Promise<TripOccupancyResult> {
  const vehicleId = input.vehicleId
  const [vehicle] =
    vehicleId === null
      ? []
      : await queryable
          .select(OCCUPANCY_VEHICLE_COLUMNS)
          .from(fleetVehicles)
          .where(and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, vehicleId)))
          .limit(1)
  if (vehicle === undefined) {
    return resolveTripOccupancyFromFacts({
      facts: {
        cargo: EMPTY_OCCUPANCY_CARGO_FACTS,
        reference: undefined,
        trailer: undefined,
        vehicle: undefined,
      },
      nfeDocumentIds: input.nfeDocumentIds,
      vehicleId: input.vehicleId,
    })
  }

  /**
   * Spec 147 D3/T12: só uma consulta a mais, e só quando a viagem tem carreta — a maioria não tem
   * (T0). `trailer` aqui é quem carrega de verdade; a ficha do cavalo nunca entra na conta.
   */
  const trailer =
    input.trailerVehicleId === null
      ? undefined
      : await queryable
          .select(OCCUPANCY_VEHICLE_COLUMNS)
          .from(fleetVehicles)
          .where(
            and(
              eq(fleetVehicles.companyId, input.companyId),
              eq(fleetVehicles.id, input.trailerVehicleId),
            ),
          )
          .limit(1)
          .then((rows) => rows[0])
  const referenceKey = resolveOccupancyReferenceKey({ trailer, vehicle })
  const [reference] = await queryable
    .select({
      cargoHeightM: vehicleVolumeReferences.cargoHeightM,
      cargoLengthM: vehicleVolumeReferences.cargoLengthM,
      cargoWidthM: vehicleVolumeReferences.cargoWidthM,
    })
    .from(vehicleVolumeReferences)
    .where(
      and(
        eq(vehicleVolumeReferences.vehicleType, referenceKey.vehicleType),
        eq(vehicleVolumeReferences.bodyType, referenceKey.bodyType),
      ),
    )
    .limit(1)

  const capacityFacts = { reference, trailer, vehicle }
  const cargo = hasKnownTripCapacity(capacityFacts)
    ? await loadOccupancyCargoFacts(queryable, input)
    : EMPTY_OCCUPANCY_CARGO_FACTS

  return resolveTripOccupancyFromFacts({
    facts: { ...capacityFacts, cargo },
    nfeDocumentIds: input.nfeDocumentIds,
    vehicleId: input.vehicleId,
  })
}

/** Os fatores da empresa, os volumes das notas e as caixas medidas — as três leituras de carga. */
export async function loadOccupancyCargoFacts(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly nfeDocumentIds: readonly string[] },
): Promise<OccupancyCargoFacts> {
  const factors = await queryable
    .select({
      species: companyCargoVolumeFactors.species,
      volumePerUnitM3: companyCargoVolumeFactors.volumePerUnitM3,
    })
    .from(companyCargoVolumeFactors)
    .where(eq(companyCargoVolumeFactors.companyId, input.companyId))

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

  return {
    factorBySpecies: new Map(factors.map((row) => [row.species, row.volumePerUnitM3])),
    measured: await loadMeasuredItems(queryable, input),
    volumeByDocument: new Map(
      volumes.map((row) => [row.documentId, { quantity: row.quantity, species: row.species }]),
    ),
  }
}

/**
 * Spec 259: o catálogo de referência do veículo — a chave que decide **qual** medida de catálogo vale
 * para o par tração + carreta. Exportada porque o lote lê a referência de muitas viagens por ela.
 */
export function resolveOccupancyReferenceKey(input: {
  readonly trailer: OccupancyVehicleFacts | undefined
  readonly vehicle: OccupancyVehicleFacts
}): ReturnType<typeof resolveVolumeReferenceKey> {
  return resolveVolumeReferenceKey({
    traction: {
      bodyType: input.vehicle.bodyType,
      role: 'traction',
      vehicleType: input.vehicle.vehicleType,
    },
    trailer:
      input.trailer === undefined
        ? null
        : {
            bodyType: input.trailer.bodyType,
            role: 'trailer',
            vehicleType: input.trailer.vehicleType,
          },
  })
}

/** A capacidade de quem carrega: a carreta quando existe, senão o veículo — referência só como último degrau. */
function resolveCarrierCapacity(
  facts: Pick<TripOccupancyFacts, 'reference' | 'trailer'> & {
    readonly vehicle: OccupancyVehicleFacts
  },
) {
  const carrier = facts.trailer ?? facts.vehicle
  const referenceM3 =
    facts.reference === undefined
      ? null
      : (resolveVehicleCapacity({ ...facts.reference, capacityM3: null, referenceM3: null })
          ?.capacityM3 ?? null)
  const capacity = resolveVehicleCapacity({
    capacityM3: carrier.capacityM3,
    cargoHeightM: carrier.cargoHeightM,
    cargoLengthM: carrier.cargoLengthM,
    cargoWidthM: carrier.cargoWidthM,
    referenceM3,
  })

  return { capacity, carrier }
}

/** Sem veículo ou sem capacidade a conta de volume nem começa: quem lê o banco pode poupar as leituras de carga. */
export function hasKnownTripCapacity(
  facts: Pick<TripOccupancyFacts, 'reference' | 'trailer' | 'vehicle'>,
): boolean {
  if (facts.vehicle === undefined) return false

  return resolveCarrierCapacity({ ...facts, vehicle: facts.vehicle }).capacity !== null
}

/**
 * Spec 259: a conta da ocupação, **pura**, sobre fatos já lidos — o detalhe (`loadTripOccupancy`) e o
 * lote da listagem (`loadTripOccupancies`) chamam esta mesma função, e é isso que impede a lista de
 * dizer um número e o detalhe outro. `facts.cargo` pode cobrir mais notas que `nfeDocumentIds` (o lote
 * lê a página inteira): a conta lê sempre por id de nota.
 */
export function resolveTripOccupancyFromFacts(input: {
  readonly facts: TripOccupancyFacts
  readonly nfeDocumentIds: readonly string[]
  readonly vehicleId: string | null
}): TripOccupancyResult {
  const { facts, nfeDocumentIds } = input
  const { reference, trailer, vehicle } = facts
  if (vehicle === undefined) {
    return {
      bedDimensions: null,
      boxesByDocument: new Map(),
      /** Sem veículo não há candidato de tração para nomear o motivo — a viagem está órfã. */
      capacityUnknownReason: null,
      capacityUnknownVehicleId: null,
      capacityM3: null,
      fallbackBoxVolumeM3: null,
      measuredShapes: [],
      bodyType: null,
      /** Veiculo desconhecido assume o mais restritivo, como a ausencia de acesso declarado. */
      loadingAccess: 'rear',
      maxPayloadKg: null,
      occupancy: null,
      volumeByDocument: new Map(),
    }
  }

  /** A ficha de quem carrega: a carreta quando existe, senão o próprio veículo de tração. */
  const { capacity, carrier } = resolveCarrierCapacity({ reference, trailer, vehicle })
  /**
   * Spec 147 D2/D3/RF4: recalculado a cada retorno porque `capacityM3` é o mesmo que decide se há
   * ocupação. Cavalo (`tractor_unit`) sem carreta cai em `trailerMissing`, nunca em
   * `bodyTypeMissing` — `resolveCapacityUnknownReason` já resolve essa precedência.
   */
  const capacityUnknownReason = resolveCapacityUnknownReason({
    capacityM3: capacity === null ? null : capacity.capacityM3,
    traction: { bodyType: vehicle.bodyType, vehicleType: vehicle.vehicleType },
    trailer:
      trailer === undefined
        ? null
        : { bodyType: trailer.bodyType, vehicleType: trailer.vehicleType },
  })
  /**
   * T18 (revisão, item 10): a ficha que falta é a de quem carrega em `bodyTypeMissing` — a carreta
   * quando existe, senão o cavalo, o mesmo `carrier` que resolveu a capacidade. Nos outros motivos
   * (`trailerMissing`, `referenceMissing`) não há ficha de carroceria para editar; o link volta para
   * o veículo da viagem, como sempre foi.
   */
  const capacityUnknownVehicleId =
    capacityUnknownReason === null
      ? null
      : capacityUnknownReason === 'bodyTypeMissing'
        ? carrier.id
        : input.vehicleId
  if (capacity === null) {
    return {
      bedDimensions: toBedDimensions(carrier, reference),
      boxesByDocument: new Map(),
      capacityUnknownReason,
      capacityUnknownVehicleId,
      capacityM3: null,
      fallbackBoxVolumeM3: null,
      measuredShapes: [],
      bodyType: vehicle.bodyType,
      loadingAccess: carrier.loadingAccess,
      maxPayloadKg: carrier.capacityKg,
      occupancy: null,
      volumeByDocument: new Map(),
    }
  }

  const { factorBySpecies } = facts.cargo
  const defaultFactor = factorBySpecies.get('') ?? null
  /** Sem nota a medida não é lida: o conjunto vazio é o que o detalhe sempre viu nesse caso. */
  const measured =
    nfeDocumentIds.length === 0 ? EMPTY_OCCUPANCY_CARGO_FACTS.measured : facts.cargo.measured
  const byDocument = nfeDocumentIds.length === 0 ? new Map() : facts.cargo.volumeByDocument
  /**
   * Spec 144 (D1/D2): uma estimativa por nota, na precedência ficha → resíduo → mediana → ausência.
   * `resolveDocumentCargoEstimate` já decide tudo isso — o par `resolveMeasuredCargoVolume` +
   * `resolveCargoVolume` que vivia aqui só cobria ficha e espécie, sem o resíduo no meio.
   * Spec 163 (P3): nota que somou caixa estimada pela unidade nunca sai como `measured`.
   */
  const estimates = markDocumentsWithEstimatedBoxes(
    new Map(
      nfeDocumentIds.map((documentId) => {
        const row = byDocument.get(documentId)

        return [
          documentId,
          resolveDocumentCargoEstimate({
            items: measured.itemsByDocument.get(documentId) ?? [],
            medianBoxVolumeM3: measured.medianM3,
            volumeFactor:
              row === undefined ? null : (factorBySpecies.get(row.species) ?? defaultFactor),
            volumeQuantity: row?.quantity ?? null,
          }),
        ] as const
      }),
    ),
    measured.documentsWithEstimatedBoxes,
  )
  const documents = nfeDocumentIds.map((documentId) => {
    const estimate = estimates.get(documentId)

    return { source: estimate?.source ?? null, volumeM3: estimate?.volumeM3 ?? null }
  })

  const volumeByDocument = new Map(
    nfeDocumentIds.map((documentId) => [documentId, estimates.get(documentId)?.volumeM3 ?? null]),
  )
  const boxesByDocument = stampEstimatedVolume(measured.boxesByDocument, estimates)

  const occupancy = resolveTripOccupancy({ capacityM3: capacity.capacityM3, documents })
  if (occupancy === null) {
    return {
      bedDimensions: toBedDimensions(carrier, reference),
      boxesByDocument,
      capacityUnknownReason,
      capacityUnknownVehicleId,
      capacityM3: capacity.capacityM3,
      fallbackBoxVolumeM3: toNumber(measured.medianM3),
      measuredShapes: measured.measuredShapes,
      bodyType: vehicle.bodyType,
      loadingAccess: carrier.loadingAccess,
      maxPayloadKg: carrier.capacityKg,
      occupancy: null,
      volumeByDocument,
    }
  }

  return {
    bedDimensions: toBedDimensions(carrier, reference),
    boxesByDocument,
    capacityUnknownReason,
    capacityUnknownVehicleId,
    capacityM3: capacity.capacityM3,
    fallbackBoxVolumeM3: toNumber(measured.medianM3),
    measuredShapes: measured.measuredShapes,
    bodyType: vehicle.bodyType,
    loadingAccess: carrier.loadingAccess,
    /**
     * T18 (revisão, item 9): o teto de peso é de quem carrega — a carreta quando existe, senão o
     * próprio veículo de tração. Antes desta correção ele sempre lia o cavalo, e uma carreta com
     * capacidade diferente da dele fazia o teto mentir.
     */
    maxPayloadKg: carrier.capacityKg,
    occupancy: {
      ...occupancy,
      capacityDimensions: resolveDimensions({ reference, vehicle: carrier }, capacity.source),
      capacityM3: capacity.capacityM3,
      capacitySource: capacity.source,
    },
    volumeByDocument,
  }
}

/**
 * Spec 144 (D2/D4): carimba na caixa sem ficha a procedência da estimativa (`estimateSource`) e,
 * quando o resíduo da nota foi a origem, o m³ que ela devolveu. Caixa medida nunca é tocada; sem
 * resíduo (mediana ou ausência) a caixa segue sem m³ presumido, mas a procedência é dita mesmo
 * assim — é o que a lista do que falta medir (D4) usa para dizer "pela nota", "pela mediana" ou
 * "sem estimativa".
 */
export function stampEstimatedVolume(
  boxesByDocument: ReadonlyMap<string, readonly CargoPlanBox[]>,
  estimates: ReadonlyMap<string, ResolvedDocumentCargoEstimate>,
): ReadonlyMap<string, readonly CargoPlanBox[]> {
  return new Map(
    [...boxesByDocument].map(([documentId, boxes]) => {
      const estimate = estimates.get(documentId)
      const estimateSource = estimate?.estimateSource ?? 'none'
      const estimatedVolumeM3 =
        estimate?.estimateSource === 'note' && estimate.unmeasuredBoxVolumeM3 !== null
          ? Number.parseFloat(estimate.unmeasuredBoxVolumeM3)
          : null

      return [
        documentId,
        boxes.map((box) =>
          box.heightMm === null && box.lengthMm === null && box.widthMm === null
            ? {
                ...box,
                estimateSource,
                ...(estimatedVolumeM3 === null ? {} : { estimatedVolumeM3 }),
              }
            : box,
        ),
      ] as const
    }),
  )
}

/**
 * As três medidas da ficha, ou nada. Medida pela metade não desenha planta pela metade: duas
 * medidas e um palpite não descrevem um baú, e a escala é a única coisa que o desenho promete.
 */
/**
 * A escala do baú: **a ficha primeiro, o catálogo do tipo depois** — e a origem viaja junto.
 *
 * ⚠️ Zero na ficha é ausência de medida, nunca baú de volume zero (spec 088). E o catálogo só entra
 * marcado: sem a marca, o palpite de mercado se apresentaria como fita na mão de quem carrega.
 */
function toBedDimensions(
  vehicle: Dimensions,
  reference?: Dimensions | undefined,
): CargoBedDimensions | null {
  const measured = fromDimensions(vehicle, 'measured')
  if (measured !== null) return measured

  return reference === undefined ? null : fromDimensions(reference, 'reference')
}

function fromDimensions(
  dimensions: Dimensions,
  source: 'measured' | 'reference',
): CargoBedDimensions | null {
  const [height, length, width] = [
    Number(dimensions.cargoHeightM),
    Number(dimensions.cargoLengthM),
    Number(dimensions.cargoWidthM),
  ]
  if (!(height > 0) || !(length > 0) || !(width > 0)) return null

  return {
    heightM: dimensions.cargoHeightM,
    lengthM: dimensions.cargoLengthM,
    source,
    widthM: dimensions.cargoWidthM,
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

export type MeasuredItems = {
  /** Spec 088 G003: a mesma linha, agora com a caixa que a planta conta em camadas. */
  readonly boxesByDocument: ReadonlyMap<string, readonly CargoPlanBox[]>
  /** Spec 163 (P3): as notas em que alguma caixa entrou pela estimativa da unidade. */
  readonly documentsWithEstimatedBoxes: ReadonlySet<string>
  readonly itemsByDocument: ReadonlyMap<string, readonly MeasuredCargoItem[]>
  /**
   * Spec 094: as formas das caixas que a empresa mediu. É delas que sai a **proporção** da caixa
   * presumida — proporção, não cubo: um cubo de 0,021 m³ empilha diferente de uma caixa de
   * 38 × 26 × 21, e a planta é justamente sobre como as peças se arrumam no piso.
   */
  readonly measuredShapes: readonly MeasuredBoxShape[]
  readonly medianM3: string | null
}

/**
 * As linhas da nota com a caixa que o conferente mediu, mais a mediana da empresa para as que ele
 * ainda não alcançou (spec 085 G006).
 *
 * ⚠️ Duas consultas, nunca uma por nota: o detalhe da viagem já é a tela mais pesada do módulo
 * (`code-standart.md` §15). A mediana é da empresa inteira, não da viagem — a viagem tem poucas
 * caixas medidas e a mediana delas oscilaria de viagem para viagem.
 */
export async function loadMeasuredItems(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly nfeDocumentIds: readonly string[] },
): Promise<MeasuredItems> {
  if (input.nfeDocumentIds.length === 0) {
    return {
      boxesByDocument: new Map(),
      documentsWithEstimatedBoxes: new Set(),
      itemsByDocument: new Map(),
      measuredShapes: [],
      medianM3: null,
    }
  }

  /** Só a medida real: a mediana e as formas medidas nunca aprendem com estimativa (spec 163). */
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

  // Em série: o `queryable` pode ser transação, e consulta concorrente nela pode nunca voltar.
  const rows = await queryable
    .select({
      boxHeightMm: nfePackageBoxes.heightMm,
      boxLengthMm: nfePackageBoxes.lengthMm,
      boxWidthMm: nfePackageBoxes.widthMm,
      /** Spec 163 (RF07): a caixa estimada pela unidade, lida só na falta da medida real. */
      estimatedHeightMm: nfePackageBoxes.estimatedHeightMm,
      estimatedLengthMm: nfePackageBoxes.estimatedLengthMm,
      estimatedWidthMm: nfePackageBoxes.estimatedWidthMm,
      documentId: nfeProducts.documentId,
      /** Spec 094: as restrições que decidem onde a caixa pode ir. Nulo é "não informado". */
      isFragile: nfePackageBoxes.isFragile,
      isStackable: nfePackageBoxes.isStackable,
      keepUpright: nfePackageBoxes.keepUpright,
      /** O nome que a planta imprime, e que a linha do excedente usa para nomear o que não coube. */
      label: nfeProducts.description,
      maxStackCount: nfePackageBoxes.maxStackCount,
      /** Spec 144: código do produto, carimbado na caixa sem ficha para a lista do que falta medir. */
      productCode: nfeProducts.code,
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
    )
    // A ordem das caixas entra no hash da planta (spec 145 D6): sem ela o hash oscila à toa
    .orderBy(nfeProducts.documentId, nfeProducts.ordinal, nfeProducts.id)
  const measuredBoxes = await queryable
    .select({
      boxVolumeM3: boxVolume,
      heightMm: nfePackageBoxes.heightMm,
      lengthMm: nfePackageBoxes.lengthMm,
      widthMm: nfePackageBoxes.widthMm,
    })
    .from(nfePackageBoxes)
    .where(
      and(eq(nfePackageBoxes.companyId, input.companyId), isNotNull(nfePackageBoxes.measuredAt)),
    )
    .orderBy(nfePackageBoxes.id)

  const itemsByDocument = new Map<string, MeasuredCargoItem[]>()
  const boxesByDocument = new Map<string, CargoPlanBox[]>()
  const documentsWithEstimatedBoxes = new Set<string>()
  for (const row of rows) {
    const box = resolveCubageBoxRow({
      estimatedHeightMm: row.estimatedHeightMm,
      estimatedLengthMm: row.estimatedLengthMm,
      estimatedWidthMm: row.estimatedWidthMm,
      heightMm: row.boxHeightMm,
      lengthMm: row.boxLengthMm,
      widthMm: row.boxWidthMm,
    })
    if (box.isEstimated) documentsWithEstimatedBoxes.add(row.documentId)
    const item: MeasuredCargoItem = {
      boxVolumeM3: box.boxVolumeM3,
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
        heightMm: box.heightMm,
        /** Spec 094: as restrições viajam com a caixa — nulas até alguém informar. */
        isFragile: row.isFragile,
        isStackable: row.isStackable,
        keepUpright: row.keepUpright,
        label: row.label,
        lengthMm: box.lengthMm,
        maxStackCount: row.maxStackCount,
        /** Spec 144: só a caixa sem ficha carrega o código — a medida nunca precisou dele. */
        ...(box.heightMm === null ? { productCode: row.productCode } : {}),
        widthMm: box.widthMm,
      },
    ])
  }

  return {
    boxesByDocument,
    documentsWithEstimatedBoxes,
    itemsByDocument,
    measuredShapes: measuredBoxes.flatMap((row) =>
      row.heightMm === null || row.lengthMm === null || row.widthMm === null
        ? []
        : [{ heightMm: row.heightMm, lengthMm: row.lengthMm, widthMm: row.widthMm }],
    ),
    medianM3: medianBoxVolumeM3(
      measuredBoxes.flatMap((row) => (row.boxVolumeM3 === null ? [] : [row.boxVolumeM3])),
    ),
  }
}

/** A mediana chega como decimal em texto; o empacotador pensa em número. */
function toNumber(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number.parseFloat(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

type CubageBoxRow = {
  readonly boxVolumeM3: string | null
  readonly heightMm: number | null
  readonly isEstimated: boolean
  readonly lengthMm: number | null
  readonly widthMm: number | null
}

const CUBIC_MILLIMETERS_PER_MICRO_CUBIC_METER = 1000
const MICRO_CUBIC_METERS_PER_CUBIC_METER = 1_000_000

/**
 * Spec 163 (RF07): a caixa que a ocupação e a planta leem — por `resolveBoxDimensionsForCubage`,
 * nunca pelas colunas cruas. ⚠️ O m³ sai em texto com seis casas, arredondado como o
 * `round(numeric, 6)` que o Postgres fazia aqui: a caixa medida precisa do mesmo texto de antes,
 * ou o hash da planta (spec 145 D6) mudaria para toda viagem sem nada ter mudado.
 */
export function resolveCubageBoxRow(row: PackageBoxDimensionsSource): CubageBoxRow {
  const resolved = resolveBoxDimensionsForCubage(row)
  if (resolved === undefined) {
    return { boxVolumeM3: null, heightMm: null, isEstimated: false, lengthMm: null, widthMm: null }
  }
  const { heightMm, lengthMm, widthMm } = resolved.dims
  const cubicMillimeters = lengthMm * widthMm * heightMm
  const microCubicMeters = Math.floor(
    (cubicMillimeters + CUBIC_MILLIMETERS_PER_MICRO_CUBIC_METER / 2) /
      CUBIC_MILLIMETERS_PER_MICRO_CUBIC_METER,
  )
  const whole = Math.floor(microCubicMeters / MICRO_CUBIC_METERS_PER_CUBIC_METER)
  const fraction = String(microCubicMeters % MICRO_CUBIC_METERS_PER_CUBIC_METER).padStart(6, '0')
  return {
    boxVolumeM3: `${whole}.${fraction}`,
    heightMm,
    isEstimated: resolved.isEstimated,
    lengthMm,
    widthMm,
  }
}

/**
 * Spec 163 (P3): a nota que somou alguma caixa estimada pela unidade cai de `measured` para
 * `partial` — a pior origem manda (`resolveTripOccupancy`), e a ocupação imprime a marca de
 * estimativa ao lado do número. Origem já pior que `measured` fica como está.
 */
export function markDocumentsWithEstimatedBoxes(
  estimates: ReadonlyMap<string, ResolvedDocumentCargoEstimate>,
  documentsWithEstimatedBoxes: ReadonlySet<string>,
): ReadonlyMap<string, ResolvedDocumentCargoEstimate> {
  return new Map(
    [...estimates].map(([documentId, estimate]) =>
      documentsWithEstimatedBoxes.has(documentId) && estimate.source === 'measured'
        ? ([documentId, { ...estimate, source: 'partial' }] as const)
        : ([documentId, estimate] as const),
    ),
  )
}
