/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3 (RF5, RF8): se o sábado conta como dia útil. Sem linha é resposta válida (`false`,
 * origem `default`), nunca 404; `settings.manage` para ler e escrever.
 */
import { describe, expect, test } from 'bun:test'

import type { BusinessCalendarSettingsRecord } from '../../src/business-calendar/application/business-calendar-settings.port.js'
import { createBusinessCalendarSettingsRoutes } from '../../src/business-calendar/presentation/business-calendar-settings.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  COMPANY_CONTEXT,
  createHttpHandler,
  FLEET_ONLY_PERMISSIONS,
  FORGED_IP,
  jsonRequest,
  OTHER_COMPANY_ID,
  RESOLVED_IP,
  recordingUseCase,
  responseApiError,
  responseData,
  type RecordedCalls,
} from '../fixtures/business-calendar-http.fixture.js'

const PATH = '/company-settings/business-calendar'
const STORED: BusinessCalendarSettingsRecord = {
  saturdayIsBusinessDay: true,
  updatedAt: new Date('2026-10-07T13:00:00.000Z'),
}

function createFixture(input: {
  readonly permissions?: CompanyContext['permissions']
  readonly stored?: BusinessCalendarSettingsRecord | null
}) {
  const calls: RecordedCalls = {}
  const routes = createBusinessCalendarSettingsRoutes({
    get: recordingUseCase(calls, 'get', input.stored ?? null),
    resolveClientIp: () => RESOLVED_IP,
    save: recordingUseCase(calls, 'save', STORED),
  })
  return {
    calls,
    handle: createHttpHandler({
      routes,
      ...(input.permissions === undefined ? {} : { permissions: input.permissions }),
    }),
  }
}

describe('GET/PUT /company-settings/business-calendar (spec 238 T1.3)', () => {
  test('sem linha, o padrão da empresa é segunda a sexta, com origem default', async () => {
    const { calls, handle } = createFixture({})

    const response = await handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({
      origin: 'default',
      saturdayIsBusinessDay: false,
      updatedAt: null,
    })
    expect(calls.get).toEqual([{ companyId: COMPANY_CONTEXT.companyId }])
  })

  test('com linha, a escolha da empresa e quando foi feita; nada além disso', async () => {
    const { handle } = createFixture({
      stored: { ...STORED, updatedByUserId: 'x', companyId: 'y' } as never,
    })

    const response = await handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(await responseData(response)).toEqual({
      origin: 'company',
      saturdayIsBusinessDay: true,
      updatedAt: '2026-10-07T13:00:00.000Z',
    })
  })

  test('grava a escolha com a empresa, o ator e o IP do contexto', async () => {
    const { calls, handle } = createFixture({})
    const request = jsonRequest({
      body: { saturdayIsBusinessDay: true },
      method: 'PUT',
      path: PATH,
    })
    request.headers.set('x-forwarded-for', FORGED_IP)

    const response = await handle(request)

    expect(response.status).toBe(200)
    expect(calls.save).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: 'freight-regions-http-correlation',
        ipAddress: RESOLVED_IP,
        saturdayIsBusinessDay: true,
        userId: COMPANY_CONTEXT.userId,
      },
    ])
  })

  test('recusa o que não é booleano, o que falta e qualquer campo a mais com 400', async () => {
    const { calls, handle } = createFixture({})
    const bodies = [
      { saturdayIsBusinessDay: 'true' },
      { saturdayIsBusinessDay: 1 },
      { saturdayIsBusinessDay: null },
      {},
      { companyId: OTHER_COMPANY_ID, saturdayIsBusinessDay: true },
      { saturdayIsBusinessDay: true, updatedByUserId: COMPANY_CONTEXT.userId },
    ]

    for (const body of bodies) {
      expect((await handle(jsonRequest({ body, method: 'PUT', path: PATH }))).status).toBe(400)
    }
    expect(calls.save).toEqual([])
  })

  test('sem settings.manage, leitura e escrita dão 403', async () => {
    const { calls, handle } = createFixture({ permissions: FLEET_ONLY_PERMISSIONS })

    for (const attempt of [
      jsonRequest({ method: 'GET', path: PATH }),
      jsonRequest({ body: { saturdayIsBusinessDay: true }, method: 'PUT', path: PATH }),
    ]) {
      const response = await handle(attempt)

      expect(response.status).toBe(403)
      expect((await responseApiError(response)).code).toBe('FORBIDDEN')
    }
    expect(Object.values(calls).flat()).toEqual([])
  })
})
