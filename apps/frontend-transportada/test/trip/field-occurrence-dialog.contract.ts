import { describe, expect, it } from 'bun:test'

import {
  isWithinFieldOccurrenceLimit,
  MAX_FIELD_OCCURRENCE_DOCUMENTS,
  resolveFieldOccurrenceDialogMode,
} from '../../src/modules/trip/shared/fieldOccurrenceBatch.service'

/**
 * Spec 156 T9 (D7, aceite 10): o mesmo diálogo serve a ação da linha (uma nota) e a ação em massa
 * (a seleção existente, até 50 notas) — o que muda é o texto, nunca o formulário.
 */
describe('modo do diálogo de ocorrência de campo (spec 156 T9)', () => {
  it('uma nota é a ação da linha', () => {
    expect(resolveFieldOccurrenceDialogMode(['doc-1'])).toBe('single')
  })

  it('mais de uma nota é a ação em massa', () => {
    expect(resolveFieldOccurrenceDialogMode(['doc-1', 'doc-2'])).toBe('batch')
  })
})

describe('limite do lote (spec 156 T7.3, mesmo teto da API)', () => {
  it('zero notas não é lote válido', () => {
    expect(isWithinFieldOccurrenceLimit(0)).toBe(false)
  })

  it('até 50 notas está dentro do limite', () => {
    expect(isWithinFieldOccurrenceLimit(MAX_FIELD_OCCURRENCE_DOCUMENTS)).toBe(true)
  })

  it('51 notas excede o limite', () => {
    expect(isWithinFieldOccurrenceLimit(MAX_FIELD_OCCURRENCE_DOCUMENTS + 1)).toBe(false)
  })
})
