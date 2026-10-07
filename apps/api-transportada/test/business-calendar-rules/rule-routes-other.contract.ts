/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (RF8): `PATCH`, `DELETE`, `GET` e a geração dos próximos anos da regra; e quem
 * alcança as cinco rotas (`settings.manage`, nada de `fleet.read`).
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  FLEET_ONLY_PERMISSIONS,
  jsonRequest,
  RESOLVED_IP,
  RULE_ID,
  responseApiError,
  responseData,
} from '../fixtures/business-calendar-http.fixture.js'
import {
  createRuleRoutesFixture,
  VALID_RULE_BODY,
} from '../fixtures/business-calendar-rule-routes.fixture.js'

const PATH = '/municipal-holiday-rules'
const RULE_PATH = `${PATH}/${RULE_ID}`
const ACTOR = {
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: 'freight-regions-http-correlation',
  ipAddress: RESOLVED_IP,
  userId: COMPANY_CONTEXT.userId,
}

describe('PATCH, DELETE, GET e geração dos próximos anos (spec 238 T1.3)', () => {
  test('edita campos soltos; a cidade não se edita e o corpo vazio é recusado', async () => {
    const { calls, handle } = createRuleRoutesFixture()

    expect(
      (await handle(jsonRequest({ body: { name: 'Novo' }, method: 'PATCH', path: RULE_PATH })))
        .status,
    ).toBe(200)
    expect(calls.update).toEqual([{ ...ACTOR, changes: { name: 'Novo' }, id: RULE_ID }])

    for (const body of [{}, { cityIbgeCode: '3550308' }, { month: 13 }, { day: 31, month: 4 }]) {
      expect((await handle(jsonRequest({ body, method: 'PATCH', path: RULE_PATH }))).status).toBe(
        400,
      )
    }
    expect(calls.update).toHaveLength(1)
  })

  test('identificador que não é UUID canônico nem chega à rota: 404', async () => {
    const { calls, handle } = createRuleRoutesFixture()

    const patch = jsonRequest({ body: { name: 'x' }, method: 'PATCH', path: `${PATH}/1` })
    expect((await handle(patch)).status).toBe(404)
    expect((await handle(jsonRequest({ method: 'DELETE', path: `${PATH}/1` }))).status).toBe(404)
    expect(Object.values(calls).flat()).toEqual([])
  })

  test('apagar responde 204 sem corpo', async () => {
    const { calls, handle } = createRuleRoutesFixture()

    const response = await handle(jsonRequest({ method: 'DELETE', path: RULE_PATH }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(calls.remove).toEqual([{ ...ACTOR, id: RULE_ID }])
  })

  test('lista com o ano até onde cada regra foi gerada, filtrando pela cidade', async () => {
    const { calls, handle } = createRuleRoutesFixture()

    const response = await handle(
      jsonRequest({ method: 'GET', path: `${PATH}?cityIbgeCode=3509502` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([
      {
        cityIbgeCode: '3509502',
        createdAt: '2026-10-07T12:00:00.000Z',
        day: 14,
        id: RULE_ID,
        kind: 'city_anniversary',
        materializedThroughYear: 2036,
        month: 7,
        name: 'Aniversário de Campinas',
        updatedAt: '2026-10-07T13:00:00.000Z',
      },
    ])
    expect(calls.list).toEqual([{ cityIbgeCode: '3509502', companyId: COMPANY_CONTEXT.companyId }])
  })

  test('a listagem recusa filtro desconhecido, repetido e cidade que não existe', async () => {
    const { handle } = createRuleRoutesFixture()

    for (const query of [
      '?companyId=22222222-2222-4222-8222-222222222222',
      '?cityIbgeCode=9999999',
      '?cityIbgeCode=3509502&cityIbgeCode=3550308',
    ]) {
      expect((await handle(jsonRequest({ method: 'GET', path: `${PATH}${query}` }))).status).toBe(
        400,
      )
    }
  })

  test('gerar os próximos anos completa o horizonte de todas as regras da empresa', async () => {
    const { calls, handle } = createRuleRoutesFixture()

    const response = await handle(jsonRequest({ method: 'POST', path: `${PATH}/materializations` }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({ holidaysCreated: 22, rulesProcessed: 2 })
    expect(calls.materialize).toEqual([ACTOR])
  })
})

describe('quem alcança as rotas da regra (spec 238 T1.3)', () => {
  test('sem settings.manage, nenhuma delas: leitura e escrita dão 403', async () => {
    const { calls, handle } = createRuleRoutesFixture({ permissions: FLEET_ONLY_PERMISSIONS })
    const attempts = [
      jsonRequest({ method: 'GET', path: PATH }),
      jsonRequest({ body: VALID_RULE_BODY, method: 'POST', path: PATH }),
      jsonRequest({ body: { name: 'x' }, method: 'PATCH', path: RULE_PATH }),
      jsonRequest({ method: 'DELETE', path: RULE_PATH }),
      jsonRequest({ method: 'POST', path: `${PATH}/materializations` }),
    ]

    for (const attempt of attempts) {
      const response = await handle(attempt)

      expect(response.status).toBe(403)
      expect((await responseApiError(response)).code).toBe('FORBIDDEN')
    }
    expect(Object.values(calls).flat()).toEqual([])
  })
})
