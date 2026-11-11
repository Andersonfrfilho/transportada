/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316 T1.1/T1.3: o vendedor da contratante é cadastro do escritório (`settings.manage`). O contato é normalizado
 * (e-mail em minúsculas, WhatsApp em E.164 com a chave do nono dígito), ao menos um canal é obrigatório, a carteira não
 * repete cliente e a empresa e o ator nunca vêm do corpo.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type {
  PortfolioClient,
  Salesperson,
  SalespersonPort,
} from '../../src/salespeople/application/salesperson.port.js'
import {
  createCreateSalespersonUseCase,
  createLinkSalespersonContractorUseCase,
  createListSalespeopleUseCase,
  createReadSalespersonPortfolioUseCase,
  createReplaceSalespersonPortfolioUseCase,
  createUnlinkSalespersonContractorUseCase,
  createUpdateSalespersonUseCase,
} from '../../src/salespeople/application/salesperson.use-case.js'
import { resolveSalespersonContact } from '../../src/salespeople/domain/salesperson-contact.policy.js'
import { createSalespersonRoutes } from '../../src/salespeople/presentation/salesperson.routes.js'
import { API_SALESPEOPLE_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const SALESPERSON_ID = '55555555-5555-4555-8555-555555555555'
const CONTRACTOR_ID = '66666666-6666-4666-8666-666666666666'
const NOW = new Date('2026-11-10T12:00:00.000Z')

const CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '44444444-4444-4444-8444-444444444444',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

type Call = Record<string, unknown>

function fakePort() {
  const calls: Call[] = []
  const person = (fields?: Call): Salesperson => ({
    contractors: [],
    createdAt: NOW,
    email: (fields?.email as string | null | undefined) ?? 'ana@loja.com.br',
    id: SALESPERSON_ID,
    name: (fields?.name as string | undefined) ?? 'Ana',
    status: 'active',
    updatedAt: NOW,
    whatsappE164: (fields?.whatsappE164 as string | null | undefined) ?? null,
  })
  const clients: PortfolioClient[] = []
  const port: SalespersonPort = {
    create: async (params) => {
      calls.push({ op: 'create', ...params })
      return person(params.fields)
    },
    linkContractor: async (params) => {
      calls.push({ op: 'link', ...params })
      return person()
    },
    list: async (params) => {
      calls.push({ op: 'list', ...params })
      return []
    },
    readPortfolio: async (params) => {
      calls.push({ op: 'readPortfolio', ...params })
      return clients
    },
    replacePortfolio: async (params) => {
      calls.push({ op: 'replacePortfolio', ...params })
      return clients
    },
    unlinkContractor: async (params) => {
      calls.push({ op: 'unlink', ...params })
      return person()
    },
    update: async (params) => {
      calls.push({ op: 'update', ...params })
      return person(params.fields)
    },
  }

  return { calls, port }
}

function routesFor(port: SalespersonPort) {
  const dependencies = { salespeople: port }
  return createSalespersonRoutes({
    create: createCreateSalespersonUseCase(dependencies),
    link: createLinkSalespersonContractorUseCase(dependencies),
    list: createListSalespeopleUseCase(dependencies),
    readPortfolio: createReadSalespersonPortfolioUseCase(dependencies),
    replacePortfolio: createReplaceSalespersonPortfolioUseCase(dependencies),
    resolveClientIp: () => '10.0.0.9',
    unlink: createUnlinkSalespersonContractorUseCase(dependencies),
    update: createUpdateSalespersonUseCase(dependencies),
  })
}

function callRoute(params: {
  readonly body?: unknown
  readonly method: string
  readonly path: string
  readonly pathname: string
  readonly port: SalespersonPort
}): Promise<Response> {
  const route = routesFor(params.port).find(
    (candidate) => candidate.method === params.method && candidate.pathname === params.pathname,
  )
  if (route === undefined) throw new Error(`missing ${params.method} ${params.pathname}`)

  return route.execute({
    context: { identity: undefined, scope: CONTEXT } as never,
    correlationId: 'salesperson-contract',
    pathParameters: { contractorId: CONTRACTOR_ID, id: SALESPERSON_ID },
    request: new Request(`http://api.test${params.path}`, {
      ...(params.body === undefined
        ? {}
        : { body: JSON.stringify(params.body), headers: { 'content-type': 'application/json' } }),
      method: params.method,
    }),
  })
}

async function rejection(attempt: () => unknown): Promise<ApiError> {
  try {
    await attempt()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected the attempt to be rejected')
}

const ITEM = `${API_SALESPEOPLE_PATH}/:id`
const CONTRACTOR = `${ITEM}/contractors/:contractorId`
const PORTFOLIO = `${CONTRACTOR}/clients`

describe('o contato do vendedor (spec 316)', () => {
  test('e-mail em minúsculas e WhatsApp em E.164, com a chave do celular', () => {
    expect(
      resolveSalespersonContact({ email: ' Ana@Loja.COM.br ', whatsapp: '(11) 99999-8888' }),
    ).toEqual({
      email: 'ana@loja.com.br',
      whatsappE164: '+5511999998888',
      whatsappPhoneKey: '551199998888',
    })
  })

  test('o mesmo celular digitado com e sem o código do país cai na mesma chave', () => {
    const withNinth = resolveSalespersonContact({ email: null, whatsapp: '11 99999-8888' })
    const withoutNinth = resolveSalespersonContact({ email: null, whatsapp: '+55 11 99999-8888' })
    expect(withNinth.whatsappPhoneKey).toBe(withoutNinth.whatsappPhoneKey)
  })

  test('só e-mail ou só WhatsApp basta; nenhum dos dois é recusado', async () => {
    expect(resolveSalespersonContact({ email: 'a@b.co', whatsapp: null }).whatsappE164).toBeNull()
    expect(resolveSalespersonContact({ email: null, whatsapp: '11999998888' }).email).toBeNull()
    const refused = await rejection(() => resolveSalespersonContact({ email: ' ', whatsapp: '' }))
    expect(refused.code).toBe('SALESPERSON_CONTACT_REQUIRED')
    expect(refused.status).toBe(400)
  })

  test('WhatsApp inválido é recusado com erro estável', async () => {
    const refused = await rejection(() =>
      resolveSalespersonContact({ email: null, whatsapp: '123' }),
    )
    expect(refused.code).toBe('SALESPERSON_WHATSAPP_INVALID')
  })
})

describe('o cadastro do vendedor é do escritório (spec 316)', () => {
  test('toda rota exige settings.manage na empresa', () => {
    const routes = routesFor(fakePort().port)
    expect(routes).toHaveLength(7)
    for (const route of routes) {
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
  })

  test('criar normaliza o contato e leva só a empresa e o ator do contexto', async () => {
    const { calls, port } = fakePort()
    const response = await callRoute({
      body: { email: 'ANA@loja.com.br', name: '  Ana ', whatsapp: '11999998888' },
      method: 'POST',
      path: API_SALESPEOPLE_PATH,
      pathname: API_SALESPEOPLE_PATH,
      port,
    })

    expect(response.status).toBe(201)
    expect(calls[0]).toMatchObject({
      companyId: COMPANY_ID,
      fields: { email: 'ana@loja.com.br', name: 'Ana', whatsappE164: '+5511999998888' },
      ipAddress: '10.0.0.9',
      userId: USER_ID,
    })
  })

  test('a empresa nunca vem do corpo (.strict())', async () => {
    const { port } = fakePort()
    const refused = await rejection(() =>
      callRoute({
        body: { companyId: crypto.randomUUID(), email: 'a@b.co', name: 'Ana' },
        method: 'POST',
        path: API_SALESPEOPLE_PATH,
        pathname: API_SALESPEOPLE_PATH,
        port,
      }),
    )
    expect(refused.status).toBe(400)
  })

  test('a resposta é lista branca: nada do objeto do repositório vaza', async () => {
    const { port } = fakePort()
    const response = await callRoute({
      body: { email: 'a@b.co', name: 'Ana' },
      method: 'POST',
      path: API_SALESPEOPLE_PATH,
      pathname: API_SALESPEOPLE_PATH,
      port,
    })
    const { data } = (await response.json()) as { data: Record<string, unknown> }

    expect(Object.keys(data).sort()).toEqual([
      'contractors',
      'createdAt',
      'email',
      'id',
      'name',
      'status',
      'updatedAt',
      'whatsapp',
    ])
  })

  test('a lista repassa a busca e a ligação usa os dois ids do caminho', async () => {
    const { calls, port } = fakePort()
    await callRoute({
      method: 'GET',
      path: `${API_SALESPEOPLE_PATH}?search=ana`,
      pathname: API_SALESPEOPLE_PATH,
      port,
    })
    await callRoute({ method: 'PUT', path: 'x', pathname: CONTRACTOR, port })
    await callRoute({ method: 'DELETE', path: 'x', pathname: CONTRACTOR, port })

    expect(calls[0]).toMatchObject({ companyId: COMPANY_ID, op: 'list', search: 'ana' })
    expect(calls[1]).toMatchObject({ contractorId: CONTRACTOR_ID, id: SALESPERSON_ID, op: 'link' })
    expect(calls[2]).toMatchObject({ op: 'unlink' })
  })

  test('a carteira sem repetição, em maiúsculas, e recusa CNPJ malformado', async () => {
    const { calls, port } = fakePort()
    await callRoute({
      body: { taxIds: ['12345678000199', '12345678000199', 'ab1234567890ab'.slice(0, 12) + '12'] },
      method: 'PUT',
      path: 'x',
      pathname: PORTFOLIO,
      port,
    })
    expect(calls[0]).toMatchObject({
      op: 'replacePortfolio',
      taxIds: ['12345678000199', 'AB123456789012'],
    })

    const refused = await rejection(() =>
      callRoute({
        body: { taxIds: ['não é cnpj'] },
        method: 'PUT',
        path: 'x',
        pathname: PORTFOLIO,
        port,
      }),
    )
    expect(refused.status).toBe(400)
  })
})
