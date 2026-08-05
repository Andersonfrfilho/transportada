/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Desliga o opt-in da distribuição agendada. Membership sintética e cursor de
 * NSU ficam de pé: religar depois retoma de onde parou em vez de reprocessar
 * tudo o que a SEFAZ já entregou.
 */
import type {
  DisableScheduledDistributionResult,
  ScheduledDistributionUnitOfWorkPort,
} from './enable-scheduled-distribution.port.js'

export function createDisableScheduledDistributionUseCase(input: {
  readonly unitOfWork: ScheduledDistributionUnitOfWorkPort
}): {
  readonly execute: (request: {
    readonly companyId: string
  }) => Promise<DisableScheduledDistributionResult>
} {
  return {
    execute: ({ companyId }) =>
      input.unitOfWork.execute(async (transaction) => {
        await transaction.disableScheduledDistribution({ companyId })
        return { companyId, scheduledDistributionEnabled: false }
      }),
  }
}
