/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type { DailyAllowanceRateOrigin } from '../domain/daily-allowance.policy.js'
import type { TripCostParcelBasis, TripValuation } from '../domain/trip-valuation.policy.js'
import type {
  TripFinancialParcel,
  TripFinancialResult,
  TripFinancialResultPort,
} from './trip-financial-result.port.js'

/** Imposto desce da receita; o resto sai do bolso. A tela separa as duas naturezas. */
const TAX_KINDS = new Set(['icms', 'pis_cofins'])

export class TripFinancialRecalculationReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_FINANCIAL_RECALCULATION_REASON_REQUIRED',
      details: [{ field: 'reason', message: 'recalculating a frozen result requires a reason' }],
      message: 'Recalculating a frozen result requires a reason',
      status: 422,
    })
  }
}

export type FreezeTripFinancialResultInput = {
  readonly actorUserId: null | string
  readonly assumptions: Readonly<Record<string, unknown>>
  readonly companyId: string
  /** Obrigatório a partir da segunda versão: número que muda sem explicação é pergunta sem resposta. */
  readonly reason?: string
  readonly repository: TripFinancialResultPort
  readonly tripId: string
  readonly valuation: TripValuation
}

/**
 * ADR-0049 §5: **viagem aberta calcula ao vivo; viagem fechada congela.** Sem isso a viagem de março
 * mudaria de margem em julho, porque preço de combustível, tabela de agregado e alíquota mudam — e o
 * histórico deixaria de servir para comparar.
 *
 * O congelamento acontece **depois** da transação que fechou a viagem, não dentro dela. É desvio
 * declarado do RF-2, e o motivo é o mesmo da sugestão de taxa da 060: esta conta lê uma dúzia de
 * tabelas, e prendê-la na transação de escrita da entrega seguraria o pedido do motorista em 3G. Se
 * ela falhar, o resultado simplesmente ainda não existe — e a rota de recálculo o produz.
 */
export async function freezeTripFinancialResult(
  input: FreezeTripFinancialResultInput,
): Promise<TripFinancialResult> {
  const current = await input.repository.findCurrent({
    companyId: input.companyId,
    tripId: input.tripId,
  })
  if (current !== null && (input.reason ?? '').trim().length === 0) {
    throw new TripFinancialRecalculationReasonRequiredError()
  }

  const parcels = input.valuation.costParcels.map(toParcel)
  const taxTotal = sumAmounts(parcels.filter((parcel) => parcel.nature === 'tax'))
  const costTotal = sumAmounts(parcels.filter((parcel) => parcel.nature === 'cost'))
  const measured = input.valuation.revenueLines.filter((line) => line.source === 'measured')

  return input.repository.insertVersion({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    result: {
      assumptions: input.assumptions,
      costTotal,
      /**
       * Incompleto quando falta CT-e **ou** quando alguma parcela é desconhecida. O número existe e
       * é mostrado; o que não pode é ele parecer final.
       */
      isComplete:
        !input.valuation.hasGaps && measured.length === input.valuation.revenueLines.length,
      marginRate: input.valuation.marginPercentage,
      netAmount: subtract(input.valuation.totalRevenue, add(taxTotal, costTotal)),
      parcels,
      recalculationReason: input.reason ?? '',
      revenueAmount: input.valuation.totalRevenue,
      revenueDocumentCount: measured.length,
      revenueExpectedCount: input.valuation.revenueLines.length,
      taxTotal,
      tripId: input.tripId,
    },
  })
}

function toParcel(parcel: TripValuation['costParcels'][number]): TripFinancialParcel {
  return {
    /** Parcela desconhecida ou de período é zero **com nome** — o banco recusa valor ali. */
    amount: parcel.source === 'missing' || parcel.source === 'period' ? '0.0000' : parcel.amount,
    kind: parcel.kind,
    nature: TAX_KINDS.has(parcel.kind) ? 'tax' : 'cost',
    note: composeParcelNote(parcel),
    source: parcel.source,
  }
}

/**
 * Spec 143 D5/T6: a lacuna vence sempre — uma parcela sem condutor (`NO_TRIP_DRIVER`) grava o
 * código, nunca a frase, porque não há `basis` nenhum para descrevê-la. Sem lacuna e com a diária
 * resolvida, `note` grava a frase de origem: a viagem fechada precisa continuar legível sem o
 * cadastro do motorista, que pode mudar depois (D3).
 *
 * ⚠️ Composição própria da API, deliberadamente. O frontend (T11) monta a mesma frase a partir do
 * `basis` cru para a viagem aberta — as duas nunca compartilham código (apps não importam fonte uma
 * da outra), e o texto idêntico é o contrato entre elas, não uma função só.
 */
function composeParcelNote(parcel: TripValuation['costParcels'][number]): string {
  if (parcel.gap !== null) return parcel.gap
  if (parcel.basis?.of !== 'driver') return ''
  return composeDriverAllowanceNote(parcel.basis)
}

/** Mais de um condutor soma a viagem (D2); a frase soma junto, uma linha por condutor. */
function composeDriverAllowanceNote(basis: Extract<TripCostParcelBasis, { of: 'driver' }>): string {
  return basis.crew
    .map((member) =>
      composeAllowanceLine({
        dailyAmount: member.dailyAmount,
        days: basis.days,
        rateOrigin: member.rateOrigin,
      }),
    )
    .join(ALLOWANCE_NOTE_SEPARATOR)
}

type ComposeAllowanceLineParams = {
  readonly dailyAmount: string
  readonly days: number
  readonly rateOrigin: DailyAllowanceRateOrigin
}

function composeAllowanceLine({
  dailyAmount,
  days,
  rateOrigin,
}: ComposeAllowanceLineParams): string {
  const dayLabel = days === 1 ? 'dia' : 'dias'
  return `R$${CURRENCY_SPACE}${formatRateText(dailyAmount)} × ${days} ${dayLabel} · ${DAILY_ALLOWANCE_RATE_ORIGIN_LABEL[rateOrigin]}`
}

/** D3: de onde veio o valor, por extenso — a mesma leitura que `daily-allowance.policy.ts` descreve. */
const DAILY_ALLOWANCE_RATE_ORIGIN_LABEL: Record<DailyAllowanceRateOrigin, string> = {
  company: 'valor geral',
  default: 'valor padrão',
  driver: 'valor do motorista',
}

/** Entre condutores, nunca entre frase e valor: `·` já separa o valor da origem dentro da linha. */
const ALLOWANCE_NOTE_SEPARATOR = '; '

/**
 * ⚠️ O fator sai com as casas que **tem**, nunca com as duas do total. A diária mora em
 * `numeric(19,4)`, e arredondá-la antes da multiplicação faz a frase desmentir o número que ela
 * explica: "R$ 200,34 × 3 dias" para uma parcela de R$ 601,0050. Quem confere a margem multiplica o
 * que lê. O total continua arredondando na exibição; o fator, não.
 */
function formatRateText(value: string): string {
  const [integerPart = '0', fractionalPart = ''] = value.split('.')
  const grouped = integerPart.replace(THOUSANDS_SEPARATOR_PATTERN, '.')

  return `${grouped},${significantFraction(fractionalPart)}`
}

/** Duas casas é o mínimo que dinheiro mostra; o zero além delas é ruído, o dígito não é. */
function significantFraction(fractionalPart: string): string {
  const padded = fractionalPart.padEnd(MINIMUM_FRACTION_DIGITS, '0')
  const trimmed = padded.replace(TRAILING_ZERO_PATTERN, '')

  return trimmed.length < MINIMUM_FRACTION_DIGITS
    ? padded.slice(0, MINIMUM_FRACTION_DIGITS)
    : trimmed
}

const MINIMUM_FRACTION_DIGITS = 2
const TRAILING_ZERO_PATTERN = /0+$/
const THOUSANDS_SEPARATOR_PATTERN = /\B(?=(\d{3})+(?!\d))/g

/** O mesmo `\u00A0` que o `Intl` do navegador escreve na viagem aberta — o texto é o contrato. */
const CURRENCY_SPACE = '\u00A0'

/**
 * Dinheiro em texto do começo ao fim: as somas do congelamento passam por inteiro escalado, nunca
 * por ponto flutuante — é a mesma regra que vale no banco e na tela.
 */
function sumAmounts(parcels: readonly TripFinancialParcel[]): string {
  return parcels.reduce((total, parcel) => add(total, parcel.amount), '0.0000')
}

function add(left: string, right: string): string {
  return format(toScaled(left) + toScaled(right))
}

function subtract(left: string, right: string): string {
  return format(toScaled(left) - toScaled(right))
}

function toScaled(value: string): bigint {
  const [integer, fraction = ''] = value.split('.')
  const padded = `${fraction}0000`.slice(0, 4)
  const negative = (integer ?? '').startsWith('-')
  const magnitude = BigInt(`${(integer ?? '0').replace('-', '')}${padded}`)

  return negative ? -magnitude : magnitude
}

function format(value: bigint): string {
  const negative = value < 0n
  const magnitude = (negative ? -value : value).toString().padStart(5, '0')
  const integer = magnitude.slice(0, -4)
  const fraction = magnitude.slice(-4)

  return `${negative ? '-' : ''}${integer}.${fraction}`
}
