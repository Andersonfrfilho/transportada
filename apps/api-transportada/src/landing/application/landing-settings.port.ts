/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LandingSections } from '../domain/landing-settings.policy.js'

export type LandingSettingsRecord = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  contactEmail: string | undefined
  contactPhone: string | undefined
  sections: LandingSections
  updatedAt: Date
}>

export type LandingSettingsWriteInput = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  contactEmail: string | undefined
  contactPhone: string | undefined
  cnpjRoot: string
  sections: LandingSections
}>

export type LandingSettingsRepositoryPort = Readonly<{
  findByRoot: (input: { readonly cnpjRoot: string }) => Promise<LandingSettingsRecord | null>
  upsert: (input: LandingSettingsWriteInput) => Promise<LandingSettingsRecord>
}>
