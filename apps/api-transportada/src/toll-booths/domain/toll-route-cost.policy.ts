/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que a rota paga de pedágio (spec 090 T5). Política **pura**: recebe os nós que o caminhão
 * percorreu, o catálogo de praças e a contagem de eixos, e devolve o custo com as praças nomeadas.
 *
 * ⚠️ **A praça se casa por identidade de nó, nunca por proximidade** (D1). A praça **é** um nó do
 * OSM, então a interseção é exata e o sentido está resolvido por construção: rodovia duplicada tem
 * as pistas a poucos metros uma da outra, e um raio cobraria a praça de quem passou do outro lado.
 * Por isso esta política não conhece latitude nem longitude, e um contrato de texto de fonte reprova
 * qualquer aritmética de distância que apareça aqui.
 */
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'TOLL_ROUTE_COST'

export const AXLE_COUNT_SOURCES = ['declared', 'estimated'] as const
export type AxleCountSource = (typeof AXLE_COUNT_SOURCES)[number]

/**
 * Quantos eixos, e de onde o número veio. A origem viaja **junto** do valor porque um veículo
 * estimado torna o total estimado, e a tela é proibida de imprimir o número sem a marca
 * (ADR-0044 §1).
 */
export type AxleCount = Readonly<{
  count: number
  source: AxleCountSource
}>

/**
 * A praça como o catálogo a guarda. Tarifa `null` é **desconhecida**, nunca gratuita.
 *
 * ⚠️ `latitude`/`longitude` viajam junto **só para o mapa desenhar o ícone** (spec 094 D3) — quem
 * decide se a praça foi cobrada continua sendo a identidade do nó, nunca a coordenada (ver o
 * cabeçalho deste arquivo).
 */
export type TollBoothRecord = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  latitude: string
  longitude: string
  name: null | string
  operator: null | string
  osmNodeId: number
}>

export type TollRouteCost = Readonly<{
  axles: AxleCount
  /** Na ordem em que o caminhão passa, para quem confere saber **por onde** o custo entrou. */
  booths: readonly TollBoothRecord[]
  /**
   * Quantas das praças acima não têm tarifa por eixo conhecida.
   *
   * ⚠️ Medido em 2026-09-07 no extract real: 3 praças de 166 não declaram tarifa nenhuma, e outras
   * declaram `0.00` — duas delas com nome de praça de rodovia e zero em tudo, que é campo não
   * mapeado e não isenção. O mapa não distingue as duas coisas, então o total sozinho é número
   * crível e possivelmente falso; esta contagem é o que a tela imprime ao lado dele.
   */
  boothsWithoutCharge: number
  /** A soma das tarifas por eixo das praças percorridas. */
  chargePerAxle: string
  total: string
}>

export type ResolveTollRouteCostParams = {
  readonly axles: AxleCount
  readonly booths: readonly TollBoothRecord[]
  /** `null` quando o roteirizador não anotou os nós — e aí não há o que cruzar. */
  readonly nodeIds: null | readonly number[]
}

/**
 * ⚠️ **`null` é "não sei", e rota sem praça é zero.** As duas coisas são diferentes na conta, e
 * colapsá-las num zero só faria uma rota cujos nós nunca chegaram parecer uma rota sem pedágio.
 */
export function resolveTollRouteCost(input: ResolveTollRouteCostParams): TollRouteCost | null {
  if (input.nodeIds === null) return null

  const byNode = new Map(input.booths.map((booth) => [booth.osmNodeId, booth]))
  const passed: TollBoothRecord[] = []
  const seen = new Set<number>()

  for (const nodeId of input.nodeIds) {
    const booth = byNode.get(nodeId)
    /**
     * ⚠️ **Uma vez por rota.** Medido: numa rota de 89,4 km, 27 nós aparecem mais de uma vez, com
     * 65 ocorrências extras — alça de trevo e retorno de rotatória, não segunda passagem por
     * cancela. Cobrar duas vezes daria número maior que o real na tela de quem aceita a carga, e a
     * viagem de volta está fora do escopo da spec.
     */
    if (booth === undefined || seen.has(nodeId)) continue
    seen.add(nodeId)
    passed.push(booth)
  }

  let chargePerAxle = 0n
  let boothsWithoutCharge = 0
  for (const booth of passed) {
    if (booth.chargePerAxle === null) {
      boothsWithoutCharge += 1
      continue
    }
    chargePerAxle += parseScaledDecimal({
      errorCodePrefix: ERROR_CODE_PREFIX,
      scale: MONEY_SCALE,
      value: booth.chargePerAxle,
    })
  }

  return {
    axles: input.axles,
    booths: passed,
    boothsWithoutCharge,
    chargePerAxle: formatScaledDecimal(chargePerAxle, MONEY_SCALE),
    total: formatScaledDecimal(chargePerAxle * BigInt(input.axles.count), MONEY_SCALE),
  }
}
