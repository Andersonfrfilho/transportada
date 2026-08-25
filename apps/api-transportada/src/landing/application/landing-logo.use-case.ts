/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyLogo, CompanyLogoRepositoryPort } from '../../companies/application/company-logo.port.js'

type Dependencies = {
  readonly companyLogoRepository: CompanyLogoRepositoryPort
  /** Mesma empresa que ancora `landing-settings.use-case.ts` — ver ADR-0041 item 7. */
  readonly landingCompanyId: string | undefined
}

export type LandingLogoUseCase = Readonly<{
  getPublicLogo: () => Promise<CompanyLogo | null>
}>

export function createLandingLogoUseCase(dependencies: Dependencies): LandingLogoUseCase {
  return {
    async getPublicLogo() {
      if (dependencies.landingCompanyId === undefined) return null
      return dependencies.companyLogoRepository.find({ companyId: dependencies.landingCompanyId })
    },
  }
}
