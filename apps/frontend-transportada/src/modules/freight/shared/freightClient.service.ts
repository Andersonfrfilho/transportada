/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createFreightResponseAdapters } from './freightResponse.validation'

export type FreightRuleSummary = Readonly<{
  createdAt: string
  currentVersion: string
  description: string
  id: string
  name: string
  priority: string
  status: 'active' | 'draft' | 'inactive'
  type: 'percentage_of_invoice_total'
  updatedAt: string
}>

export type FreightRuleListPage = Readonly<{
  items: readonly FreightRuleSummary[]
  nextCursor: null | string
}>

export type FreightRuleCreate = Readonly<{
  description: string
  maximumAmount: null | string
  minimumAmount: null | string
  name: string
  percentage: string
  priority: string
  validFrom: string
  validUntil: null | string
}>

export type FreightSimulationRequest = Readonly<{
  documentId: string
}>

export type FreightSimulationResult = Readonly<{
  adjustments: readonly Readonly<{
    amount: string
    description: string
    type: 'maximum_amount' | 'minimum_amount'
  }>[]
  baseAmount: string
  calculatedAmount: string
  calculationDetails: Readonly<{
    formula: string
    roundingMode: 'half_up'
    scale: 4
  }>
  correlationId: string
  createdAt: string
  freightRuleId: string
  freightRuleVersionId: string
  id: string
  maximumAmount: null | string
  minimumAmount: null | string
  nfeDocumentId: string
  percentage: string
  ruleSnapshot: Readonly<{
    freightRuleId: string
    freightRuleVersionId: string
    maximumAmount: null | string
    minimumAmount: null | string
    percentage: string
    ruleVersion: string
    type: 'percentage_of_invoice_total'
    validFrom: string
    validUntil: null | string
  }>
  ruleVersion: string
  status: 'rejected' | 'snapshotted'
  totalAmount: string
  updatedAt: string
}>

export type FreightCalculationListPage = Readonly<{
  items: readonly FreightSimulationResult[]
  nextCursor: null | string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
  newIdempotencyKey: () => string
}>

export type FreightClient = Readonly<{
  createRule: (input: FreightRuleCreate) => Promise<FreightRuleSummary>
  listCalculations: (
    input: Readonly<{ cursor: null | string; documentId: string; limit: number }>,
  ) => Promise<FreightCalculationListPage>
  listRules: (
    input: Readonly<{ cursor: null | string; limit: number }>,
  ) => Promise<FreightRuleListPage>
  simulateFreight: (input: FreightSimulationRequest) => Promise<FreightSimulationResult>
}>

export type FreightClientFactory = (input: ClientDependencies) => FreightClient

function requestError(code: string): Error {
  return new Error(code)
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError('FREIGHT_REQUEST_FAILED')
  }
  if (!response.ok) throw requestError('FREIGHT_REQUEST_FAILED')
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('FREIGHT_RESPONSE_INVALID')
  }
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  }
  if (input.body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  if (input.idempotencyKey !== undefined) {
    headers['idempotency-key'] = input.idempotencyKey
  }
  const requestInit: RequestInit = {
    cache: 'no-store',
    headers,
    method: input.method,
  }
  if (input.body !== undefined) {
    requestInit.body = input.body
  }
  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input)) throw requestError('FREIGHT_RESPONSE_INVALID')
  return input.data
}

function readNextCursor(input: unknown): null | string {
  if (!isRecord(input) || !isRecord(input.page)) throw requestError('FREIGHT_RESPONSE_INVALID')
  const nextCursor = input.page.nextCursor
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    throw requestError('FREIGHT_RESPONSE_INVALID')
  }
  return nextCursor
}

function cleanRuleCreate(input: FreightRuleCreate): FreightRuleCreate {
  return {
    description: input.description,
    maximumAmount: input.maximumAmount,
    minimumAmount: input.minimumAmount,
    name: input.name,
    percentage: input.percentage,
    priority: input.priority,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  }
}

export const createFreightClient: FreightClientFactory = (dependencies) => {
  const adapters = createFreightResponseAdapters()

  return {
    async createRule(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(cleanRuleCreate(input)),
        dependencies,
        idempotencyKey: dependencies.newIdempotencyKey(),
        method: 'POST',
        path: '/freight-rules',
      })
      try {
        return adapters.ruleFromApi(readEnvelopeData(response))
      } catch {
        throw requestError('FREIGHT_RESPONSE_INVALID')
      }
    },
    async listCalculations(input) {
      const search = new URLSearchParams()
      if (input.cursor !== null) search.set('cursor', input.cursor)
      search.set('limit', String(input.limit))
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/nfe-documents/${input.documentId}/freight-calculations?${search}`,
      })
      try {
        return adapters.calculationListFromApi(response)
      } catch {
        throw requestError('FREIGHT_RESPONSE_INVALID')
      }
    },
    async listRules(input) {
      const search = new URLSearchParams()
      if (input.cursor !== null) search.set('cursor', input.cursor)
      search.set('limit', String(input.limit))
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/freight-rules?${search}`,
      })
      const data = readEnvelopeData(response)
      if (!Array.isArray(data)) throw requestError('FREIGHT_RESPONSE_INVALID')
      try {
        return {
          items: data.map((item) => adapters.ruleFromApi(item)),
          nextCursor: readNextCursor(response),
        }
      } catch {
        throw requestError('FREIGHT_RESPONSE_INVALID')
      }
    },
    async simulateFreight(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ documentId: input.documentId }),
        dependencies,
        idempotencyKey: dependencies.newIdempotencyKey(),
        method: 'POST',
        path: '/freight-calculations',
      })
      try {
        return adapters.simulationFromApi(readEnvelopeData(response))
      } catch {
        throw requestError('FREIGHT_RESPONSE_INVALID')
      }
    },
  }
}
