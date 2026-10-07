/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: as rotas ANTIGAS de `/municipal-holidays` (spec 060 T008) depois da mudança. Mantêm a
 * permissão (`fleet.read` lê, `settings.manage` escreve) e o contrato; ganham a data civil conferida
 * (400), `kind` opcional, `kind` e `generatedByRuleId` na resposta e o `PATCH`.
 */
import { describe, expect, test } from 'bun:test'

import { MunicipalHolidayGeneratedByRuleError } from '../../src/business-calendar/domain/business-calendar-rule.error.js'
import type { MunicipalHoliday } from '../../src/business-calendar/application/municipal-holiday.port.js'
import { createMunicipalHolidayRoutes } from '../../src/business-calendar/presentation/municipal-holiday.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  COMPANY_CONTEXT,
  createHttpHandler,
  HOLIDAY_ID,
  jsonRequest,
  RESOLVED_IP,
  RULE_ID,
  recordingUseCase,
  responseApiError,
  type RecordedCalls,
} from '../fixtures/business-calendar-http.fixture.js'

const PATH = '/municipal-holidays'
const ITEM = `${PATH}/${HOLIDAY_ID}`
const HOLIDAY: MunicipalHoliday = {
  cityIbgeCode: '3551702',
  generatedByRuleId: RULE_ID,
  holidayOn: '2026-06-24',
  id: HOLIDAY_ID,
  kind: 'city_anniversary',
  name: 'Aniversário da cidade',
}
const ACTOR = {
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: 'freight-regions-http-correlation',
  ipAddress: RESOLVED_IP,
  userId: COMPANY_CONTEXT.userId,
}
const FLEET_PERMISSIONS: CompanyContext['permissions'] = new Set(['fleet.read', 'fleet.manage'])

function createFixture(
  input: {
    readonly removeError?: Error
    readonly permissions?: CompanyContext['permissions']
  } = {},
) {
  const calls: RecordedCalls = {}
  const routes = createMunicipalHolidayRoutes({
    list: recordingUseCase(calls, 'list', [HOLIDAY]),
    remove: {
      async execute(call) {
        calls.remove = [...(calls.remove ?? []), structuredClone(call)]
        if (input.removeError !== undefined) throw input.removeError
      },
    },
    resolveClientIp: () => RESOLVED_IP,
    save: recordingUseCase(calls, 'save', HOLIDAY),
    update: recordingUseCase(calls, 'update', HOLIDAY),
  })
  return {
    calls,
    handle: createHttpHandler({
      routes,
      ...(input.permissions === undefined ? {} : { permissions: input.permissions }),
    }),
  }
}

describe('PATCH e DELETE /municipal-holidays (spec 238 T1.3)', () => {
  test('o PATCH muda o nome e o tipo; a data e a cidade não se editam', async () => {
    const { calls, handle } = createFixture()

    expect(
      (
        await handle(
          jsonRequest({ body: { kind: 'holiday', name: 'Novo' }, method: 'PATCH', path: ITEM }),
        )
      ).status,
    ).toBe(200)
    expect(calls.update).toEqual([
      { ...ACTOR, changes: { kind: 'holiday', name: 'Novo' }, id: HOLIDAY_ID },
    ])
    for (const body of [
      {},
      { holidayOn: '2026-07-01' },
      { cityIbgeCode: '3550308' },
      { kind: 'x' },
    ]) {
      expect((await handle(jsonRequest({ body, method: 'PATCH', path: ITEM }))).status).toBe(400)
    }
  })

  test('apagar responde 204, sem corpo', async () => {
    const { calls, handle } = createFixture()

    const response = await handle(jsonRequest({ method: 'DELETE', path: ITEM }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(calls.remove).toEqual([{ ...ACTOR, id: HOLIDAY_ID }])
  })

  test('data gerada por regra não se apaga aqui: 409 com o código que manda editar a regra', async () => {
    const { handle } = createFixture({ removeError: new MunicipalHolidayGeneratedByRuleError() })

    const response = await handle(jsonRequest({ method: 'DELETE', path: ITEM }))

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('MUNICIPAL_HOLIDAY_GENERATED_BY_RULE')
  })

  test('escrever é settings.manage: quem só cuida da frota recebe 403', async () => {
    const { calls, handle } = createFixture({ permissions: FLEET_PERMISSIONS })
    const attempts = [
      jsonRequest({
        body: { cityIbgeCode: '3551702', holidayOn: '2026-06-24', name: 'x' },
        method: 'POST',
        path: PATH,
      }),
      jsonRequest({ body: { name: 'x' }, method: 'PATCH', path: ITEM }),
      jsonRequest({ method: 'DELETE', path: ITEM }),
    ]

    for (const attempt of attempts) expect((await handle(attempt)).status).toBe(403)
    expect(Object.values(calls).flat()).toEqual([])
  })
})
