/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parseRegionCode } from '../../freight-regions/domain/region-coverage.policy.js'
import { MONEY_SCALE, parseScaledDecimal } from '../../shared/decimal.service.js'
import type { TiedZone } from './trip-driver-zone.policy.js'

/** Uma faixa empatada com o preço que a tabela dá para a classe do veículo — `null` é célula vazia. */
export type PricedTiedZone = TiedZone & { readonly amount: null | string }

export type ChooseTiedZoneParams = {
  /** `regionId → driver_amount` para a classe do veículo, como `readRatesByRegion` devolve. */
  readonly rates: ReadonlyMap<string, string>
  readonly tiedZones: readonly TiedZone[]
}

export type ChooseTiedZoneResult = {
  /** A faixa que paga a viagem; `null` quando nenhuma empatada tem preço. */
  readonly chosen: null | PricedTiedZone
  /** Todas as empatadas, pelo código — é o que o detalhe da parcela nomeia. */
  readonly zones: readonly PricedTiedZone[]
}

/**
 * Spec 128 D1 — **no empate de rotas vale o maior preço.** Entre as faixas empatadas (a mais alta de
 * cada rota), vence a de maior `driver_amount` para a classe; faixa sem preço não concorre. Maior
 * valor também empatado cai no **menor código de zona** — a escolha nunca depende da ordem das
 * linhas que o Postgres devolveu.
 */
export function chooseTiedZone(input: ChooseTiedZoneParams): ChooseTiedZoneResult {
  const zones = [...input.tiedZones]
    .sort(byZoneCode)
    .map((zone) => ({ ...zone, amount: input.rates.get(zone.regionId) ?? null }))

  const chosen = zones.reduce<null | PricedTiedZone>((best, zone) => {
    if (zone.amount === null) return best
    if (best === null) return zone

    /** Estritamente maior: no empate de valor fica a anterior, que tem o menor código. */
    return toScaled(zone.amount) > toScaled(best.amount ?? '0') ? zone : best
  }, null)

  return { chosen, zones }
}

/** Valor em inteiro escalado: como texto, `'1100.0000'` viria antes de `'990.0000'`. */
function toScaled(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: 'TRIP_DRIVER_TIE', scale: MONEY_SCALE, value })
}

function byZoneCode(first: TiedZone, second: TiedZone): number {
  const firstCode = parseRegionCode(first.code)
  const secondCode = parseRegionCode(second.code)

  return firstCode.family === secondCode.family
    ? firstCode.zone - secondCode.zone
    : firstCode.family.localeCompare(secondCode.family, undefined, { numeric: true })
}
