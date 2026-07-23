/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  FREIGHT_CALCULATION_LIST_PAGE,
  FREIGHT_DOCUMENT,
  FREIGHT_RULE,
  FREIGHT_RULE_CREATE,
  FREIGHT_RULE_LIST_PAGE,
  FREIGHT_SIMULATION_REQUEST,
  FREIGHT_SIMULATION_RESULT,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from './freight.fixture'

describe('freight client and queries contract', () => {
  test('uses relative authenticated no-store requests for freight rules, simulation and calculation history', async () => {
    const requests: Request[] = []
    const { createFreightClient } = await loadFutureModule<FreightClientModule>(
      '../../src/modules/freight/shared/freightClient.service',
    )
    const client = createFreightClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
    })

    expect(await client.listRules({ cursor: SYNTHETIC_CURSOR, limit: 25 })).toEqual(
      FREIGHT_RULE_LIST_PAGE,
    )
    expect(await client.createRule(FREIGHT_RULE_CREATE)).toEqual(FREIGHT_RULE)
    expect(await client.simulateFreight(FREIGHT_SIMULATION_REQUEST)).toEqual(
      FREIGHT_SIMULATION_RESULT,
    )
    expect(
      await client.listCalculations({
        cursor: null,
        documentId: FREIGHT_SIMULATION_REQUEST.documentId,
        limit: 10,
      }),
    ).toEqual(FREIGHT_CALCULATION_LIST_PAGE)

    const [listRulesRequest, createRuleRequest, simulateRequest, listCalculationsRequest] = requests
    if (
      listRulesRequest === undefined ||
      createRuleRequest === undefined ||
      simulateRequest === undefined ||
      listCalculationsRequest === undefined
    ) {
      throw new Error('FREIGHT_CONTRACT_REQUEST_MISSING')
    }

    expect(listRulesRequest.url).toBe(
      `https://api.example.test/freight-rules?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=25`,
    )
    expect(listRulesRequest.method).toBe('GET')
    expect(listRulesRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(listRulesRequest.cache).toBe('no-store')

    expect(createRuleRequest.url).toBe('https://api.example.test/freight-rules')
    expect(createRuleRequest.method).toBe('POST')
    expect(createRuleRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(createRuleRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(createRuleRequest.headers.get('content-type')).toBe('application/json')
    expect(createRuleRequest.cache).toBe('no-store')
    expect(await createRuleRequest.json()).toEqual(FREIGHT_RULE_CREATE)

    expect(simulateRequest.url).toBe('https://api.example.test/freight-calculations')
    expect(simulateRequest.method).toBe('POST')
    expect(simulateRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(simulateRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(simulateRequest.cache).toBe('no-store')
    expect(await simulateRequest.json()).toEqual(FREIGHT_SIMULATION_REQUEST)

    expect(listCalculationsRequest.url).toBe(
      `https://api.example.test/nfe-documents/${FREIGHT_SIMULATION_REQUEST.documentId}/freight-calculations?limit=10`,
    )
    expect(listCalculationsRequest.method).toBe('GET')
    expect(listCalculationsRequest.cache).toBe('no-store')
  })

  test('keeps rule, simulation and calculation dto boundaries strict and decimal-safe', async () => {
    const { createFreightResponseAdapters } = await loadFutureModule<FreightAdaptersModule>(
      '../../src/modules/freight/shared/freightResponse.validation',
    )
    const adapters = createFreightResponseAdapters()

    expect(() => adapters.ruleFromApi({ ...FREIGHT_RULE, companyId: 'forbidden-company' })).toThrow(
      'FREIGHT_INVALID_RULE_RESPONSE',
    )
    expect(() =>
      adapters.simulationFromApi({
        ...FREIGHT_SIMULATION_RESULT,
        totalAmount: 350,
      }),
    ).toThrow('FREIGHT_INVALID_SIMULATION_RESPONSE')
    expect(() =>
      adapters.simulationFromApi({
        ...FREIGHT_SIMULATION_RESULT,
        percentage: 'not-decimal',
      }),
    ).toThrow('FREIGHT_INVALID_SIMULATION_RESPONSE')
    expect(() =>
      adapters.simulationFromApi({
        ...FREIGHT_SIMULATION_RESULT,
        totalAmount: '350',
      }),
    ).toThrow('FREIGHT_INVALID_SIMULATION_RESPONSE')
    expect(() =>
      adapters.calculationListFromApi({
        data: [{ ...FREIGHT_SIMULATION_RESULT, xml: '<nfeProc />' }],
        page: { nextCursor: null },
      }),
    ).toThrow('FREIGHT_INVALID_CALCULATION_LIST_RESPONSE')
  })
})

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.includes('/freight-rules?')) {
    return Promise.resolve(
      Response.json({
        data: FREIGHT_RULE_LIST_PAGE.items,
        page: { nextCursor: FREIGHT_RULE_LIST_PAGE.nextCursor },
      }),
    )
  }
  if (request.url.endsWith('/freight-rules')) {
    return Promise.resolve(Response.json({ data: FREIGHT_RULE }))
  }
  if (request.url.endsWith('/freight-calculations')) {
    return Promise.resolve(Response.json({ data: FREIGHT_SIMULATION_RESULT }))
  }
  if (request.url.includes(`/nfe-documents/${FREIGHT_DOCUMENT.id}/freight-calculations?limit=10`)) {
    return Promise.resolve(
      Response.json({
        data: FREIGHT_CALCULATION_LIST_PAGE.items,
        page: { nextCursor: FREIGHT_CALCULATION_LIST_PAGE.nextCursor },
      }),
    )
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type FreightClient = {
  createRule(input: typeof FREIGHT_RULE_CREATE): Promise<unknown>
  listCalculations(input: {
    readonly cursor: null | string
    readonly documentId: string
    readonly limit: number
  }): Promise<unknown>
  listRules(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  simulateFreight(input: typeof FREIGHT_SIMULATION_REQUEST): Promise<unknown>
}

type FreightClientModule = {
  readonly createFreightClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => FreightClient
}

type FreightAdaptersModule = {
  readonly createFreightResponseAdapters: () => {
    readonly calculationListFromApi: (input: unknown) => unknown
    readonly ruleFromApi: (input: unknown) => unknown
    readonly simulationFromApi: (input: unknown) => unknown
  }
}
