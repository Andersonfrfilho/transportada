/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5/T6, aceite 1: sem `trip.report-on-behalf` nenhuma rota do escritório abre — nem para o
 * separador (que tem `trip.manage`) nem para o motorista (que tem `trip.report`).
 */
import { describe, expect, it } from 'bun:test'

import {
  createClientIpResolver,
  DEFAULT_CLIENT_IP_POLICY,
} from '../../src/http/client-ip.service.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import { createTripFieldOfficeRoutes } from '../../src/trips/presentation/trip-field-office.routes.js'

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

const routes = createTripFieldOfficeRoutes({
  attachProof: NOT_CALLED,
  reportArrival: NOT_CALLED,
  reportDelivery: NOT_CALLED,
  reportOccurrence: NOT_CALLED,
  reportReturn: NOT_CALLED,
  resolveClientIp: createClientIpResolver(DEFAULT_CLIENT_IP_POLICY),
  startFieldTrip: NOT_CALLED,
  targets: { findTripCrew: NOT_CALLED },
})

describe('as sete rotas do escritório (spec 156 T5/T6)', () => {
  it('existem as sete, todas em /trips/:id', () => {
    expect(routes).toHaveLength(7)
    for (const route of routes) {
      expect(route.method).toBe('POST')
      expect(route.pathname).toStartWith('/trips/:id')
    }
  })

  it('todas pedem só trip.report-on-behalf, escopo company', () => {
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'trip.report-on-behalf', scope: 'company' })
    }
  })

  it('aceite 1: o separador (trip.manage) não alcança nenhuma', () => {
    const separatorPermissions = resolveCompanyPermissions(['separator'])

    expect(separatorPermissions.has('trip.manage')).toBe(true)
    expect(separatorPermissions.has('trip.report-on-behalf')).toBe(false)
    for (const route of routes) {
      expect(separatorPermissions.has(route.policy?.permission as never)).toBe(false)
    }
  })

  it('aceite 1: o motorista (trip.report) não alcança nenhuma', () => {
    const driverPermissions = resolveCompanyPermissions(['driver'])

    expect(driverPermissions.has('trip.report')).toBe(true)
    expect(driverPermissions.has('trip.report-on-behalf')).toBe(false)
    for (const route of routes) {
      expect(driverPermissions.has(route.policy?.permission as never)).toBe(false)
    }
  })

  it('company-admin, operator e finance alcançam as sete (ADR-0067 §1)', () => {
    for (const role of ['company-admin', 'operator', 'finance'] as const) {
      const permissions = resolveCompanyPermissions([role])
      for (const route of routes) {
        expect(permissions.has(route.policy?.permission as never)).toBe(true)
      }
    }
  })
})
