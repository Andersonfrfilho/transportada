/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N1): o que o modo EFETIVO do tipo (tipo + exceção do contratante e do destinatário da
 * nota) faz com o número do documento do cliente e com os valores pagos numa correção.
 *
 * - `off`: o valor enviado é descartado, sem erro — gravá-lo mudaria `{{valorDeclarado}}` de um tipo que
 *   diz não ter o campo, e recusá-lo travaria quem tem a tela aberta com a configuração velha. O `null`
 *   (limpar) segue valendo: esvaziar um campo desligado nunca é problema;
 * - `required`: recusa só a limpeza EXPLÍCITA (`null`). Ausente continua sendo "mantém" — cobrar
 *   `required` de ocorrência anterior à 247, que nunca teve o campo, travaria a correção de qualquer uma;
 * - o lugar do valor pago (ocorrência ou linha) é o escopo efetivo (`resolveDeclaredAmountTarget`).
 */
import { REQUIRED_PROOF_FIELD_MODE } from './delivery-event.constant.js'
import {
  OCCURRENCE_DECLARED_AMOUNT_FIELD,
  OCCURRENCE_DECLARED_AMOUNT_SCOPE,
  OCCURRENCE_ITEMS_MODE,
} from '../../shared/trip-occurrence.constant.js'
import type { TriStateText } from './occurrence-correction-values.policy.js'
import { resolveDeclaredAmountTarget } from './occurrence-declared-amount-target.policy.js'
import { lineDeclaredAmountField } from './occurrence-requirement-guard.policy.js'
import type { OccurrenceRequirements } from './occurrence-requirements.policy.js'
import {
  TripOccurrenceDeclaredAmountRequiredError,
  TripOccurrenceReferenceNumberRequiredError,
} from './trip.error.js'

export type ApplyCorrectionRequirementsParams = {
  readonly declaredAmount: TriStateText
  /** Quantas linhas a ocorrência terá depois da correção. */
  readonly lineCount: number
  readonly productDeclaredAmounts: readonly TriStateText[]
  readonly referenceNumber: TriStateText
  readonly requirements: OccurrenceRequirements
}

export type AppliedCorrectionRequirements = {
  readonly declaredAmount: TriStateText
  readonly productDeclaredAmounts: readonly TriStateText[]
  readonly referenceNumber: TriStateText
}

/** Valor enviado é descartado (volta a "mantém"); só o `null` explícito atravessa. */
function discardValue(value: TriStateText): TriStateText {
  return value === null ? null : undefined
}

function assertDeclaredAmountNotCleared(params: ApplyCorrectionRequirementsParams): void {
  const target = resolveDeclaredAmountTarget({
    itemsMode: params.requirements.itemsMode,
    lineCount: params.lineCount,
    scope: params.requirements.declaredAmountScope,
  })
  if (target === OCCURRENCE_DECLARED_AMOUNT_SCOPE.occurrence) {
    if (params.declaredAmount === null) {
      throw new TripOccurrenceDeclaredAmountRequiredError(OCCURRENCE_DECLARED_AMOUNT_FIELD)
    }
    return
  }
  const clearedIndex = params.productDeclaredAmounts
    .slice(0, params.lineCount)
    .findIndex((amount) => amount === null)
  if (clearedIndex >= 0) {
    throw new TripOccurrenceDeclaredAmountRequiredError(lineDeclaredAmountField(clearedIndex))
  }
}

export function applyCorrectionRequirements(
  params: ApplyCorrectionRequirementsParams,
): AppliedCorrectionRequirements {
  const { requirements } = params
  const isReferenceOff = requirements.referenceNumberMode === OCCURRENCE_ITEMS_MODE.off
  const isAmountOff = requirements.declaredAmountMode === OCCURRENCE_ITEMS_MODE.off

  if (requirements.referenceNumberMode === REQUIRED_PROOF_FIELD_MODE) {
    if (params.referenceNumber === null) throw new TripOccurrenceReferenceNumberRequiredError()
  }
  if (requirements.declaredAmountMode === REQUIRED_PROOF_FIELD_MODE) {
    assertDeclaredAmountNotCleared(params)
  }

  return {
    declaredAmount: isAmountOff ? discardValue(params.declaredAmount) : params.declaredAmount,
    productDeclaredAmounts: isAmountOff
      ? params.productDeclaredAmounts.map(discardValue)
      : params.productDeclaredAmounts,
    referenceNumber: isReferenceOff ? discardValue(params.referenceNumber) : params.referenceNumber,
  }
}
