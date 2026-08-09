/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A tela de notas e a de configurações leem o mesmo estado por rotas diferentes.
 * Divergir o corpo faria a aba "Remota" contar uma história e a configuração
 * outra sobre a mesma empresa.
 */
import { describe, expect, test } from 'bun:test'

import type { ScheduledDistributionStatus } from '../../src/companies/application/get-scheduled-distribution-status.use-case.js'
import { createScheduledDistributionRoutes } from '../../src/companies/presentation/scheduled-distribution.routes.js'
import { createNfeImportRoutes } from '../../src/nfe-imports/presentation/nfe-imports.routes.js'
import {
  API_COMPANY_SETTINGS_SCHEDULED_DISTRIBUTION_PATH,
  API_NFE_IMPORTS_DISTRIBUTION_PATH,
} from '../../src/shared/api.constant.js'
import { COMPANY_CONTEXT, COMPANY_ID } from '../fixtures/nfe-import-application.fixture'
import { DISTRIBUTION_STATUS } from '../fixtures/nfe-http-payload.fixture'

const STATUS: ScheduledDistributionStatus = {
  certificateExpiresAt: '2027-01-31T23:59:59.000Z',
  companyId: COMPANY_ID,
  eligible: false,
  enabled: true,
  ineligibilityReason: 'cooldown_active',
  lastAutomationImport: {
    finishedAt: '2026-07-24T11:46:12.000Z',
    receivedCount: 42,
    startedAt: '2026-07-24T11:45:00.000Z',
    status: 'completed',
  },
  nextAllowedAt: '2026-07-24T12:45:00.000Z',
  nextScheduledRunAt: '2026-07-24T13:00:00.000Z',
}

describe('scheduled distribution route parity contract', () => {
  test('serves the same scheduled payload on the settings and the imports route', async () => {
    const settingsBody = await readJson(await callSettingsStatusRoute())
    const importsBody = await readJson(await callImportsDistributionRoute())

    expect(importsBody.data.scheduled).toEqual(settingsBody.data)
  })

  test('keeps the existing cursor fields alongside the scheduled block', async () => {
    const importsBody = await readJson(await callImportsDistributionRoute())

    expect(importsBody.data).toMatchObject({
      canPull: expect.any(Boolean),
      environment: expect.any(String),
      maxNsu: expect.any(String),
      ultNsu: expect.any(String),
    })
  })

  test('reports undefined optional fields as null on both routes', async () => {
    const empty: ScheduledDistributionStatus = {
      certificateExpiresAt: undefined,
      companyId: COMPANY_ID,
      eligible: false,
      enabled: false,
      ineligibilityReason: 'not_opted_in',
      lastAutomationImport: undefined,
      nextAllowedAt: undefined,
      nextScheduledRunAt: '2026-07-24T13:00:00.000Z',
    }

    const settingsBody = await readJson(await callSettingsStatusRoute(empty))
    const importsBody = await readJson(await callImportsDistributionRoute(empty))

    expect(settingsBody.data).toMatchObject({
      certificateExpiresAt: null,
      lastAutomationImport: null,
      nextAllowedAt: null,
    })
    expect(importsBody.data.scheduled).toEqual(settingsBody.data)
  })
})

function scheduledStatusUseCase(status: ScheduledDistributionStatus): {
  readonly execute: (input: { readonly companyId: string }) => Promise<ScheduledDistributionStatus>
} {
  return { execute: async () => status }
}

async function callSettingsStatusRoute(status = STATUS): Promise<Response> {
  const [statusRoute] = createScheduledDistributionRoutes({
    disable: {
      execute: async () => ({ companyId: COMPANY_ID, scheduledDistributionEnabled: false }),
    },
    enable: {
      execute: async () => ({
        companyId: COMPANY_ID,
        scheduledDistributionEnabled: true,
        systemActorUserId: '00000000-0000-4000-8000-000000000006',
      }),
    },
    getStatus: scheduledStatusUseCase(status),
  })
  if (statusRoute === undefined) throw new Error('missing settings status route')
  return executeRoute(statusRoute, API_COMPANY_SETTINGS_SCHEDULED_DISTRIBUTION_PATH)
}

async function callImportsDistributionRoute(status = STATUS): Promise<Response> {
  const notCalled = { execute: () => Promise.reject(new Error('unexpected call')) }
  const route = createNfeImportRoutes({
    getDistributionStatus: { execute: async () => DISTRIBUTION_STATUS },
    getImport: notCalled,
    getScheduledDistribution: scheduledStatusUseCase(status),
    listImports: notCalled,
    reprocessImport: notCalled,
    requestDistribution: notCalled,
    requestUpload: notCalled,
  }).find(
    (candidate) =>
      candidate.pathname === API_NFE_IMPORTS_DISTRIBUTION_PATH && candidate.method === 'GET',
  )
  if (route === undefined) throw new Error('missing imports distribution route')
  return executeRoute(route, API_NFE_IMPORTS_DISTRIBUTION_PATH)
}

function executeRoute(
  route: { readonly execute: (input: never) => Promise<Response> },
  pathname: string,
): Promise<Response> {
  return route.execute({
    context: { identity: undefined, scope: COMPANY_CONTEXT },
    correlationId: 'scheduled-distribution-parity',
    pathParameters: {},
    request: new Request(`http://localhost${pathname}`),
  } as never)
}

async function readJson(response: Response): Promise<{ data: Record<string, unknown> }> {
  expect(response.status).toBe(200)
  return (await response.json()) as { data: Record<string, unknown> }
}
