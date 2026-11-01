/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 290: a rota do quadro de mensagens enviadas. Sai com a permissão de leitura do painel, passa a janela como data,
 * recusa data inválida e só existe quando a dependência é entregue.
 */
import { describe, expect, test } from 'bun:test'

import { createOperationsRoutes } from '../../src/operations/presentation/operations.routes.js'
import { API_OPERATIONS_SENT_MESSAGES_PATH } from '../../src/shared/api.constant.js'

function routesWith(sentMessages: Parameters<typeof createOperationsRoutes>[0]['sentMessages']) {
  return createOperationsRoutes({
    audit: { listEvents: async () => ({}) },
    jobSchedules: {
      listSchedules: async () => [],
      pause: async () => ({}),
      resume: async () => ({}),
    },
    operations: {
      getSummary: async () => ({}),
      listJobs: async () => ({}),
      listTimeline: async () => ({}),
    },
    runJob: { run: async () => ({ outcome: 'already_running' as const }) },
    ...(sentMessages === undefined ? {} : { sentMessages }),
  })
}

const CONTEXT = {
  scope: { companyId: 'company-1', permissions: new Set(['operations.read']), userId: 'user-1' },
} as never

async function run(
  route: ReturnType<typeof routesWith>[number],
  query: string,
): Promise<Response> {
  return route.execute({
    context: CONTEXT,
    correlationId: 'corr-1',
    pathParameters: {},
    request: new Request(`http://api.test${API_OPERATIONS_SENT_MESSAGES_PATH}${query}`),
  })
}

describe('Spec 290 — GET /operations/sent-messages', () => {
  test('sem a dependência a rota não existe', () => {
    expect(
      routesWith(undefined).some((route) => route.pathname === API_OPERATIONS_SENT_MESSAGES_PATH),
    ).toBe(false)
  })

  test('usa a permissão de leitura do painel e repassa a janela como data', async () => {
    const calls: Array<{ from: Date | undefined; to: Date | undefined }> = []
    const route = routesWith({
      read: async (input) => {
        calls.push({ from: input.from, to: input.to })
        return { total: { failed: 0, sent: 1, total: 1 } }
      },
    }).find((candidate) => candidate.pathname === API_OPERATIONS_SENT_MESSAGES_PATH)
    expect(route?.policy).toEqual({ permission: 'operations.read', scope: 'company' })
    if (route === undefined) return

    const response = await run(route, '?from=2026-10-31T00:00:00.000Z&to=2026-11-01T00:00:00.000Z')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { total: { failed: 0, sent: 1, total: 1 } } })
    expect(calls[0]?.from?.toISOString()).toBe('2026-10-31T00:00:00.000Z')
    expect(calls[0]?.to?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  test('data inválida vira 400 em vez de cair na janela padrão', async () => {
    const route = routesWith({ read: async () => ({}) }).find(
      (candidate) => candidate.pathname === API_OPERATIONS_SENT_MESSAGES_PATH,
    )
    if (route === undefined) throw new Error('route missing')
    await expect(run(route, '?from=ontem')).rejects.toMatchObject({
      code: 'SENT_MESSAGES_WINDOW_INVALID',
      status: 400,
    })
  })
})
