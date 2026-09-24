/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { TRIP_DETAIL } from './trip.fixture'

const adapters = createTripResponseAdapters()

function acceptsDetail(data: unknown): boolean {
  try {
    adapters.tripDetailFromApi(data)
    return true
  } catch {
    return false
  }
}

function withoutCloseFields(): Record<string, unknown> {
  const detail: Record<string, unknown> = { ...TRIP_DETAIL }
  Reflect.deleteProperty(detail, 'closeReason')
  Reflect.deleteProperty(detail, 'closedAt')
  Reflect.deleteProperty(detail, 'closedByName')
  return detail
}

/**
 * Spec 156 T8d: `closeReason`/`closedAt`/`closedByName` nascem opcionais (spec 078 D2) — bundle
 * novo com API antiga não pode reprovar o detalhe inteiro por eles faltarem. Presente com forma
 * errada continua reprovando (o mesmo `hasKeys`/`isNullableString` das outras chaves opcionais).
 */
describe('o validador do detalhe aceita a chave nova e recusa tipo errado (spec 156 T8d)', () => {
  it('aceita o detalhe sem as três chaves (API anterior a esta task)', () => {
    expect(acceptsDetail(withoutCloseFields())).toBe(true)
  })

  it('aceita os três nulos (viagem concluída pela derivação automática)', () => {
    expect(
      acceptsDetail({
        ...TRIP_DETAIL,
        closeReason: null,
        closedAt: null,
        closedByName: null,
      }),
    ).toBe(true)
  })

  it('aceita os três preenchidos (encerramento manual)', () => {
    expect(
      acceptsDetail({
        ...TRIP_DETAIL,
        closeReason: 'Canhotos recebidos no escritório',
        closedAt: '2026-09-20T18:00:00.000Z',
        closedByName: 'Encerradora do Escritório',
      }),
    ).toBe(true)
  })

  it('aceita closedByName nulo com closedAt preenchido (pessoa removida)', () => {
    expect(
      acceptsDetail({
        ...TRIP_DETAIL,
        closeReason: null,
        closedAt: '2026-09-20T18:00:00.000Z',
        closedByName: null,
      }),
    ).toBe(true)
  })

  it('recusa closeReason numérico', () => {
    expect(acceptsDetail({ ...TRIP_DETAIL, closeReason: 42 })).toBe(false)
  })

  it('recusa closedAt numérico', () => {
    expect(acceptsDetail({ ...TRIP_DETAIL, closedAt: 42 })).toBe(false)
  })

  it('recusa closedByName numérico', () => {
    expect(acceptsDetail({ ...TRIP_DETAIL, closedByName: 42 })).toBe(false)
  })
})
