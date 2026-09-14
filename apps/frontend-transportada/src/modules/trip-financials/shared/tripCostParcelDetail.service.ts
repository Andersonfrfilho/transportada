/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { TripValuationCostParcelBasis } from './tripValuation.service'

/**
 * ⚠️ `TFunction` do react-i18next é sobrecarregado demais para caber num tipo simples sob
 * `exactOptionalPropertyTypes` — quem chama converte para este tipo na fronteira, uma vez, em vez
 * de este serviço puro conhecer a forma completa da biblioteca.
 */
export type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Spec 129 — **a API manda o empate cru, e a frase é composta aqui.** `basis.tie` traz quantas
 * cidades empataram e cada faixa com o código, a cidade e o preço em decimal (ou ausência); a
 * palavra "cidade(s)", "sem preço" e a moeda formatada são desta função, no mesmo molde de
 * `ledger.driverBasis` ao lado.
 *
 * ⚠️ **Serviço puro, compartilhado entre o razão da viagem** (`ValuationLedger`) **e o da
 * proposta** (`SuggestionVehicleValuation`) — duas implementações da mesma frase divergiriam
 * caladas, como já aconteceu com o preço do combustível (spec 100).
 *
 * ⚠️ **Sem `basis.tie` cai no texto cru de `detail`.** É o caminho de uma API anterior a esta spec
 * (ainda mandando a frase composta em português) ou de uma parcela sem empate — nos dois casos o
 * texto aparece como veio, sem tradução, em vez de a tela quebrar ou esconder o aviso.
 */
export function composeCostParcelDetail(input: {
  readonly basis: null | TripValuationCostParcelBasis
  readonly detail: null | string
  readonly t: Translate
}): null | string {
  const { basis, detail, t } = input
  const tie = basis !== null && basis.of === 'driver' ? (basis.tie ?? null) : null
  if (tie === null || tie === undefined) return detail

  const cityCount = t('ledger.tieCityCount', { count: tie.cityCount })
  const zones = tie.zones.map((zone) => formatTiedZone({ t, zone })).join(TIE_ZONES_SEPARATOR)
  const vehicleClass = basis?.of === 'driver' ? basis.vehicleClass.trim() : ''
  const base =
    vehicleClass === ''
      ? `${cityCount}${TIE_SEPARATOR}${zones}`
      : `${cityCount}${TIE_SEPARATOR}${zones}${TIE_SEPARATOR}${vehicleClass}`

  /** Com mais de um condutor, o nome de quem carrega a lacuna é o único pedaço que sobrou nela. */
  return detail === null ? base : `${base}${TIE_SEPARATOR}${detail}`
}

function formatTiedZone(input: {
  readonly t: Translate
  readonly zone: Readonly<{ amount: null | string; city: string; code: string }>
}): string {
  const { t, zone } = input
  const price = zone.amount === null ? t('ledger.tieNoPrice') : formatAmount(zone.amount)

  return `${zone.code} (${zone.city}) ${price}`
}

/** O mesmo separador do `ledger.driverBasis`: a tela já lê zona · classe assim na parcela medida. */
const TIE_SEPARATOR = ' · '
/** Entre zonas empatadas: o `·` já separa zona de classe, e reusá-lo tornaria a leitura ambígua. */
const TIE_ZONES_SEPARATOR = ' | '
