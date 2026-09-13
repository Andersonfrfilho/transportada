/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { jsonRequest } from '../fixtures/fleet-http-payload.fixture.js'
import {
  createPendingItemsHttpFixture,
  PENDING_ITEM_PAGE,
} from '../fixtures/pending-items-http.fixture.js'

const PENDING_ITEMS_PATH = '/pending-items'

describe('pending items route contract', () => {
  test('serves the pending item page with the repo envelope', async () => {
    const fixture = await createPendingItemsHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PENDING_ITEMS_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: PENDING_ITEM_PAGE.items,
      page: { nextCursor: null },
    })
    expect(fixture.listCalls).toHaveLength(1)
    expect(fixture.listCalls[0]).toMatchObject({ cursor: null, limit: 25 })
  })

  /** `readPaging` já recusa acima de 100 — a rota não reimplementa o teto. */
  test('rejects a limit above 100 with 400', async () => {
    const fixture = await createPendingItemsHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${PENDING_ITEMS_PATH}?limit=101` }),
    )

    expect(response.status).toBe(400)
    expect(fixture.listCalls).toEqual([])
  })

  /**
   * ⚠️ Decisão registrada (T14): a infraestrutura de rotas não tem política de "qualquer membro
   * autenticado" — toda rota exige uma `RouteAuthorizationPolicy`. Com uma fonte só, e ela sendo a
   * única que hoje existe, a rota usa `fleet.read` (a mesma permissão da fonte), e quem não a tem
   * recebe `403` aqui, na borda — não a lista vazia que a T-domain prova no caso de uso. A filtragem
   * por fonte (D2) vale para quem passa da rota e tem a permissão da rota mas não a de uma fonte
   * futura diferente; hoje, com uma fonte só, os dois coincidem.
   */
  test('rejects a caller without fleet.read with 403, at the route', async () => {
    const fixture = await createPendingItemsHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PENDING_ITEMS_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.listCalls).toEqual([])
  })
})
