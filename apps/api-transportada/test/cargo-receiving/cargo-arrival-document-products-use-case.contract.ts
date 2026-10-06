/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2b (ADR-0094 §9): os itens da nota da chegada para o formulário de avaria — a chegada
 * alheia e a nota fora dela são 404 com códigos distintos e estáveis; nota sem item é lista vazia.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ArrivalDocumentProductsResult,
  CargoArrivalDocumentProductsReadPort,
} from '../../src/cargo-receiving/application/cargo-arrival-occurrence.port.js'
import { createListCargoArrivalDocumentProductsUseCase } from '../../src/cargo-receiving/application/read-cargo-arrival-document-products.use-case.js'
import { CONTEXT } from '../fixtures/cargo-arrival-occurrence-use-case.fixture.js'

const PRODUCT = {
  code: 'P1',
  commercialUnit: 'CX',
  description: 'Caixa',
  ordinal: 1,
  quantity: '10.0000',
  totalValue: '100.0000',
  unitValue: '10.0000',
}

function setup(result: ArrivalDocumentProductsResult) {
  const scopes: unknown[] = []
  const reads: CargoArrivalDocumentProductsReadPort = {
    listArrivalDocumentProducts: async (scope) => {
      scopes.push(scope)
      return result
    },
  }
  const useCase = createListCargoArrivalDocumentProductsUseCase({ reads })
  return { execute: useCase.execute, scopes }
}

const INPUT = { arrivalId: 'arrival-1', context: CONTEXT, documentId: 'nfe-1' }

describe('os itens da nota da chegada (spec 237 T3.2b)', () => {
  test('devolve os itens e consulta pela empresa do contexto, nunca por outra', async () => {
    const { execute, scopes } = setup({ outcome: 'found', products: [PRODUCT] })

    expect(await execute(INPUT)).toEqual([PRODUCT])
    expect(scopes).toEqual([
      { arrivalId: 'arrival-1', companyId: CONTEXT.companyId, nfeDocumentId: 'nfe-1' },
    ])
  })

  test('nota sem item é lista vazia, não erro', async () => {
    const { execute } = setup({ outcome: 'found', products: [] })

    expect(await execute(INPUT)).toEqual([])
  })

  test('chegada que não é da empresa é 404 CARGO_ARRIVAL_NOT_FOUND', async () => {
    const { execute } = setup({ outcome: 'arrival-not-found' })

    await expect(execute(INPUT)).rejects.toMatchObject({
      code: 'CARGO_ARRIVAL_NOT_FOUND',
      status: 404,
    })
  })

  test('nota que não é da chegada é 404 CARGO_ARRIVAL_DOCUMENT_NOT_FOUND', async () => {
    const { execute } = setup({ outcome: 'document-not-found' })

    await expect(execute(INPUT)).rejects.toMatchObject({
      code: 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND',
      status: 404,
    })
  })
})
