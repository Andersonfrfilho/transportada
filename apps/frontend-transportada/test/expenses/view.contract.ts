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
  employeeKeys,
  isEmployeeCategoryName,
  fromPersonFieldValue,
  toPersonFieldValue,
  formatCivilDate,
  isOverdue,
  isValidBillUrl,
  listCompetenceOptions,
  parseMoney,
  formatInstallment,
  formatTripRoute,
  parseInstallmentsTotal,
  resolveOccurrencePayeeKey,
  resolvePayeeLabelKey,
  summarizeOccurrences,
  validateCreateForm,
} from '@/modules/expenses/shared/expensesView.service'
import {
  EMPTY_LIST_SEARCH,
  filterListItems,
  runBulk,
  selectableItems,
  summarizeSelection,
} from '@/modules/expenses/shared/expensesSelection.service'
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
    installmentNumber: null,
    installmentsTotal: null,
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

describe('contas — parcelas', () => {
  it('mostra n/total só quando a conta é parcelada', () => {
    expect(formatInstallment({ installmentNumber: 3, installmentsTotal: 10 })).toBe('3/10')
    expect(formatInstallment({ installmentNumber: null, installmentsTotal: null })).toBeNull()
  })

  it('o total digitado vai de 2 a 600', () => {
    expect(parseInstallmentsTotal('10')).toBe(10)
    for (const bad of ['', '1', '601', '1a']) expect(parseInstallmentsTotal(bad)).toBeNull()
  })
})

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

describe('contas — viagens do pagamento', () => {
  it('o trajeto da viagem é "origem → destino", só o destino com uma parada e nada sem ele', () => {
    expect(formatTripRoute({ destination: 'CAMPINAS', origin: 'RIBEIRAO PRETO' })).toBe(
      'RIBEIRAO PRETO → CAMPINAS',
    )
    expect(formatTripRoute({ destination: 'CAMPINAS', origin: null })).toBe('CAMPINAS')
    expect(formatTripRoute(null)).toBeNull()
    expect(formatTripRoute(undefined)).toBeNull()
  })
})

describe('contas — link do boleto (spec 329)', () => {
  it('só http(s) ou vazio vale, e um link inválido barra o formulário', () => {
    expect(isValidBillUrl('')).toBe(true)
    expect(isValidBillUrl('  ')).toBe(true)
    expect(isValidBillUrl('https://portal.exemplo.com/boleto?id=1')).toBe(true)
    expect(isValidBillUrl('http://portal.exemplo.com')).toBe(true)
    expect(isValidBillUrl('javascript:alert(1)')).toBe(false)
    expect(isValidBillUrl('portal.exemplo.com')).toBe(false)
    expect(
      validateCreateForm(
        {
          ...EMPTY_CREATE_FORM,
          amount: '10,00',
          billUrl: 'nao-e-link',
          categoryId: 'c',
          name: 'x',
        },
        { requiresDriver: false },
      ),
    ).toContain('billUrl')
  })
})

describe('funcionário da conta (spec 330)', () => {
  it('a escolha do select vira a chave certa da API', () => {
    expect(employeeKeys('driver:d1')).toEqual({ employeeDriverId: 'd1' })
    expect(employeeKeys('user:u1')).toEqual({ employeeUserId: 'u1' })
    expect(employeeKeys('')).toEqual({})
  })
})

describe('campo único de pessoa (spec 332)', () => {
  it('a escolha do cadastro e o nome digitado cabem no mesmo valor e voltam iguais', () => {
    expect(toPersonFieldValue({ choice: 'driver:d1', name: '' })).toBe('driver:d1')
    expect(toPersonFieldValue({ choice: '', name: '  Maria  ' })).toBe('name:Maria')
    expect(toPersonFieldValue({ choice: '', name: ' ' })).toBe('')
    expect(fromPersonFieldValue('user:u1')).toEqual({ choice: 'user:u1', name: '' })
    expect(fromPersonFieldValue('name:A própria empresa')).toEqual({
      choice: '',
      name: 'A própria empresa',
    })
    expect(fromPersonFieldValue('')).toEqual({ choice: '', name: '' })
  })
})

describe('spec 332 — o bloco Funcionário é só da folha', () => {
  it('reconhece Folha e Funcionários, com ou sem acento e caixa', () => {
    expect(isEmployeeCategoryName('Folha')).toBe(true)
    expect(isEmployeeCategoryName(' funcionários ')).toBe(true)
    expect(isEmployeeCategoryName('FUNCIONARIOS')).toBe(true)
    expect(isEmployeeCategoryName('Aluguel')).toBe(false)
    expect(isEmployeeCategoryName('Cartão de crédito')).toBe(false)
  })
})

describe('spec 333 — busca, faixa de vencimento e seleção em lote', () => {
  const items = [
    {
      ...row({ dueDate: '2026-11-05', expectedAmount: '100.10' }),
      id: 'a',
      expenseName: 'Aluguel Barracão',
    },
    {
      ...row({ dueDate: '2026-11-20', expectedAmount: '50.20' }),
      id: 'b',
      expenseName: 'Cartão Santander',
      subtypeName: 'Santander',
    },
    { ...row({ dueDate: '2026-11-25', status: 'paid' }), id: 'c', expenseName: 'Internet' },
  ]

  it('busca por nome sem depender de acento ou caixa, e filtra a faixa de vencimento', () => {
    expect(
      filterListItems(items, { ...EMPTY_LIST_SEARCH, text: 'BARRACÃO' }).map((i) => i.id),
    ).toEqual(['a'])
    expect(
      filterListItems(items, { ...EMPTY_LIST_SEARCH, text: 'santander' }).map((i) => i.id),
    ).toEqual(['b'])
    expect(
      filterListItems(items, { dueFrom: '2026-11-10', dueTo: '2026-11-25', text: '' }).map(
        (i) => i.id,
      ),
    ).toEqual(['b', 'c'])
    expect(filterListItems(items, EMPTY_LIST_SEARCH)).toHaveLength(3)
  })

  it('só conta em aberto é selecionável e a soma é exata', () => {
    expect(selectableItems(items).map((i) => i.id)).toEqual(['a', 'b'])
    expect(summarizeSelection(items, new Set(['a', 'b', 'c']))).toEqual({
      count: 2,
      expected: '150.30',
    })
    expect(summarizeSelection(items, new Set()).count).toBe(0)
  })

  it('uma falha não derruba as outras e fica anotada', async () => {
    const seen: string[] = []
    const result = await runBulk(['a', 'b', 'c'], (id) => {
      seen.push(id)
      return id === 'b' ? Promise.reject(new Error('x')) : Promise.resolve(id)
    })
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(result).toEqual({ failed: ['b'], succeeded: 2 })
  })
})
