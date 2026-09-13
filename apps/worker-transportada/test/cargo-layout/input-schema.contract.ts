/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { z } from 'zod'

import {
  storedCargoLayoutInputSchema,
  type StoredCargoLayoutInput,
} from '../../src/cargo-layout/application/stored-cargo-layout-input.schema.js'
import { buildStoredCargoLayoutInput } from '../fixtures/cargo-layout-input.fixture.js'

/** Paridade nos dois sentidos, em tempo de compilação: o schema não aceita menos nem mais que o tipo. */
const outputIsStored: StoredCargoLayoutInput = {} as z.output<typeof storedCargoLayoutInputSchema>
const storedIsOutput: z.output<typeof storedCargoLayoutInputSchema> = {} as StoredCargoLayoutInput

describe('entrada guardada da planta (spec 145 D5 — o jsonb é fronteira)', () => {
  test('aceita a entrada que a API grava, com rótulo, cliente e nota', () => {
    const input = buildStoredCargoLayoutInput({ stopCount: 2 })

    expect(storedCargoLayoutInputSchema.parse(JSON.parse(JSON.stringify(input)))).toEqual(input)
    expect([outputIsStored, storedIsOutput]).toHaveLength(2)
  })

  test('recusa campo desconhecido na raiz, na parada e na caixa', () => {
    const input = buildStoredCargoLayoutInput({ stopCount: 1 })
    const [stop] = input.stops
    const [box] = stop?.boxes ?? []

    expect(storedCargoLayoutInputSchema.safeParse({ ...input, companyId: 'x' }).success).toBe(false)
    expect(
      storedCargoLayoutInputSchema.safeParse({ ...input, stops: [{ ...stop, phone: '11' }] })
        .success,
    ).toBe(false)
    expect(
      storedCargoLayoutInputSchema.safeParse({
        ...input,
        stops: [{ ...stop, boxes: [{ ...box, weightKg: 3 }] }],
      }).success,
    ).toBe(false)
  })

  test('recusa forma quebrada: acesso desconhecido, sem policyVersion, dimensão em texto', () => {
    const input = buildStoredCargoLayoutInput({ stopCount: 1 })
    const withoutVersion = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== 'policyVersion'),
    )
    const [stop] = input.stops
    const [box] = stop?.boxes ?? []

    expect(
      storedCargoLayoutInputSchema.safeParse({ ...input, loadingAccess: 'roof' }).success,
    ).toBe(false)
    expect(storedCargoLayoutInputSchema.safeParse(withoutVersion).success).toBe(false)
    expect(
      storedCargoLayoutInputSchema.safeParse({
        ...input,
        stops: [{ ...stop, boxes: [{ ...box, heightMm: '300' }] }],
      }).success,
    ).toBe(false)
    expect(storedCargoLayoutInputSchema.safeParse(null).success).toBe(false)
  })
})
