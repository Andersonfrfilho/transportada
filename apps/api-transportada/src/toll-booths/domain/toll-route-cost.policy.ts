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
 *
 * ⚠️ `chargePerAxleAutomatic` é a tarifa de quem paga com tag (spec 095 D3) — o OSM não a declara,
 * então ela só existe quando o ajuste da empresa (ou, um dia, a curadoria oficial) a informa. Nula
 * é "desconhecida", nunca "sem desconto": inventar um percentual de tag por cima da manual é o
 * palpite que a spec proíbe.
 */
export type TollBoothRecord = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  chargePerAxleAutomatic: null | string
  latitude: string
  longitude: string
  name: null | string
  operator: null | string
  osmNodeId: number
}>

/** Se o veículo paga com tag ou não — só ele decide qual das duas tarifas da praça vale. */
export const TOLL_PAYMENT_MODES = ['automatic', 'manual'] as const
export type TollPaymentMode = (typeof TOLL_PAYMENT_MODES)[number]

export type TollRouteCost = Readonly<{
  axles: AxleCount
  /** Na ordem em que o caminhão passa, para quem confere saber **por onde** o custo entrou. */
  booths: readonly TollBoothRecord[]
  /**
   * Quantas das praças acima não têm tarifa conhecida **na base que o veículo paga** — manual para
   * quem não tem tag, e nem manual nem automática para quem tem (spec 090; a automática entrou na
   * 095 sem mudar o que esta contagem significa).
   *
   * ⚠️ Medido em 2026-09-07 no extract real: 3 praças de 166 não declaram tarifa nenhuma, e outras
   * declaram `0.00` — duas delas com nome de praça de rodovia e zero em tudo, que é campo não
   * mapeado e não isenção. O mapa não distingue as duas coisas, então o total sozinho é número
   * crível e possivelmente falso; esta contagem é o que a tela imprime ao lado dele.
   */
  boothsWithoutCharge: number
  /**
   * Quantas praças caíram para a manual por falta de tarifa automática conhecida — só existe
   * quando `paymentMode` é `automatic` (spec 095 D3). A queda **superestima** de propósito: num
   * número que decide aceitar carga, errar para cima recusa uma viagem que pagaria, e errar para
   * baixo aceita uma que não paga.
   */
  boothsFallenBackToManual: number
  /** A soma das tarifas efetivamente cobradas — automática onde o veículo paga com tag e ela é
   *  conhecida, manual no resto. */
  chargePerAxle: string
  /** Se o veículo paga com tag — a base que a tela mostra ao lado do total. */
  paymentMode: TollPaymentMode
  total: string
}>

export type ResolveTollRouteCostParams = {
  readonly axles: AxleCount
  readonly booths: readonly TollBoothRecord[]
  /** Spec 095 D3: quem decide qual das duas tarifas da praça vale é o veículo, não a empresa. */
  readonly hasAutomaticTollPayment: boolean
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
  let boothsFallenBackToManual = 0
  for (const booth of passed) {
    const charge = resolveBoothCharge({
      booth,
      hasAutomaticTollPayment: input.hasAutomaticTollPayment,
    })
    if (charge.fellBackToManual) boothsFallenBackToManual += 1
    if (charge.value === null) {
      boothsWithoutCharge += 1
      continue
    }
    chargePerAxle += parseScaledDecimal({
      errorCodePrefix: ERROR_CODE_PREFIX,
      scale: MONEY_SCALE,
      value: charge.value,
    })
  }

  return {
    axles: input.axles,
    booths: passed,
    boothsFallenBackToManual,
    boothsWithoutCharge,
    chargePerAxle: formatScaledDecimal(chargePerAxle, MONEY_SCALE),
    paymentMode: input.hasAutomaticTollPayment ? 'automatic' : 'manual',
    total: formatScaledDecimal(chargePerAxle * BigInt(input.axles.count), MONEY_SCALE),
  }
}

/**
 * ⚠️ **A queda para o manual só conta quando a automática é desconhecida E a manual é conhecida.**
 * Sem tarifa nenhuma nas duas bases a praça é "sem tarifa conhecida" (`boothsWithoutCharge`), não
 * uma queda — não há para onde cair. Nunca se aplica desconto estimado: sem a automática, o valor é
 * a manual, inteira (spec 095 D3).
 */
function resolveBoothCharge(input: {
  readonly booth: TollBoothRecord
  readonly hasAutomaticTollPayment: boolean
}): Readonly<{ fellBackToManual: boolean; value: null | string }> {
  if (!input.hasAutomaticTollPayment) {
    return { fellBackToManual: false, value: input.booth.chargePerAxle }
  }
  if (input.booth.chargePerAxleAutomatic !== null) {
    return { fellBackToManual: false, value: input.booth.chargePerAxleAutomatic }
  }
  return { fellBackToManual: input.booth.chargePerAxle !== null, value: input.booth.chargePerAxle }
}
