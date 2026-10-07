/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.2 (A1/A2): o que o registro **já gravou** — número do documento do cliente, valor pago da
 * ocorrência e valor pago por linha — e o que a tela mostra a partir disso. A correção nasce preenchida com o
 * gravado, e o nível do valor pago (linhas ou ocorrência) nasce no nível em que ele está gravado.
 * Dinheiro é sempre texto decimal (`50.00`); a máscara pt-BR só existe no campo.
 */
import type { CorrectionAmountsResolution } from './occurrenceCorrectionAmounts.service'
import { maskAmountFromDecimal } from './occurrenceSettlementMoney.service'
import type { TripOccurrenceDetail } from './tripOccurrenceFeed.service'

export type CorrectionRecordedAmounts = Readonly<{
  /** O valor pago da ocorrência (`"0.00"` é valor, `null` é nada gravado). */
  declaredAmount: null | string
  /** O valor pago de cada linha **que tem um** — a linha sem valor não tem entrada. */
  lineAmounts: ReadonlyMap<string, string>
  referenceNumber: null | string
}>

export const EMPTY_CORRECTION_RECORDED_AMOUNTS: CorrectionRecordedAmounts = {
  declaredAmount: null,
  lineAmounts: new Map(),
  referenceNumber: null,
}

/** Ocorrência ou API antigas não trazem as chaves: ausente é "nada gravado". */
export function buildCorrectionRecordedAmounts(
  detail: Pick<TripOccurrenceDetail, 'declaredAmount' | 'itemValues' | 'referenceNumber'>,
): CorrectionRecordedAmounts {
  const lineAmounts = new Map<string, string>()
  for (const line of detail.itemValues ?? []) {
    if (line.declaredAmount !== null && !lineAmounts.has(line.productCode)) {
      lineAmounts.set(line.productCode, line.declaredAmount)
    }
  }
  return {
    declaredAmount: detail.declaredAmount ?? null,
    lineAmounts,
    referenceNumber: detail.referenceNumber ?? null,
  }
}

/** O valor no campo: o decimal gravado chega mascarado (`50,00`), nunca como `50.00`. */
export function maskRecordedAmount(amount: null | string | undefined): string {
  return amount === null || amount === undefined ? '' : maskAmountFromDecimal(amount)
}

export type CorrectionFinalAmounts = Readonly<{
  /** O valor pago de cada linha da seleção depois do salvar; `null` é sem valor (vale a soma da linha). */
  lineAmounts: ReadonlyMap<string, null | string>
  occurrenceAmount: null | string
}>

/** O gravado com o corpo da correção aplicado por cima: ausente mantém, `null` limpa, texto vale. */
export function resolveCorrectionFinalAmounts(
  input: Readonly<{
    codes: readonly string[]
    recorded: CorrectionRecordedAmounts
    resolution: CorrectionAmountsResolution
  }>,
): CorrectionFinalAmounts {
  const { codes, recorded, resolution } = input
  const lineAmounts = new Map<string, null | string>()
  for (const code of codes) {
    lineAmounts.set(
      code,
      resolution.lineAmounts.has(code)
        ? (resolution.lineAmounts.get(code) ?? null)
        : (recorded.lineAmounts.get(code) ?? null),
    )
  }
  return {
    lineAmounts,
    occurrenceAmount:
      resolution.declaredAmount === undefined ? recorded.declaredAmount : resolution.declaredAmount,
  }
}
