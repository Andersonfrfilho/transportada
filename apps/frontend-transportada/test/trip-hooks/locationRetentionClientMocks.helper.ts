/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239 T3.1: o cliente HTTP do painel trocado **uma vez** (`mock.module` não se desfaz). Cada
 * teste só reconfigura `locationRetentionFakes`; `calls` é o registro do que a tela pediu.
 */
import { mock } from 'bun:test'

import type { LocationRetentionClient } from '@/modules/trip/shared/locationRetentionClient.service'
import type {
  LocationRetentionDraft,
  LocationRetentionImpact,
  LocationRetentionSettings,
} from '@/modules/trip/shared/locationRetention.validation'

export const DEFAULT_SETTINGS: LocationRetentionSettings = {
  origin: 'default',
  purgeEffectiveAt: null,
  purgeEnabled: false,
  retentionDays: 90,
  updatedAt: null,
}

export const locationRetentionFakes: {
  calls: string[]
  clear: () => Promise<void>
  get: () => Promise<LocationRetentionSettings>
  impact: (retentionDays: number) => Promise<LocationRetentionImpact>
  save: (draft: LocationRetentionDraft) => Promise<LocationRetentionSettings>
} = {
  calls: [],
  clear: () => Promise.resolve(),
  get: () => Promise.resolve(DEFAULT_SETTINGS),
  impact: () => Promise.resolve({ byTable: [] }),
  save: () => Promise.resolve(DEFAULT_SETTINGS),
}

const client: LocationRetentionClient = {
  clear: () => {
    locationRetentionFakes.calls.push('clear')
    return locationRetentionFakes.clear()
  },
  get: () => {
    locationRetentionFakes.calls.push('get')
    return locationRetentionFakes.get()
  },
  readImpact: (retentionDays) => {
    locationRetentionFakes.calls.push(`impact:${retentionDays}`)
    return locationRetentionFakes.impact(retentionDays)
  },
  save: (draft) => {
    locationRetentionFakes.calls.push(`save:${JSON.stringify(draft)}`)
    return locationRetentionFakes.save(draft)
  },
}

void mock.module('@/modules/trip/shared/locationRetentionClient.provider', () => ({
  getLocationRetentionClient: () => client,
}))
