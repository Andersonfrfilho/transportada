/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverPaymentModel } from '../../database/fleet.schema.js'
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { MINIMUM_ALLOWANCE_DAYS } from './daily-allowance.constant.js'
import { resolveDailyAllowance, type DailyAllowanceDaysOrigin } from './daily-allowance.policy.js'
import {
  VALUATION_GAPS,
  type TripCostParcel,
  type TripDriverCostCrewLine,
} from './trip-valuation.policy.js'

/**
 * Spec 143 D1: **a diária paga o motorista, e os dois modelos recebem igual.** O que o cálculo
 * precisa saber de cada condutor é quanto vale a diária dele — a tabela de região não entra mais na
 * conta, e por isso não sobra aqui nenhum campo de zona, classe ou rota.
 *
 * `driverAmount` é o cru da ficha (`numeric(19,4)`): `null` é "sem valor próprio", e aí paga o valor
 * da empresa ou o padrão do sistema — nunca zero.
 */
export type TripCrewMember = {
  readonly driverAmount: null | string
  readonly driverId: string
  /** Spec 123: a linha nomeia quem recebeu. Ausente é ausência explícita, nunca string vazia. */
  readonly driverName: null | string
  readonly paymentModel: DriverPaymentModel
}

export type BuildTripDriverCostParams = {
  /** Spec 143 D3: a configuração vale para a viagem inteira — uma vez, nunca por condutor. */
  readonly companyDailyAmount: null | string
  readonly crew: readonly TripCrewMember[]
  readonly days: number
  readonly daysOrigin: DailyAllowanceDaysOrigin
}

/**
 * O custo de motorista da viagem: `Σ (diária × dias)`, uma linha por condutor.
 *
 * As respostas possíveis, e por que elas são diferentes:
 *
 * - **`measured`** — os dias foram informados na viagem, então o número é o que a operação decidiu;
 * - **`estimated`** — os dias vieram da duração estimada do roteiro (D4), e a viagem ainda pode
 *   render mais ou menos do que isso;
 * - **`missing`** — não há condutor na viagem. O custo é desconhecido, e desconhecido não é zero.
 *
 * ⚠️ `measured`/`estimated` aqui falam de **dias**, não de cadastro: o valor da diária sempre existe
 * (a empresa ou o padrão do sistema respondem por quem não tem o seu), então o que resta de incerto
 * é quantos dias a viagem vai durar. É o inverso da leitura antiga, quando o incerto era o preço.
 */
export function buildTripDriverCost({
  companyDailyAmount,
  crew,
  days,
  daysOrigin,
}: BuildTripDriverCostParams): TripCostParcel {
  /** D4 garante o mínimo de um dia na criação e na sugestão: menos que isso não chega aqui. */
  if (days < MINIMUM_ALLOWANCE_DAYS) throw new Error(`${ERROR_CODE_PREFIX}_INVALID_DAYS`)

  if (crew.length === 0) {
    return {
      amount: ZERO,
      basis: null,
      detail: null,
      gap: VALUATION_GAPS.noTripDriver,
      kind: 'driver',
      source: 'missing',
    }
  }

  const pricedCrew = crew.map((member) =>
    priceCrewMember({ companyDailyAmount, days: BigInt(days), member }),
  )
  const total = pricedCrew.reduce((accumulated, priced) => accumulated + priced.subtotal, 0n)

  return {
    amount: formatScaledDecimal(total, MONEY_SCALE),
    basis: {
      crew: pricedCrew.map((priced) => priced.line),
      days,
      daysOrigin,
      of: 'driver',
    },
    detail: null,
    gap: null,
    kind: 'driver',
    source: daysOrigin === 'informed' ? 'measured' : 'estimated',
  }
}

/**
 * O subtotal sai em `bigint` escalado e só depois vira texto: somar as linhas já formatadas perderia
 * a exatidão que a invariante `Σ subtotal === amount` exige.
 */
function priceCrewMember(input: {
  readonly companyDailyAmount: null | string
  readonly days: bigint
  readonly member: TripCrewMember
}): { readonly line: TripDriverCostCrewLine; readonly subtotal: bigint } {
  const { member } = input
  const { amount, rateOrigin } = resolveDailyAllowance({
    companyAmount: input.companyDailyAmount,
    driverAmount: member.driverAmount,
  })
  const dailyAmount = parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: MONEY_SCALE,
    value: amount,
  })
  const subtotal = dailyAmount * input.days

  return {
    line: {
      dailyAmount: formatScaledDecimal(dailyAmount, MONEY_SCALE),
      driverId: member.driverId,
      driverName: member.driverName,
      paymentModel: member.paymentModel,
      rateOrigin,
      subtotal: formatScaledDecimal(subtotal, MONEY_SCALE),
    },
    subtotal,
  }
}

const ZERO = '0.0000'
const ERROR_CODE_PREFIX = 'TRIP_DRIVER_COST'
