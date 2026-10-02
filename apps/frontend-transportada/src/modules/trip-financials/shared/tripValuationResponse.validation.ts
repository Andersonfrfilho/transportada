/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DailyAllowanceDaysOrigin,
  DailyAllowanceRateOrigin,
  TripDriverCostCrewLine,
  TripValuation,
  TripValuationCostParcel,
  TripValuationCostParcelBasis,
  TripValuationRevenueLine,
  ValuationSource,
} from './tripValuation.service'
import { readRevenueLineCostFigures } from './revenueLineCostFigures.validation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const SOURCES: readonly ValuationSource[] = ['estimated', 'measured', 'missing', 'period']

function isSource(value: unknown): value is ValuationSource {
  return SOURCES.some((source) => source === value)
}

const DAILY_ALLOWANCE_RATE_ORIGINS: readonly DailyAllowanceRateOrigin[] = [
  'company',
  'default',
  'driver',
]

function isRateOrigin(value: unknown): value is DailyAllowanceRateOrigin {
  return DAILY_ALLOWANCE_RATE_ORIGINS.some((origin) => origin === value)
}

const DAILY_ALLOWANCE_DAYS_ORIGINS: readonly DailyAllowanceDaysOrigin[] = ['estimated', 'informed']

function isDaysOrigin(value: unknown): value is DailyAllowanceDaysOrigin {
  return DAILY_ALLOWANCE_DAYS_ORIGINS.some((origin) => origin === value)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readGap(value: unknown): null | string {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Dinheiro é lido **por forma**, não por confiança: a escala fiscal de quatro casas do repositório,
 * que é exatamente o conjunto que `formatAmount` aceita.
 *
 * ⚠️ Fora dela não serve `readText`. Valor fora de forma viraria `''`, atravessaria a fronteira
 * calado e **lançaria na renderização** (`INVALID_AMOUNT`), derrubando a tela da viagem por causa
 * da conta de apoio — o oposto do que esta borda existe para fazer.
 */
const MONEY_PATTERN = /^-?\d+(\.\d{1,4})?$/u

function readMoney(value: unknown): null | string {
  return typeof value === 'string' && MONEY_PATTERN.test(value) ? value : null
}

/**
 * O lote só vale inteiro: linha com dinheiro fora de forma invalida a avaliação, em vez de sumir
 * da conta e fazer o total desmentir as linhas que sobraram.
 */
function collectLines<TLine>(entries: readonly (null | TLine)[]): null | readonly TLine[] {
  const kept = entries.flatMap((entry) => (entry === null ? [] : [entry]))

  return kept.length === entries.length ? kept : null
}

/**
 * Corpo malformado vira **ausência**, não exceção: a conta prevista é informação de apoio, e
 * derrubar a tela da viagem por causa dela seria trocar o problema de lugar.
 */
export function toTripValuation(envelope: unknown): TripValuation | null {
  if (!isRecord(envelope)) return null
  /**
   * ⚠️ A resposta vem **envelopada** em `{ data }`, como toda rota desta API. O adaptador lia o
   * envelope como se fosse o conteúdo: `revenueSource` era sempre `undefined`, a guarda devolvia
   * `null`, e a avaliação prevista **nunca apareceu** — nem no painel da viagem aberta, que a pede
   * desde a 061. O irmão `toTripFinancialResult` já desembrulhava; era a assimetria que escondia.
   */
  const payload = isRecord(envelope.data) ? envelope.data : envelope
  const source = payload.revenueSource
  if (!isSource(source)) return null

  const rawCostParcels = Array.isArray(payload.costParcels) ? payload.costParcels : []
  const rawRevenueLines = Array.isArray(payload.revenueLines) ? payload.revenueLines : []

  const costParcels = collectLines(rawCostParcels.filter(isRecord).map(toCostParcel))
  if (costParcels === null) return null
  const revenueLines = collectLines(rawRevenueLines.filter(isRecord).map(toRevenueLine))
  if (revenueLines === null) return null

  return {
    costParcels,
    hasGaps: payload.hasGaps === true,
    marginPercentage:
      typeof payload.marginPercentage === 'string' ? payload.marginPercentage : null,
    revenueLines,
    revenueSource: source,
    totalCost: readText(payload.totalCost),
    totalMargin: readText(payload.totalMargin),
    totalRevenue: readText(payload.totalRevenue),
  }
}

function toCostParcel(parcel: Record<string, unknown>): null | TripValuationCostParcel {
  const amount = readMoney(parcel.amount)
  if (amount === null) return null

  return {
    amount,
    /** Resposta anterior à 110 não traz base: a linha sai sem derivação, nunca quebrada. */
    basis: readBasis(parcel.basis),
    /** Resposta anterior à 086 não traz o campo: ausência é `null`, nunca "undefined" na tela. */
    detail: typeof parcel.detail === 'string' && parcel.detail !== '' ? parcel.detail : null,
    gap: readGap(parcel.gap),
    kind: readText(parcel.kind),
    source: isSource(parcel.source) ? parcel.source : 'estimated',
  }
}

/**
 * Spec 232: a prévia e a sugestão multi-veículo saem com os oito campos de gasto, como `unavailable`
 * (não têm trechos nem paradas). Linha **sem** nenhum deles continua válida — é a resposta de uma API
 * anterior à spec durante a publicação. Linha com campo de tipo errado **derruba a avaliação inteira**,
 * como `amount` malformado já faz: o gasto errado de uma nota é pior do que a conta ausente, porque a
 * conta ausente a tela sabe dizer.
 */
function toRevenueLine(line: Record<string, unknown>): null | TripValuationRevenueLine {
  const amount = readMoney(line.amount)
  if (amount === null) return null
  const costFigures = readRevenueLineCostFigures(line)
  if (costFigures.kind === 'malformed') return null

  return {
    amount,
    /** Só a linha prevista traz regra: a realizada vem do CT-e já emitido, não de um cálculo agora. */
    freightRuleId: typeof line.freightRuleId === 'string' ? line.freightRuleId : null,
    freightRuleName: typeof line.freightRuleName === 'string' ? line.freightRuleName : null,
    percentage: typeof line.percentage === 'string' ? line.percentage : null,
    gap: readGap(line.gap),
    nfeDocumentId: typeof line.nfeDocumentId === 'string' ? line.nfeDocumentId : null,
    source: isSource(line.source) ? line.source : 'estimated',
    tripDocumentId: readText(line.tripDocumentId),
    ...(costFigures.kind === 'present' ? costFigures.figures : {}),
  }
}

/**
 * ⚠️ A base é lida **por forma**, não por confiança: `of` decide quais campos existem, e um corpo
 * que não declara nenhuma das duas formas vira ausência. A tela então imprime só o total, que é o
 * comportamento anterior a esta spec.
 */
function readBasis(value: unknown): null | TripValuationCostParcelBasis {
  if (!isRecord(value)) return null

  if (value.of === 'fuel') {
    return {
      kilometersPerLiter: readText(value.kilometersPerLiter),
      litres: readText(value.litres),
      of: 'fuel',
      pricePerLiter: readText(value.pricePerLiter),
    }
  }
  if (value.of === 'driver') {
    return {
      crew: readCrew(value.crew),
      days: typeof value.days === 'number' ? value.days : 0,
      daysOrigin: isDaysOrigin(value.daysOrigin) ? value.daysOrigin : 'estimated',
      of: 'driver',
    }
  }
  if (value.of === 'icms') {
    return {
      baseReductionRate: readText(value.baseReductionRate),
      cst: readText(value.cst),
      of: 'icms',
      rate: readText(value.rate),
    }
  }

  return null
}

/**
 * Spec 143: uma linha crua por condutor — condutor malformado é descartado, nunca invalida a
 * parcela inteira.
 */
function readCrew(value: unknown): readonly TripDriverCostCrewLine[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((member) => {
    if (!isRecord(member)) return []
    if (!isRateOrigin(member.rateOrigin)) return []

    return [
      {
        dailyAmount: readText(member.dailyAmount),
        driverId: readText(member.driverId),
        driverName: typeof member.driverName === 'string' ? member.driverName : null,
        paymentModel: readText(member.paymentModel),
        rateOrigin: member.rateOrigin,
        subtotal: readText(member.subtotal),
      },
    ]
  })
}
