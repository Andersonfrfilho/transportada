/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { RoutingMatrixUnavailableError } from '../../src/routing/domain/routing-matrix.error.js'

const CODE = 'ROUTING_MATRIX_UNAVAILABLE'

describe('erro de matriz de estrada indisponível', () => {
  test('carrega o código, que é como o handler o reconhece', () => {
    expect(new RoutingMatrixUnavailableError().message).toBe(CODE)
  })

  test('anexa o contexto quando ele serializa', () => {
    const error = new RoutingMatrixUnavailableError({ status: 503 })

    expect(error.message).toBe(`${CODE} {"status":503}`)
  })

  /**
   * O contexto é diagnóstico, e diagnóstico não pode derrubar o erro que descreve: sem isto o
   * construtor lançaria `TypeError` e a causa real — a matriz fora do ar — sumiria do rastro.
   */
  test('não lança com BigInt no contexto', () => {
    const error = new RoutingMatrixUnavailableError({ elapsed: 12n })

    expect(error.message).toBe(`${CODE} {"elapsed":"12"}`)
  })

  test('não lança com referência circular no contexto', () => {
    const context: Record<string, unknown> = { status: 503 }
    context.self = context

    const error = new RoutingMatrixUnavailableError(context)

    expect(error.message).toBe(`${CODE} [context not serializable]`)
    expect(error).toBeInstanceOf(RoutingMatrixUnavailableError)
  })
})
