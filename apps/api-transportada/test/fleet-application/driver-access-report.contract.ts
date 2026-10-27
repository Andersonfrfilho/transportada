/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createFleetDriverAccessReportUseCase,
  type FleetDriverAccessSource,
} from '../../src/fleet/application/fleet-driver-access-report.use-case.js'
import { COMPANY_CONTEXT } from '../fixtures/company-settings-application.fixture.js'

const NOW = new Date('2026-10-27T12:00:00.000Z')

function source(overrides: Partial<FleetDriverAccessSource>): FleetDriverAccessSource {
  return {
    driverId: crypto.randomUUID(),
    email: 'motorista@example.com',
    invitation: null,
    name: 'Motorista',
    phone: '16999990000',
    taxId: '12345678909',
    userId: null,
    ...overrides,
  }
}

function run(sources: readonly FleetDriverAccessSource[]) {
  return createFleetDriverAccessReportUseCase({
    clock: () => NOW,
    port: { listActiveDrivers: async () => sources },
  }).execute({ context: COMPANY_CONTEXT })
}

describe('fleet driver access report', () => {
  test('lists a ficha without user, an open invite and an expired invite, never an accepted one', async () => {
    const rows = await run([
      source({ name: 'Sem usuário' }),
      source({
        invitation: {
          acceptedAt: null,
          deliveredAt: null,
          expiresAt: new Date('2026-10-28T00:00:00.000Z'),
          status: 'pending',
        },
        name: 'Convidado',
        userId: 'u1',
      }),
      source({
        invitation: {
          acceptedAt: null,
          deliveredAt: new Date('2026-10-01T00:00:00.000Z'),
          expiresAt: new Date('2026-10-10T00:00:00.000Z'),
          status: 'pending',
        },
        name: 'Vencido',
        userId: 'u2',
      }),
      source({
        invitation: {
          acceptedAt: new Date('2026-10-02T00:00:00.000Z'),
          deliveredAt: null,
          expiresAt: new Date('2026-10-10T00:00:00.000Z'),
          status: 'accepted',
        },
        name: 'Ativo',
        userId: 'u3',
      }),
    ])

    expect(rows.map((row) => [row.name, row.state])).toEqual([
      ['Sem usuário', 'no-user'],
      ['Convidado', 'invited'],
      ['Vencido', 'expired'],
    ])
  })

  test('masks the tax id and the contact', async () => {
    const [row] = await run([source({})])

    expect(row?.taxId).not.toContain('12345678909')
    expect(row?.contact).not.toContain('motorista@example.com')
  })
})
