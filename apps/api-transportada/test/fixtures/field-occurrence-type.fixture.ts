/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (T2.1): o tipo de rua resolvido, completo — os seis campos de exigência com o padrão de
 * hoje (foto desligada, observação opcional, assinatura desligada, produtos opcionais, mínimo 1).
 * `attachmentMode` e `photoMode` são o mesmo valor; informar um preenche o outro.
 */
import type { FieldOccurrenceType } from '../../src/trips/application/list-field-occurrence-types.use-case.js'

export type FieldOccurrenceTypeOverrides = Partial<FieldOccurrenceType> & {
  readonly id: string
  readonly name: string
}

export function buildFieldOccurrenceType(
  overrides: FieldOccurrenceTypeOverrides,
): FieldOccurrenceType {
  const photoMode = overrides.photoMode ?? overrides.attachmentMode ?? 'off'
  return {
    attachmentMode: photoMode,
    declaredAmountLabel: 'Valor pago',
    declaredAmountMode: 'off',
    declaredAmountScope: 'item',
    flow: 'document',
    itemsMinimumCount: null,
    itemsMode: 'optional',
    noteMode: 'optional',
    photoMinimumCount: 1,
    photoMode,
    referenceNumberLabel: 'Número do documento do cliente',
    referenceNumberMode: 'off',
    signatureMode: 'off',
    stopKind: null,
    ...overrides,
  }
}
