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

export type FreightRuleFilters = Readonly<{
  createdFrom?: string
  createdUntil?: string
  currentVersionEq?: string
  currentVersionNe?: string
  descriptionContains?: string
  maximumAmountEq?: string
  maximumAmountGt?: string
  maximumAmountGte?: string
  maximumAmountLt?: string
  maximumAmountLte?: string
  maximumAmountNe?: string
  minimumAmountEq?: string
  minimumAmountGt?: string
  minimumAmountGte?: string
  minimumAmountLt?: string
  minimumAmountLte?: string
  minimumAmountNe?: string
  nameContains?: string
  percentageEq?: string
  percentageGt?: string
  percentageGte?: string
  percentageLt?: string
  percentageLte?: string
  percentageNe?: string
  priorityEq?: string
  priorityGt?: string
  priorityGte?: string
  priorityLt?: string
  priorityLte?: string
  priorityNe?: string
  statusEq?: FreightRuleSummary['status']
  statusNe?: FreightRuleSummary['status']
  typeEq?: FreightRuleSummary['type']
  typeNe?: FreightRuleSummary['type']
  updatedFrom?: string
  updatedUntil?: string
  validFromFrom?: string
  validFromUntil?: string
  validUntilFrom?: string
  validUntilIsNull?: boolean
  validUntilUntil?: string
}>

export type FreightCalculationFilters = Readonly<{
  baseAmountEq?: string
  baseAmountGt?: string
  baseAmountGte?: string
  baseAmountLt?: string
  baseAmountLte?: string
  baseAmountNe?: string
  calculatedAmountEq?: string
  calculatedAmountGt?: string
  calculatedAmountGte?: string
  calculatedAmountLt?: string
  calculatedAmountLte?: string
  calculatedAmountNe?: string
  createdFrom?: string
  createdUntil?: string
  freightRuleIdEq?: string
  freightRuleIdNe?: string
  freightRuleVersionIdEq?: string
  freightRuleVersionIdNe?: string
  maximumAmountEq?: string
  maximumAmountGt?: string
  maximumAmountGte?: string
  maximumAmountLt?: string
  maximumAmountLte?: string
  maximumAmountNe?: string
  minimumAmountEq?: string
  minimumAmountGt?: string
  minimumAmountGte?: string
  minimumAmountLt?: string
  minimumAmountLte?: string
  minimumAmountNe?: string
  percentageEq?: string
  percentageGt?: string
  percentageGte?: string
  percentageLt?: string
  percentageLte?: string
  percentageNe?: string
  ruleVersionEq?: string
  ruleVersionNe?: string
  statusEq?: FreightSimulationResult['status']
  statusNe?: FreightSimulationResult['status']
  totalAmountEq?: string
  totalAmountGt?: string
  totalAmountGte?: string
  totalAmountLt?: string
  totalAmountLte?: string
  totalAmountNe?: string
  updatedFrom?: string
  updatedUntil?: string
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
    input: Readonly<{
      cursor: null | string
      documentId: string
      filters?: FreightCalculationFilters
      limit: number
    }>,
  ) => Promise<FreightCalculationListPage>
  listRules: (
    input: Readonly<{ cursor: null | string; filters?: FreightRuleFilters; limit: number }>,
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

function appendStringSearch(
  search: URLSearchParams,
  input: Readonly<Record<string, string | undefined>>,
): void {
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value.length > 0) {
      search.set(key, value)
    }
  }
}

function appendBooleanSearch(
  search: URLSearchParams,
  input: Readonly<Record<string, boolean | undefined>>,
): void {
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      search.set(key, String(value))
    }
  }
}

function buildRuleSearch(
  input: Readonly<{
    cursor: null | string
    filters?: FreightRuleFilters
    limit: number
  }>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  appendStringSearch(search, {
    currentVersionEq: input.filters?.currentVersionEq,
    currentVersionNe: input.filters?.currentVersionNe,
    createdFrom: input.filters?.createdFrom,
    createdUntil: input.filters?.createdUntil,
    descriptionContains: input.filters?.descriptionContains,
    maximumAmountEq: input.filters?.maximumAmountEq,
    maximumAmountGt: input.filters?.maximumAmountGt,
    maximumAmountGte: input.filters?.maximumAmountGte,
    maximumAmountLt: input.filters?.maximumAmountLt,
    maximumAmountLte: input.filters?.maximumAmountLte,
    maximumAmountNe: input.filters?.maximumAmountNe,
    minimumAmountEq: input.filters?.minimumAmountEq,
    minimumAmountGt: input.filters?.minimumAmountGt,
    minimumAmountGte: input.filters?.minimumAmountGte,
    minimumAmountLt: input.filters?.minimumAmountLt,
    minimumAmountLte: input.filters?.minimumAmountLte,
    minimumAmountNe: input.filters?.minimumAmountNe,
    nameContains: input.filters?.nameContains,
    percentageEq: input.filters?.percentageEq,
    percentageGt: input.filters?.percentageGt,
    percentageGte: input.filters?.percentageGte,
    percentageLt: input.filters?.percentageLt,
    percentageLte: input.filters?.percentageLte,
    percentageNe: input.filters?.percentageNe,
    priorityEq: input.filters?.priorityEq,
    priorityGt: input.filters?.priorityGt,
    priorityGte: input.filters?.priorityGte,
    priorityLt: input.filters?.priorityLt,
    priorityLte: input.filters?.priorityLte,
    priorityNe: input.filters?.priorityNe,
    statusEq: input.filters?.statusEq,
    statusNe: input.filters?.statusNe,
    typeEq: input.filters?.typeEq,
    typeNe: input.filters?.typeNe,
    updatedFrom: input.filters?.updatedFrom,
    updatedUntil: input.filters?.updatedUntil,
    validFromFrom: input.filters?.validFromFrom,
    validFromUntil: input.filters?.validFromUntil,
    validUntilFrom: input.filters?.validUntilFrom,
    validUntilUntil: input.filters?.validUntilUntil,
  })
  appendBooleanSearch(search, { validUntilIsNull: input.filters?.validUntilIsNull })
  return search.toString()
}

function buildCalculationSearch(
  input: Readonly<{
    cursor: null | string
    filters?: FreightCalculationFilters
    limit: number
  }>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  appendStringSearch(search, {
    baseAmountEq: input.filters?.baseAmountEq,
    baseAmountGt: input.filters?.baseAmountGt,
    baseAmountGte: input.filters?.baseAmountGte,
    baseAmountLt: input.filters?.baseAmountLt,
    baseAmountLte: input.filters?.baseAmountLte,
    baseAmountNe: input.filters?.baseAmountNe,
    calculatedAmountEq: input.filters?.calculatedAmountEq,
    calculatedAmountGt: input.filters?.calculatedAmountGt,
    calculatedAmountGte: input.filters?.calculatedAmountGte,
    calculatedAmountLt: input.filters?.calculatedAmountLt,
    calculatedAmountLte: input.filters?.calculatedAmountLte,
    calculatedAmountNe: input.filters?.calculatedAmountNe,
    createdFrom: input.filters?.createdFrom,
    createdUntil: input.filters?.createdUntil,
    freightRuleIdEq: input.filters?.freightRuleIdEq,
    freightRuleIdNe: input.filters?.freightRuleIdNe,
    freightRuleVersionIdEq: input.filters?.freightRuleVersionIdEq,
    freightRuleVersionIdNe: input.filters?.freightRuleVersionIdNe,
    maximumAmountEq: input.filters?.maximumAmountEq,
    maximumAmountGt: input.filters?.maximumAmountGt,
    maximumAmountGte: input.filters?.maximumAmountGte,
    maximumAmountLt: input.filters?.maximumAmountLt,
    maximumAmountLte: input.filters?.maximumAmountLte,
    maximumAmountNe: input.filters?.maximumAmountNe,
    minimumAmountEq: input.filters?.minimumAmountEq,
    minimumAmountGt: input.filters?.minimumAmountGt,
    minimumAmountGte: input.filters?.minimumAmountGte,
    minimumAmountLt: input.filters?.minimumAmountLt,
    minimumAmountLte: input.filters?.minimumAmountLte,
    minimumAmountNe: input.filters?.minimumAmountNe,
    percentageEq: input.filters?.percentageEq,
    percentageGt: input.filters?.percentageGt,
    percentageGte: input.filters?.percentageGte,
    percentageLt: input.filters?.percentageLt,
    percentageLte: input.filters?.percentageLte,
    percentageNe: input.filters?.percentageNe,
    ruleVersionEq: input.filters?.ruleVersionEq,
    ruleVersionNe: input.filters?.ruleVersionNe,
    statusEq: input.filters?.statusEq,
    statusNe: input.filters?.statusNe,
    totalAmountEq: input.filters?.totalAmountEq,
    totalAmountGt: input.filters?.totalAmountGt,
    totalAmountGte: input.filters?.totalAmountGte,
    totalAmountLt: input.filters?.totalAmountLt,
    totalAmountLte: input.filters?.totalAmountLte,
    totalAmountNe: input.filters?.totalAmountNe,
    updatedFrom: input.filters?.updatedFrom,
    updatedUntil: input.filters?.updatedUntil,
  })
  return search.toString()
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
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/nfe-documents/${input.documentId}/freight-calculations?${buildCalculationSearch(input)}`,
      })
      try {
        return adapters.calculationListFromApi(response)
      } catch {
        throw requestError('FREIGHT_RESPONSE_INVALID')
      }
    },
    async listRules(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `/freight-rules?${buildRuleSearch(input)}`,
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
