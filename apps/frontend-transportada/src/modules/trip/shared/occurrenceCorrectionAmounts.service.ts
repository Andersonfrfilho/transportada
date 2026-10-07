/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF13): o número do documento do cliente e o valor pago na correção, em três estados —
 * ausente mantém o gravado, vazio depois de editado limpa (`null`), texto vale. Dinheiro é sempre texto
 * (a máscara pt-BR só deixa dígito).
 *
 * Spec 247 T7.2 (A1): o servidor recusa com `400 DECLARED_AMOUNT_SELECTION_CONFLICT` quando os dois níveis
 * chegam com valor, e "ausente" significa "mantém". Por isso, quando o operador digita um valor num nível e o
 * outro nível tem valor **gravado**, o outro vai `null` explícito no mesmo corpo.
 */
import type { DeclaredAmountScope } from './occurrence.constant'
import {
  EMPTY_CORRECTION_RECORDED_AMOUNTS,
  type CorrectionRecordedAmounts,
} from './occurrenceRecordedAmounts.service'
import { unmaskAmountInput } from './occurrenceSettlementMoney.service'

export const CORRECTION_AMOUNT_SCOPE = { item: 'item', occurrence: 'occurrence' } as const

export type CorrectionAmountScope =
  (typeof CORRECTION_AMOUNT_SCOPE)[keyof typeof CORRECTION_AMOUNT_SCOPE]

/** O que o operador mexeu: campo que não está no rascunho não foi tocado, e é "mantenha o gravado". */
export type CorrectionAmountsDraft = Readonly<{
  /** O texto **mascarado** de cada linha editada; a chave presente é "editada". */
  lineAmounts: ReadonlyMap<string, string>
  occurrenceAmount: string | undefined
  referenceNumber: string | undefined
  /** `undefined` é "não escolheu": o nível é o gravado, ou o do tipo (`resolveCorrectionAmountScope`). */
  scope: CorrectionAmountScope | undefined
}>

export const EMPTY_CORRECTION_AMOUNTS_DRAFT: CorrectionAmountsDraft = {
  lineAmounts: new Map(),
  occurrenceAmount: undefined,
  referenceNumber: undefined,
  scope: undefined,
}

/** Cópia por valor de `OCCURRENCE_REFERENCE_NUMBER_PATTERN` da API — mudou lá, muda aqui. */
const REFERENCE_NUMBER_PATTERN = /^[A-Za-z0-9 ./-]{1,30}$/u

export function isValidReferenceNumber(text: string): boolean {
  return REFERENCE_NUMBER_PATTERN.test(text)
}

export type CorrectionAmountsContext = Readonly<{
  codes: readonly string[]
  draft: CorrectionAmountsDraft
  /** O que o registro gravou; ausente é "nada gravado". */
  recorded?: CorrectionRecordedAmounts
  /** Onde o tipo pede o valor pago; só decide o nível quando nada está gravado. */
  typeScope?: DeclaredAmountScope | undefined
}>

/** Nasce onde está gravado; sem gravado, onde o tipo o pede; sem tipo, por linha. */
export function resolveCorrectionAmountScope(
  context: CorrectionAmountsContext,
): CorrectionAmountScope {
  const recorded = context.recorded ?? EMPTY_CORRECTION_RECORDED_AMOUNTS
  if (context.draft.scope !== undefined) return context.draft.scope
  if (recorded.lineAmounts.size > 0) return CORRECTION_AMOUNT_SCOPE.item
  if (recorded.declaredAmount !== null) return CORRECTION_AMOUNT_SCOPE.occurrence
  return context.typeScope ?? CORRECTION_AMOUNT_SCOPE.item
}

/** "A nota inteira" não tem linha onde digitar: o valor é o da ocorrência, qualquer que seja o nível escolhido. */
export function isCorrectionAmountByLine(context: CorrectionAmountsContext): boolean {
  return (
    resolveCorrectionAmountScope(context) === CORRECTION_AMOUNT_SCOPE.item &&
    context.codes.length > 0
  )
}

export type CorrectionAmountsResolution = Readonly<{
  /** Texto ou `null` (limpa). Só vai quando editado, ou para limpar o nível que o outro substitui. */
  declaredAmount?: null | string
  hasReferenceNumberError: boolean
  /** Só das linhas editadas e que ainda estão na seleção; `null` limpa. */
  lineAmounts: ReadonlyMap<string, null | string>
  /** Só quando editado e válido: texto aparado ou `null`. */
  referenceNumber?: null | string
}>

function toDeclaredAmount(masked: string): null | string {
  const amount = unmaskAmountInput(masked)
  return amount === '' ? null : amount
}

export function resolveCorrectionAmounts(
  context: CorrectionAmountsContext,
): CorrectionAmountsResolution {
  const { codes, draft } = context
  const recorded = context.recorded ?? EMPTY_CORRECTION_RECORDED_AMOUNTS
  const trimmedReference = draft.referenceNumber?.trim()
  const hasReferenceNumberError =
    trimmedReference !== undefined &&
    trimmedReference !== '' &&
    !isValidReferenceNumber(trimmedReference)
  const referenceNumber =
    trimmedReference === undefined || hasReferenceNumberError
      ? {}
      : { referenceNumber: trimmedReference === '' ? null : trimmedReference }

  const lineAmounts = new Map<string, null | string>()
  if (isCorrectionAmountByLine(context)) {
    for (const code of codes) {
      const masked = draft.lineAmounts.get(code)
      if (masked !== undefined) lineAmounts.set(code, toDeclaredAmount(masked))
    }
    const hasTypedLineValue = [...lineAmounts.values()].some((amount) => amount !== null)
    const clearsOccurrence = hasTypedLineValue && recorded.declaredAmount !== null
    return {
      ...(clearsOccurrence ? { declaredAmount: null } : {}),
      hasReferenceNumberError,
      lineAmounts,
      ...referenceNumber,
    }
  }

  if (draft.occurrenceAmount === undefined) {
    return { hasReferenceNumberError, lineAmounts, ...referenceNumber }
  }
  const declaredAmount = toDeclaredAmount(draft.occurrenceAmount)
  const clearsLines = declaredAmount !== null && recorded.lineAmounts.size > 0
  if (clearsLines) for (const code of codes) lineAmounts.set(code, null)
  return { declaredAmount, hasReferenceNumberError, lineAmounts, ...referenceNumber }
}
