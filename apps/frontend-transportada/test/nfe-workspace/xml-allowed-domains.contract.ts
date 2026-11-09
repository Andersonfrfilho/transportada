/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  createNfeXmlAllowedDomainsClient,
  NfeXmlAllowedDomainRequestError,
  parseNfeXmlAllowedDomains,
} from '../../src/modules/nfe-workspace/shared/nfeXmlAllowedDomains.service'

const ROW = {
  contractorId: 'c1',
  contractorName: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
  createdAt: '2026-11-09T18:46:23.130Z',
  domain: 'spani.com.br',
  id: 'd1',
  status: 'active',
}

describe('allowed domains (spec 313)', () => {
  test('parses the list, keeps the contractor and drops rows it does not understand', () => {
    const parsed = parseNfeXmlAllowedDomains({
      data: [ROW, { ...ROW, contractorId: null, contractorName: null, id: 'd2' }, { id: 'x' }],
    })
    expect(parsed.map((row) => row.id)).toEqual(['d1', 'd2'])
    expect(parsed[0]?.contractorName).toBe('COMERCIAL ZARAGOZA IMP EXP LTDA')
    expect(parsed[1]?.contractorId).toBeNull()
  })

  test('refuses a body without data', () => {
    expect(() => parseNfeXmlAllowedDomains({})).toThrow('NFE_XML_ALLOWED_DOMAINS_RESPONSE_INVALID')
  })

  test('release posts the domain with the contractor and nothing about the company', async () => {
    const requests: Request[] = []
    const client = createNfeXmlAllowedDomainsClient({
      apiUrl: 'https://api.exemplo.com',
      fetch: (input) => {
        requests.push(input as Request)
        return Promise.resolve(new Response(JSON.stringify({ data: ROW }), { status: 201 }))
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    await client.release({ contractorId: 'c1', domain: 'spani.com.br' })
    const request = requests[0] as Request
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.exemplo.com/nfe-xml-allowed-domains')
    expect(await request.json()).toEqual({ contractorId: 'c1', domain: 'spani.com.br' })
  })

  test('surfaces the API error code', async () => {
    const client = createNfeXmlAllowedDomainsClient({
      apiUrl: 'https://api.exemplo.com',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'NFE_XML_PUBLIC_EMAIL_DOMAIN' } }), {
            status: 400,
          }),
        ),
      getAccessToken: () => Promise.resolve('token'),
    })
    const error: unknown = await client.release({ contractorId: 'c1', domain: 'gmail.com' }).then(
      () => undefined,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(NfeXmlAllowedDomainRequestError)
    expect((error as NfeXmlAllowedDomainRequestError).code).toBe('NFE_XML_PUBLIC_EMAIL_DOMAIN')
  })
})
