/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createDisableScheduledDistributionUseCase } from '../../src/companies/application/disable-scheduled-distribution.use-case.js'
import { createEnableScheduledDistributionUseCase } from '../../src/companies/application/enable-scheduled-distribution.use-case.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/identity/domain/system-distribution-actor.constant.js'
import { ScheduledDistributionProvisioningFixture } from '../fixtures/scheduled-distribution-provisioning.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'

describe('disable scheduled distribution use case', () => {
  test('turns the opt-in off and reports it', async () => {
    const fixture = new ScheduledDistributionProvisioningFixture()
    await createEnableScheduledDistributionUseCase({ unitOfWork: fixture }).execute({
      companyId: COMPANY_ID,
    })

    const result = await createDisableScheduledDistributionUseCase({ unitOfWork: fixture }).execute(
      {
        companyId: COMPANY_ID,
      },
    )

    expect(result).toEqual({ companyId: COMPANY_ID, scheduledDistributionEnabled: false })
    expect(fixture.distributionSettings.get(COMPANY_ID)).toEqual({ enabled: false })
  })

  test('preserves the synthetic membership so re-enabling never reprovisions it', async () => {
    const fixture = new ScheduledDistributionProvisioningFixture()
    await createEnableScheduledDistributionUseCase({ unitOfWork: fixture }).execute({
      companyId: COMPANY_ID,
    })

    await createDisableScheduledDistributionUseCase({ unitOfWork: fixture }).execute({
      companyId: COMPANY_ID,
    })

    expect(fixture.memberships.get(`${SYSTEM_DISTRIBUTION_ACTOR_USER_ID}:${COMPANY_ID}`)).toEqual({
      companyId: COMPANY_ID,
      status: 'active',
      userId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
    })
    expect(fixture.identityUsers.has(SYSTEM_DISTRIBUTION_ACTOR_USER_ID)).toBe(true)
  })

  test('is idempotent for a company that never opted in', async () => {
    const fixture = new ScheduledDistributionProvisioningFixture()

    const result = await createDisableScheduledDistributionUseCase({ unitOfWork: fixture }).execute(
      {
        companyId: COMPANY_ID,
      },
    )

    expect(result.scheduledDistributionEnabled).toBe(false)
    expect(fixture.distributionSettings.get(COMPANY_ID)).toEqual({ enabled: false })
  })

  test('re-enabling after a disable does not open a second provisioning transaction per step', async () => {
    const fixture = new ScheduledDistributionProvisioningFixture()
    const enable = createEnableScheduledDistributionUseCase({ unitOfWork: fixture })
    const disable = createDisableScheduledDistributionUseCase({ unitOfWork: fixture })

    await enable.execute({ companyId: COMPANY_ID })
    await disable.execute({ companyId: COMPANY_ID })
    await enable.execute({ companyId: COMPANY_ID })

    expect(fixture.transactionCount).toBe(3)
    expect(fixture.distributionSettings.get(COMPANY_ID)).toEqual({ enabled: true })
  })

  test('leaves the opt-in untouched when the persistence fails mid transaction', async () => {
    const fixture = new ScheduledDistributionProvisioningFixture()
    await createEnableScheduledDistributionUseCase({ unitOfWork: fixture }).execute({
      companyId: COMPANY_ID,
    })
    fixture.failOn = 'settings'

    await expect(
      createDisableScheduledDistributionUseCase({ unitOfWork: fixture }).execute({
        companyId: COMPANY_ID,
      }),
    ).rejects.toThrow()
    expect(fixture.distributionSettings.get(COMPANY_ID)).toEqual({ enabled: true })
  })
})
