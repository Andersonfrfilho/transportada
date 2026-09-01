/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildFinancialSummary,
  type FinancialSummaryRow,
} from '../../src/trips/domain/financial-summary.policy.js'

function row(overrides: Partial<FinancialSummaryRow> = {}): FinancialSummaryRow {
  return {
    costTotal: '1000.0000',
    groupId: 'g',
    groupLabel: 'Grupo',
    isComplete: true,
    netAmount: '900.0000',
    revenueAmount: '2000.0000',
    taxTotal: '100.0000',
    tripCount: 1,
    ...overrides,
  }
}

describe('o acumulado do período (spec 061 T007)', () => {
  test('soma receita, imposto e custo, e conta as viagens', () => {
    const summary = buildFinancialSummary({
      payrollAmount: null,
      rows: [row(), row({ groupId: 'h', revenueAmount: '1000.0000', tripCount: 2 })],
    })

    expect(summary).toMatchObject({
      costTotal: '2000.0000',
      netAmount: '800.0000',
      revenueAmount: '3000.0000',
      taxTotal: '200.0000',
      tripCount: 3,
    })
  })

  /**
   * ADR-0049 §3: a folha entra **uma vez, no total** — e nunca dentro dos grupos. Ratear salário por
   * viagem é o que a ADR recusa, e ratear por veículo seria a mesma invenção com outro nome.
   */
  test('a folha do período desce do total, e não dos grupos', () => {
    const summary = buildFinancialSummary({ payrollAmount: '5000.0000', rows: [row()] })

    expect(summary.costTotal).toBe('6000.0000')
    expect(summary.netAmount).toBe('-4100.0000')
    expect(summary.groups[0]?.costTotal).toBe('1000.0000')
    expect(summary.payrollAmount).toBe('5000.0000')
  })

  /** Margem negativa aparece negativa. Esconder seria decidir por quem lê. */
  test('mostra margem negativa como negativa', () => {
    const summary = buildFinancialSummary({
      payrollAmount: '0.0000',
      rows: [row({ costTotal: '2500.0000' })],
    })

    expect(summary.netAmount).toBe('-600.0000')
    expect(summary.marginRate?.startsWith('-')).toBe(true)
  })

  /**
   * Uma viagem incompleta no meio já torna o total uma aproximação — e chamá-lo de fechado seria a
   * mentira que a ADR-0049 §2 existe para impedir.
   */
  test('o acumulado só é completo quando toda viagem dele é', () => {
    expect(
      buildFinancialSummary({
        payrollAmount: '0.0000',
        rows: [row(), row({ isComplete: false })],
      }).isComplete,
    ).toBe(false)

    /** E folha desconhecida também torna o total aproximado: `null` não é zero. */
    expect(buildFinancialSummary({ payrollAmount: null, rows: [row()] }).isComplete).toBe(false)
    expect(buildFinancialSummary({ payrollAmount: '0.0000', rows: [row()] }).isComplete).toBe(true)
  })

  /** Sem receita não há margem: dividir por zero produziria infinito, não informação. */
  test('período sem receita não tem margem', () => {
    const summary = buildFinancialSummary({
      payrollAmount: null,
      rows: [row({ costTotal: '0.0000', revenueAmount: '0.0000', taxTotal: '0.0000' })],
    })

    expect(summary.marginRate).toBeNull()
  })

  test('período vazio soma zero e não estoura', () => {
    expect(buildFinancialSummary({ payrollAmount: null, rows: [] })).toMatchObject({
      marginRate: null,
      netAmount: '0.0000',
      tripCount: 0,
    })
  })
})
