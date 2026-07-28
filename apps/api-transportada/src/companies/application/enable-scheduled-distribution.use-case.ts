/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../identity/domain/system-distribution-actor.constant.js'
import type {
  EnableScheduledDistributionResult,
  ScheduledDistributionUnitOfWorkPort,
} from './enable-scheduled-distribution.port.js'

type EnableScheduledDistributionRequest = {
  readonly companyId: string
}

export function createEnableScheduledDistributionUseCase(input: {
  readonly unitOfWork: ScheduledDistributionUnitOfWorkPort
}): {
  readonly execute: (
    request: EnableScheduledDistributionRequest,
  ) => Promise<EnableScheduledDistributionResult>
} {
  return {
    execute: (request) => enable(input.unitOfWork, request.companyId),
  }
}

function enable(
  unitOfWork: ScheduledDistributionUnitOfWorkPort,
  companyId: string,
): Promise<EnableScheduledDistributionResult> {
  return unitOfWork.execute(async (transaction) => {
    await transaction.ensureSystemActor()
    await transaction.ensureCompanyMembership({ companyId })
    await transaction.enableScheduledDistribution({ companyId })
    return {
      companyId,
      scheduledDistributionEnabled: true,
      systemActorUserId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID,
    }
  })
}
