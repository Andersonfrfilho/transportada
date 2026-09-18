/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  TRIP_BATCH_ACTIONS,
  TRIP_DOCUMENT_TRANSITION_ACTIONS,
} from '../../src/modules/trip/shared/trip.types'

const CLIENT_SOURCE = new URL(
  '../../src/modules/trip/shared/tripClient.service.ts',
  import.meta.url,
)

/**
 * Spec 156 T8b, ADR-0067: `deliver`/`return` saíram do lote e da transição individual — o caminho
 * com autoria (`field-delivery`/`field-return`) é o único que resta. Nenhum dos dois `as const`
 * pode voltar a listar essas ações, e o client não pode voltar a montar `/deliver`.
 */
describe('o caminho antigo de entrega/devolução do escritório não volta (T8b.2)', () => {
  test('o lote não aceita mais deliver/return', () => {
    expect(TRIP_BATCH_ACTIONS).toEqual(['load', 'separate'])
  })

  test('a transição individual não aceita mais deliver/return', () => {
    expect(TRIP_DOCUMENT_TRANSITION_ACTIONS).toEqual(['load', 'separate'])
  })

  test('o client não monta a rota /deliver, e só a monta como field-delivery', () => {
    const source = readFileSync(CLIENT_SOURCE, 'utf8')

    expect(source).not.toInclude('/deliver`')
    expect(source).toInclude('/field-delivery`')
    expect(source).toInclude('/field-return`')
    expect(source).not.toInclude('deliverTripDocument')
  })
})
