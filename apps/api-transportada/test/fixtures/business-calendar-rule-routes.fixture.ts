/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MunicipalHolidayRuleRecord } from '../../src/business-calendar/application/municipal-holiday-rule.port.js'
import { createMunicipalHolidayRuleRoutes } from '../../src/business-calendar/presentation/municipal-holiday-rule.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  createHttpHandler,
  RESOLVED_IP,
  RULE_ID,
  recordingUseCase,
  type RecordedCalls,
} from './business-calendar-http.fixture.js'

export const RULE: MunicipalHolidayRuleRecord = {
  cityIbgeCode: '3509502',
  createdAt: new Date('2026-10-07T12:00:00.000Z'),
  day: 14,
  id: RULE_ID,
  kind: 'city_anniversary',
  materializedThroughYear: 2036,
  month: 7,
  name: 'Aniversário de Campinas',
  updatedAt: new Date('2026-10-07T13:00:00.000Z'),
}

export const VALID_RULE_BODY = {
  cityIbgeCode: '3509502',
  day: 14,
  kind: 'city_anniversary',
  month: 7,
  name: 'Aniversário de Campinas',
} as const

export function createRuleRoutesFixture(
  input: {
    readonly created?: boolean
    readonly permissions?: CompanyContext['permissions']
  } = {},
) {
  const calls: RecordedCalls = {}
  const routes = createMunicipalHolidayRuleRoutes({
    create: recordingUseCase(calls, 'create', { created: input.created ?? true, rule: RULE }),
    list: recordingUseCase(calls, 'list', [RULE]),
    materialize: recordingUseCase(calls, 'materialize', { holidaysCreated: 22, rulesProcessed: 2 }),
    remove: recordingUseCase(calls, 'remove', undefined),
    resolveClientIp: () => RESOLVED_IP,
    update: recordingUseCase(calls, 'update', RULE),
  })
  return {
    calls,
    handle: createHttpHandler({
      routes,
      ...(input.permissions === undefined ? {} : { permissions: input.permissions }),
    }),
  }
}
