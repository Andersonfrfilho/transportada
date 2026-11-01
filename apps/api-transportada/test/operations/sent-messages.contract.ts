/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 290: o quadro de mensagens enviadas. O use case agrega as linhas que cada fonte devolve, isola uma fonte que
 * falha e não deixa dado pessoal passar.
 */
import { describe, expect, test } from 'bun:test'

import {
  createSentMessagesUseCase,
  type SentMessagesSource,
  type SentMessagesSourceRow,
} from '../../src/operations/application/sent-messages.use-case.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-01T12:00:00.000Z')
const CONTEXT = {
  companyId: COMPANY_ID,
  permissions: new Set(['operations.read']),
  userId: 'user-1',
}

function row(overrides: Partial<SentMessagesSourceRow> = {}): SentMessagesSourceRow {
  return {
    category: 'occurrence',
    channel: 'whatsapp',
    count: 1,
    status: 'sent',
    subcategory: 'Recusa',
    ...overrides,
  }
}

function source(
  key: string,
  rows: readonly SentMessagesSourceRow[] | Error,
  seen: Array<{ companyId: string; from: Date; to: Date }> = [],
): SentMessagesSource {
  return {
    category: 'occurrence',
    key,
    read: async (query) => {
      seen.push(query)
      if (rows instanceof Error) throw rows
      return rows
    },
  }
}

function build(sources: readonly SentMessagesSource[]) {
  return createSentMessagesUseCase({ now: () => NOW, sources })
}

describe('Spec 290 — sent messages use case', () => {
  test('sem operations.read recusa', async () => {
    const useCase = build([source('a', [row()])])
    await expect(
      useCase.read({ context: { ...CONTEXT, permissions: new Set() } }),
    ).rejects.toMatchObject({ code: 'OPERATIONS_READ_FORBIDDEN', status: 403 })
  })

  test('a janela padrão é de 24 h e vai com a empresa autenticada para cada fonte', async () => {
    const seen: Array<{ companyId: string; from: Date; to: Date }> = []
    await build([source('a', [], seen)]).read({ context: CONTEXT })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.companyId).toBe(COMPANY_ID)
    expect(seen[0]?.to.toISOString()).toBe(NOW.toISOString())
    expect(seen[0]?.from.toISOString()).toBe('2026-10-31T12:00:00.000Z')
  })

  test('janela maior que 90 dias, invertida ou no futuro é recusada', async () => {
    const useCase = build([source('a', [])])
    const day = 86_400_000
    for (const [from, to] of [
      [new Date(NOW.getTime() - 91 * day), NOW],
      [NOW, new Date(NOW.getTime() - day)],
      [new Date(NOW.getTime() - day), new Date(NOW.getTime() + day)],
    ] as const) {
      await expect(useCase.read({ context: CONTEXT, from, to })).rejects.toMatchObject({
        code: 'SENT_MESSAGES_WINDOW_INVALID',
        status: 400,
      })
    }
  })

  test('soma por canal, por categoria e por subcategoria, e conta falha à parte', async () => {
    const result = await build([
      source('a', [
        row({ count: 5, subcategory: 'Recusa' }),
        row({ channel: 'email', count: 3, subcategory: 'Recusa' }),
        row({ count: 2, status: 'failed', subcategory: 'Recusa' }),
        row({ category: 'notification', channel: 'email', count: 4, subcategory: 'driver.alert' }),
      ]),
    ]).read({ context: CONTEXT })

    expect(result.total).toEqual({ failed: 2, sent: 12, total: 14 })
    expect(result.byChannel).toEqual([
      { channel: 'email', failed: 0, sent: 7, total: 7 },
      { channel: 'whatsapp', failed: 2, sent: 5, total: 7 },
    ])
    expect(result.byCategory.map((entry) => [entry.category, entry.total])).toEqual([
      ['occurrence', 10],
      ['notification', 4],
    ])
    expect(result.bySubcategory[0]).toEqual({
      audience: '',
      category: 'occurrence',
      channel: 'whatsapp',
      failed: 2,
      sent: 5,
      subcategory: 'Recusa',
      total: 7,
    })
    expect(result.bySubcategory[1]?.total).toBe(4)
  })

  test('o público (cliente, contratante, motorista) separa a subcategoria sem misturar os canais', async () => {
    const result = await build([
      source('a', [
        row({ audience: 'client', count: 2 }),
        row({ audience: 'contractor', count: 3 }),
      ]),
    ]).read({ context: CONTEXT })
    expect(result.byChannel).toEqual([{ channel: 'whatsapp', failed: 0, sent: 5, total: 5 }])
    expect(result.bySubcategory.map((entry) => [entry.audience, entry.total])).toEqual([
      ['contractor', 3],
      ['client', 2],
    ])
  })

  test('uma fonte que falha vira indisponível e as outras seguem', async () => {
    const result = await build([
      source('boa', [row({ count: 2 })]),
      source('ruim', new Error('relation does not exist')),
    ]).read({ context: CONTEXT })
    expect(result.total.total).toBe(2)
    expect(result.unavailable).toEqual(['ruim'])
    expect(JSON.stringify(result)).not.toContain('relation does not exist')
  })

  test('descarta contagem inválida e limita a quantidade de subcategorias devolvidas', async () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      row({ count: 80 - index, subcategory: `tipo-${index}` }),
    )
    const result = await build([source('a', [...many, row({ count: -3 }), row({ count: Number.NaN })])]).read({
      context: CONTEXT,
    })
    expect(result.bySubcategory).toHaveLength(50)
    expect(result.bySubcategory[0]?.subcategory).toBe('tipo-0')
    expect(result.total.total).toBe(many.reduce((sum, entry) => sum + entry.count, 0))
  })
})
