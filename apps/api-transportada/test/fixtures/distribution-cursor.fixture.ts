/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DistributionCursorAuditPort,
  DistributionCursorRecord,
  DistributionCursorRepositoryPort,
} from '../../src/companies/application/distribution-cursor.port'
import { COMPANY_ID } from './nfe-import-application.fixture'

export const CURSOR_NOW = new Date('2026-08-11T14:20:00.000Z')
export const CURSOR_RESYNC_WINDOW_MS = 60 * 60 * 1000

export const CURSOR_RECORD: DistributionCursorRecord = {
  companyId: COMPANY_ID,
  consecutiveRateLimits: 2,
  environment: 'production',
  lastSkipped: {
    at: new Date('2026-08-11T13:10:00.000Z'),
    fromNsu: '000000000037702',
    toNsu: '000000000045636',
  },
  maxNsu: '000000000045700',
  nextAllowedAt: new Date('2026-08-11T15:10:00.000Z'),
  ultNsu: '000000000045636',
  updatedAt: new Date('2026-08-11T14:10:00.000Z'),
}

export const BARE_CURSOR_RECORD: DistributionCursorRecord = {
  companyId: COMPANY_ID,
  consecutiveRateLimits: 0,
  environment: 'production',
  lastSkipped: undefined,
  maxNsu: '000000000045700',
  nextAllowedAt: undefined,
  ultNsu: '000000000045636',
  updatedAt: new Date('2026-08-11T14:10:00.000Z'),
}

export type DistributionCursorSpy = {
  readonly calls: string[]
  readonly port: DistributionCursorRepositoryPort
}

export function createDistributionCursorRepositorySpy(
  record: DistributionCursorRecord | null = CURSOR_RECORD,
): DistributionCursorSpy {
  const calls: string[] = []
  return {
    calls,
    port: {
      async find({ companyId }) {
        calls.push(`find:${companyId}`)
        return record
      },
      async jump({ companyId, now, ultNsu }) {
        calls.push(`jump:${companyId}:${ultNsu}`)
        return {
          ...(record ?? CURSOR_RECORD),
          consecutiveRateLimits: 0,
          nextAllowedAt: new Date(now.getTime() + CURSOR_RESYNC_WINDOW_MS),
          ultNsu,
          updatedAt: now,
        }
      },
    },
  }
}

export type DistributionCursorAuditSpy = {
  readonly entries: Array<Record<string, unknown>>
  readonly port: DistributionCursorAuditPort
}

export function createDistributionCursorAuditSpy(): DistributionCursorAuditSpy {
  const entries: Array<Record<string, unknown>> = []
  return {
    entries,
    port: {
      async append(entry) {
        entries.push({ ...entry })
      },
    },
  }
}
