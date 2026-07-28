/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../src/identity/domain/tenant-context'

export const COMPANY_ID = '00000000-0000-4000-8000-0000000005a1'
export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000005a2'
export const USER_ID = '00000000-0000-4000-8000-0000000005a3'
export const OTHER_USER_ID = '00000000-0000-4000-8000-0000000005a4'
export const MEMBERSHIP_ID = '00000000-0000-4000-8000-0000000005a5'
export const VIEW_KEY = 'nfe-workspace.documents'

export const SAMPLE_PREFERENCES: Record<string, unknown> = {
  columnOrder: ['status', 'accessKey', 'issuedAt'],
  columnVisibility: { accessKey: true, issuedAt: false },
  pageSize: 50,
  sort: { direction: 'desc', key: 'issuedAt' },
}

export const COMPANY_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: MEMBERSHIP_ID,
  permissions: new Set(['view-preferences.manage']),
  roles: ['viewer'],
  userId: USER_ID,
}
