/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'TRIP_VALUATION'
const PERCENT_FACTOR = 100n

/**
 * Spec 065 D7 e 061 D2: **nenhuma parcela ausente vira zero silencioso.** E `period` (ADR-0049 §3)
 * é a quarta resposta: o custo existe, é conhecido, e **não é da viagem** — é o salário do motorista
 * da casa, que a visão do período subtrai.
 * Uma margem de 18% que na
 * verdade é "18% se o combustível estiver certo, e ele foi estimado" leva a decisão errada com mais
 * confiança do que número nenhum levaria.
 */
export const VALUATION_SOURCES = ['measured', 'estimated', 'missing', 'period'] as const
export type ValuationSource = (typeof VALUATION_SOURCES)[number]

/**
 * Por que a parcela não pôde ser calculada. Existe para a tela dizer o que fazer — "cadastre o preço
 * do diesel" é acionável; "combustível: 0" manda o operador adivinhar.
 */
export const VALUATION_GAPS = {
  /** As taxas de entrega são da spec 060, que ainda não foi construída. */
  featureAbsent: 'FEATURE_ABSENT',
  /**
   * O valor do agregado sai de `freight_region_driver_rates`, cruzando a zona da parada com a classe
   * do veículo (que a spec 038 passou a fornecer). Sem linha na tabela é **desconhecido**, não zero.
   */
  noDriverRate: 'NO_DRIVER_RATE',
  /**
   * ADR-0049 §3: há motorista assalariado na tripulação. O custo dele existe e **não é da viagem** —
   * quem o subtrai é a visão do período. A viagem carrega a marca para a tela poder dizer isso.
   */
  salariedCrewMember: 'SALARIED_CREW_MEMBER',
  /** A empresa não declarou regime federal, então PIS/COFINS não desce da receita (ADR-0049 §4). */
  noFederalRegime: 'NO_FEDERAL_REGIME',
  /** Nenhuma regra de frete casa com a nota: sem parâmetro não há receita prevista. */
  noFreightRule: 'NO_FREIGHT_RULE',
  /**
   * ⚠️ Fica só para o consumo declarado que **não produz conta** — zero, ou valor que não parseia.
   * Ausência de consumo e ausência de preço têm lacuna própria: elas se cadastram em telas
   * diferentes (a ficha do veículo e a aba Combustível da frota), e uma lacuna só mandava o
   * operador procurar nas duas.
   */
  noFuelBaseline: 'NO_FUEL_BASELINE',
  /** O veículo não declara consumo médio — cadastra-se na ficha dele, em `fleet_vehicles`. */
  noFuelConsumption: 'NO_FUEL_CONSUMPTION',
  /**
   * Não há preço para o combustível deste veículo: nem ajuste da empresa, nem tarifa da ANEEL, nem
   * referência da ANP para a UF do perfil fiscal. Empresa sem UF cadastrada cai aqui, e a rotina
   * `fuel.price.pull` que ainda não rodou também.
   */
  noFuelPrice: 'NO_FUEL_PRICE',
  /** O roteiro ainda não foi calculado, então não há quilometragem para multiplicar. */
  noPlannedDistance: 'NO_PLANNED_DISTANCE',
  /** Pedágio é lançamento manual e ainda não existe (061 D2). */
  notRecorded: 'NOT_RECORDED',
  /**
   * Spec 101 D2: **a sugestão não sabe o pedágio, e não é falta de lançamento.** O cálculo precisa
   * dos `nodeIds` que o OSRM devolve em `annotations=nodes` (spec 090), e a sugestão não os
   * persiste. Distinta de `notRecorded` de propósito: ali o operador **pode** lançar, e dizer
   * "ninguém lançou" numa tela sem viagem o mandaria procurar um botão que não existe.
   *
   * ⚠️ Zero seria pior que as duas: diria que o trajeto não tem pedágio, e numa distribuição pelo
   * interior de SP ele costuma ser a segunda maior parcela.
   */
  tollNotAvailableInSuggestion: 'TOLL_NOT_AVAILABLE_IN_SUGGESTION',
  /**
   * O pedágio foi calculado, e **alguma praça do trajeto não declara tarifa**: o total soma só as
   * conhecidas e portanto subestima. Sem esta lacuna ele se apresentaria como estimativa completa,
   * e é ele que a margem usa para dizer se a viagem paga. `detail` traz quantas ficaram de fora.
   */
  tollPartial: 'TOLL_PARTIAL',
  /**
   * Spec 086 D2: o destino da viagem não está em `freight_region_cities`. Distinta de
   * `noDriverRate` de propósito — "cadastre ITOBI/SP" e "este motorista não cobre esta zona" pedem
   * ações diferentes, e uma lacuna só faria o operador procurar no lugar errado.
   */
  cityWithoutRegion: 'CITY_WITHOUT_REGION',
  /**
   * Spec 123: a zona do destino existe e **este motorista não a cobre**. A correção é a ficha dele
   * (`fleet_driver_regions`), não a planilha — e é por isso que ela não pode dividir uma lacuna com
   * `driverRateMissingForClass`, que se resolve na aba Regiões. `detail` traz a zona recusada.
   */
  driverZoneNotCovered: 'DRIVER_ZONE_NOT_COVERED',
  /**
   * Spec 123: a zona existe, o motorista a cobre, e **a célula de preço daquela classe está
   * vazia** — célula zerada na planilha não vira linha (ADR-0038), então ausência aqui é ausência
   * de preço para aquela coluna. Medido em 2026-09-10 na base real: a coluna `utility` está vazia
   * nas 25 zonas que têm algum preço, e a `driver` daquela viagem saía sem dizer qual.
   *
   * ⚠️ Veículo **sem coluna** na planilha (moto, carro, cavalo mecânico) não cai aqui: ali não há
   * célula para preencher, e a lacuna honesta continua sendo `noDriverRate`.
   */
  driverRateMissingForClass: 'DRIVER_RATE_MISSING_FOR_CLASS',
  /**
   * Spec 124: o motorista não cobre a zona do destino, **e a tabela tem preço** para aquela zona e
   * aquela classe. A parcela conta esse preço como `estimated` e o aviso manda acrescentar a zona na
   * ficha dele — o preço da célula é o que a transportadora paga pela rota; o que falta é só alguém
   * afirmar que aquele motorista roda ali. `detail` traz a zona, a classe e, com dois condutores, o
   * nome de quem não cobre.
   */
  driverZonePricedFromTable: 'DRIVER_ZONE_PRICED_FROM_TABLE',
} as const

export type ValuationGap = (typeof VALUATION_GAPS)[keyof typeof VALUATION_GAPS]

/**
 * Spec 124 D2: **aviso, não lacuna.** A parcela tem valor completo e o número conta no total — o que
 * falta é um cadastro que não muda o número. Por isso `hasGaps` o ignora: marcar a conta como
 * incompleta mandaria o operador procurar um buraco que não existe.
 *
 * ⚠️ `TOLL_PARTIAL` **não** entra aqui, embora também tenha valor: lá o total subestima (praça sem
 * tarifa fica de fora), e isso é incompleto de verdade.
 */
export const ADVISORY_GAPS: readonly ValuationGap[] = [VALUATION_GAPS.driverZonePricedFromTable]

export function isAdvisoryGap(gap: null | ValuationGap): boolean {
  return gap !== null && ADVISORY_GAPS.includes(gap)
}

export const TRIP_COST_KINDS = [
  'driver',
  'fuel',
  'other_per_kilometer',
  'toll',
  'delivery_charges',
  /** ADR-0049 §4: imposto não é custo de operação — ele **desce da receita**, e a tela separa os dois. */
  'icms',
  'pis_cofins',
] as const
export type TripCostKind = (typeof TRIP_COST_KINDS)[number]

export type TripRevenueLine = {
  readonly amount: string
  /**
   * Qual parametrização produziu o número, e a que percentual.
   *
   * ⚠️ Só a linha `estimated` os tem. `measured` é a soma dos encargos do **CT-e autorizado** — ali
   * a origem é o documento já emitido, cujo perfil decidiu o preço na emissão, e não uma regra
   * aplicada agora; inventar um nome de regra para ela diria que a conta foi refeita, e não foi.
   */
  readonly freightRuleId: null | string
  readonly freightRuleName: null | string
  readonly gap: null | ValuationGap
  readonly nfeDocumentId: null | string
  readonly percentage: null | string
  readonly source: ValuationSource
  readonly tripDocumentId: string
}

/**
 * Spec 110 D7: **de onde o número veio**, em valores crus — nunca em texto composto.
 *
 * ⚠️ A API não escreve a frase. `184,2 km ÷ 2,8 km/l × R$ 6,29` é apresentação, e compor isso aqui
 * mandaria a tela imprimir uma string que ela não pode traduzir, formatar por locale nem quebrar em
 * duas linhas. O que sobe é o insumo; a frase é de quem imprime.
 *
 * ⚠️ E só existe para as duas parcelas **derivadas**. Pedágio é soma de tarifas e taxa de entrega é
 * lançamento: nas duas o número já é a explicação de si mesmo.
 */
export type TripCostParcelBasis =
  | Readonly<{
      kilometersPerLiter: string
      /** O que o trajeto queima, já calculado: a tela não repete a divisão da API. */
      litres: string
      of: 'fuel'
      pricePerLiter: string
    }>
  | Readonly<{
      of: 'driver'
      paymentModel: string
      /** A cidade que decidiu a zona — o destino mais distante (spec 086 D1). */
      regionCity: null | string
      regionCode: null | string
      vehicleClass: string
    }>

export type TripCostParcel = {
  readonly amount: string
  /** Spec 110: os insumos da parcela derivada. `null` onde o número não vem de conta nossa. */
  readonly basis?: null | TripCostParcelBasis
  /**
   * O que a lacuna precisa nomear para virar ação — hoje a cidade a cadastrar
   * (`CITY_WITHOUT_REGION`). Genérico de propósito: é a lacuna que decide o que o texto significa, e
   * um campo por parcela faria a próxima lacuna nascer sem lugar para o dado dela.
   */
  readonly detail: null | string
  readonly gap: null | ValuationGap
  readonly kind: TripCostKind
  readonly source: ValuationSource
}

export type TripValuation = {
  readonly costParcels: readonly TripCostParcel[]
  /**
   * O total sozinho mente quando falta parcela. Este campo é o que a tela usa para dizer isso ao
   * lado do número, em vez de esconder o número — que seria pior.
   */
  readonly hasGaps: boolean
  /** `null` quando a receita é zero — dividir por zero produziria margem infinita, não informação. */
  readonly marginPercentage: null | string
  readonly revenueLines: readonly TripRevenueLine[]
  /** `measured` só quando **toda** linha é medida: uma prevista no meio já torna o total previsão. */
  readonly revenueSource: ValuationSource
  readonly totalCost: string
  readonly totalMargin: string
  readonly totalRevenue: string
}

export type BuildTripValuationParams = {
  readonly costParcels: readonly TripCostParcel[]
  readonly revenueLines: readonly TripRevenueLine[]
}

export function buildTripValuation(input: BuildTripValuationParams): TripValuation {
  const totalRevenue = sum(input.revenueLines.map((line) => line.amount))
  const totalCost = sum(input.costParcels.map((parcel) => parcel.amount))
  const totalMargin = totalRevenue - totalCost

  return {
    costParcels: input.costParcels,
    hasGaps:
      input.revenueLines.some((line) => line.gap !== null) ||
      input.costParcels.some((parcel) => parcel.gap !== null && !isAdvisoryGap(parcel.gap)),
    marginPercentage:
      totalRevenue === 0n
        ? null
        : formatScaledDecimal(
            divideHalfUp(totalMargin * PERCENT_FACTOR * scaleFactor(), totalRevenue),
            MONEY_SCALE,
          ),
    revenueLines: input.revenueLines,
    revenueSource: collapseSource(input.revenueLines.map((line) => line.source)),
    totalCost: formatScaledDecimal(totalCost, MONEY_SCALE),
    totalMargin: formatScaledDecimal(totalMargin, MONEY_SCALE),
    totalRevenue: formatScaledDecimal(totalRevenue, MONEY_SCALE),
  }
}

/**
 * Custo por quilômetro contra a distância planejada. A distância chega em **metros inteiros** do
 * roteiro, e a conversão para quilômetro acontece aqui, uma vez — espalhá-la pelas parcelas é como
 * uma delas acaba dividindo por mil na hora errada.
 */
export function costOverDistance(input: {
  readonly amountPerKilometer: string
  readonly distanceMeters: number
}): string {
  const perKilometer = parseMoney(input.amountPerKilometer)
  return formatScaledDecimal(
    divideHalfUp(perKilometer * BigInt(Math.round(input.distanceMeters)), 1000n),
    MONEY_SCALE,
  )
}

/**
 * Combustível: quilômetros ÷ consumo × preço do litro. O consumo é km/l, então ele **divide** — a
 * inversão silenciosa é o erro clássico aqui, e é por isso que a ordem está escrita numa função só.
 */
export function fuelCost(input: {
  readonly distanceMeters: number
  readonly kilometersPerLiter: string
  readonly pricePerLiter: string
}): null | string {
  const litresScaled = fuelLitresScaled(input)
  if (litresScaled === null) return null

  return formatScaledDecimal(
    divideHalfUp(litresScaled * parseMoney(input.pricePerLiter), scaleFactor()),
    MONEY_SCALE,
  )
}

/**
 * Os litros que o trajeto queima. ⚠️ **Extraído para não haver duas divisões**: a tela imprime os
 * litros ao lado do total (spec 110 D7), e recalculá-los noutro lugar produziria um número que
 * discorda do custo por arredondamento — em conta de dinheiro isso aparece.
 */
export function fuelLitres(input: {
  readonly distanceMeters: number
  readonly kilometersPerLiter: string
}): null | string {
  const litresScaled = fuelLitresScaled(input)
  return litresScaled === null ? null : formatScaledDecimal(litresScaled, MONEY_SCALE)
}

function fuelLitresScaled(input: {
  readonly distanceMeters: number
  readonly kilometersPerLiter: string
}): bigint | null {
  const consumption = parseMoney(input.kilometersPerLiter)
  if (consumption <= 0n) return null

  const meters = BigInt(Math.round(input.distanceMeters))
  return divideHalfUp(meters * scaleFactor() * scaleFactor(), consumption * 1000n)
}

/**
 * O pior caso vence, e a ordem é essa: uma linha ausente torna o conjunto ausente, e uma prevista
 * torna o conjunto previsão. Chamar de "medido" um total com uma previsão dentro é a mentira que a
 * D1 da 061 existe para impedir.
 */
function collapseSource(sources: readonly ValuationSource[]): ValuationSource {
  if (sources.length === 0) return 'missing'
  if (sources.includes('missing')) return 'missing'
  if (sources.includes('estimated')) return 'estimated'

  return 'measured'
}

function sum(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + parseMoney(value), 0n)
}

function parseMoney(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value })
}

function scaleFactor(): bigint {
  return 10n ** MONEY_SCALE
}
