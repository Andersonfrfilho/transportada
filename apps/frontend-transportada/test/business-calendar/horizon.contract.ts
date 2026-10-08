/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (ADR-0096 §6): a regra "todo ano" gera 10 anos na escrita, sem rotina agendada; a tela é quem avisa
 * quando o horizonte fica abaixo do ano corrente + 2. O ano corrente é o de São Paulo, o mesmo da geração.
 */
import { describe, expect, test } from 'bun:test'

import {
  hasShortMaterializationHorizon,
  readCalendarYear,
  resolveCoveredThroughYear,
} from '@/modules/company-settings/shared/businessCalendarHorizon.service'

import { buildRule, OTHER_RULE_ID } from '../fixtures/businessCalendar.fixture'

describe('ano corrente', () => {
  test('é o de São Paulo: 01h UTC do dia 1º ainda é 31/12 em São Paulo', () => {
    expect(readCalendarYear(new Date('2027-01-01T01:00:00.000Z'))).toBe(2026)
    expect(readCalendarYear(new Date('2027-01-01T03:00:00.000Z'))).toBe(2027)
    expect(readCalendarYear(new Date('2026-10-07T15:00:00.000Z'))).toBe(2026)
  })
})

describe('aviso de horizonte baixo', () => {
  test('uma regra que só vai até o ano corrente + 1 dispara o aviso', () => {
    expect(
      hasShortMaterializationHorizon({
        currentYear: 2026,
        rules: [buildRule({ materializedThroughYear: 2027 })],
      }),
    ).toBe(true)
  })

  test('até o ano corrente + 2 já basta', () => {
    expect(
      hasShortMaterializationHorizon({
        currentYear: 2026,
        rules: [buildRule({ materializedThroughYear: 2028 })],
      }),
    ).toBe(false)
  })

  test('basta UMA regra curta no meio das outras', () => {
    expect(
      hasShortMaterializationHorizon({
        currentYear: 2026,
        rules: [
          buildRule({ materializedThroughYear: 2036 }),
          buildRule({ id: OTHER_RULE_ID, materializedThroughYear: 2026 }),
        ],
      }),
    ).toBe(true)
  })

  test('sem regra não há o que gerar', () => {
    expect(hasShortMaterializationHorizon({ currentYear: 2026, rules: [] })).toBe(false)
  })
})

describe('até que ano o roteiro já fecha os clientes', () => {
  test('é o menor "gerado até" entre as regras', () => {
    expect(
      resolveCoveredThroughYear({
        currentYear: 2026,
        rules: [
          buildRule({ materializedThroughYear: 2036 }),
          buildRule({ id: OTHER_RULE_ID, materializedThroughYear: 2031 }),
        ],
      }),
    ).toBe(2031)
  })

  test('sem regra é o que uma regra nova geraria: o ano corrente + 10', () => {
    expect(resolveCoveredThroughYear({ currentYear: 2026, rules: [] })).toBe(2036)
  })
})
