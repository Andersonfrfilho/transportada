import { describe, expect, test } from 'bun:test'

import {
  createCompanyInfoClient,
  mergeCompanyIntoFields,
  type CompanyDeclaredFields,
  type CompanyInfo,
} from '../../src/modules/application/shared/cnpjInfo.service.js'
import { formatPostalCode } from '../../src/modules/application/shared/postalCode.service.js'
import { isLookupableCnpj } from '../../src/modules/application/hooks/useCompanyLookup.hook.js'

const CNPJ = '11222333000181'

const API_ANSWER = {
  data: {
    address: {
      city: 'São Paulo',
      cityIbgeCode: '3550308',
      complement: '',
      district: 'Centro',
      number: '1000',
      postalCode: '01310100',
      state: 'SP',
      street: 'Avenida Paulista',
    },
    cnpj: CNPJ,
    legalName: 'Exemplo Transportes Ltda',
    legalNature: '2135',
    mainActivityCode: '4930202',
    mainActivityName: 'Transporte rodoviário de carga',
    openedAt: '2019-04-11',
    simplesNacional: true,
    size: 'MICRO EMPRESA',
    situation: 'ATIVA',
    tradeName: 'Exemplo',
  },
}

function withFetch<T>(
  respond: (url: string) => Response | Promise<Response>,
  run: (requested: string[]) => Promise<T>,
): Promise<T> {
  const requested: string[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: unknown) => {
    requested.push(String(input))
    return Promise.resolve(respond(String(input)))
  }) as unknown as typeof fetch
  return run(requested).finally(() => {
    globalThis.fetch = originalFetch
  })
}

describe('public cnpj lookup client', () => {
  test('asks the public route with the document stripped of its mask', async () => {
    await withFetch(
      () => new Response(JSON.stringify(API_ANSWER), { status: 200 }),
      async (requested) => {
        const client = createCompanyInfoClient({ apiBaseUrl: 'http://api.local' })
        const company = await client.lookup({ cnpj: '11.222.333/0001-81' })

        expect(requested).toEqual([`http://api.local/public/cnpj-info?cnpj=${CNPJ}`])
        expect(company?.legalName).toBe('Exemplo Transportes Ltda')
        expect(company?.address.street).toBe('Avenida Paulista')
        expect(company?.situation).toBe('ATIVA')
      },
    )
  })

  /** A tela segue funcionando sem a Receita: campo vazio e editável, nunca formulário travado. */
  test('answers undefined when the document is unknown, and when the route fails', async () => {
    await withFetch(
      () => new Response(null, { status: 404 }),
      async () => {
        const client = createCompanyInfoClient({ apiBaseUrl: 'http://api.local' })
        expect(await client.lookup({ cnpj: CNPJ })).toBeUndefined()
      },
    )

    await withFetch(
      () => new Response('não é json', { status: 200 }),
      async () => {
        const client = createCompanyInfoClient({ apiBaseUrl: 'http://api.local' })
        expect(await client.lookup({ cnpj: CNPJ })).toBeUndefined()
      },
    )

    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new Error('rede fora'))) as unknown as typeof fetch
    try {
      const client = createCompanyInfoClient({ apiBaseUrl: 'http://api.local' })
      expect(await client.lookup({ cnpj: CNPJ })).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('a corpo sem cnpj não vira empresa de campos vazios', async () => {
    await withFetch(
      () => new Response(JSON.stringify({ data: { legalName: 'Sem documento' } }), { status: 200 }),
      async () => {
        const client = createCompanyInfoClient({ apiBaseUrl: 'http://api.local' })
        expect(await client.lookup({ cnpj: CNPJ })).toBeUndefined()
      },
    )
  })

  test('only a complete CNPJ is looked up — CPF and half-typed documents are not', () => {
    expect(isLookupableCnpj('11.222.333/0001-81')).toBe(true)
    expect(isLookupableCnpj('11222333000181')).toBe(true)
    expect(isLookupableCnpj('123.456.789-01')).toBe(false)
    expect(isLookupableCnpj('11222333')).toBe(false)
    expect(isLookupableCnpj('')).toBe(false)
  })
})

const COMPANY = API_ANSWER.data as CompanyInfo

const EMPTY: CompanyDeclaredFields = {
  city: '',
  companyLegalName: '',
  companyOpenedAt: '',
  companySituation: '',
  companyTradeName: '',
  complement: '',
  district: '',
  number: '',
  postalCode: '',
  state: '',
  street: '',
}

describe('what the Receita answers versus what the person typed', () => {
  test('fills the empty address, with the postal code masked as the field expects', () => {
    const merged = mergeCompanyIntoFields({ company: COMPANY, current: EMPTY, formatPostalCode })

    expect(merged.street).toBe('Avenida Paulista')
    expect(merged.city).toBe('São Paulo')
    expect(merged.state).toBe('SP')
    expect(merged.postalCode).toBe('01310-100')
    expect(merged.companyLegalName).toBe('Exemplo Transportes Ltda')
  })

  /** É a regra que faz a consulta ser ajuda e não atropelo. */
  test('never overwrites a field the person already filled', () => {
    const typed: CompanyDeclaredFields = {
      ...EMPTY,
      city: 'Osasco',
      number: '77',
      postalCode: '06010-000',
      street: 'Rua do Motorista',
    }

    const merged = mergeCompanyIntoFields({ company: COMPANY, current: typed, formatPostalCode })

    expect(merged.street).toBe('Rua do Motorista')
    expect(merged.city).toBe('Osasco')
    expect(merged.number).toBe('77')
    expect(merged.postalCode).toBe('06010-000')
    // o que ela não digitou continua vindo da Receita
    expect(merged.district).toBe('Centro')
    expect(merged.state).toBe('SP')
  })

  test('a segunda consulta corrige os dados da empresa, que só existem por causa dela', () => {
    const outra: CompanyInfo = { ...COMPANY, legalName: 'Outra Razão', situation: 'BAIXADA' }
    const current: CompanyDeclaredFields = {
      ...EMPTY,
      companyLegalName: 'Exemplo Transportes Ltda',
      companySituation: 'ATIVA',
    }

    const merged = mergeCompanyIntoFields({ company: outra, current, formatPostalCode })

    expect(merged.companyLegalName).toBe('Outra Razão')
    expect(merged.companySituation).toBe('BAIXADA')
  })
})
