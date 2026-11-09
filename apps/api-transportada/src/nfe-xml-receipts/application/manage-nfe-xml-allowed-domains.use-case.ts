/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 313: liberar (ou desligar) um domínio de e-mail a enviar XML de NF-e, sempre de um contratante.
 */
import {
  NfeXmlAllowedDomainContractorNotFoundError,
  NfeXmlPublicEmailDomainError,
} from '../domain/nfe-xml-allowed-domain.error.js'
import {
  NFE_XML_PUBLIC_EMAIL_PROVIDERS,
  normalizeAllowedDomain,
} from '../domain/nfe-xml-allowed-domain.policy.js'

export type NfeXmlAllowedDomainView = {
  readonly contractorId: string | null
  readonly contractorName: string | null
  readonly createdAt: string
  readonly domain: string
  readonly id: string
  readonly status: 'active' | 'inactive'
}

export type NfeXmlAllowedDomainPort = {
  /** `undefined` quando o contratante não é da empresa. */
  release(input: {
    readonly companyId: string
    readonly contractorId: string
    readonly domain: string
  }): Promise<NfeXmlAllowedDomainView | undefined>
  list(input: { readonly companyId: string }): Promise<readonly NfeXmlAllowedDomainView[]>
  /** `undefined` quando o domínio não é da empresa. */
  setStatus(input: {
    readonly companyId: string
    readonly id: string
    readonly status: 'active' | 'inactive'
  }): Promise<NfeXmlAllowedDomainView | undefined>
}

export function createListNfeXmlAllowedDomainsUseCase(dependencies: {
  readonly repository: NfeXmlAllowedDomainPort
}) {
  return {
    execute: (input: { readonly companyId: string }) => dependencies.repository.list(input),
  }
}

export function createReleaseNfeXmlAllowedDomainUseCase(dependencies: {
  readonly repository: NfeXmlAllowedDomainPort
}) {
  return {
    async execute(input: {
      readonly companyId: string
      readonly contractorId: string
      readonly domain: string
    }): Promise<NfeXmlAllowedDomainView> {
      const domain = normalizeAllowedDomain(input.domain)
      if (domain === null) throw new RangeError('invalid domain')
      if (NFE_XML_PUBLIC_EMAIL_PROVIDERS.has(domain)) throw new NfeXmlPublicEmailDomainError()
      const view = await dependencies.repository.release({ ...input, domain })
      if (view === undefined) throw new NfeXmlAllowedDomainContractorNotFoundError()
      return view
    },
  }
}
