/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  createContractorMailTemplatesClient,
  ContractorMailTemplatesRequestError,
} from '../../src/modules/delivery-clients/shared/contractorMailTemplatesClient.service'

const TEMPLATE = {
  closing: '{operador}',
  id: 'template-1',
  intro: 'Olá, {contratante}',
  isDefault: true,
  itemText: 'Motivo: {motivo}.',
  mailType: 'address_correction',
  name: 'Padrão',
  status: 'active',
  subject: 'Correção de endereço',
  updatedAt: '2026-09-15T00:00:00.000Z',
  version: '1',
}

function fakeFetch(body: unknown, status = 200) {
  const calls: Readonly<{ init: RequestInit | undefined; input: RequestInfo | URL }>[] = []
  const fetchFn = (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ init, input })
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status,
      }),
    )
  }
  return { calls, fetchFn }
}

function dependencies(fetchFn: ReturnType<typeof fakeFetch>['fetchFn']) {
  return {
    apiUrl: 'https://api.example.com',
    fetch: fetchFn,
    getAccessToken: () => Promise.resolve('token-123'),
  }
}

describe('contractor mail templates client — request shape', () => {
  test('creates a template with POST and the full content body', async () => {
    const { calls, fetchFn } = fakeFetch({ data: TEMPLATE }, 201)
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    await client.createTemplate({
      closing: '{operador}',
      intro: 'Olá',
      itemText: '',
      mailType: 'address_correction',
      name: 'Padrão',
      subject: 'Assunto',
    })

    expect(calls).toHaveLength(1)
    const request = calls[0]?.input as Request
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.example.com/contractor-mail-templates')
    expect(JSON.parse(await request.text())).toEqual({
      closing: '{operador}',
      intro: 'Olá',
      itemText: '',
      mailType: 'address_correction',
      name: 'Padrão',
      subject: 'Assunto',
    })
  })

  test('updates a template with PATCH at /:id, carrying the version', async () => {
    const { calls, fetchFn } = fakeFetch({ data: TEMPLATE })
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    await client.updateTemplate({
      body: { name: 'Novo nome', version: '3' },
      templateId: 'template-1',
    })

    const request = calls[0]?.input as Request
    expect(request.method).toBe('PATCH')
    expect(request.url).toBe('https://api.example.com/contractor-mail-templates/template-1')
    expect(JSON.parse(await request.text())).toEqual({ name: 'Novo nome', version: '3' })
  })

  test('sets a template as default with POST at /:id/default', async () => {
    const { calls, fetchFn } = fakeFetch({ data: TEMPLATE })
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    await client.setDefault({ templateId: 'template-1', version: '3' })

    const request = calls[0]?.input as Request
    expect(request.method).toBe('POST')
    expect(request.url).toBe('https://api.example.com/contractor-mail-templates/template-1/default')
    expect(JSON.parse(await request.text())).toEqual({ version: '3' })
  })

  test('previews unsaved content at POST /preview', async () => {
    const { calls, fetchFn } = fakeFetch({ data: { html: '<p>x</p>', subject: 's', text: 'x' } })
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    await client.preview({
      closing: 'c',
      intro: 'i',
      itemText: '',
      mailType: 'address_correction',
      subject: 's',
    })

    const request = calls[0]?.input as Request
    expect(request.url).toBe('https://api.example.com/contractor-mail-templates/preview')
    expect(JSON.parse(await request.text())).toEqual({
      closing: 'c',
      intro: 'i',
      itemText: '',
      mailType: 'address_correction',
      subject: 's',
    })
  })

  test('previews a saved template by id, with no content fields', async () => {
    const { calls, fetchFn } = fakeFetch({ data: { html: '<p>x</p>', subject: 's', text: 'x' } })
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    await client.preview({ templateId: 'template-1' })

    const request = calls[0]?.input as Request
    expect(JSON.parse(await request.text())).toEqual({ templateId: 'template-1' })
  })

  test('lists templates with the mailType query parameter', async () => {
    const { calls, fetchFn } = fakeFetch({ data: [TEMPLATE] })
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    await client.listTemplates('address_correction')

    const request = calls[0]?.input as Request
    expect(request.url).toBe(
      'https://api.example.com/contractor-mail-templates?mailType=address_correction',
    )
  })

  test('carries the bearer token on every request', async () => {
    const { calls, fetchFn } = fakeFetch({ data: [] })
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    await client.getCatalog()

    const request = calls[0]?.input as Request
    expect(request.headers.get('authorization')).toBe('Bearer token-123')
  })
})

describe('contractor mail templates client — error mapping', () => {
  test('carries error.details as a field→message map', () => {
    const { fetchFn } = fakeFetch(
      {
        error: {
          code: 'CONTRACTOR_MAIL_TEMPLATE_NAME_TAKEN',
          details: [{ field: 'name', message: 'already in use' }],
        },
      },
      409,
    )
    const client = createContractorMailTemplatesClient(dependencies(fetchFn))

    expect(
      client.createTemplate({
        closing: 'c',
        intro: 'i',
        itemText: '',
        mailType: 'address_correction',
        name: 'Padrão',
        subject: 's',
      }),
    ).rejects.toMatchObject({
      details: new Map([['name', 'already in use']]),
      message: 'CONTRACTOR_MAIL_TEMPLATE_NAME_TAKEN',
    })
  })

  test('throws ContractorMailTemplatesRequestError when the transport itself fails', () => {
    const client = createContractorMailTemplatesClient({
      apiUrl: 'https://api.example.com',
      fetch: () => Promise.reject(new Error('network down')),
      getAccessToken: () => Promise.resolve('token-123'),
    })

    expect(client.getCatalog()).rejects.toBeInstanceOf(ContractorMailTemplatesRequestError)
  })
})
