/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 313: o domínio liberado a enviar XML pertence a um contratante, e provedor público nunca é liberado inteiro.
 */
import { describe, expect, test } from 'bun:test'

import {
  createReleaseNfeXmlAllowedDomainUseCase,
  type NfeXmlAllowedDomainPort,
  type NfeXmlAllowedDomainView,
} from '../../src/nfe-xml-receipts/application/manage-nfe-xml-allowed-domains.use-case.js'
import { normalizeAllowedDomain } from '../../src/nfe-xml-receipts/domain/nfe-xml-allowed-domain.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const CONTRACTOR_ID = '00000000-0000-4000-8000-0000000000c1'

function repository(known = true): NfeXmlAllowedDomainPort & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    list: () => Promise.resolve([]),
    release: ({ domain, contractorId }) => {
      calls.push(domain)
      const view: NfeXmlAllowedDomainView = {
        contractorId,
        contractorName: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
        createdAt: '2026-11-09T00:00:00.000Z',
        domain,
        id: 'd1',
        status: 'active',
      }
      return Promise.resolve(known ? view : undefined)
    },
    setStatus: () => Promise.resolve(undefined),
  }
}

describe('normalizeAllowedDomain', () => {
  test('keeps only the lowercase domain', () => {
    expect(normalizeAllowedDomain(' @SPANI.com.br ')).toBe('spani.com.br')
    expect(normalizeAllowedDomain('fulano@Spani.com.br')).toBe('spani.com.br')
  })
  test('rejects what is not a domain', () => {
    expect(normalizeAllowedDomain('spani')).toBeNull()
    expect(normalizeAllowedDomain('sp ani.com')).toBeNull()
    expect(normalizeAllowedDomain('')).toBeNull()
  })
})

describe('release a domain to a contractor', () => {
  test('releases the domain for the chosen contractor', async () => {
    const repo = repository()
    const view = await createReleaseNfeXmlAllowedDomainUseCase({ repository: repo }).execute({
      companyId: COMPANY_ID,
      contractorId: CONTRACTOR_ID,
      domain: '@spani.com.br',
    })
    expect(view).toMatchObject({
      contractorId: CONTRACTOR_ID,
      domain: 'spani.com.br',
      status: 'active',
    })
  })

  test('refuses a public mail provider and never reaches the repository', async () => {
    const repo = repository()
    await expect(
      createReleaseNfeXmlAllowedDomainUseCase({ repository: repo }).execute({
        companyId: COMPANY_ID,
        contractorId: CONTRACTOR_ID,
        domain: 'gmail.com',
      }),
    ).rejects.toMatchObject({ code: 'NFE_XML_PUBLIC_EMAIL_DOMAIN', status: 400 })
    expect(repo.calls).toEqual([])
  })

  test('refuses a contractor that is not in the company', async () => {
    await expect(
      createReleaseNfeXmlAllowedDomainUseCase({ repository: repository(false) }).execute({
        companyId: COMPANY_ID,
        contractorId: CONTRACTOR_ID,
        domain: 'spani.com.br',
      }),
    ).rejects.toMatchObject({ code: 'NFE_XML_ALLOWED_DOMAIN_CONTRACTOR_NOT_FOUND', status: 404 })
  })
})
