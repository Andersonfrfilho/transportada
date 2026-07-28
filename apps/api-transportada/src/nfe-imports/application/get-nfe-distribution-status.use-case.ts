/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { nfeDistributionNotConfigured } from './nfe-import.error.js'
import type {
  NfeDistributionClockPort,
  NfeDistributionStatus,
  NfeDistributionStatusReaderPort,
} from './nfe-import.types.js'

const DEFAULT_NSU = '000000000000000'

export function createGetNfeDistributionStatusUseCase(dependencies: {
  readonly clock: NfeDistributionClockPort
  readonly reader: NfeDistributionStatusReaderPort
}) {
  return {
    execute: async (request: {
      readonly context: CompanyContext
    }): Promise<NfeDistributionStatus> => {
      const state = await dependencies.reader.read({ companyId: request.context.companyId })
      if (state === null) throw nfeDistributionNotConfigured()
      const now = dependencies.clock.now()
      const cursor = state.cursor
      const nextAllowedAt = cursor?.nextAllowedAt ?? null
      const pullInProgress = cursor?.leaseExpiresAt != null && new Date(cursor.leaseExpiresAt) > now
      const cooldownActive = nextAllowedAt !== null && new Date(nextAllowedAt) > now
      return {
        canPull: !pullInProgress && !cooldownActive,
        environment: state.environment,
        lastPulledAt: cursor?.updatedAt ?? null,
        maxNsu: cursor?.maxNsu ?? DEFAULT_NSU,
        nextAllowedAt,
        pullInProgress,
        ultNsu: cursor?.ultNsu ?? DEFAULT_NSU,
      }
    },
  }
}
