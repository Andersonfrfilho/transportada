/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF13): o número do documento do cliente e o valor pago na correção, em três estados —
 * ausente mantém o gravado, vazio depois de editado limpa (`null`), texto vale. Dinheiro é sempre texto
 * (a máscara pt-BR só deixa dígito), e o valor da ocorrência e o de linha nunca vão juntos (a API recusa).
 */
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
  scope: CorrectionAmountScope
}>

export const EMPTY_CORRECTION_AMOUNTS_DRAFT: CorrectionAmountsDraft = {
  lineAmounts: new Map(),
  occurrenceAmount: undefined,
  referenceNumber: undefined,
  scope: CORRECTION_AMOUNT_SCOPE.item,
}

/** Cópia por valor de `OCCURRENCE_REFERENCE_NUMBER_PATTERN` da API — mudou lá, muda aqui. */
const REFERENCE_NUMBER_PATTERN = /^[A-Za-z0-9 ./-]{1,30}$/u

export function isValidReferenceNumber(text: string): boolean {
  return REFERENCE_NUMBER_PATTERN.test(text)
}

export type CorrectionAmountsResolution = Readonly<{
  /** Só no escopo da ocorrência, e só quando editado: texto ou `null`. */
  declaredAmount?: null | string
  hasReferenceNumberError: boolean
  /** Só no escopo por linha, só das linhas editadas e que ainda estão na seleção. */
  lineAmounts: ReadonlyMap<string, null | string>
  /** Só quando editado e válido: texto aparado ou `null`. */
  referenceNumber?: null | string
}>

function toDeclaredAmount(masked: string): null | string {
  const amount = unmaskAmountInput(masked)
  return amount === '' ? null : amount
}

export function resolveCorrectionAmounts(
  input: Readonly<{ codes: readonly string[]; draft: CorrectionAmountsDraft }>,
): CorrectionAmountsResolution {
  const { codes, draft } = input
  const trimmedReference = draft.referenceNumber?.trim()
  const hasReferenceNumberError =
    trimmedReference !== undefined &&
    trimmedReference !== '' &&
    !isValidReferenceNumber(trimmedReference)
  const referenceNumber =
    trimmedReference === undefined || hasReferenceNumberError
      ? {}
      : { referenceNumber: trimmedReference === '' ? null : trimmedReference }

  /** "A nota inteira" não tem linha onde digitar: o valor é o da ocorrência, qualquer que seja o escopo escolhido. */
  const isByLine = draft.scope === CORRECTION_AMOUNT_SCOPE.item && codes.length > 0
  const lineAmounts = new Map<string, null | string>()
  if (isByLine) {
    for (const code of codes) {
      const masked = draft.lineAmounts.get(code)
      if (masked !== undefined) lineAmounts.set(code, toDeclaredAmount(masked))
    }
  }
  const declaredAmount =
    isByLine || draft.occurrenceAmount === undefined
      ? {}
      : { declaredAmount: toDeclaredAmount(draft.occurrenceAmount) }

  return { ...declaredAmount, hasReferenceNumberError, lineAmounts, ...referenceNumber }
}
