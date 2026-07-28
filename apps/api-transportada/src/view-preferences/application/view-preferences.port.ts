/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type ViewPreferencesRecord = {
  readonly preferences: Record<string, unknown>
  readonly updatedAt: string
}

export type ViewPreferencesReaderPort = {
  find(input: {
    readonly companyId: string
    readonly userId: string
    readonly viewKey: string
  }): Promise<ViewPreferencesRecord | null>
}

export type ViewPreferencesWriterPort = {
  save(input: {
    readonly companyId: string
    readonly preferences: Record<string, unknown>
    readonly userId: string
    readonly viewKey: string
  }): Promise<ViewPreferencesRecord>
}
