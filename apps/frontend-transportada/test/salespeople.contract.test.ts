/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  COMPANY_SETTINGS_TAB_IDS,
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
} from '@/modules/company-settings/shared/companySettingsTabs.service'
import {
  SALESPERSON_FAILURE,
  createSalespersonClient,
} from '@/modules/company-settings/shared/salespersonClient.service'
import {
  EMPTY_SALESPERSON_FORM,
  parseTaxIds,
  toInput,
  type Salesperson,
} from '@/modules/company-settings/shared/salesperson.validation'

/** Spec 316 T1.4: a tela dos vendedores da contratante. */
const PERSON: Salesperson = {
  contractors: [{ clientCount: 2, contractorId: 'c1', contractorName: 'Spani' }],
  email: 'ana@loja.com.br',
  id: 's1',
  name: 'Ana',
  status: 'active',
  whatsapp: '+5511999998888',
}

function clientWith(respond: (request: Request) => Response) {
  const requests: Request[] = []
  const client = createSalespersonClient({
    apiUrl: 'http://api.test',
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(respond(request))
    },
    getAccessToken: () => Promise.resolve('token'),
  })

  return { client, requests }
}

async function failureOf(attempt: () => Promise<unknown>): Promise<unknown> {
  try {
    await attempt()
  } catch (error) {
    return (error as { failure?: unknown }).failure
  }
  return undefined
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status })

describe('o formulário do vendedor', () => {
  it('exige o nome e ao menos um canal, e confere o e-mail', () => {
    expect(toInput(EMPTY_SALESPERSON_FORM)).toEqual({ error: 'name', ok: false })
    expect(toInput({ ...EMPTY_SALESPERSON_FORM, name: 'Ana' })).toEqual({
      error: 'contactRequired',
      ok: false,
    })
    expect(toInput({ ...EMPTY_SALESPERSON_FORM, email: 'sem-arroba', name: 'Ana' })).toEqual({
      error: 'emailFormat',
      ok: false,
    })
  })

  it('manda e-mail em minúsculas e campo vazio como ausente', () => {
    expect(
      toInput({ ...EMPTY_SALESPERSON_FORM, email: ' ANA@Loja.com.br ', name: ' Ana ' }),
    ).toEqual({
      input: { email: 'ana@loja.com.br', name: 'Ana', status: 'active', whatsapp: null },
      ok: true,
    })
    const onlyPhone = toInput({ ...EMPTY_SALESPERSON_FORM, name: 'Ana', whatsapp: '11999998888' })
    expect(onlyPhone.ok && onlyPhone.input.email).toBeNull()
  })

  it('a carteira lê um CNPJ por linha, sem pontuação nem repetição, e separa os inválidos', () => {
    expect(parseTaxIds('12.345.678/0001-99\n12345678000199, ab123456789012; 123')).toEqual({
      invalid: ['123'],
      valid: ['12345678000199', 'AB123456789012'],
    })
  })
})

describe('o cliente da API de vendedores', () => {
  it('lista e valida a forma da resposta', async () => {
    const { client, requests } = clientWith(() => json([PERSON]))

    expect(await client.list()).toEqual([PERSON])
    expect(requests[0]?.url).toBe('http://api.test/salespeople')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer token')
    const bad = clientWith(() => json([{ id: 's1' }]))
    expect(await failureOf(() => bad.client.list())).toBe(SALESPERSON_FAILURE.FAILED)
  })

  it('cria, edita, vincula, desvincula e troca a carteira nos caminhos certos', async () => {
    const { client, requests } = clientWith((request) =>
      request.url.endsWith('/clients') ? json([]) : json(PERSON),
    )
    const input = { email: null, name: 'Ana', status: 'active', whatsapp: '11999998888' } as const

    await client.create(input)
    await client.update('s 1', input)
    await client.link('s1', 'c1')
    await client.unlink('s1', 'c1')
    await client.replacePortfolio('s1', 'c1', ['12345678000199'])

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        'POST /salespeople',
        'PUT /salespeople/s%201',
        'PUT /salespeople/s1/contractors/c1',
        'DELETE /salespeople/s1/contractors/c1',
        'PUT /salespeople/s1/contractors/c1/clients',
      ],
    )
    expect(await requests[0]?.json()).toEqual(input)
    expect(await requests[4]?.json()).toEqual({ taxIds: ['12345678000199'] })
  })

  it('traduz o status HTTP em recusa estável', async () => {
    for (const [status, failure] of [
      [400, SALESPERSON_FAILURE.INVALID],
      [403, SALESPERSON_FAILURE.FORBIDDEN],
      [404, SALESPERSON_FAILURE.NOT_FOUND],
      [409, SALESPERSON_FAILURE.CONFLICT],
      [422, SALESPERSON_FAILURE.UNKNOWN_CLIENT],
      [500, SALESPERSON_FAILURE.FAILED],
    ] as const) {
      const { client } = clientWith(() => json(null, status))
      expect(await failureOf(() => client.list())).toBe(failure)
    }
  })
})

describe('a aba Vendedores', () => {
  it('é uma aba de Configurações, e só a consulta dela sobe', () => {
    expect(SETTINGS_PANEL_PLACEMENT.salespeople).toEqual({
      module: 'company-settings',
      source: 'salespeople',
      tab: 'salespeople',
    })
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('salespeople')
    expect(resolveSettingsDataScope('company-settings', 'salespeople').salespeople).toBe(true)
    expect(resolveSettingsDataScope('company-settings', 'company').salespeople).toBe(false)
  })
})
