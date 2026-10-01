/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type CrewSettings = {
  /** Nulo é "ainda não parametrizado" — a conta cai na lacuna, nunca em zero silencioso. */
  readonly helperDailyRate: string | null
}

export type CrewSettingsPort = {
  load(input: { readonly companyId: string }): Promise<CrewSettings>
  save(input: {
    readonly companyId: string
    readonly helperDailyRate: string | null
  }): Promise<void>
}
