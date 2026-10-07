/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (RF4, RF8, CA4): o feriado estadual, em data fixa (`once`) ou todo ano (`yearly`). Cada
 * ramo da união é `.strict()`; `settings.manage` para ler e escrever.
 */
import { describe, expect, test } from 'bun:test'

import type { StateHolidayRecord } from '../../src/business-calendar/application/state-holiday.port.js'
import { createStateHolidayRoutes } from '../../src/business-calendar/presentation/state-holiday.routes.js'
import {
  COMPANY_CONTEXT,
  createHttpHandler,
  FLEET_ONLY_PERMISSIONS,
  jsonRequest,
  RESOLVED_IP,
  recordingUseCase,
  responseApiError,
  responseData,
  STATE_HOLIDAY_ID,
  type RecordedCalls,
} from '../fixtures/business-calendar-http.fixture.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'

const PATH = '/state-holidays'
const UPDATED_AT = new Date('2026-10-07T13:00:00.000Z')
const ONCE: StateHolidayRecord = {
  holidayOn: '2026-07-09',
  id: STATE_HOLIDAY_ID,
  name: 'Revolução Constitucionalista',
  recurrence: 'once',
  stateIbgeCode: '35',
  updatedAt: UPDATED_AT,
}
const YEARLY: StateHolidayRecord = {
  day: 9,
  id: STATE_HOLIDAY_ID,
  month: 7,
  name: 'Revolução Constitucionalista',
  recurrence: 'yearly',
  stateIbgeCode: '35',
  updatedAt: UPDATED_AT,
}
const ONCE_BODY = {
  holidayOn: '2026-07-09',
  name: 'Revolução Constitucionalista',
  recurrence: 'once',
  stateIbgeCode: '35',
} as const

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: RecordedCalls = {}
  const routes = createStateHolidayRoutes({
    create: recordingUseCase(calls, 'create', ONCE),
    list: recordingUseCase(calls, 'list', [ONCE, YEARLY]),
    remove: recordingUseCase(calls, 'remove', undefined),
    resolveClientIp: () => RESOLVED_IP,
    update: recordingUseCase(calls, 'update', YEARLY),
  })
  return {
    calls,
    handle: createHttpHandler({ routes, ...(permissions === undefined ? {} : { permissions }) }),
  }
}

describe('o feriado estadual: edição, leitura e permissão (spec 238 T1.3)', () => {
  test('edita dentro da forma e recusa corpo sem nenhuma mudança', async () => {
    const { calls, handle } = createFixture()
    const path = `${PATH}/${STATE_HOLIDAY_ID}`

    const response = await handle(
      jsonRequest({ body: { name: 'Novo', recurrence: 'yearly' }, method: 'PATCH', path }),
    )

    expect(response.status).toBe(200)
    expect(calls.update).toEqual([
      {
        changes: { name: 'Novo', recurrence: 'yearly' },
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: 'freight-regions-http-correlation',
        id: STATE_HOLIDAY_ID,
        ipAddress: RESOLVED_IP,
        userId: COMPANY_CONTEXT.userId,
      },
    ])
    for (const body of [
      { recurrence: 'once' },
      { name: 'Sem forma' },
      { holidayOn: '2026-07-09', recurrence: 'yearly' },
      { month: 7, recurrence: 'once' },
      { holidayOn: '2026-02-30', recurrence: 'once' },
      { recurrence: 'once', stateIbgeCode: '33' },
    ]) {
      expect((await handle(jsonRequest({ body, method: 'PATCH', path }))).status).toBe(400)
    }
    expect(calls.update).toHaveLength(1)
  })

  test('apaga com 204 e lista pela UF; filtro desconhecido é 400', async () => {
    const { calls, handle } = createFixture()

    expect(
      (await handle(jsonRequest({ method: 'DELETE', path: `${PATH}/${STATE_HOLIDAY_ID}` }))).status,
    ).toBe(204)
    const response = await handle(jsonRequest({ method: 'GET', path: `${PATH}?stateIbgeCode=35` }))
    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([
      {
        holidayOn: '2026-07-09',
        id: STATE_HOLIDAY_ID,
        name: 'Revolução Constitucionalista',
        recurrence: 'once',
        stateIbgeCode: '35',
        updatedAt: '2026-10-07T13:00:00.000Z',
      },
      {
        day: 9,
        id: STATE_HOLIDAY_ID,
        month: 7,
        name: 'Revolução Constitucionalista',
        recurrence: 'yearly',
        stateIbgeCode: '35',
        updatedAt: '2026-10-07T13:00:00.000Z',
      },
    ])
    expect(calls.list).toEqual([{ companyId: COMPANY_CONTEXT.companyId, stateIbgeCode: '35' }])
    for (const query of ['?companyId=x', '?stateIbgeCode=99']) {
      expect((await handle(jsonRequest({ method: 'GET', path: `${PATH}${query}` }))).status).toBe(
        400,
      )
    }
  })

  test('sem settings.manage, nenhuma das quatro: 403', async () => {
    const { calls, handle } = createFixture(FLEET_ONLY_PERMISSIONS)
    const path = `${PATH}/${STATE_HOLIDAY_ID}`

    for (const attempt of [
      jsonRequest({ method: 'GET', path: PATH }),
      jsonRequest({ body: ONCE_BODY, method: 'POST', path: PATH }),
      jsonRequest({ body: { name: 'x', recurrence: 'once' }, method: 'PATCH', path }),
      jsonRequest({ method: 'DELETE', path }),
    ]) {
      const response = await handle(attempt)

      expect(response.status).toBe(403)
      expect((await responseApiError(response)).code).toBe('FORBIDDEN')
    }
    expect(Object.values(calls).flat()).toEqual([])
  })
})
