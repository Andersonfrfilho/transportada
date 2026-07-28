/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ViewPreferencesRecord, ViewPreferencesWriterPort } from './view-preferences.port.js'

export function createSaveViewPreferencesUseCase(input: {
  readonly repository: ViewPreferencesWriterPort
}): {
  readonly execute: (input: {
    readonly context: CompanyContext
    readonly preferences: Record<string, unknown>
    readonly viewKey: string
  }) => Promise<ViewPreferencesRecord>
} {
  return {
    execute({ context, preferences, viewKey }) {
      return input.repository.save({
        companyId: context.companyId,
        preferences,
        userId: context.userId,
        viewKey,
      })
    },
  }
}
