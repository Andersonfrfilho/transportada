/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 326: o financeiro lança conta pela conversa direta com a assistente.
 */
import { describe, expect, test } from 'bun:test'

import {
  createExpenseFlowActions,
  type ExpenseFlowDependencies,
} from '../../src/whatsapp-commands/application/register-expense-flow-actions.js'
import {
  EXPENSE_FLOW_ACTION_KIND,
  EXPENSE_FLOW_CONTEXT_KEY as KEY,
  EXPENSE_FLOW_NODE,
  EXPENSE_FLOW_PERMISSION,
} from '../../src/whatsapp-commands/domain/whatsapp-expense-flow.constant.js'
import {
  parseExpenseAmount,
  parseExpenseDueDate,
  parseExpenseDueDay,
} from '../../src/whatsapp-commands/domain/whatsapp-expense-input.policy.js'
import { WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS } from '../../src/whatsapp-commands/domain/whatsapp-root-menu.policy.js'
import { WHATSAPP_ROOT_FLOW_GRAPH } from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'

describe('o que o financeiro digita', () => {
  test('valor em reais, com ou sem R$, ponto de milhar e vírgula', () => {
    expect(parseExpenseAmount('1500')).toBe('1500.00')
    expect(parseExpenseAmount('R$ 1.500,50')).toBe('1500.50')
    expect(parseExpenseAmount('89,9')).toBe('89.90')
    expect(parseExpenseAmount('0')).toBeUndefined()
    expect(parseExpenseAmount('-5')).toBeUndefined()
    expect(parseExpenseAmount('muito')).toBeUndefined()
  })

  test('vencimento: hoje, amanhã, dd/mm e dd/mm/aaaa', () => {
    const today = '2026-11-15'
    expect(parseExpenseDueDate('hoje', today)).toBe('2026-11-15')
    expect(parseExpenseDueDate('Amanhã', today)).toBe('2026-11-16')
    expect(parseExpenseDueDate('20/11', today)).toBe('2026-11-20')
    expect(parseExpenseDueDate('05/01', today)).toBe('2027-01-05')
    expect(parseExpenseDueDate('05/01/2027', today)).toBe('2027-01-05')
    expect(parseExpenseDueDate('31/02', today)).toBeUndefined()
    expect(parseExpenseDueDate('depois', today)).toBeUndefined()
  })

  test('dia do vencimento de 1 a 31', () => {
    expect(parseExpenseDueDay('5')).toBe(5)
    expect(parseExpenseDueDay('dia 10')).toBe(10)
    expect(parseExpenseDueDay('0')).toBeUndefined()
    expect(parseExpenseDueDay('32')).toBeUndefined()
  })
})

describe('quem vê a opção no menu', () => {
  test('só quem tem expenses.manage; motorista e financeiro sem a permissão não', () => {
    expect(WHATSAPP_ROOT_MENU_OPTION_PERMISSIONS.lancar_conta).toEqual(['expenses.manage'])
    expect(EXPENSE_FLOW_PERMISSION).toBe('expenses.manage')
    const options = WHATSAPP_ROOT_FLOW_GRAPH.nodes.menu?.options ?? []
    expect(options.some(([id]) => id === 'lancar_conta')).toBe(true)
    expect(WHATSAPP_ROOT_FLOW_GRAPH.nodes.menu?.next).toMatchObject({
      byAnswer: { lancar_conta: EXPENSE_FLOW_NODE.start },
    })
  })
})

const CATEGORIES = [
  { id: 'CAT1', name: 'Aluguel', requiresDriver: false },
  { id: 'CAT2', name: 'Seguro', requiresDriver: false },
  { id: 'CATD', name: 'Pagamento de motorista/agregado', requiresDriver: true },
]

function setup(roles: readonly string[] = ['company-admin'], withPeople = false) {
  const texts: string[] = []
  const lists: { body: string; rows: { id: string; title: string }[] }[] = []
  const created: Record<string, unknown>[] = []
  const failures = { create: false }
  const deps: ExpenseFlowDependencies = {
    createExpense: async (input) => {
      if (failures.create) throw new Error('boom')
      created.push(input as unknown as Record<string, unknown>)
    },
    ...(withPeople
      ? {
          listPeople: async () => [
            { id: 'P1', name: 'João Motorista' },
            { id: 'P2', name: 'Ana Ajudante' },
          ],
        }
      : {}),
    listCategories: async () => CATEGORIES.map((c) => ({ ...c, active: true })),
    today: () => '2026-11-15',
  }
  const actions = createExpenseFlowActions(deps)
  const run = async (kind: string, context: Record<string, unknown>) => {
    const definition = actions.find((action) => action.kind === kind)
    if (definition === undefined) throw new Error(`sem ação ${kind}`)
    return definition.handler({
      actor: { scope: { companyId: 'C1', roles, userId: 'U9' } },
      channel: {
        sendInteractiveList: async (message: {
          body: string
          rows: { id: string; title: string }[]
        }) => {
          lists.push(message)
        },
        sendText: async (_to: string, body: string) => {
          texts.push(body)
        },
      },
      context,
      node: { id: 'n' },
      session: { companyId: 'C1', whatsappNumber: '5516' },
    } as never)
  }
  /** Um turno: a resposta entra no contexto e o roteador anda um passo, como o despachante faz. */
  let context: Record<string, unknown> = {}
  const start = async () => {
    const result = await run(EXPENSE_FLOW_ACTION_KIND.start, context)
    context = { ...context, ...(result?.context ?? {}) }
    return result
  }
  const say = async (answer: string) => {
    const result = await run(EXPENSE_FLOW_ACTION_KIND.router, { ...context, [KEY.answer]: answer })
    context = { ...context, ...(result?.context ?? {}) }
    return result
  }
  return { created, failures, lists, say, start, texts }
}

describe('lançar conta variável pela conversa', () => {
  test('passo a passo até a confirmação, e só então grava, com o canal whatsapp', async () => {
    const t = setup()
    await t.start()
    expect(t.lists.at(-1)?.rows.map((r) => r.id)).toEqual(['fixed', 'variable'])
    await t.say('variable')
    await t.say('Troca de pneus')
    expect(t.lists.at(-1)?.rows.map((r) => r.id)).toEqual(['CAT1', 'CAT2'])
    await t.say('CAT2')
    await t.say('R$ 2.300,00')
    await t.say('20/11')
    expect(t.created).toEqual([])
    expect(t.lists.at(-1)?.body).toContain('Troca de pneus')
    expect(t.lists.at(-1)?.body).toContain('R$ 2.300,00')
    expect(t.lists.at(-1)?.rows.map((r) => r.id)).toEqual(['confirm', 'fix', 'cancel'])
    const done = await t.say('confirm')
    expect(t.created).toEqual([
      {
        categoryId: 'CAT2',
        channel: 'whatsapp',
        companyId: 'C1',
        createdBy: 'U9',
        dueDate: '2026-11-20',
        expectedAmount: '2300.00',
        kind: 'variable',
        name: 'Troca de pneus',
        today: '2026-11-15',
      },
    ])
    expect(done?.next).toBe('menu')
  })
})

describe('lançar conta fixa pela conversa', () => {
  test('pede periodicidade e dia, e grava como fixa', async () => {
    const t = setup()
    await t.start()
    await t.say('fixed')
    await t.say('Aluguel do galpão')
    await t.say('CAT1')
    await t.say('4500')
    expect(t.lists.at(-1)?.rows.map((r) => r.id)).toEqual([
      'monthly',
      'bimonthly',
      'quarterly',
      'yearly',
    ])
    await t.say('monthly')
    await t.say('5')
    await t.say('confirm')
    expect(t.created).toEqual([
      {
        categoryId: 'CAT1',
        channel: 'whatsapp',
        companyId: 'C1',
        createdBy: 'U9',
        dueDay: 5,
        expectedAmount: '4500.00',
        kind: 'fixed',
        name: 'Aluguel do galpão',
        recurrence: 'monthly',
        today: '2026-11-15',
      },
    ])
  })
})

describe('regras de segurança e de conversa', () => {
  test('a categoria de pagamento de motorista não é oferecida nem aceita', async () => {
    const t = setup()
    await t.start()
    await t.say('variable')
    await t.say('Algo')
    expect(t.lists.at(-1)?.rows.map((r) => r.id)).not.toContain('CATD')
    await t.say('CATD')
    expect(t.texts.at(-1)).toContain('lista')
    expect(t.created).toEqual([])
  })

  test('quem tem papel de motorista, agregado ou ajudante é recusado, mesmo com a permissão', async () => {
    for (const role of ['driver', 'aggregate', 'helper']) {
      const t = setup(['company-admin', role])
      const result = await t.start()
      expect(result?.next).toBe('menu')
      expect(t.lists).toEqual([])
      expect(t.texts).toHaveLength(1)
    }
  })

  test('valor inválido pergunta de novo; cancelar encerra sem gravar', async () => {
    const t = setup()
    await t.start()
    await t.say('variable')
    await t.say('Multa')
    await t.say('CAT1')
    await t.say('abc')
    expect(t.texts.at(-1)).toContain('valor')
    const out = await t.say('cancelar')
    expect(out?.next).toBe('menu')
    expect(t.created).toEqual([])
  })

  test('Corrigir recomeça; confirmar fora do passo de confirmação não grava', async () => {
    const t = setup()
    await t.start()
    await t.say('confirm')
    expect(t.created).toEqual([])
    await t.say('variable')
    await t.say('Multa')
    await t.say('CAT1')
    await t.say('100')
    await t.say('hoje')
    await t.say('fix')
    expect(t.lists.at(-1)?.rows.map((r) => r.id)).toEqual(['fixed', 'variable'])
    expect(t.created).toEqual([])
  })

  test('falha ao gravar avisa para conferir no painel e não repete', async () => {
    const t = setup()
    t.failures.create = true
    await t.start()
    await t.say('variable')
    await t.say('Multa')
    await t.say('CAT1')
    await t.say('100')
    await t.say('hoje')
    const out = await t.say('confirm')
    expect(out?.next).toBe('menu')
    expect(t.texts.at(-1)).toContain('painel')
  })
})

describe('quem causou a conta (opcional)', () => {
  test('pergunta com Pular, mostra no resumo e grava a ficha escolhida', async () => {
    const t = setup(['company-admin'], true)
    await t.start()
    await t.say('variable')
    await t.say('Multa de trânsito')
    await t.say('CAT1')
    await t.say('195,23')
    await t.say('20/11')
    expect(t.lists.at(-1)?.rows.map((r) => r.id)).toEqual(['skip', 'P1', 'P2'])
    await t.say('P1')
    expect(t.lists.at(-1)?.body).toContain('Quem causou: João Motorista')
    await t.say('confirm')
    expect(t.created[0]).toMatchObject({ causedByDriverId: 'P1' })
  })

  test('Pular segue sem ficha, e pessoa fora da lista pergunta de novo', async () => {
    const t = setup(['company-admin'], true)
    await t.start()
    await t.say('variable')
    await t.say('Multa')
    await t.say('CAT1')
    await t.say('100')
    await t.say('hoje')
    await t.say('XX')
    expect(t.texts.at(-1)).toContain('Pular')
    await t.say('pular')
    expect(t.lists.at(-1)?.body).not.toContain('Quem causou')
    await t.say('confirm')
    expect(t.created[0]).not.toHaveProperty('causedByDriverId')
  })
})
