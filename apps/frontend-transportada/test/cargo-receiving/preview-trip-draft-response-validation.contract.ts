/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.2: a guarda dos rascunhos de viagem confere as chaves EXATAS em cada nível, no formato real de
 * `GET /cargo-previews/:id/trip-drafts` (`security.md` §3: resposta de API é entrada não confiável).
 */
import { describe, expect, test } from 'bun:test'

import { toTripDrafts } from '@/modules/cargo-receiving/shared/cargoPreviewResponse.validation'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { DEFAULT_TRIP_DRAFTS } from '../fixtures/cargoPreviewTripDraft.fixture'

function isInvalid(call: () => unknown): boolean {
  try {
    call()
    return false
  } catch (error) {
    return error instanceof CargoReceivingRequestError && error.message === 'RESPONSE_INVALID'
  }
}

type Json = Record<string, unknown>

function clone(): Json {
  return structuredClone(DEFAULT_TRIP_DRAFTS) as unknown as Json
}

function route(drafts: Json, index: number): Json {
  return (drafts.routes as Json[])[index] as Json
}

function without(value: Json, key: string): Json {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
}

const wrap = (data: unknown) => ({ data })

describe('os rascunhos de viagem da prévia (resposta da API)', () => {
  test('aceita o formato real, com o grupo "sem roteiro" e a carga ainda sem par', () => {
    const drafts = toTripDrafts(wrap(clone()))

    expect(drafts.routes.map((entry) => entry.routeName)).toEqual([
      'FR.FRANC',
      'FR.MATAO',
      'FR.R.PRE',
      'FR.S.CAR',
      null,
    ])
    expect(drafts.routableDocumentIds).toHaveLength(4)
  })

  test('recusa a resposta sem o envelope `data`', () => {
    expect(isInvalid(() => toTripDrafts(clone()))).toBe(true)
    expect(isInvalid(() => toTripDrafts(wrap(null)))).toBe(true)
  })

  test.each(['routableDocumentIds', 'summary', 'routes', 'status', 'plannedDate'])(
    'recusa a resposta sem a chave `%s`',
    (key) => {
      expect(isInvalid(() => toTripDrafts(wrap(without(clone(), key))))).toBe(true)
    },
  )

  test('recusa chave a mais no topo, no resumo, no roteiro, na nota, na cidade e nos totais', () => {
    const top = { ...clone(), extra: 1 }
    const summary = clone()
    summary.summary = { ...(summary.summary as Json), extra: 1 }
    const inRoute = clone()
    inRoute.routes = [{ ...route(inRoute, 3), extra: 1 }]
    const inDocument = clone()
    const documentRoute = route(inDocument, 3)
    documentRoute.documents = [{ ...(documentRoute.documents as Json[])[0], extra: 1 }]
    inDocument.routes = [documentRoute]
    const inCity = clone()
    const cityRoute = route(inCity, 3)
    cityRoute.cities = [{ ...(cityRoute.cities as Json[])[0], extra: 1 }]
    inCity.routes = [cityRoute]
    const inTotals = clone()
    const totalsRoute = route(inTotals, 3)
    totalsRoute.totals = { ...(totalsRoute.totals as Json), extra: 1 }
    inTotals.routes = [totalsRoute]

    for (const candidate of [top, summary, inRoute, inDocument, inCity, inTotals]) {
      expect(isInvalid(() => toTripDrafts(wrap(candidate)))).toBe(true)
    }
  })

  test('recusa chave a menos numa nota, numa cidade e nas contagens', () => {
    const noDocumentKey = clone()
    const documentRoute = route(noDocumentKey, 3)
    documentRoute.documents = [
      without((documentRoute.documents as Json[])[0] as Json, 'isRoutable'),
    ]
    noDocumentKey.routes = [documentRoute]
    const noCityKey = clone()
    const cityRoute = route(noCityKey, 3)
    cityRoute.cities = [without((cityRoute.cities as Json[])[0] as Json, 'pendingLineCount')]
    noCityKey.routes = [cityRoute]
    const noCountKey = clone()
    const countRoute = route(noCountKey, 3)
    countRoute.counts = without(countRoute.counts as Json, 'suggested')
    noCountKey.routes = [countRoute]

    for (const candidate of [noDocumentKey, noCityKey, noCountKey]) {
      expect(isInvalid(() => toTripDrafts(wrap(candidate)))).toBe(true)
    }
  })

  test('recusa valor fora da lista: situação da prévia, origem da carga e motivo de recusa', () => {
    const status = { ...clone(), status: 'done' }
    const origin = clone()
    origin.routes = [{ ...route(origin, 3), loadOrigin: 'guess' }]
    const reason = clone()
    reason.routes = [{ ...route(reason, 0), cannotProposeReason: 'because' }]

    for (const candidate of [status, origin, reason]) {
      expect(isInvalid(() => toTripDrafts(wrap(candidate)))).toBe(true)
    }
  })

  test('recusa tipo errado: contagem fracionária, ids que não são texto e booleano em texto', () => {
    const fractional = clone()
    fractional.routes = [{ ...route(fractional, 0), missingCount: 1.5 }]
    const ids = { ...clone(), routableDocumentIds: [1, 2] }
    const boolean = clone()
    const booleanRoute = route(boolean, 3)
    booleanRoute.canPropose = 'yes'
    boolean.routes = [booleanRoute]

    for (const candidate of [fractional, ids, boolean]) {
      expect(isInvalid(() => toTripDrafts(wrap(candidate)))).toBe(true)
    }
  })

  test('aceita os nulos que a API devolve: volume ausente, peso da nota sem volume e cidade sem nome', () => {
    const drafts = clone()
    const target = route(drafts, 3)
    target.totals = { ...(target.totals as Json), volumeM3: null }
    target.documents = [
      { ...(target.documents as Json[])[0], cityIbgeCode: null, cityName: null, weightKg: null },
    ]
    target.cities = [{ cityIbgeCode: null, cityName: null, documentCount: 1, pendingLineCount: 0 }]
    drafts.routes = [target]

    expect(() => toTripDrafts(wrap(drafts))).not.toThrow()
  })
})
