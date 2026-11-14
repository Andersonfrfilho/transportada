/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T5.3 (RF16): trocar o grupo de custo de uma categoria. O pagamento de motorista é `in_trip` e só ele;
 * as demais categorias escolhem entre os três grupos rateáveis; o que muda vai para o diário e nunca vaza entre empresas.
 */
import { describe, expect, it } from 'bun:test'

import { createSetExpenseCategoryCostGroupUseCase } from '../../src/expenses/application/expense.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  buildInMemoryExpenses,
  CATEGORY_DRIVER_ID,
  CATEGORY_RENT_ID,
  COMPANY_A,
  COMPANY_B,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

function setup() {
  const ports = buildInMemoryExpenses()
  return { ports, useCase: createSetExpenseCategoryCostGroupUseCase(ports) }
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return error instanceof ApiError ? error.code : 'unexpected'
  }
}

describe('grupo de custo da categoria (spec 325 T5.3)', () => {
  it('troca o grupo de uma categoria comum e grava o diário com o antes e o depois', async () => {
    const { ports, useCase } = setup()

    const updated = await useCase.execute({
      categoryId: CATEGORY_RENT_ID,
      companyId: COMPANY_A,
      costGroup: 'vehicle_fixed',
      updatedBy: USER_ID,
    })

    expect(updated.costGroup).toBe('vehicle_fixed')
    expect(ports.auditRows.at(-1)).toMatchObject({
      action: 'expense.category.cost_group_changed',
      entityId: CATEGORY_RENT_ID,
      metadata: { from: 'administrative', name: 'Aluguel', to: 'vehicle_fixed' },
    })
  })

  it('categoria comum não entra no grupo da viagem', async () => {
    const { useCase } = setup()

    expect(
      await codeOf(
        useCase.execute({
          categoryId: CATEGORY_RENT_ID,
          companyId: COMPANY_A,
          costGroup: 'in_trip',
          updatedBy: USER_ID,
        }),
      ),
    ).toBe('EXPENSE_CATEGORY_COST_GROUP_INVALID')
  })

  it('o pagamento de motorista continua no grupo da viagem e só nele', async () => {
    const { useCase } = setup()

    expect(
      await codeOf(
        useCase.execute({
          categoryId: CATEGORY_DRIVER_ID,
          companyId: COMPANY_A,
          costGroup: 'per_km',
          updatedBy: USER_ID,
        }),
      ),
    ).toBe('EXPENSE_CATEGORY_COST_GROUP_INVALID')
  })

  it('categoria de outra empresa responde não encontrada', async () => {
    const { useCase } = setup()

    expect(
      await codeOf(
        useCase.execute({
          categoryId: CATEGORY_RENT_ID,
          companyId: COMPANY_B,
          costGroup: 'per_km',
          updatedBy: USER_ID,
        }),
      ),
    ).toBe('EXPENSE_CATEGORY_NOT_FOUND')
  })
})
