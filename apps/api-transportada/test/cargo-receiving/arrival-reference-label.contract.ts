/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S3): o perfil guarda o TEXTO que antecede o número da
 * carga, nunca uma expressão — a expressão do usuário passava pelo filtro e retrocedia por 23,6 s
 * sobre 100 dígitos. O texto tem 1 a 60 caracteres, sem controle nem quebra de linha.
 */
import { describe, expect, test } from 'bun:test'

import { findArrivalReferenceLabelIssue } from '../../src/cargo-receiving/domain/arrival-reference-label.policy.js'
import { RECEIVING_PROFILE_LIMITS } from '../../src/cargo-receiving/domain/contractor-receiving-profile.constant.js'

describe('o texto que antecede o número da carga (spec 237, segurança S3)', () => {
  test('o teto é de 60 caracteres', () => {
    expect(RECEIVING_PROFILE_LIMITS.arrivalReferenceLabelMaxLength).toBe(60)
  })

  test.each([['NroCarga:'], ['Carga (n.º):'], ['x'.repeat(60)], ['LACRE: 1 - NroCarga']])(
    '%p é aceito',
    (label) => {
      expect(findArrivalReferenceLabelIssue(label)).toBeUndefined()
    },
  )

  test.each([
    ['', 'blank'],
    ['   ', 'blank'],
    ['x'.repeat(61), 'too_long'],
    ['NroCarga:\n', 'control_character'],
    ['Nro\tCarga', 'control_character'],
    ['Nro\u0000Carga', 'control_character'],
  ] as const)('%p é recusado (%p)', (label, issue) => {
    expect(findArrivalReferenceLabelIssue(label)).toBe(issue)
  })
})
