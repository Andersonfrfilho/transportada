/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { parseTripAllowedActions } from '../../src/modules/trip/shared/tripAllowedActions.validation'

const TRIP = {
  documentIds: ['00000000-0000-4000-8000-000000000d01'],
  stopIds: ['00000000-0000-4000-8000-000000000b01'],
} as const
const [DOCUMENT_ID] = TRIP.documentIds
const [STOP_ID] = TRIP.stopIds

function parse(value: unknown) {
  return parseTripAllowedActions({ trip: TRIP, value })
}

/**
 * Spec 156 D10 (ressalva B4): a lista de ações vem da API, e a tela só a lê. Forma estrita, ids só
 * da própria viagem, e nome de ação desconhecido é ignorado — ele só pode esconder um botão.
 */
describe('GET /trips/:id/allowed-actions no cliente (spec 156 D10, B4)', () => {
  it('lê a lista da API', () => {
    expect(
      parse({
        documents: { [DOCUMENT_ID]: ['fieldDelivery', 'fieldReturn'] },
        stops: { [STOP_ID]: ['arrive'] },
        trip: ['startRoute'],
      }),
    ).toEqual({
      documents: { [DOCUMENT_ID]: ['fieldDelivery', 'fieldReturn'] },
      stops: { [STOP_ID]: ['arrive'] },
      trip: ['startRoute'],
    })
  })

  it('ignora nome de ação desconhecido, sem recusar a lista', () => {
    expect(
      parse({
        documents: { [DOCUMENT_ID]: ['fieldDelivery', 'teleport'] },
        stops: {},
        trip: ['startRoute', 'fly'],
      }),
    ).toEqual({ documents: { [DOCUMENT_ID]: ['fieldDelivery'] }, stops: {}, trip: ['startRoute'] })
  })

  it('recusa nota ou parada que não é da viagem', () => {
    expect(() =>
      parse({ documents: { 'outra-nota': ['fieldDelivery'] }, stops: {}, trip: [] }),
    ).toThrow()
    expect(() =>
      parse({ documents: {}, stops: { 'outra-parada': ['arrive'] }, trip: [] }),
    ).toThrow()
  })

  it('recusa forma errada', () => {
    expect(() => parse({ documents: {}, stops: {} })).toThrow()
    expect(() => parse({ documents: {}, stops: {}, trip: 'startRoute' })).toThrow()
    expect(() => parse({ documents: { [DOCUMENT_ID]: [1] }, stops: {}, trip: [] })).toThrow()
    expect(() => parse({ documents: {}, extra: true, stops: {}, trip: [] })).toThrow()
  })
})
