/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type DriverAllowanceSettings = {
  readonly amount: string
  readonly updatedAt: Date
}

export type DriverAllowanceAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly after: string | null
  readonly before: string | null
  readonly companyId: string
  readonly correlationId: string
}

/** Todo método recebe a empresa do contexto: a tabela é uma linha por empresa, e só a dela. */
export type DriverAllowanceSettingsPort = {
  appendAudit(entry: DriverAllowanceAuditEntry): Promise<void>
  find(input: { readonly companyId: string }): Promise<DriverAllowanceSettings | null>
  remove(input: { readonly companyId: string }): Promise<void>
  upsert(input: {
    readonly amount: string
    readonly companyId: string
    readonly updatedByUserId: string
  }): Promise<DriverAllowanceSettings>
}
