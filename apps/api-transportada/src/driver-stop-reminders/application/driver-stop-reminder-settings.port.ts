/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { StopReminderCompanySettings } from '../domain/driver-stop-reminder.types.js'

export type DriverStopReminderStoredSettings = {
  readonly settings: StopReminderCompanySettings
  /** `null` quando a empresa ainda não tem linha (valem os padrões). */
  readonly updatedAt: Date | null
}

export type SaveDriverStopReminderSettingsParams = StopReminderCompanySettings & {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

/** Toda instrução leva `companyId` do contexto autenticado (RNF5). */
export type DriverStopReminderSettingsPort = {
  find(params: { readonly companyId: string }): Promise<DriverStopReminderStoredSettings>
  save(params: SaveDriverStopReminderSettingsParams): Promise<DriverStopReminderStoredSettings>
}
