/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createFleetDriversUseCase } from '../../src/fleet/application/fleet-drivers.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createDriverRepositoryStub, FLEET_CONTEXT } from '../fixtures/fleet-application.fixture'
import {
  CREATE_DRIVER_BODY,
  DRIVER_ID,
  MEMBERSHIP_ID,
} from '../fixtures/fleet-http-payload.fixture'

const CORRELATION_ID = 'fleet-drivers-application'

describe('fleet drivers use case contract', () => {
  test('skips the membership lookup when the driver has no login', async () => {
    const stub = createDriverRepositoryStub()
    const useCase = createFleetDriversUseCase({ repository: stub.repository })

    await useCase.create({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: CREATE_DRIVER_BODY,
    })

    expect(stub.membershipCalls).toEqual([])
    expect(stub.createCalls).toEqual([
      { companyId: FLEET_CONTEXT.companyId, driver: { ...CREATE_DRIVER_BODY } },
    ])
  })

  // O membership tem que ser desta empresa — o vínculo do motorista nunca atravessa o tenant
  test('checks the membership inside the company before linking it', async () => {
    const stub = createDriverRepositoryStub()
    const useCase = createFleetDriversUseCase({ repository: stub.repository })

    await useCase.create({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: { ...CREATE_DRIVER_BODY, membershipId: MEMBERSHIP_ID },
    })

    expect(stub.membershipCalls).toEqual([
      { companyId: FLEET_CONTEXT.companyId, membershipId: MEMBERSHIP_ID },
    ])
  })

  test('refuses a membership that does not belong to the company', async () => {
    const stub = createDriverRepositoryStub({ membershipBelongs: false })
    const useCase = createFleetDriversUseCase({ repository: stub.repository })

    const failure = await useCase
      .create({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driver: { ...CREATE_DRIVER_BODY, membershipId: MEMBERSHIP_ID },
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(422)
    expect((failure as ApiError).code).toBe('FLEET_DRIVER_MEMBERSHIP_NOT_FOUND')
    expect(stub.createCalls).toEqual([])
  })

  test('separates the stale version from the missing driver on update', async () => {
    const conflictUseCase = createFleetDriversUseCase({
      repository: createDriverRepositoryStub({ updated: null }).repository,
    })
    const missingUseCase = createFleetDriversUseCase({
      repository: createDriverRepositoryStub({ current: null, updated: null }).repository,
    })
    const input = {
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driver: CREATE_DRIVER_BODY,
      driverId: DRIVER_ID,
      expectedVersion: '1',
      status: 'active',
    } as const

    const conflict = await conflictUseCase.update(input).catch((error: unknown) => error)
    const missing = await missingUseCase.update(input).catch((error: unknown) => error)

    expect((conflict as ApiError).code).toBe('FLEET_DRIVER_VERSION_CONFLICT')
    expect((conflict as ApiError).status).toBe(409)
    expect((missing as ApiError).code).toBe('FLEET_DRIVER_NOT_FOUND')
    expect((missing as ApiError).status).toBe(404)
  })
})
