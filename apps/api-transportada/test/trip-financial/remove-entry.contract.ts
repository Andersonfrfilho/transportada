/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 RF12/RF13: remover não apaga — a listagem filtra por padrão, e a fonte fala isso.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const COST_REPOSITORY = readFileSync(
  new URL('../../src/trips/infrastructure/drizzle-trip-cost.repository.ts', import.meta.url),
  'utf8',
)
const REVENUE_REPOSITORY = readFileSync(
  new URL('../../src/trips/infrastructure/drizzle-trip-revenue.repository.ts', import.meta.url),
  'utf8',
)

describe('remover é soft — some da lista e da soma, sem apagar a linha (spec 169 RF12/RF13)', () => {
  test('o repositório de gasto tem remove() e filtra removedAt na listagem', () => {
    expect(COST_REPOSITORY).toInclude('public async remove(')
    expect(COST_REPOSITORY).toInclude('removedAt: new Date()')
    expect(COST_REPOSITORY).toInclude('removedByUserId: input.actorUserId')
    expect(COST_REPOSITORY).toInclude('isNull(tripCostEntries.removedAt)')
  })

  test('o repositório de receita tem remove() e filtra removedAt na listagem', () => {
    expect(REVENUE_REPOSITORY).toInclude('public async remove(')
    expect(REVENUE_REPOSITORY).toInclude('removedAt: new Date()')
    expect(REVENUE_REPOSITORY).toInclude('removedByUserId: input.actorUserId')
    expect(REVENUE_REPOSITORY).toInclude('isNull(tripRevenueEntries.removedAt)')
  })

  /** RF13: remover já removido não é erro — `remove()` só marca quando `removedAt` ainda é nulo. */
  test('remover já removido é idempotente na fonte — o where trava por removedAt nulo', () => {
    expect(COST_REPOSITORY).toInclude('isNull(tripCostEntries.removedAt)')
    expect(REVENUE_REPOSITORY).toInclude('isNull(tripRevenueEntries.removedAt)')
  })
})
