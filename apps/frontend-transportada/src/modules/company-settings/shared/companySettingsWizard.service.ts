/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createDefaultCompanySettings } from './companySettings.constant'
import type { CompanySettingsResponse, CompanySettingsUpdate } from './companySettings.types'

export function isCompanyWizardRequired(response: CompanySettingsResponse): boolean {
  return response.data.profile === null
}

export function toWizardSettingsUpdate(
  profile: CompanySettingsUpdate['profile'],
): CompanySettingsUpdate {
  return { ...createDefaultCompanySettings(), profile }
}
