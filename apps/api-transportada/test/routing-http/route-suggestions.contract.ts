/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ADDRESS_KEY,
  READ_ONLY_PERMISSIONS,
  SUGGESTION_ID,
  TRIP_ID,
  createRouteSuggestionHttpFixture,
  jsonRequest,
} from '../fixtures/route-suggestion-http.fixture.js'

const SUGGESTIONS_PATH = `/trips/${TRIP_ID}/route-suggestions`
const SUGGESTION_PATH = `${SUGGESTIONS_PATH}/${SUGGESTION_ID}`

async function responseData(response: Response): Promise<Record<string, unknown>> {
  const payload = (await response.json()) as { readonly data: Record<string, unknown> }
  return payload.data
}

describe('route suggestion routes (ADR-0044 §7)', () => {
  /**
   * `202`, não `201`: a sugestão foi **aceita para processamento**, não produzida. O solver roda no
   * worker porque um GA dentro do `Bun.serve` bloqueia o event loop e derruba o resto da API.
   */
  test('answers 202 with a queued suggestion, because the solver runs elsewhere', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: SUGGESTIONS_PATH }))

    expect(response.status).toBe(202)
    expect(await responseData(response)).toMatchObject({ status: 'queued', tripId: TRIP_ID })
  })

  /** Pedir sugestão para uma viagem não precisa de corpo nenhum — a viagem já diz tudo. */
  test('accepts a request with no body at all', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: SUGGESTIONS_PATH }))

    expect(response.status).toBe(202)
    expect(fixture.createCalls[0]).toMatchObject({ tripId: TRIP_ID })
  })

  /** ADR-0044 §8: quem manda a semente reproduz uma sugestão exatamente. */
  test('passes a caller-provided seed through, so a suggestion can be reproduced', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    await fixture.handle(
      jsonRequest({ body: { seed: 4_242 }, method: 'POST', path: SUGGESTIONS_PATH }),
    )

    expect(fixture.createCalls[0]).toMatchObject({ seed: 4_242 })
  })

  test('rejects a solver budget outside the bounds the settings allow', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { solverTimeBudgetSeconds: 9_999 },
        method: 'POST',
        path: SUGGESTIONS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('reads a suggestion back, which is how the screen polls for it', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: SUGGESTION_PATH }))

    expect(response.status).toBe(200)
    expect(fixture.readCalls[0]).toMatchObject({ suggestionId: SUGGESTION_ID, tripId: TRIP_ID })
  })

  test('records both the acceptance and the rejection, which is what measures the feature', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const accepted = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${SUGGESTION_PATH}/accept` }),
    )
    const rejected = await fixture.handle(
      jsonRequest({
        body: { reason: 'o centro trava às 16h' },
        method: 'POST',
        path: `${SUGGESTION_PATH}/reject`,
      }),
    )

    expect(await responseData(accepted)).toMatchObject({ status: 'accepted' })
    expect(await responseData(rejected)).toMatchObject({ status: 'rejected' })
    expect(fixture.rejectCalls[0]).toMatchObject({ reason: 'o centro trava às 16h' })
  })

  /**
   * Ler roteiro é `fleet.read`; **pedir e decidir é `trip.manage`** — a mesma permissão que
   * reordena parada, porque pedir sugestão e aceitá-la são duas metades da mesma decisão.
   */
  test('lets a reader look but never ask, and never decide', async () => {
    const fixture = await createRouteSuggestionHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
    })

    const read = await fixture.handle(jsonRequest({ method: 'GET', path: SUGGESTION_PATH }))
    const created = await fixture.handle(jsonRequest({ method: 'POST', path: SUGGESTIONS_PATH }))
    const accepted = await fixture.handle(
      jsonRequest({ method: 'POST', path: `${SUGGESTION_PATH}/accept` }),
    )

    expect(read.status).toBe(200)
    expect(created.status).toBe(403)
    expect(accepted.status).toBe(403)
  })

  /**
   * `404`, e não `400`: o roteador exige UUID canônico no segmento, então a rota simplesmente não
   * casa — o identificador malformado nunca chega ao caso de uso. É a mesma resposta que as demais
   * rotas de viagem já dão, e mantê-la igual evita que o formato do id vire um oráculo.
   */
  test('refuses a trip id that is not a uuid before reaching the use case', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: '/trips/not-a-uuid/route-suggestions' }),
    )

    expect(response.status).toBe(404)
    expect(fixture.createCalls).toHaveLength(0)
  })
})

describe('geocoded address correction (ADR-0044 §3)', () => {
  /**
   * Fora da árvore `/trips/:id` de propósito: o pino corrigido conserta o endereço para **todas** as
   * viagens, presentes e futuras. Pendurá-lo numa viagem sugeriria um efeito local que ele não tem.
   */
  test('lives outside a trip, because the fix is for every trip', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { latitude: '-23.5613090', longitude: '-46.6564870' },
        method: 'PATCH',
        path: `/geocoded-addresses/${encodeURIComponent(ADDRESS_KEY)}`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.correctCalls[0]).toMatchObject({ addressKey: ADDRESS_KEY })
  })

  /** Quem arrastou o pino apontou um telhado: a correção nasce `manual` e `rooftop`. */
  test('stores the correction as a rooftop from a human, which always wins the cascade', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { latitude: '-23.5613090', longitude: '-46.6564870' },
        method: 'PATCH',
        path: `/geocoded-addresses/${encodeURIComponent(ADDRESS_KEY)}`,
      }),
    )

    expect(await responseData(response)).toMatchObject({ precision: 'rooftop', source: 'manual' })
  })

  test('refuses a coordinate outside the globe', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { latitude: '-91.0000000', longitude: '-46.6564870' },
        method: 'PATCH',
        path: `/geocoded-addresses/${encodeURIComponent(ADDRESS_KEY)}`,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.correctCalls).toHaveLength(0)
  })

  /** Chave malformada não vira consulta ao banco: ela não tem a forma de endereço nenhum. */
  test('refuses an address key that is not one, before touching the database', async () => {
    const fixture = await createRouteSuggestionHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { latitude: '-23.5613090', longitude: '-46.6564870' },
        method: 'PATCH',
        path: '/geocoded-addresses/whatever',
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.correctCalls).toHaveLength(0)
  })
})
