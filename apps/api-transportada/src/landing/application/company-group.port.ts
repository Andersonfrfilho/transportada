/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyGroupUnit } from '../domain/company-group.policy.js'

export type CompanyGroupRepositoryPort = Readonly<{
  listGroupUnits: (input: { readonly companyId: string }) => Promise<readonly CompanyGroupUnit[]>
}>
