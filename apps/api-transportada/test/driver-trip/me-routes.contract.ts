/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

const meRoutes = createMeTripRoutes({
  attachProof: NOT_CALLED,
  findCurrentTrip: NOT_CALLED,
  reportArrival: NOT_CALLED,
  reportDelivery: NOT_CALLED,
  reportOccurrence: NOT_CALLED,
  reportReturn: NOT_CALLED,
  resolveDriverId: NOT_CALLED,
})

const officeRoutes = createTripRoutes(
  new Proxy({} as never, { get: () => ({ execute: NOT_CALLED }) }),
)

describe('as rotas do campo', () => {
  /** ADR-0045 §2: nenhuma delas leva id de viagem. Se ele não escolhe, não há o que enumerar. */
  it('não aceitam id de viagem em caminho nenhum', () => {
    for (const route of meRoutes) {
      expect(route.pathname).toStartWith('/me/trips/current')
      expect(route.pathname).not.toContain(':tripId')
      expect(route.pathname).not.toContain(':id')
    }
  })

  it('só usam as duas permissões do papel de campo', () => {
    const permissions = new Set(meRoutes.map((route) => route.policy?.permission))

    expect([...permissions].toSorted()).toEqual(['trip.read', 'trip.report'])
  })

  /**
   * O critério de aceite da spec, virado teste: com o papel `driver` **nenhuma** rota de viagem do
   * escritório abre. A checagem é sobre a política declarada, não sobre uma lista de caminhos que
   * alguém teria de lembrar de atualizar.
   */
  it('o papel driver não alcança nenhuma rota de viagem do escritório', () => {
    const driverPermissions = resolveCompanyPermissions(['driver'])

    for (const route of officeRoutes) {
      const permission = route.policy?.permission
      expect(permission).toBeDefined()
      expect(driverPermissions.has(permission as never)).toBe(false)
    }
  })

  it('e alcança todas as do campo', () => {
    const driverPermissions = resolveCompanyPermissions(['driver'])

    for (const route of meRoutes) {
      expect(driverPermissions.has(route.policy?.permission as never)).toBe(true)
    }
  })
})
