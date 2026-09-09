/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverPaymentModel } from '../../database/fleet.schema.js'
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { VALUATION_GAPS, type TripCostParcel, type ValuationGap } from './trip-valuation.policy.js'

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
  readonly paymentModel: DriverPaymentModel
  readonly routeAmount: null | string
  /**
   * Spec 086: **por que** faltou o valor. "O motorista não cobre esta zona" se resolve na ficha
   * dele; "ITOBI/SP não está na tabela" se resolve na aba Regiões. Ausente cai em `NO_DRIVER_RATE`,
   * que é o que sempre foi.
   */
  readonly routeGap?: null | ValuationGap
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
    return missing({ cityToRegister: null, routeGap: null })
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
    const chosen = named ?? withoutAmount[0]

    return missing({
      cityToRegister: chosen?.cityToRegister ?? null,
      routeGap: chosen?.routeGap ?? null,
    })
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

  return {
    amount: formatScaledDecimal(total, MONEY_SCALE),
    basis: {
      of: 'driver',
      paymentModel: 'route_table',
      regionCity: reference?.regionCity ?? null,
      regionCode: reference?.regionCode ?? null,
      vehicleClass: reference?.vehicleClass ?? '',
    },
    detail: null,
    /**
     * Há salário fora da conta, e a viagem carrega isso como lacuna — não para bloquear o número,
     * mas para a tela poder dizer "e mais um motorista da casa, que é custo do período".
     */
    gap: salaried.length > 0 ? VALUATION_GAPS.salariedCrewMember : null,
    kind: 'driver',
    source: 'measured',
  }
}

function missing(input: {
  readonly cityToRegister: null | string
  readonly routeGap: null | ValuationGap
}): TripCostParcel {
  return {
    amount: ZERO,
    detail: input.cityToRegister ?? null,
    gap: input.routeGap ?? VALUATION_GAPS.noDriverRate,
    kind: 'driver',
    source: 'missing',
  }
}

const ZERO = '0.0000'
const ERROR_CODE_PREFIX = 'TRIP_DRIVER_COST'
