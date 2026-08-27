/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type { TripValuation } from '../domain/trip-valuation.policy.js'
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
    note: parcel.gap ?? '',
    source: parcel.source,
  }
}

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
