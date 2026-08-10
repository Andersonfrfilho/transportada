/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FiscalEnvironment } from '../../database/company-fiscal-profile.schema.js'

export type CompanyFiscalEnvironmentPort = {
  /** `null` enquanto a empresa não tem cadastro fiscal — não há ambiente a anunciar. */
  readonly readEnvironment: (input: {
    readonly companyId: string
  }) => Promise<FiscalEnvironment | null>
}
