/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  chooseDistributorRequest,
  clearDistributorRequest,
  COMPANY_ID,
  createCompanyEnergyHttpFixture,
  ENERGY_PATH,
  FRONTEND_ORIGIN,
  readEnergyRequest,
} from '../fixtures/company-energy-http.fixture'

const SERIALIZED_CATALOG = [
  { code: 'CERACA', taxId: '12345678000195' },
  { code: 'CPFL-PAULISTA', taxId: '33050196000188' },
]

describe('GET /company-settings/energy HTTP contract', () => {
  /**
   * A lista vem junto da escolha porque o painel precisa das duas: sem catálogo o select abre vazio,
   * e uma segunda rota só para ele custaria uma ida a mais para desenhar um campo.
   */
  test('answers the catalog and the neutral factor while nobody chose a distributor', async () => {
    const fixture = await createCompanyEnergyHttpFixture()

    const response = await fixture.handle(readEnergyRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        adjustmentFactor: '1.0000',
        distributorCode: null,
        distributors: SERIALIZED_CATALOG,
      },
    })
    expect(fixture.readCalls).toEqual([COMPANY_ID])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('answers the saved choice beside the catalog it came from', async () => {
    const fixture = await createCompanyEnergyHttpFixture({
      choice: { adjustmentFactor: '1.3500', distributorCode: 'CERACA' },
    })

    const response = await fixture.handle(readEnergyRequest())

    expect(await response.json()).toEqual({
      data: {
        adjustmentFactor: '1.3500',
        distributorCode: 'CERACA',
        distributors: SERIALIZED_CATALOG,
      },
    })
  })

  test('answers an empty catalog instead of failing before the first collection runs', async () => {
    const fixture = await createCompanyEnergyHttpFixture({ catalog: [] })

    const response = await fixture.handle(readEnergyRequest())

    expect(response.status).toBe(200)
    expect(
      ((await response.json()) as { data: { distributors: unknown[] } }).data.distributors,
    ).toEqual([])
  })
})

describe('PUT /company-settings/energy HTTP contract', () => {
  test('saves the choice and answers how the settings ended up', async () => {
    const fixture = await createCompanyEnergyHttpFixture()

    const response = await fixture.handle(
      chooseDistributorRequest({ adjustmentFactor: '1.3500', distributorCode: 'CERACA' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        adjustmentFactor: '1.3500',
        distributorCode: 'CERACA',
        distributors: SERIALIZED_CATALOG,
      },
    })
    expect(fixture.chooseCalls).toEqual([
      { adjustmentFactor: '1.3500', companyId: COMPANY_ID, distributorCode: 'CERACA' },
    ])
  })

  /** A sigla é gravada em caixa alta pelo CHECK do banco: subir a caixa aqui evita o 500 do fio. */
  test('raises the case of the code before the use case sees it', async () => {
    const fixture = await createCompanyEnergyHttpFixture()

    await fixture.handle(
      chooseDistributorRequest({ adjustmentFactor: '1.0000', distributorCode: 'ceraca' }),
    )

    expect(fixture.chooseCalls[0]?.distributorCode).toBe('CERACA')
  })

  /**
   * Código fora da lista não é pedido malformado — é escolha que a coleta não conhece, e gravá-la
   * daria uma linha que nunca vira preço: a tela mostraria distribuidora configurada e o elétrico
   * ficaria indisponível para sempre, sem nada reclamar.
   */
  test('refuses a distributor the collection never published', async () => {
    const fixture = await createCompanyEnergyHttpFixture()

    const response = await fixture.handle(
      chooseDistributorRequest({ adjustmentFactor: '1.0000', distributorCode: 'INEXISTENTE' }),
    )

    expect(response.status).toBe(422)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'COMPANY_ENERGY_DISTRIBUTOR_UNKNOWN',
    )
  })

  test.each([
    ['zero, which the database check refuses anyway', '0.0000'],
    ['a factor of ten, which is a typo and not a bill', '10.0000'],
    ['a factor without the four decimals', '1.35'],
    ['a negative factor', '-1.0000'],
  ])('refuses %s before touching the use case', async (_reason, adjustmentFactor) => {
    const fixture = await createCompanyEnergyHttpFixture()

    const response = await fixture.handle(
      chooseDistributorRequest({ adjustmentFactor, distributorCode: 'CERACA' }),
    )

    expect(response.status).toBe(400)
    expect(fixture.chooseCalls).toHaveLength(0)
  })

  test.each([
    ['an empty code', { adjustmentFactor: '1.0000', distributorCode: '' }],
    ['a missing code', { adjustmentFactor: '1.0000' }],
    ['a missing factor', { distributorCode: 'CERACA' }],
    ['a stray field', { adjustmentFactor: '1.0000', distributorCode: 'CERACA', state: 'SP' }],
  ])('refuses %s before touching the use case', async (_reason, body) => {
    const fixture = await createCompanyEnergyHttpFixture()

    const response = await fixture.handle(chooseDistributorRequest(body))

    expect(response.status).toBe(400)
    expect(fixture.chooseCalls).toHaveLength(0)
  })

  /** `companyId` vem do contexto autenticado: mandá-lo no corpo é pedido malformado, não sugestão. */
  test('never lets the body name the company', async () => {
    const fixture = await createCompanyEnergyHttpFixture()

    const response = await fixture.handle(
      chooseDistributorRequest({
        adjustmentFactor: '1.0000',
        companyId: '00000000-0000-4000-8000-000000000000',
        distributorCode: 'CERACA',
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.chooseCalls).toHaveLength(0)
  })
})

describe('DELETE /company-settings/energy HTTP contract', () => {
  test('drops the choice, answers 204 without a body and keeps the catalog standing', async () => {
    const fixture = await createCompanyEnergyHttpFixture({
      choice: { adjustmentFactor: '1.3500', distributorCode: 'CERACA' },
    })

    const cleared = await fixture.handle(clearDistributorRequest())

    expect(cleared.status).toBe(204)
    expect(await cleared.text()).toBe('')
    expect(fixture.clearCalls).toEqual([COMPANY_ID])

    const response = await fixture.handle(readEnergyRequest())

    expect(await response.json()).toEqual({
      data: {
        adjustmentFactor: '1.0000',
        distributorCode: null,
        distributors: SERIALIZED_CATALOG,
      },
    })
  })
})

describe('/company-settings/energy security and CORS contract', () => {
  test.each(['read', 'choose', 'clear'])(
    'requires settings.manage before the %s use case runs',
    async (operation) => {
      const fixture = await createCompanyEnergyHttpFixture({
        permissions: new Set(['invoices.read']),
      })

      const response = await fixture.handle(requestFor(operation))

      expect(response.status).toBe(403)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN')
      expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
      expect(fixture.chooseCalls).toHaveLength(0)
      expect(fixture.clearCalls).toHaveLength(0)
      expect(fixture.readCalls).toHaveLength(0)
      expect(response.headers.get('cache-control')).toBe('no-store')
    },
  )

  test('allows the preflight so the browser can reach the three verbs', async () => {
    const fixture = await createCompanyEnergyHttpFixture()

    const response = await fixture.handle(
      preflightRequest({ headers: 'Authorization, Content-Type', method: 'PUT' }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, PUT, DELETE')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.events).toEqual([])
  })

  test('reduces an unexpected failure to a safe no-store 500', async () => {
    const fixture = await createCompanyEnergyHttpFixture({
      readError: new Error('postgresql://user:password@private/tenant'),
    })

    const response = await fixture.handle(readEnergyRequest())
    const serialized = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(serialized).error.code).toBe('INTERNAL_ERROR')
    expect(serialized).not.toContain('password')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

function requestFor(operation: string): Request {
  if (operation === 'choose') {
    return chooseDistributorRequest({ adjustmentFactor: '1.0000', distributorCode: 'CERACA' })
  }
  return operation === 'clear' ? clearDistributorRequest() : readEnergyRequest()
}

function preflightRequest(params: { readonly headers: string; readonly method: string }): Request {
  return new Request(`http://localhost${ENERGY_PATH}`, {
    headers: {
      origin: FRONTEND_ORIGIN,
      'access-control-request-headers': params.headers,
      'access-control-request-method': params.method,
    },
    method: 'OPTIONS',
  })
}
