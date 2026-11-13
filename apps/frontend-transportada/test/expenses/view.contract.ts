/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T2.2: as contas da tela de Contas — o que conta como vencida, como o resumo fecha e
 * quando o formulário de nova conta deixa salvar. Dinheiro é texto do começo ao fim.
 */
import { describe, expect, it } from 'bun:test'

import type { ExpenseOccurrenceListItem } from '@/modules/expenses/shared/expenses.types'
import {
  EMPTY_CREATE_FORM,
  formatCivilDate,
  isOverdue,
  listCompetenceOptions,
  parseMoney,
  resolveOccurrencePayeeKey,
  resolvePayeeLabelKey,
  summarizeOccurrences,
  validateCreateForm,
} from '@/modules/expenses/shared/expensesView.service'
import { WORKSPACE_PERMISSIONS } from '@/modules/shared/workspaceAccess.service'

function row(
  changes: Partial<Pick<ExpenseOccurrenceListItem, 'dueDate' | 'expectedAmount' | 'status'>>,
): ExpenseOccurrenceListItem {
  return {
    categoryId: 'c',
    categoryName: 'Aluguel',
    competence: '2026-11',
    dueDate: '2026-11-20',
    expectedAmount: '100.00',
    expenseId: 'e',
    expenseKind: 'fixed',
    expenseName: 'x',
    id: 'o',
    paidAmount: null,
    paidAt: null,
    paidBy: null,
    payeeDriverId: null,
    payeeDriverName: null,
    payeeDriverPaymentModel: null,
    settlementNote: null,
    slot: 1,
    status: 'open',
    ...changes,
  }
}

describe('contas — leitura da lista', () => {
  it('vencida é só a aberta com vencimento anterior a hoje', () => {
    expect(isOverdue(row({ dueDate: '2026-11-12' }), '2026-11-13')).toBe(true)
    expect(isOverdue(row({ dueDate: '2026-11-13' }), '2026-11-13')).toBe(false)
    expect(isOverdue(row({ dueDate: '2026-11-01', status: 'paid' }), '2026-11-13')).toBe(false)
    expect(isOverdue(row({ dueDate: '2026-11-01', status: 'canceled' }), '2026-11-13')).toBe(false)
  })

  it('o resumo soma em aberto e vencidas sem passar por número binário', () => {
    const summary = summarizeOccurrences({
      items: [
        row({ dueDate: '2026-11-05', expectedAmount: '0.10' }),
        row({ dueDate: '2026-11-06', expectedAmount: '0.20' }),
        row({ dueDate: '2026-11-30', expectedAmount: '3940.00' }),
        row({ expectedAmount: '8500.00', status: 'paid' }),
      ],
      today: '2026-11-13',
      totals: { expectedAmount: '12440.30', paidAmount: '8500.00' },
    })
    expect(summary.overdueCount).toBe(2)
    expect(summary.overdueAmount).toBe('0.30')
    expect(summary.open).toBe('3940.30')
    expect(summary.paid).toBe('8500.00')
  })

  it('o rótulo da pessoa sai do modelo de pagamento do cadastro', () => {
    expect(resolvePayeeLabelKey('route_table')).toBe('aggregate')
    expect(resolvePayeeLabelKey('fixed')).toBe('driver')
    expect(resolvePayeeLabelKey(null)).toBeNull()
    expect(
      resolveOccurrencePayeeKey({ payeeDriverPaymentModel: 'fixed', payeeProfile: 'helper' }),
    ).toBe('helper')
    expect(resolveOccurrencePayeeKey({ payeeDriverPaymentModel: 'route_table' })).toBe('aggregate')
  })

  it('a data civil não passa por Date', () => {
    expect(formatCivilDate('2026-11-05')).toBe('05/11/2026')
  })

  it('o seletor de mês vai de seis meses atrás a seis à frente do corrente', () => {
    const options = listCompetenceOptions(new Date(2026, 10, 13))
    expect(options).toHaveLength(13)
    expect(options[0]?.value).toBe('2026-05')
    expect(options[6]?.value).toBe('2026-11')
    expect(options[12]?.value).toBe('2027-05')
  })
})

describe('contas — formulário de nova conta', () => {
  it('digitação em pt-BR vira texto decimal da API; zero e lixo viram nulo', () => {
    expect(parseMoney('8.500,00')).toBe('8500.00')
    expect(parseMoney('389,90')).toBe('389.90')
    expect(parseMoney('0,00')).toBeNull()
    expect(parseMoney('')).toBeNull()
  })

  it('fixa mensal pede nome, categoria, valor e dia; quinzenal não pede dia', () => {
    const base = { ...EMPTY_CREATE_FORM, amount: '10,00', categoryId: 'c', name: 'Aluguel' }
    expect(validateCreateForm(base, { requiresDriver: false })).toEqual(['dueDay'])
    expect(validateCreateForm({ ...base, dueDay: '5' }, { requiresDriver: false })).toEqual([])
    expect(
      validateCreateForm({ ...base, recurrence: 'fortnightly' }, { requiresDriver: false }),
    ).toEqual([])
  })

  it('variável pede o vencimento; categoria de pagamento pede a pessoa', () => {
    const base = {
      ...EMPTY_CREATE_FORM,
      amount: '10,00',
      categoryId: 'c',
      kind: 'variable' as const,
      name: 'Pneu',
    }
    expect(validateCreateForm(base, { requiresDriver: false })).toEqual(['dueDate'])
    expect(
      validateCreateForm({ ...base, dueDate: '2026-11-18' }, { requiresDriver: true }),
    ).toEqual(['payee'])
  })
})

describe('contas — menu', () => {
  it('a página abre só com expenses.read', () => {
    expect(WORKSPACE_PERMISSIONS.expenses).toEqual(['expenses.read'])
  })
})
