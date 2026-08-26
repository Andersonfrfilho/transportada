/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import type { CnpjInfo } from '@adatechnology/fiscal-provider'

import type { CompanyProfileLookupPort } from '../../src/companies/application/company-settings.port.js'

const ALPHANUMERIC_CNPJ = '12ABC34501DE35'
const LEGACY_CNPJ = '11222333000181'

const RECEITA_ANSWER: CnpjInfo = {
  bairro: 'Centro',
  cep: '01310-100',
  cnae: '4930202',
  cnaeDescricao: 'Transporte rodoviário de carga',
  cnpj: ALPHANUMERIC_CNPJ,
  codigoMunicipio: '3550308',
  complemento: 'Sala 12',
  dataAbertura: '2019-04-11',
  email: 'contato@exemplo.com.br',
  inscricaoEstadual: '111222333444',
  logradouro: 'Avenida Paulista',
  municipio: 'São Paulo',
  naturezaJuridica: '2135',
  nomeFantasia: 'Exemplo',
  numero: '1000',
  optanteSimplesNacional: true,
  porte: 'MICRO EMPRESA',
  razaoSocial: 'Exemplo Transportes Ltda',
  situacao: 'ATIVA',
  telefone: '1140028922',
  uf: 'sp',
}

describe('fiscal company profile lookup contract', () => {
  const requestedDocuments: string[] = []
  let gateway: CompanyProfileLookupPort
  let nextOutcome: CnpjInfo | Error = RECEITA_ANSWER
  let restoreLookup: () => void = () => undefined

  beforeAll(async () => {
    const fiscalProvider = await import('@adatechnology/fiscal-provider')
    const lookupSpy = spyOn(fiscalProvider, 'consultarCnpj').mockImplementation(async (cnpj) => {
      requestedDocuments.push(cnpj)
      if (nextOutcome instanceof Error) throw nextOutcome
      return nextOutcome
    })
    restoreLookup = () => lookupSpy.mockRestore()

    const { createFiscalCompanyProfileLookupGateway } = await import(
      '../../src/companies/infrastructure/fiscal-company-profile-lookup.gateway.js'
    )
    gateway = createFiscalCompanyProfileLookupGateway()
  })

  afterAll(() => {
    restoreLookup()
  })

  test('turns the fields the Receita omits into empty, never undefined', async () => {
    nextOutcome = {
      cnpj: ALPHANUMERIC_CNPJ,
      razaoSocial: 'Exemplo Transportes Ltda',
      situacao: 'ATIVA',
    }

    const profile = await gateway.lookupByCnpj({ cnpj: ALPHANUMERIC_CNPJ })

    expect(profile?.openedAt).toBe('')
    expect(profile?.mainActivityCode).toBe('')
    expect(profile?.legalNature).toBe('')
    expect(profile?.size).toBe('')
    expect(profile?.simplesNacional).toBe(false)
  })

  test('keeps the letters of an alphanumeric document on the way in and on the way out', async () => {
    requestedDocuments.length = 0
    nextOutcome = RECEITA_ANSWER

    const profile = await gateway.lookupByCnpj({ cnpj: ALPHANUMERIC_CNPJ })

    expect(requestedDocuments).toEqual([ALPHANUMERIC_CNPJ])
    expect(profile?.cnpj).toBe(ALPHANUMERIC_CNPJ)
  })

  test('normalizes the masked document the Receita may answer with', async () => {
    requestedDocuments.length = 0
    nextOutcome = { ...RECEITA_ANSWER, cnpj: '12.ABC.345/01DE-35' }

    const profile = await gateway.lookupByCnpj({ cnpj: ALPHANUMERIC_CNPJ })

    expect(profile?.cnpj).toBe(ALPHANUMERIC_CNPJ)
  })

  test('keeps answering the legacy numeric document unchanged', async () => {
    requestedDocuments.length = 0
    nextOutcome = { ...RECEITA_ANSWER, cnpj: '11.222.333/0001-81' }

    const profile = await gateway.lookupByCnpj({ cnpj: LEGACY_CNPJ })

    expect(requestedDocuments).toEqual([LEGACY_CNPJ])
    expect(profile?.cnpj).toBe(LEGACY_CNPJ)
  })

  test('strips the mask of the fields that stay numeric and normalizes the state', async () => {
    nextOutcome = RECEITA_ANSWER

    const profile = await gateway.lookupByCnpj({ cnpj: ALPHANUMERIC_CNPJ })

    expect(profile).toEqual({
      city: 'São Paulo',
      cityIbgeCode: '3550308',
      cnpj: ALPHANUMERIC_CNPJ,
      complement: 'Sala 12',
      district: 'Centro',
      email: 'contato@exemplo.com.br',
      legalName: 'Exemplo Transportes Ltda',
      legalNature: '2135',
      mainActivityCode: '4930202',
      mainActivityName: 'Transporte rodoviário de carga',
      number: '1000',
      openedAt: '2019-04-11',
      phone: '1140028922',
      postalCode: '01310100',
      simplesNacional: true,
      size: 'MICRO EMPRESA',
      situation: 'ATIVA',
      state: 'SP',
      stateRegistration: '111222333444',
      street: 'Avenida Paulista',
      tradeName: 'Exemplo',
    })
  })

  test('answers nothing when the consultation fails', async () => {
    nextOutcome = new Error('CNPJ 12ABC34501DE35 não encontrado na Receita Federal')

    expect(await gateway.lookupByCnpj({ cnpj: ALPHANUMERIC_CNPJ })).toBeNull()
  })

  test('takes the normalization from the shared seam, never from a digit-only filter', async () => {
    const gatewaySource = await Bun.file(
      new URL(
        '../../src/companies/infrastructure/fiscal-company-profile-lookup.gateway.ts',
        import.meta.url,
      ),
    ).text()

    expect(gatewaySource).toMatch(/normalizeTaxId.+from ['"]\.\.\/\.\.\/shared\/tax-id\.service/su)
    expect(gatewaySource).not.toMatch(/onlyDigits\(result\.cnpj\)/u)
  })
})
