/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverPaymentModel } from '../../database/fleet.schema.js'
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { VALUATION_GAPS, type TripCostParcel } from './trip-valuation.policy.js'

/**
 * ADR-0049 §3: **os dois modelos convivem na mesma frota.** O que o cálculo precisa saber de cada
 * condutor é como ele é pago, e quanto a tabela de região diz para a rota daquela viagem.
 *
 * `routeAmount` é `null` quando a tabela não cobre a zona ou a classe do veículo — e isso é
 * **desconhecido**, não zero.
 */
export type TripCrewMember = {
  readonly driverId: string
  readonly paymentModel: DriverPaymentModel
  readonly routeAmount: null | string
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
    return { amount: ZERO, gap: VALUATION_GAPS.noDriverRate, kind: 'driver', source: 'missing' }
  }
  if (paidByRoute.length === 0) {
    /** Só assalariado: o custo é do período, e a viagem diz isso em vez de fingir que é zero. */
    return { amount: ZERO, gap: null, kind: 'driver', source: 'period' }
  }
  if (paidByRoute.some((member) => member.routeAmount === null)) {
    return { amount: ZERO, gap: VALUATION_GAPS.noDriverRate, kind: 'driver', source: 'missing' }
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

  return {
    amount: formatScaledDecimal(total, MONEY_SCALE),
    /**
     * Há salário fora da conta, e a viagem carrega isso como lacuna — não para bloquear o número,
     * mas para a tela poder dizer "e mais um motorista da casa, que é custo do período".
     */
    gap: salaried.length > 0 ? VALUATION_GAPS.salariedCrewMember : null,
    kind: 'driver',
    source: 'measured',
  }
}

const ZERO = '0.0000'
const ERROR_CODE_PREFIX = 'TRIP_DRIVER_COST'
