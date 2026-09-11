/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  coversRegion,
  foldRegionCity,
  parseRegionCode,
} from '../../freight-regions/domain/region-coverage.policy.js'
import { VALUATION_GAPS, type ValuationGap } from './trip-valuation.policy.js'

/** Uma parada da viagem, reduzida ao que decide zona. `sequence` é `null` sem roteiro planejado. */
export type TripZoneStop = {
  readonly city: null | string
  readonly sequence: null | number
  readonly state: null | string
}

/** Uma linha de `freight_region_cities` com o código impresso da zona a que ela pertence. */
export type RegionCityEntry = {
  readonly city: string
  readonly code: string
  readonly regionId: string
  readonly state: string
}

/** Uma linha de `fleet_driver_regions`, com o código da zona coberta. */
export type DriverZoneCoverage = {
  readonly city: string
  readonly code: string
  readonly regionId: string
  readonly scope: 'city' | 'region'
  readonly state: string
}

export type TripDriverZone =
  | { readonly cityToRegister: string; readonly gap: ValuationGap }
  | { readonly gap: ValuationGap }
  /**
   * Spec 123: **a zona que foi recusada.** A política tinha o destino casado na mão no instante em
   * que negou a cobertura, e jogava fora — a tela recebia "rota do agregado sem valor cadastrado" e
   * o operador não tinha como saber qual linha da ficha do motorista cadastrar.
   *
   * Spec 124: o **id** vai junto, porque a consulta passou a pedir à tabela o preço da zona recusada
   * — é ele que vira estimativa com aviso quando a célula existe.
   */
  | {
      readonly gap: ValuationGap
      readonly regionCity: string
      readonly regionCode: string
      readonly regionId: string
    }
  /**
   * Spec 110 D7: o **código** da zona e a **cidade que a decidiu** viajam junto do id.
   *
   * ⚠️ Sem os dois, a tela imprime "R$ 1.480,00" e nada mais — e o operador não tem como saber que
   * quem pagou aquele preço foi Jaboticabal, o destino mais distante. O id da zona é chave de banco:
   * ele não diz nada a ninguém.
   */
  | { readonly regionCity: string; readonly regionCode: string; readonly regionId: string }

export type ResolveTripDriverZoneParams = {
  readonly catalog: readonly RegionCityEntry[]
  readonly coverage: readonly DriverZoneCoverage[]
  readonly stops: readonly TripZoneStop[]
}

/**
 * Qual zona paga esta viagem.
 *
 * ADR-0049 §3 diz que o agregado é pago por rota; a tabela do cliente tem um preço por
 * `(zona, classe)`. Faltava dizer **qual zona**, e o código de antes não dizia: a consulta juntava a
 * cobertura do motorista sem filtro de destino e ficava com a primeira linha que trouxesse valor.
 * Medido no dado real: em BARRETOS, `truck` vale 1.086,12 na zona `1.000` e 1.508,51 na `1.003` — o
 * preço mudava conforme a ordem que o Postgres devolveu.
 *
 * A regra é **o último destino, o mais distante** (D1 da spec 086): uma saída, um pagamento, e o
 * preço da zona alta já paga a passagem pelas baixas — que é o que a coluna OBSERVAÇÃO da planilha
 * diz ao escrever "Todas da Zona 1, 2, mais Zona 3".
 *
 * O que ela devolve, e por que são três coisas diferentes:
 *
 * - `{ regionId }` — a zona decidida. O preço sai dela, não da cobertura do motorista: cobrir a
 *   1.003 e entregar na 1.001 paga a 1.001, que é a estrada que ele de fato andou;
 * - `{ gap: CITY_WITHOUT_REGION, cityToRegister }` — o destino não está na tabela. A cidade sai por
 *   nome porque "cadastre ITOBI/SP" é acionável e "sem preço" não é;
 * - `{ gap: DRIVER_ZONE_NOT_COVERED, regionCode, regionCity }` — a zona existe e o motorista não a
 *   cobre. A zona viaja junto porque é ela que se cadastra na ficha dele (spec 123);
 * - `{ gap: NO_DRIVER_RATE }` — não há como decidir a zona, e aí não há nada que nomear.
 */
export function resolveTripDriverZone(input: ResolveTripDriverZoneParams): TripDriverZone {
  const catalog = new Map(input.catalog.map((entry) => [cityKey(entry), entry]))
  const matched: ResolvedStop[] = []
  const unnamed: TripZoneStop[] = []
  for (const stop of input.stops) {
    const entry = stop.city === null || stop.state === null ? undefined : catalog.get(cityKey(stop))
    if (entry === undefined) unnamed.push(stop)
    else matched.push({ entry, stop })
  }

  const destination = chooseDestination(matched)
  if (destination === null) {
    const unmatched = lastUnmatchedCity(unnamed)
    if (unmatched === null) return { gap: VALUATION_GAPS.noDriverRate }

    return { cityToRegister: unmatched, gap: VALUATION_GAPS.cityWithoutRegion }
  }

  return isCovered({ coverage: input.coverage, destination })
    ? {
        regionCity: destination.city,
        regionCode: destination.code,
        regionId: destination.regionId,
      }
    : {
        gap: VALUATION_GAPS.driverZoneNotCovered,
        regionCity: destination.city,
        regionCode: destination.code,
        regionId: destination.regionId,
      }
}

type ResolvedStop = { readonly entry: RegionCityEntry; readonly stop: TripZoneStop }

/**
 * Com roteiro, a última parada manda — e uma parada sem endereço resolvível não derruba a viagem:
 * a anterior responde. Sem roteiro não existe "mais distante" calculável, e aí vale a zona mais
 * alta da família, que é o que a acumulação de `coversRegion` já significa. Paradas em famílias
 * diferentes sem ordem **não se desempatam sozinhas**: escolher uma seria repetir o defeito que
 * esta política existe para consertar, com outra roupa.
 */
function chooseDestination(matched: readonly ResolvedStop[]): null | RegionCityEntry {
  if (matched.length === 0) return null

  const ordered = matched.filter((item) => item.stop.sequence !== null)
  if (ordered.length > 0) {
    return ordered.reduce((farthest, item) =>
      (item.stop.sequence ?? 0) > (farthest.stop.sequence ?? 0) ? item : farthest,
    ).entry
  }

  const families = new Set(matched.map((item) => parseRegionCode(item.entry.code).family))
  if (families.size > 1) return null

  return matched.reduce((highest, item) =>
    parseRegionCode(item.entry.code).zone > parseRegionCode(highest.entry.code).zone
      ? item
      : highest,
  ).entry
}

/**
 * Cobertura por zona é acumulativa dentro da família; cobertura por cidade vale **para aquela
 * cidade**, e não empresta a zona inteira — é o que a distingue no CHECK de `fleet_driver_regions`.
 */
function isCovered(input: {
  readonly coverage: readonly DriverZoneCoverage[]
  readonly destination: RegionCityEntry
}): boolean {
  return input.coverage.some((entry) => {
    if (entry.scope === 'city') {
      return (
        entry.regionId === input.destination.regionId &&
        cityKey(entry) === cityKey(input.destination)
      )
    }

    return coversRegion({ candidate: input.destination.code, coverage: entry.code })
  })
}

/** O nome que a lacuna imprime: a última parada que tinha cidade e não achou zona. */
function lastUnmatchedCity(stops: readonly TripZoneStop[]): null | string {
  const last = stops.filter((stop) => stop.city !== null && stop.state !== null).at(-1)

  return last === undefined ? null : `${last.city}/${last.state}`
}

function cityKey(value: { readonly city: null | string; readonly state: null | string }): string {
  return `${foldRegionCity(value.city ?? '')}/${(value.state ?? '').trim().toUpperCase()}`
}
