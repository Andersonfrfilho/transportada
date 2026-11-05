/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { FleetDriverWhatsappGroupTakenError } from '../../src/fleet/domain/fleet.error.js'
import type { DriverWhatsappGroupUseCase } from '../../src/fleet/application/driver-whatsapp-group.use-case.js'
import { createDriverWhatsappGroupRoutes } from '../../src/fleet/presentation/driver-whatsapp-group.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const PATH = `/fleet/drivers/${DRIVER_ID}/whatsapp-group`
const GROUP_JID = '120363000000000001@g.us'
const READ_ONLY: CompanyContext['permissions'] = new Set(['fleet.read'] as const)
const MANAGE: CompanyContext['permissions'] = new Set(['fleet.read', 'fleet.manage'] as const)

function createFixture(
  input: { readonly permissions?: CompanyContext['permissions']; readonly taken?: boolean } = {},
) {
  const calls: { readonly kind: string; readonly input: unknown }[] = []
  const useCase: DriverWhatsappGroupUseCase = {
    async get(request) {
      calls.push({ input: request, kind: 'get' })
      return {
        groupJid: GROUP_JID,
        groupName: 'Motorista João',
        updatedAt: '2026-11-04T00:00:00.000Z',
      }
    },
    async listGroups(request) {
      calls.push({ input: request, kind: 'list' })
      return [
        { assignedDriverId: null, assignedDriverName: null, groupJid: GROUP_JID, name: 'Livre' },
      ]
    },
    async remove(request) {
      calls.push({ input: request, kind: 'remove' })
      return true
    },
    async set(request) {
      calls.push({ input: request, kind: 'set' })
      if (input.taken === true) throw new FleetDriverWhatsappGroupTakenError()
      return { groupJid: request.groupJid, groupName: request.groupName, updatedAt: 'x' }
    },
  }
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? MANAGE),
      routes: createDriverWhatsappGroupRoutes({ useCase }),
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('as rotas do grupo de WhatsApp do motorista (spec 292 T1)', () => {
  test('quem só lê a frota lê o grupo, mas não troca, remove nem lista os grupos', async () => {
    const fixture = createFixture({ permissions: READ_ONLY })

    expect((await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))).status).toBe(200)
    for (const request of [
      jsonRequest({ body: { groupJid: GROUP_JID }, method: 'PUT', path: PATH }),
      jsonRequest({ method: 'DELETE', path: PATH }),
      jsonRequest({ method: 'GET', path: '/fleet/whatsapp-groups' }),
    ]) {
      expect((await fixture.handle(request)).status).toBe(403)
    }
    expect(fixture.calls.map((call) => call.kind)).toEqual(['get'])
  })

  test('trocar grava o grupo da ficha informada, com o nome como rótulo', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { groupJid: GROUP_JID, groupName: '  Motorista João  ' },
        method: 'PUT',
        path: PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.calls[0]?.input).toMatchObject({
      driverId: DRIVER_ID,
      groupJid: GROUP_JID,
      groupName: 'Motorista João',
    })
  })

  test('identificador que não é de grupo, e campo extra são 400; ficha que não é uuid é 404', async () => {
    const fixture = createFixture()

    for (const body of [
      { groupJid: '5516993857105@s.whatsapp.net' },
      { groupJid: 'abc@g.us' },
      { groupJid: GROUP_JID, extra: 1 },
      {},
    ]) {
      const response = await fixture.handle(jsonRequest({ body, method: 'PUT', path: PATH }))
      expect(response.status).toBe(400)
    }
    const badId = await fixture.handle(
      jsonRequest({
        body: { groupJid: GROUP_JID },
        method: 'PUT',
        path: '/fleet/drivers/x/whatsapp-group',
      }),
    )
    expect(badId.status).toBe(404)
    expect(fixture.calls).toEqual([])
  })

  test('grupo que já é de outro motorista responde 409 com o código próprio', async () => {
    const fixture = createFixture({ taken: true })

    const response = await fixture.handle(
      jsonRequest({ body: { groupJid: GROUP_JID }, method: 'PUT', path: PATH }),
    )
    const body = (await response.json()) as { error?: { code?: string }; code?: string }

    expect(response.status).toBe(409)
    expect(JSON.stringify(body)).toContain('FLEET_DRIVER_WHATSAPP_GROUP_TAKEN')
  })

  test('remover e listar os grupos do Evolution respondem 200', async () => {
    const fixture = createFixture()

    expect((await fixture.handle(jsonRequest({ method: 'DELETE', path: PATH }))).status).toBe(200)
    const list = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/fleet/whatsapp-groups' }),
    )
    expect(list.status).toBe(200)
    expect(((await list.json()) as { data: unknown[] }).data).toHaveLength(1)
  })
})
