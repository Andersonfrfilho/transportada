/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 237 T1.4 (ADR-0094 §5, `web.md` §11): o cliente HTTP do perfil e do cadastro do contratante.
 * O `PUT` manda o perfil inteiro; o `GET` sem perfil devolve `null`; resposta com chave a mais é
 * recusada (`security.md` §8); e o erro do transporte carrega os campos recusados, todos.
 */
import { describe, expect, test } from 'bun:test'

import type { Contractor } from '../../src/modules/delivery-clients/shared/contractorDirectory.types'
import { createContractorDirectoryClient } from '../../src/modules/delivery-clients/shared/contractorDirectoryClient.service'
import { ContractorDirectoryRequestError } from '../../src/modules/delivery-clients/shared/contractorDirectoryRequest.service'
import {
  RECEIVING_PROFILE_RULE_KEYS,
  type ReceivingProfileRules,
} from '../../src/modules/delivery-clients/shared/receivingProfile.types'
import { describeRefusedFields } from '../../src/modules/delivery-clients/shared/receivingRefusal.service'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000237001'

const RULES: ReceivingProfileRules = {
  arrivalReferencePattern: null,
  deliveryDeadlineBusinessDays: 3,
  isEnabled: true,
  matchWindowDays: 15,
  previewColumnMap: null,
  previewEnabled: false,
  previewSheetName: null,
  requiresDamageCheck: false,
  separationWindowHours: null,
  weightTolerancePercent: 0,
}

const SAVED_PROFILE = {
  ...RULES,
  contractorId: CONTRACTOR_ID,
  updatedAt: '2026-10-03T12:00:00.000Z',
}

const CONTRACTOR: Contractor = {
  closingPeriod: 'monthly',
  displayName: 'Contratante Sintético',
  id: CONTRACTOR_ID,
  notes: '',
  reportEmail: '',
  status: 'active',
  taxId: '11222333000181',
}

type RecordedCall = { body: string; headers: Headers; method: string; url: string }

function createFixture(respond: (call: RecordedCall) => { body: unknown; status?: number }) {
  const calls: RecordedCall[] = []
  const client = createContractorDirectoryClient({
    apiUrl: 'http://api.test',
    fetch: async (input) => {
      const request = input as Request
      const call = {
        body: await request.text(),
        headers: request.headers,
        method: request.method,
        url: request.url,
      }
      calls.push(call)
      const { body, status = 200 } = respond(call)
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status,
      })
    },
    getAccessToken: () => Promise.resolve('token-sintetico'),
  })
  return { calls, client }
}

describe('o perfil de recebimento no transporte', () => {
  test('contratante sem perfil: o GET devolve null', async () => {
    const { calls, client } = createFixture(() => ({ body: { data: null } }))

    expect(await client.getReceivingProfile(CONTRACTOR_ID)).toBeNull()
    expect(calls[0]?.url).toBe(`http://api.test/contractors/${CONTRACTOR_ID}/receiving-profile`)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-sintetico')
  })

  test('o GET devolve o perfil gravado', async () => {
    const { client } = createFixture(() => ({ body: { data: SAVED_PROFILE } }))

    expect(await client.getReceivingProfile(CONTRACTOR_ID)).toEqual(SAVED_PROFILE)
  })

  test('o PUT manda as 10 chaves do perfil e nada além delas (companyId nunca viaja)', async () => {
    const { calls, client } = createFixture(() => ({ body: { data: SAVED_PROFILE } }))

    await client.saveReceivingProfile({ contractorId: CONTRACTOR_ID, rules: RULES })

    const call = calls[0]
    expect(call?.method).toBe('PUT')
    expect(call?.headers.get('content-type')).toBe('application/json')
    const sent = JSON.parse(call?.body ?? '{}') as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual([...RECEIVING_PROFILE_RULE_KEYS].sort())
    expect(sent.separationWindowHours).toBeNull()
    expect(sent.arrivalReferencePattern).toBeNull()
    expect(sent.previewColumnMap).toBeNull()
  })

  test('resposta com chave desconhecida é recusada, e a tela não mostra dado que não conhece', async () => {
    const { client } = createFixture(() => ({
      body: { data: { ...SAVED_PROFILE, companyId: 'c' } },
    }))

    await expect(client.getReceivingProfile(CONTRACTOR_ID)).rejects.toThrow('RESPONSE_INVALID')
  })

  test('resposta com mapa de colunas de campo desconhecido é recusada', async () => {
    const { client } = createFixture(() => ({
      body: { data: { ...SAVED_PROFILE, previewColumnMap: { nfeNumber: 'NF' } } },
    }))

    await expect(client.getReceivingProfile(CONTRACTOR_ID)).rejects.toThrow('RESPONSE_INVALID')
  })
})

describe('o cadastro do contratante no transporte', () => {
  test('a lista segue o cursor e valida o agregado inteiro', async () => {
    const { calls, client } = createFixture(() => ({
      body: { data: [CONTRACTOR], page: { nextCursor: 'proximo' } },
    }))

    const page = await client.listContractors({ cursor: 'atual' })

    expect(page).toEqual({ items: [CONTRACTOR], nextCursor: 'proximo' })
    const url = new URL(calls[0]?.url ?? '')
    expect(url.pathname).toBe('/contractors')
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('cursor')).toBe('atual')
  })

  test('agregado com chave a mais ou faltando é recusado', async () => {
    const extra = createFixture(() => ({
      body: { data: [{ ...CONTRACTOR, internal: 1 }], page: { nextCursor: null } },
    }))
    await expect(extra.client.listContractors({ cursor: null })).rejects.toThrow('RESPONSE_INVALID')
  })

  test('o PATCH leva só os campos do cadastro e devolve o contratante', async () => {
    const { calls, client } = createFixture(() => ({ body: { data: CONTRACTOR } }))

    const updated = await client.updateContractor({
      id: CONTRACTOR_ID,
      values: { closingPeriod: 'fortnightly', displayName: 'Novo nome' },
    })

    expect(updated).toEqual(CONTRACTOR)
    expect(calls[0]?.method).toBe('PATCH')
    expect(calls[0]?.url).toBe(`http://api.test/contractors/${CONTRACTOR_ID}`)
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      closingPeriod: 'fortnightly',
      displayName: 'Novo nome',
    })
  })
})

describe('a recusa do servidor nomeia o campo (web.md §11)', () => {
  const REFUSAL = {
    error: {
      code: 'INVALID_REQUEST',
      details: [
        { field: 'matchWindowDays', message: 'Too small' },
        { field: 'separationWindowHours', message: 'Too big' },
        { field: 'matchWindowDays', message: 'Another rule' },
        { field: 'previewColumnMap.value', message: 'Column is already mapped' },
        { field: 'somethingNew', message: 'Unknown' },
      ],
      message: 'Invalid request',
    },
  }

  async function refusal(): Promise<unknown> {
    const { client } = createFixture(() => ({ body: REFUSAL, status: 400 }))
    return client
      .saveReceivingProfile({ contractorId: CONTRACTOR_ID, rules: RULES })
      .catch((error: unknown) => error)
  }

  test('o erro do transporte guarda o código e os detalhes, todos', async () => {
    const error = await refusal()

    expect(error).toBeInstanceOf(ContractorDirectoryRequestError)
    expect((error as ContractorDirectoryRequestError).message).toBe('INVALID_REQUEST')
    expect((error as ContractorDirectoryRequestError).details).toHaveLength(5)
  })

  test('a lista nomeia todos os campos recusados, sem repetir o que quebrou duas regras', async () => {
    const fields = describeRefusedFields(await refusal())

    expect(fields.map((field) => field.field)).toEqual([
      'matchWindowDays',
      'separationWindowHours',
      'previewColumnMap.value',
      'somethingNew',
    ])
  })

  test('o rótulo impresso é o que aparece, e o campo desconhecido sai com o nome cru', async () => {
    const fields = describeRefusedFields(await refusal())

    expect(fields[0]?.labelKey).toBe('fields.matchWindowDays')
    expect(fields[2]?.labelKey).toBe('columns.value')
    expect(fields[3]).toEqual({ field: 'somethingNew', labelKey: undefined })
  })

  test('falha sem campo nenhum não inventa lista: silêncio', async () => {
    const { client } = createFixture(() => ({
      body: { error: { code: 'INTERNAL_ERROR', message: 'x' } },
      status: 500,
    }))
    const error = await client
      .saveReceivingProfile({ contractorId: CONTRACTOR_ID, rules: RULES })
      .catch((caught: unknown) => caught)

    expect((error as Error).message).toBe('INTERNAL_ERROR')
    expect(describeRefusedFields(error)).toEqual([])
    expect(describeRefusedFields(new Error('INVALID_REQUEST'))).toEqual([])
    expect(describeRefusedFields(undefined)).toEqual([])
  })

  test('detalhe malformado é ignorado em vez de derrubar o caminho do erro', async () => {
    const { client } = createFixture(() => ({
      body: { error: { code: 'INVALID_REQUEST', details: [{ field: 'x' }, 7, null] } },
      status: 400,
    }))
    const error = await client
      .saveReceivingProfile({ contractorId: CONTRACTOR_ID, rules: RULES })
      .catch((caught: unknown) => caught)

    expect(describeRefusedFields(error)).toEqual([])
  })

  test('falha de rede vira REQUEST_FAILED, e corpo que não é JSON vira RESPONSE_INVALID', async () => {
    const offline = createContractorDirectoryClient({
      apiUrl: 'http://api.test',
      fetch: () => Promise.reject(new Error('offline')),
      getAccessToken: () => Promise.resolve('t'),
    })
    await expect(offline.getReceivingProfile(CONTRACTOR_ID)).rejects.toThrow('REQUEST_FAILED')

    const garbled = createContractorDirectoryClient({
      apiUrl: 'http://api.test',
      fetch: () => Promise.resolve(new Response('<html>', { status: 200 })),
      getAccessToken: () => Promise.resolve('t'),
    })
    await expect(garbled.getReceivingProfile(CONTRACTOR_ID)).rejects.toThrow('RESPONSE_INVALID')
  })
})
