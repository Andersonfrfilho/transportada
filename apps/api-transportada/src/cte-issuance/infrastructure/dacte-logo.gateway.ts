/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyLogoRepositoryPort } from '../../companies/application/company-logo.port.js'
import type { DacteLogo, DacteLogoPort, DacteLogoQuery } from '../application/render-dacte.port.js'

/** O DACTE só quer os bytes da marca: dimensão, hash e data de upload são assunto das configurações. */
export function createDacteLogoGateway(input: {
  readonly logos: CompanyLogoRepositoryPort
}): DacteLogoPort {
  return {
    async findLogo(query: DacteLogoQuery): Promise<DacteLogo | null> {
      const logo = await input.logos.find({ companyId: query.companyId })

      return logo === null ? null : { bytes: logo.bytes }
    },
  }
}
