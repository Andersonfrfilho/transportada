/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ViewPreferencesReaderPort, ViewPreferencesRecord } from './view-preferences.port.js'

export function createGetViewPreferencesUseCase(input: {
  readonly repository: ViewPreferencesReaderPort
}): {
  readonly execute: (input: {
    readonly context: CompanyContext
    readonly viewKey: string
  }) => Promise<ViewPreferencesRecord | null>
} {
  return {
    execute({ context, viewKey }) {
      return input.repository.find({
        companyId: context.companyId,
        userId: context.userId,
        viewKey,
      })
    },
  }
}
