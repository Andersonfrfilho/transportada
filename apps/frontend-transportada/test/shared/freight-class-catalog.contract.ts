/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { FREIGHT_VEHICLE_CLASSES } from '@/modules/shared/freightClass.constant'

/**
 * O bundle não carrega código da API: a lista é reescrita aqui, e o que garante que as duas dizem a
 * mesma coisa é esta asserção — a mesma disciplina de `fuel-catalog.contract.ts`. A ordem é a das
 * colunas da tabela de frete do cliente, do veículo mais leve ao mais pesado.
 */
const CATALOG = ['utility', 'van', 'vuc', 'three_quarter', 'toco', 'truck'] as const

describe('frontend freight class catalog', () => {
  test('matches the API catalog, in the same order', () => {
    expect(FREIGHT_VEHICLE_CLASSES).toEqual(CATALOG)
  })
})
