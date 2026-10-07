/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T2.1: o vocabulário e os padrões do número do documento do cliente e do valor pago são
 * constantes — a CHECK do banco e o cadastro saem delas, nunca de lista literal repetida.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_DECLARED_AMOUNT_SCOPE,
  OCCURRENCE_DECLARED_AMOUNT_SCOPES,
  OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH,
  OCCURRENCE_REFERENCE_NUMBER_PATTERN,
  OCCURRENCE_REQUIREMENT_LABEL_MAX_LENGTH,
  OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS,
  OCCURRENCE_TYPE_DECLARED_AMOUNT_ITEMS_CHECK,
} from '../../src/shared/trip-occurrence.constant.js'

const referenceNumber = new RegExp(OCCURRENCE_REFERENCE_NUMBER_PATTERN, 'u')

describe('o valor pago e o número do cliente são configuração do tipo (spec 247 T2.1)', () => {
  test('o escopo do valor pago é por item ou pela ocorrência, nesta ordem', () => {
    expect(OCCURRENCE_DECLARED_AMOUNT_SCOPE).toEqual({ item: 'item', occurrence: 'occurrence' })
    expect(OCCURRENCE_DECLARED_AMOUNT_SCOPES).toEqual(['item', 'occurrence'])
  })

  test('os padrões não mudam nenhum tipo existente: os dois modos nascem desligados', () => {
    expect(OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS).toEqual({
      declaredAmountLabel: 'Valor pago',
      declaredAmountMode: 'off',
      declaredAmountScope: 'item',
      referenceNumberLabel: 'Número do documento do cliente',
      referenceNumberMode: 'off',
    })
  })

  test('os rótulos cabem no teto, e o teto da linha de item é 400', () => {
    expect(OCCURRENCE_REQUIREMENT_LABEL_MAX_LENGTH).toBe(40)
    expect(OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH).toBe(400)
    expect(
      OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.referenceNumberLabel.length,
    ).toBeLessThanOrEqual(OCCURRENCE_REQUIREMENT_LABEL_MAX_LENGTH)
  })

  test('o número aceita letras, dígitos, espaço, ponto, barra e hífen, de 1 a 30', () => {
    for (const accepted of ['45029', 'NFD 45029', 'A-12/3.4', 'x'.repeat(30)]) {
      expect(referenceNumber.test(accepted)).toBe(true)
    }
    for (const refused of ['', 'x'.repeat(31), '45029;', 'NFD_1', 'Nº 12', '1\n2']) {
      expect(referenceNumber.test(refused)).toBe(false)
    }
  })

  test('a CHECK de forma tem nome estável, que o cadastro traduz em 422', () => {
    expect(OCCURRENCE_TYPE_DECLARED_AMOUNT_ITEMS_CHECK).toBe(
      'company_occurrence_types_declared_amount_items_check',
    )
  })
})
