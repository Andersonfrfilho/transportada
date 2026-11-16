/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FreightQuoteSettingsValues } from '../domain/freight-quote.policy.js'

export type FreightQuoteSettingsRecord = {
  readonly updatedAt: Date
  readonly values: FreightQuoteSettingsValues
}

export type FreightQuoteSettingsAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly after: FreightQuoteSettingsValues | null
  readonly before: FreightQuoteSettingsValues | null
  readonly companyId: string
  readonly correlationId: string
}

/** Todo método recebe a empresa do contexto: uma linha por empresa, e só a dela. */
export type FreightQuoteSettingsPort = {
  appendAudit(entry: FreightQuoteSettingsAuditEntry): Promise<void>
  find(input: { readonly companyId: string }): Promise<FreightQuoteSettingsRecord | null>
  remove(input: { readonly companyId: string }): Promise<void>
  upsert(input: {
    readonly companyId: string
    readonly updatedByUserId: string
    readonly values: FreightQuoteSettingsValues
  }): Promise<FreightQuoteSettingsRecord>
}
