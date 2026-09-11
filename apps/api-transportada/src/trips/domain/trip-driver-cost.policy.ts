/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverPaymentModel } from '../../database/fleet.schema.js'
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import type { ZoneLabel } from './trip-driver-zone.policy.js'
import { VALUATION_GAPS, type TripCostParcel, type ValuationGap } from './trip-valuation.policy.js'

/** Spec 129: o cru do empate que a `basis.tie` do custo de motorista carrega — sem texto composto. */
type DriverTieBasis = Readonly<{
  cityCount: number
  zones: readonly Readonly<{ amount: null | string; city: string; code: string }>[]
}>

/**
 * ADR-0049 §3: **os dois modelos convivem na mesma frota.** O que o cálculo precisa saber de cada
 * condutor é como ele é pago, e quanto a tabela de região diz para a rota daquela viagem.
 *
 * `routeAmount` é `null` quando a tabela não cobre a zona ou a classe do veículo — e isso é
 * **desconhecido**, não zero.
 */
export type TripCrewMember = {
  /** A cidade que a lacuna nomeia, quando a causa é `CITY_WITHOUT_REGION`. */
  readonly cityToRegister?: null | string
  readonly driverId: string
  /**
   * Spec 123: **de quem é a lacuna.** Com dois agregados na mesma viagem, a parcela relata um só —
   * e sem o nome o operador confere a ficha do outro. Ausente é ausência: o detalhe encolhe.
   */
  readonly driverName?: null | string
  readonly paymentModel: DriverPaymentModel
  readonly routeAmount: null | string
  /**
   * Spec 086: **por que** faltou o valor. "O motorista não cobre esta zona" se resolve na ficha
   * dele; "ITOBI/SP não está na tabela" se resolve na aba Regiões. Ausente cai em `NO_DRIVER_RATE`,
   * que é o que sempre foi.
   */
  readonly routeGap?: null | ValuationGap
  /**
   * Spec 128: no empate de rotas, quantas cidades cada rota empatada casou e as faixas empatadas com
   * o preço de cada uma — é o que o detalhe nomeia para explicar por que aquele valor foi usado.
   */
  readonly tiedCityCount?: number
  readonly tiedZones?: readonly ZoneLabel[]
  /**
   * Spec 110 D7: **a zona que pagou, por extenso.** O id da zona é chave de banco e não diz nada a
   * ninguém; o código impresso (`1.002`) e a cidade que o decidiu — o destino mais distante — são o
   * que transforma "R$ 1.480,00" em algo conferível.
   */
  readonly regionCity?: null | string
  readonly regionCode?: null | string
  /** A coluna da tabela de preço: a mesma classe que `resolveVehicleFreightClass` devolve. */
  readonly vehicleClass?: string
}

/**
 * O custo de motorista da viagem, com a origem que a tela mostra ao lado do número.
 *
 * As três respostas possíveis, e por que elas são diferentes:
 *
 * - **`measured`** — todo condutor pago por rota tem valor na tabela. É o caso normal do agregado;
 * - **`missing`** — algum agregado ficou sem valor, e o total **não** é a soma dos que tiveram: a
 *   viagem aparece na lista de "resultado incompleto por cadastro" até alguém cadastrar a rota;
 * - **`period`** — a tripulação inteira é assalariada. O custo existe, é conhecido, e **não é da
 *   viagem**: ratear o salário exigiria saber quantas viagens o período terá, o que só se sabe no
 *   fim dele — e o resultado congela antes disso (ADR-0049 §3).
 *
 * Tripulação mista (um agregado e um da casa) soma o do agregado e **diz** que há salário fora da
 * conta: esconder isso faria a viagem parecer mais barata do que é.
 */
export function buildTripDriverCost(crew: readonly TripCrewMember[]): TripCostParcel {
  const paidByRoute = crew.filter((member) => member.paymentModel === 'route_table')
  const salaried = crew.filter((member) => member.paymentModel === 'fixed')

  if (crew.length === 0) {
    return missing({ member: null, namesDriver: false })
  }
  if (paidByRoute.length === 0) {
    /** Só assalariado: o custo é do período, e a viagem diz isso em vez de fingir que é zero. */
    return {
      amount: ZERO,
      /** O zero aqui não é ausência: é salário, e ele não é da viagem (ADR-0049 §3). */
      basis: {
        of: 'driver',
        paymentModel: 'fixed',
        regionCity: null,
        regionCode: null,
        tie: null,
        vehicleClass: '',
      },
      detail: null,
      gap: null,
      kind: 'driver',
      source: 'period',
    }
  }

  const withoutAmount = paidByRoute.filter((member) => member.routeAmount === null)
  if (withoutAmount.length > 0) {
    /**
     * Entre duas causas, a que **nomeia a cidade** vence: ela é a acionável, e escolher a genérica
     * esconderia o único dado que resolve o problema.
     */
    const named = withoutAmount.find(
      (member) => member.routeGap === VALUATION_GAPS.cityWithoutRegion,
    )
    /**
     * Spec 123: sem cidade a cadastrar, vence quem **tem o que dizer**. Relatar o primeiro da lista
     * quando o segundo conhece zona e classe devolveria a frase seca com a informação a um índice
     * de distância.
     */
    const chosen = named ?? withoutAmount.find(hasDetail) ?? withoutAmount[0]

    return missing({ member: chosen ?? null, namesDriver: crew.length > 1 })
  }

  const total = paidByRoute.reduce(
    (accumulated, member) =>
      accumulated +
      parseScaledDecimal({
        errorCodePrefix: ERROR_CODE_PREFIX,
        scale: MONEY_SCALE,
        value: member.routeAmount ?? ZERO,
      }),
    0n,
  )

  /**
   * ⚠️ A base sai do **primeiro pago por rota**, e é o suficiente: a zona é da viagem, não do
   * condutor — todos os agregados desta viagem foram pagos pela mesma zona, porque ela é decidida
   * pelo destino mais distante do roteiro (spec 086 D1).
   */
  const [reference] = paidByRoute
  /**
   * Spec 124 D3, com a semântica da 127: um condutor sem a zona na ficha acende o lembrete, e ele
   * nomeia a célula — e, com mais de um condutor, quem não cobre. A origem continua `measured`: o
   * preço é o da tabela para a zona escolhida, e a ficha não o muda.
   */
  const uncovered = paidByRoute.find(
    (member) => member.routeGap === VALUATION_GAPS.driverZonePricedFromTable,
  )
  /**
   * Spec 128: o aviso de empate vence o lembrete de ficha — a parcela tem uma lacuna só, e é o empate
   * que explica **o número**; a ficha não o muda.
   */
  const tied = paidByRoute.find(
    (member) => member.routeGap === VALUATION_GAPS.driverRouteTieHighestRate,
  )
  const advised = tied ?? uncovered

  return {
    amount: formatScaledDecimal(total, MONEY_SCALE),
    basis: {
      of: 'driver',
      paymentModel: 'route_table',
      regionCity: reference?.regionCity ?? null,
      regionCode: reference?.regionCode ?? null,
      /**
       * Spec 129: dado cru do empate — a tela compõe a frase e formata a moeda, no molde de
       * `ledger.driverBasis`. `tied` é o condutor que carrega a lacuna de empate, não `reference`.
       */
      tie: buildTieBasis(tied),
      vehicleClass: reference?.vehicleClass ?? '',
    },
    detail:
      advised === undefined
        ? null
        : tied !== undefined
          ? tieDriverNameDetail({ member: tied, namesDriver: crew.length > 1 })
          : buildRateDetail({ member: advised, namesDriver: crew.length > 1 }),
    /**
     * Há salário fora da conta, e a viagem carrega isso como lacuna — não para bloquear o número,
     * mas para a tela poder dizer "e mais um motorista da casa, que é custo do período".
     *
     * Spec 124 D4: o aviso de zona fora da ficha vence — ele é acionável, e a parcela só tem uma
     * lacuna.
     */
    gap:
      advised !== undefined
        ? (advised.routeGap ?? null)
        : salaried.length > 0
          ? VALUATION_GAPS.salariedCrewMember
          : null,
    kind: 'driver',
    source: 'measured',
  }
}

/**
 * Spec 123: **a lacuna nomeia a linha e a coluna da planilha.** `detail` sai como dado cru, no
 * mesmo molde do `ledger.driverBasis` que a tela já imprime para a parcela medida
 * (`1.002 (RIBEIRÃO PRETO) · toco`) — a frase traduzida é do `*.locale.json`, e o que atravessa a
 * fronteira são os pedaços.
 *
 * ⚠️ A cidade a cadastrar sai **sozinha**: ali não há zona (é justamente o que falta), e pôr uma ao
 * lado seria contradizer a própria lacuna.
 */
function missing(input: {
  readonly member: null | TripCrewMember
  readonly namesDriver: boolean
}): TripCostParcel {
  const { member } = input
  const cityToRegister = member?.cityToRegister ?? null
  const tie = cityToRegister === null ? buildTieBasis(member ?? undefined) : null

  return {
    amount: ZERO,
    /**
     * Spec 129: sem faixa empatada precificada não há zona escolhida (`chosen` é `null` no
     * domínio) — `regionCity`/`regionCode` saem vazios, e é o `tie` cru que sobra para a tela
     * nomear as faixas. Cidade a cadastrar não tem zona nenhuma: não há `basis` para ela.
     */
    basis:
      tie === null
        ? null
        : {
            of: 'driver',
            paymentModel: member?.paymentModel ?? 'route_table',
            regionCity: null,
            regionCode: null,
            tie,
            vehicleClass: member?.vehicleClass ?? '',
          },
    detail: cityToRegister ?? (tie !== null ? tieDriverNameDetail(input) : buildRateDetail(input)),
    gap: member?.routeGap ?? VALUATION_GAPS.noDriverRate,
    kind: 'driver',
    source: 'missing',
  }
}

/** Tem algo a nomear além da frase seca — é o que faz este condutor valer a pena relatar. */
function hasDetail(member: TripCrewMember): boolean {
  return (
    buildRateDetail({ member, namesDriver: true }) !== null || (member.tiedZones?.length ?? 0) > 0
  )
}

/**
 * Spec 129: **cru** — quantas cidades empataram e cada faixa com o preço dela (ou ausência), como
 * o domínio devolveu. A frase, a moeda e o "sem preço" são de quem lê a tela; aqui não se compõe
 * texto nenhum. `undefined`/sem faixas é ausência de empate.
 */
function buildTieBasis(member: undefined | TripCrewMember): null | DriverTieBasis {
  const tiedZones = member?.tiedZones ?? []
  if (tiedZones.length === 0) return null

  return {
    cityCount: member?.tiedCityCount ?? tiedZones.length,
    zones: tiedZones.map((zone) => ({
      amount: zone.amount ?? null,
      city: zone.city,
      code: zone.code,
    })),
  }
}

/**
 * Spec 129: no empate, o único pedaço de `detail` que sobra é **quem** — o nome do condutor, só
 * com mais de um na tripulação. Zona, faixas e classe viajam em `basis.tie`, nunca aqui.
 */
function tieDriverNameDetail(input: {
  readonly member: null | TripCrewMember
  readonly namesDriver: boolean
}): null | string {
  const { member } = input
  if (member === null) return null

  const driverName = input.namesDriver ? (member.driverName ?? '').trim() : ''
  return driverName === '' ? null : driverName
}

/**
 * ⚠️ **Nada é inventado: cada pedaço só entra se o cálculo o conhece.** Cavalo mecânico não tem
 * coluna na planilha (`resolveVehicleFreightClass` manda `''`), e aí a classe some do texto em vez
 * de virar um rótulo que ninguém decidiu.
 *
 * Spec 129: o empate **não** passa mais por aqui — ele tem `detail` e `basis.tie` próprios
 * (`tieDriverNameDetail`, `buildTieBasis`), porque a lista de faixas precisa da moeda formatada
 * pela tela, e este texto é cru desde a 123.
 */
function buildRateDetail(input: {
  readonly member: null | TripCrewMember
  readonly namesDriver: boolean
}): null | string {
  const { member } = input
  if (member === null) return null

  const parts: string[] = []
  const regionCode = (member.regionCode ?? '').trim()
  if (regionCode !== '') {
    const regionCity = (member.regionCity ?? '').trim()
    parts.push(regionCity === '' ? regionCode : `${regionCode} (${regionCity})`)

    /**
     * ⚠️ **A coluna só aparece acompanhada da linha.** Sem zona decidida, "toco" sozinho diz que o
     * problema é a classe do veículo — e o problema é que não houve destino que resolvesse zona
     * nenhuma. Uma coordenada só não localiza célula em planilha.
     */
    const vehicleClass = (member.vehicleClass ?? '').trim()
    if (vehicleClass !== '') parts.push(vehicleClass)
  }

  const driverName = input.namesDriver ? (member.driverName ?? '').trim() : ''
  if (driverName !== '') parts.push(driverName)

  return parts.length === 0 ? null : parts.join(DETAIL_SEPARATOR)
}

const ZERO = '0.0000'
/** O mesmo separador do `ledger.driverBasis`: a tela já lê zona · classe assim na parcela medida. */
const DETAIL_SEPARATOR = ' · '
const ERROR_CODE_PREFIX = 'TRIP_DRIVER_COST'
