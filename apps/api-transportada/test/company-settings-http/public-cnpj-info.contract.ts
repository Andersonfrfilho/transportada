/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyProfileLookupResult } from '../../src/companies/application/company-settings.port.js'
import { createPublicCnpjInfoRoutes } from '../../src/companies/presentation/public-cnpj-info.routes.js'
import { API_PUBLIC_CNPJ_INFO_PATH } from '../../src/shared/api.constant.js'

const CNPJ = '11222333000181'

const RECEITA_PROFILE: CompanyProfileLookupResult = {
  city: 'São Paulo',
  cityIbgeCode: '3550308',
  cnpj: CNPJ,
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
}

function buildRoute(result: CompanyProfileLookupResult | null) {
  const requested: string[] = []
  const [route] = createPublicCnpjInfoRoutes({
    lookupProfileByCnpj: {
      async execute({ cnpj }) {
        requested.push(cnpj)
        return result
      },
    },
  })
  if (route === undefined) throw new Error('rota não registrada')
  return {
    requested,
    run: (query: string) =>
      route.execute({
        correlationId: 'test-correlation',
        pathParameters: {},
        request: new Request(`https://api.local${API_PUBLIC_CNPJ_INFO_PATH}${query}`),
      }),
  }
}

describe('GET /public/cnpj-info contract', () => {
  test('answers the public card of the company, and normalizes the mask on the way in', async () => {
    const route = buildRoute(RECEITA_PROFILE)

    const response = await route.run('?cnpj=11.222.333/0001-81')
    const body = (await response.json()) as { data: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(route.requested).toEqual([CNPJ])
    expect(body.data).toEqual({
      address: {
        city: 'São Paulo',
        cityIbgeCode: '3550308',
        complement: 'Sala 12',
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
    })
  })

  /**
   * A rota é anônima: inscrição estadual, e-mail e telefone são contato do titular, e sair daqui
   * seria entregá-los a quem só digitou catorze dígitos.
   */
  test('never lets the owner contact data out', async () => {
    const route = buildRoute(RECEITA_PROFILE)

    const response = await route.run(`?cnpj=${CNPJ}`)
    const raw = await response.text()

    expect(raw).not.toContain('111222333444')
    expect(raw).not.toContain('contato@exemplo.com.br')
    expect(raw).not.toContain('1140028922')
    expect(raw).not.toContain('stateRegistration')
    expect(raw).not.toContain('email')
    expect(raw).not.toContain('phone')
  })

  test('answers 404 with no body when the Receita does not know the document', async () => {
    const route = buildRoute(null)

    const response = await route.run(`?cnpj=${CNPJ}`)

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })

  test('refuses a malformed document before touching the gateway', async () => {
    const route = buildRoute(RECEITA_PROFILE)

    await expect(route.run('?cnpj=123')).rejects.toThrow()
    await expect(route.run('')).rejects.toThrow()
    expect(route.requested).toEqual([])
  })

  /** Rota anônima que dispara consulta externa sem teto vira proxy da Receita para terceiros. */
  test('declares a rate limit', () => {
    const [route] = createPublicCnpjInfoRoutes({
      lookupProfileByCnpj: { execute: async () => null },
    })

    expect(route?.rateLimit).toBeDefined()
  })
})
