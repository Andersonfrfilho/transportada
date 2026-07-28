/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createEnableScheduledDistributionUseCase } from '../../src/companies/application/enable-scheduled-distribution.use-case.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../src/identity/domain/system-distribution-actor.constant.js'
import { ScheduledDistributionProvisioningFixture } from '../fixtures/scheduled-distribution-provisioning.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000a2'

const membershipKey = (companyId: string): string =>
  `${SYSTEM_DISTRIBUTION_ACTOR_USER_ID}:${companyId}`

describe('synthetic distribution actor provisioning contract', () => {
  test('provisions the system actor, an active membership, and enables distribution', async () => {
    const unitOfWork = new ScheduledDistributionProvisioningFixture()
    const useCase = createEnableScheduledDistributionUseCase({ unitOfWork })

    const result = await useCase.execute({ companyId: COMPANY_ID })

    expect(result).toEqual({
      companyId: COMPANY_ID,
      scheduledDistributionEnabled: true,
      systemActorUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
    })
    expect(unitOfWork.identityUsers.get(SYSTEM_DISTRIBUTION_ACTOR_USER_ID)).toEqual({
      status: 'active',
    })
    expect(unitOfWork.memberships.get(membershipKey(COMPANY_ID))).toEqual({
      companyId: COMPANY_ID,
      status: 'active',
      userId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
    })
    expect(unitOfWork.distributionSettings.get(COMPANY_ID)).toEqual({ enabled: true })
  })

  test('is idempotent — re-running never duplicates the actor or membership', async () => {
    const unitOfWork = new ScheduledDistributionProvisioningFixture()
    const useCase = createEnableScheduledDistributionUseCase({ unitOfWork })

    await useCase.execute({ companyId: COMPANY_ID })
    await useCase.execute({ companyId: COMPANY_ID })

    expect(unitOfWork.transactionCount).toBe(2)
    expect(unitOfWork.identityUsers.size).toBe(1)
    expect(unitOfWork.memberships.size).toBe(1)
    expect(unitOfWork.distributionSettings.get(COMPANY_ID)).toEqual({ enabled: true })
  })

  test('shares one system actor across per-company memberships', async () => {
    const unitOfWork = new ScheduledDistributionProvisioningFixture()
    const useCase = createEnableScheduledDistributionUseCase({ unitOfWork })

    await useCase.execute({ companyId: COMPANY_ID })
    await useCase.execute({ companyId: OTHER_COMPANY_ID })

    expect(unitOfWork.identityUsers.size).toBe(1)
    expect(unitOfWork.memberships.size).toBe(2)
    expect(unitOfWork.memberships.get(membershipKey(COMPANY_ID))?.companyId).toBe(COMPANY_ID)
    expect(unitOfWork.memberships.get(membershipKey(OTHER_COMPANY_ID))?.companyId).toBe(
      OTHER_COMPANY_ID,
    )
  })

  test('provisions only the supplied company, never a wider scope', async () => {
    const unitOfWork = new ScheduledDistributionProvisioningFixture()
    const useCase = createEnableScheduledDistributionUseCase({ unitOfWork })

    await useCase.execute({ companyId: COMPANY_ID })

    expect([...unitOfWork.memberships.values()].map((record) => record.companyId)).toEqual([
      COMPANY_ID,
    ])
    expect([...unitOfWork.distributionSettings.keys()]).toEqual([COMPANY_ID])
  })

  test('rolls back the actor and membership when enabling the flag fails', async () => {
    const unitOfWork = new ScheduledDistributionProvisioningFixture()
    unitOfWork.failOn = 'settings'
    const useCase = createEnableScheduledDistributionUseCase({ unitOfWork })

    await expect(useCase.execute({ companyId: COMPANY_ID })).rejects.toThrow(
      'distribution settings persistence unavailable',
    )

    expect(unitOfWork.identityUsers.size).toBe(0)
    expect(unitOfWork.memberships.size).toBe(0)
    expect(unitOfWork.distributionSettings.size).toBe(0)
  })
})
