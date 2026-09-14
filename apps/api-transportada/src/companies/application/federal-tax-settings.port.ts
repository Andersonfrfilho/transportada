/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FederalTaxRates } from '../domain/federal-tax-settings.policy.js'

export type { FederalTaxRates } from '../domain/federal-tax-settings.policy.js'

export type FederalTaxSettings = FederalTaxRates & {
  readonly updatedAt: Date
}

export type FederalTaxAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly after: FederalTaxRates | null
  readonly before: FederalTaxRates | null
  readonly companyId: string
  readonly correlationId: string
}

/** Todo método recebe a empresa do contexto: a tabela é uma linha por empresa, e só a dela. */
export type FederalTaxSettingsPort = {
  appendAudit(entry: FederalTaxAuditEntry): Promise<void>
  find(input: { readonly companyId: string }): Promise<FederalTaxSettings | null>
  remove(input: { readonly companyId: string }): Promise<void>
  upsert(
    input: FederalTaxRates & { readonly companyId: string; readonly updatedByUserId: string },
  ): Promise<FederalTaxSettings>
}
