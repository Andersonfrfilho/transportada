/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.4b (D2): o modelo efetivo do e-mail da ocorrência é o da exceção da contratante, senão o do
 * tipo, senão nenhum — sem padrão, sem camada de destinatário.
 */
import { describe, expect, test } from 'bun:test'

import { resolveEffectiveOccurrenceMailTemplateId } from '../../src/trips/domain/occurrence-mail-template.policy.js'

describe('modelo efetivo do e-mail da ocorrência (spec 269 D2)', () => {
  test('a exceção da contratante vence o tipo', () => {
    expect(
      resolveEffectiveOccurrenceMailTemplateId({ contractorOverride: 'excecao', general: 'tipo' }),
    ).toBe('excecao')
  })

  test('a exceção nula herda o modelo do tipo', () => {
    expect(
      resolveEffectiveOccurrenceMailTemplateId({ contractorOverride: null, general: 'tipo' }),
    ).toBe('tipo')
  })

  test('sem exceção, vale o modelo do tipo', () => {
    expect(
      resolveEffectiveOccurrenceMailTemplateId({ contractorOverride: undefined, general: 'tipo' }),
    ).toBe('tipo')
  })

  test('a exceção vale mesmo com o tipo sem modelo', () => {
    expect(
      resolveEffectiveOccurrenceMailTemplateId({ contractorOverride: 'excecao', general: null }),
    ).toBe('excecao')
  })

  test('os dois nulos dão nulo, nunca um padrão', () => {
    expect(
      resolveEffectiveOccurrenceMailTemplateId({ contractorOverride: null, general: null }),
    ).toBeNull()
    expect(
      resolveEffectiveOccurrenceMailTemplateId({
        contractorOverride: undefined,
        general: undefined,
      }),
    ).toBeNull()
  })
})
