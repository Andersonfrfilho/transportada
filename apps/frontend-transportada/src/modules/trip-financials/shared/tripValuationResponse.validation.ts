/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  TripValuation,
  TripValuationCostParcelBasis,
  ValuationSource,
} from './tripValuation.service'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const SOURCES: readonly ValuationSource[] = ['estimated', 'measured', 'missing', 'period']

function isSource(value: unknown): value is ValuationSource {
  return SOURCES.some((source) => source === value)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readGap(value: unknown): null | string {
  return typeof value === 'string' && value !== '' ? value : null
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

  const costParcels = Array.isArray(payload.costParcels) ? payload.costParcels : []
  const revenueLines = Array.isArray(payload.revenueLines) ? payload.revenueLines : []

  return {
    costParcels: costParcels.filter(isRecord).map((parcel) => ({
      amount: readText(parcel.amount),
      /** Resposta anterior à 110 não traz base: a linha sai sem derivação, nunca quebrada. */
      basis: readBasis(parcel.basis),
      /** Resposta anterior à 086 não traz o campo: ausência é `null`, nunca "undefined" na tela. */
      detail: typeof parcel.detail === 'string' && parcel.detail !== '' ? parcel.detail : null,
      gap: readGap(parcel.gap),
      kind: readText(parcel.kind),
      source: isSource(parcel.source) ? parcel.source : 'estimated',
    })),
    hasGaps: payload.hasGaps === true,
    marginPercentage:
      typeof payload.marginPercentage === 'string' ? payload.marginPercentage : null,
    revenueLines: revenueLines.filter(isRecord).map((line) => ({
      amount: readText(line.amount),
      /** Só a linha prevista traz regra: a realizada vem do CT-e já emitido, não de um cálculo agora. */
      freightRuleId: typeof line.freightRuleId === 'string' ? line.freightRuleId : null,
      freightRuleName: typeof line.freightRuleName === 'string' ? line.freightRuleName : null,
      percentage: typeof line.percentage === 'string' ? line.percentage : null,
      gap: readGap(line.gap),
      nfeDocumentId: typeof line.nfeDocumentId === 'string' ? line.nfeDocumentId : null,
      source: isSource(line.source) ? line.source : 'estimated',
      tripDocumentId: readText(line.tripDocumentId),
    })),
    revenueSource: source,
    totalCost: readText(payload.totalCost),
    totalMargin: readText(payload.totalMargin),
    totalRevenue: readText(payload.totalRevenue),
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
      of: 'driver',
      paymentModel: readText(value.paymentModel),
      regionCity: typeof value.regionCity === 'string' ? value.regionCity : null,
      regionCode: typeof value.regionCode === 'string' ? value.regionCode : null,
      vehicleClass: readText(value.vehicleClass),
    }
  }

  return null
}
