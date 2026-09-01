/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContactSettings, CompanyContactsPort } from './company-contacts.port.js'

type Dependencies = { readonly contacts: CompanyContactsPort }

export type CompanyContactsUseCase = Readonly<{
  get: (input: { readonly companyId: string }) => Promise<CompanyContactSettings>
  replace: (input: {
    readonly companyId: string
    readonly settings: CompanyContactSettings
  }) => Promise<CompanyContactSettings>
}>

export function createCompanyContactsUseCase(dependencies: Dependencies): CompanyContactsUseCase {
  return {
    async get(input) {
      return dependencies.contacts.load({ companyId: input.companyId })
    },
    async replace(input) {
      return dependencies.contacts.replace(input)
    },
  }
}
