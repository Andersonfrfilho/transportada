/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { resolveCompanyGroupRoot } from '../../shared/tax-id.service.js'
import type { CompanyGroupRepositoryPort } from './company-group.port.js'
import type { CompanyGroupUnit } from '../domain/company-group.policy.js'
import {
  sanitizeLandingSettingsInput,
  type LandingSections,
} from '../domain/landing-settings.policy.js'
import type {
  CompanyContact,
  CompanyContactsPort,
  CompanySocialLink,
} from '../../companies/application/company-contacts.port.js'
import type {
  LandingSettingsRecord,
  LandingSettingsRepositoryPort,
} from './landing-settings.port.js'

export type PublicLandingSettings = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  /**
   * Spec 068: a lista de contatos da empresa, com marca de WhatsApp, e os perfis de rede social.
   * São dados públicos por natureza — é o que o rodapé do site publica —, e o e-mail do sistema lê a
   * mesma lista, para o número que a pessoa vê na tela ser o número que ela vê na caixa de entrada.
   */
  contacts: readonly CompanyContact[]
  contactEmail: string | undefined
  contactPhone: string | undefined
  sections: LandingSections
  socialLinks: readonly CompanySocialLink[]
  units: readonly CompanyGroupUnit[]
}>

export type LandingSettingsWriteRequest = Readonly<{
  accentColor: string | undefined
  brandName: string | undefined
  contactEmail: string | undefined
  contactPhone: string | undefined
  sections: LandingSections
}>

type Dependencies = {
  readonly companyContactsRepository: CompanyContactsPort
  readonly companyGroupRepository: CompanyGroupRepositoryPort
  readonly landingSettingsRepository: LandingSettingsRepositoryPort
  /**
   * Empresa que a instalação serve enquanto `054` não torna a filial criável — ver ADR-0041 item 7.
   * Sem provisionamento (`PROVISION_COMPANY_ID` ausente), a landing serve o padrão do app.
   */
  readonly landingCompanyId: string | undefined
}

export type LandingSettingsUseCase = Readonly<{
  getForCompany: (input: {
    readonly context: CompanyContext
  }) => Promise<LandingSettingsRecord | null>
  getPublic: () => Promise<PublicLandingSettings>
  update: (
    input: LandingSettingsWriteRequest & { readonly context: CompanyContext },
  ) => Promise<LandingSettingsRecord>
}>

export function createLandingSettingsUseCase(dependencies: Dependencies): LandingSettingsUseCase {
  async function resolveRoot(companyId: string): Promise<string | null> {
    const units = await dependencies.companyGroupRepository.listGroupUnits({ companyId })
    const [own] = units
    return own === undefined ? null : resolveCompanyGroupRoot(own.cnpj)
  }

  return {
    async getForCompany({ context }) {
      const root = await resolveRoot(context.companyId)
      if (root === null) return null
      return dependencies.landingSettingsRepository.findByRoot({ cnpjRoot: root })
    },

    async getPublic() {
      if (dependencies.landingCompanyId === undefined) {
        return {
          accentColor: undefined,
          brandName: undefined,
          contacts: [],
          contactEmail: undefined,
          contactPhone: undefined,
          sections: {},
          socialLinks: [],
          units: [],
        }
      }

      const [units, contactSettings] = await Promise.all([
        dependencies.companyGroupRepository.listGroupUnits({
          companyId: dependencies.landingCompanyId,
        }),
        dependencies.companyContactsRepository.load({ companyId: dependencies.landingCompanyId }),
      ])
      const [own] = units
      const settings =
        own === undefined
          ? null
          : await dependencies.landingSettingsRepository.findByRoot({
              cnpjRoot: resolveCompanyGroupRoot(own.cnpj),
            })

      return {
        accentColor: settings?.accentColor,
        brandName: settings?.brandName,
        contacts: contactSettings.contacts,
        contactEmail: settings?.contactEmail,
        contactPhone: settings?.contactPhone,
        sections: settings?.sections ?? {},
        socialLinks: contactSettings.socialLinks,
        units,
      }
    },

    async update({ context, ...input }) {
      const root = await resolveRoot(context.companyId)
      if (root === null) {
        throw new Error('cannot resolve company group root for landing settings update')
      }

      const sanitized = sanitizeLandingSettingsInput(input)
      return dependencies.landingSettingsRepository.upsert({ ...sanitized, cnpjRoot: root })
    },
  }
}
