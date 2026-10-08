/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'
import type {
  BusinessCalendarSettingsPort,
  BusinessCalendarSettingsRecord,
} from './business-calendar-settings.port.js'

export type BusinessCalendarSettingsUseCases = {
  readonly get: {
    readonly execute: (input: {
      readonly companyId: string
    }) => Promise<BusinessCalendarSettingsRecord | null>
  }
  readonly save: {
    readonly execute: (
      input: BusinessCalendarActor & { readonly saturdayIsBusinessDay: boolean },
    ) => Promise<BusinessCalendarSettingsRecord>
  }
}

export function createBusinessCalendarSettingsUseCases(dependencies: {
  readonly repository: BusinessCalendarSettingsPort
}): BusinessCalendarSettingsUseCases {
  return {
    get: { execute: (input) => dependencies.repository.find(input) },
    save: { execute: (input) => dependencies.repository.save(input) },
  }
}
