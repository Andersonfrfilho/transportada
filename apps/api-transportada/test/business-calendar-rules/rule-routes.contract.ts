/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (RF8, CA4): o `POST` da regra "todo ano". Zod `.strict()`, `companyId` só do contexto
 * autenticado, IP pelo resolvedor injetado.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  FORBIDDEN_BODY_KEYS,
  FORGED_IP,
  jsonRequest,
  RESOLVED_IP,
  RULE_ID,
  responseData,
} from '../fixtures/business-calendar-http.fixture.js'
import {
  createRuleRoutesFixture,
  VALID_RULE_BODY,
} from '../fixtures/business-calendar-rule-routes.fixture.js'

const PATH = '/municipal-holiday-rules'

describe('POST /municipal-holiday-rules (spec 238 T1.3, CA4)', () => {
  test('cria a regra com a empresa, o ator e o IP do contexto, nunca do corpo', async () => {
    const { calls, handle } = createRuleRoutesFixture()

    const response = await handle(
      jsonRequest({ body: VALID_RULE_BODY, method: 'POST', path: PATH }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toMatchObject({
      cityIbgeCode: '3509502',
      id: RULE_ID,
      materializedThroughYear: 2036,
    })
    expect(calls.create).toEqual([
      {
        ...VALID_RULE_BODY,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: 'freight-regions-http-correlation',
        ipAddress: RESOLVED_IP,
        userId: COMPANY_CONTEXT.userId,
      },
    ])
  })

  test('a resposta do POST só tem as chaves de sempre: a contagem de digitadas é do PATCH e do GET', async () => {
    const { handle } = createRuleRoutesFixture()

    const response = await handle(
      jsonRequest({ body: VALID_RULE_BODY, method: 'POST', path: PATH }),
    )

    expect(Object.keys((await responseData(response)) as object).sort()).toEqual([
      'cityIbgeCode',
      'createdAt',
      'day',
      'id',
      'kind',
      'materializedThroughYear',
      'month',
      'name',
      'updatedAt',
    ])
  })

  test('o IP vem do resolvedor injetado, não do cabeçalho que o cliente forja', async () => {
    const { calls, handle } = createRuleRoutesFixture()
    const request = jsonRequest({ body: VALID_RULE_BODY, method: 'POST', path: PATH })
    request.headers.set('x-forwarded-for', FORGED_IP)

    await handle(request)

    expect((calls.create?.[0] as { ipAddress: string }).ipAddress).toBe(RESOLVED_IP)
  })

  test('a mesma regra de novo responde 200 com a existente', async () => {
    const { handle } = createRuleRoutesFixture({ created: false })

    const response = await handle(
      jsonRequest({ body: VALID_RULE_BODY, method: 'POST', path: PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ id: RULE_ID })
  })

  test('29/02 todo ano é aceito: existe nos bissextos', async () => {
    const { handle } = createRuleRoutesFixture()

    const response = await handle(
      jsonRequest({ body: { ...VALID_RULE_BODY, day: 29, month: 2 }, method: 'POST', path: PATH }),
    )

    expect(response.status).toBe(201)
  })

  test('recusa com 400, sem chamar o caso de uso, o que não é uma regra', async () => {
    const invalidBodies = [
      { ...VALID_RULE_BODY, day: 31, month: 4 },
      { ...VALID_RULE_BODY, day: 30, month: 2 },
      { ...VALID_RULE_BODY, month: 13 },
      { ...VALID_RULE_BODY, month: 0 },
      { ...VALID_RULE_BODY, day: 0 },
      { ...VALID_RULE_BODY, day: 14.5 },
      { ...VALID_RULE_BODY, month: '7' },
      { ...VALID_RULE_BODY, cityIbgeCode: '9999999' },
      { ...VALID_RULE_BODY, cityIbgeCode: '350950' },
      { ...VALID_RULE_BODY, cityIbgeCode: '35095020' },
      { ...VALID_RULE_BODY, kind: 'feriado' },
      { ...VALID_RULE_BODY, name: '' },
      { ...VALID_RULE_BODY, name: '   ' },
      { ...VALID_RULE_BODY, name: 'x'.repeat(121) },
      { cityIbgeCode: '3509502', month: 7, name: 'Sem dia e sem tipo' },
    ]
    for (const body of invalidBodies) {
      const { calls, handle } = createRuleRoutesFixture()

      const response = await handle(jsonRequest({ body, method: 'POST', path: PATH }))

      expect(response.status).toBe(400)
      expect(calls.create).toEqual([])
    }
  })

  test('campo desconhecido é 400: a empresa e os campos derivados não vêm do corpo', async () => {
    for (const forbidden of FORBIDDEN_BODY_KEYS) {
      const { calls, handle } = createRuleRoutesFixture()

      const response = await handle(
        jsonRequest({ body: { ...VALID_RULE_BODY, ...forbidden }, method: 'POST', path: PATH }),
      )

      expect(response.status).toBe(400)
      expect(calls.create).toEqual([])
    }
  })
})
