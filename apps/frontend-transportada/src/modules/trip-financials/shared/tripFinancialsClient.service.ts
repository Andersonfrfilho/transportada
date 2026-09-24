/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  FINANCIAL_RESULTS_PATH,
  type CompanyEntryKind,
  type CompanyEntryKindSide,
  type FinancialSummary,
  type FinancialSummaryGroup,
  type TripCostEntry,
  type TripFinancialResult,
  type TripRevenueEntry,
} from './tripFinancials.types'
import { toTripCostEntries } from './tripCostEntryResponse.validation'
import { toTripRevenueEntries } from './tripRevenueEntryResponse.validation'
import { toCompanyEntryKind, toCompanyEntryKinds } from './companyEntryKindResponse.validation'
import { toFinancialSummary, toTripFinancialResult } from './tripFinancialsResponse.validation'
import { toTripValuation } from './tripValuationResponse.validation'
import type { TripValuation } from './tripValuation.service'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type TripFinancialsClient = Readonly<{
  readResult: (tripId: string) => Promise<TripFinancialResult | null>
  /** O que já foi lançado na viagem, do mais recente ao mais antigo — a ordem é da API. */
  readCosts: (tripId: string) => Promise<readonly TripCostEntry[]>
  /** A conta **prevista** da viagem aberta — a congelada só nasce quando ela fecha. */
  readValuation: (tripId: string) => Promise<TripValuation | null>
  /**
   * A mesma conta antes de a viagem existir, sobre as notas e a frota escolhidas no formulário.
   *
   * `stopOrder` (spec 090 D3) é a mesma ordem que a prévia de carga recebe — a que o mapa numerou.
   * Sem ela o combustível calcularia sobre um agrupamento diferente do que o mapa desenhou.
   */
  previewValuation: (
    input: Readonly<{
      /** Spec 143 D4: ausente é "sugere pela duração estimada" — nunca `0`, nunca `null`. */
      dailyAllowanceDays?: number
      driverIds: readonly string[]
      nfeDocumentIds: readonly string[]
      stopOrder: readonly string[]
      vehicleId: string
    }>,
  ) => Promise<TripValuation | null>
  readSummary: (
    input: Readonly<{ from: string; groupBy: FinancialSummaryGroup; to: string }>,
  ) => Promise<FinancialSummary>
  recalculate: (
    input: Readonly<{ reason: string; tripId: string }>,
  ) => Promise<TripFinancialResult | null>
  /** Spec 169 RF5: o seletor migrou para o cadastro de espécies — `entryKindId`, não `kind` fixo. */
  recordCost: (
    input: Readonly<{
      amount: string
      description: string
      entryKindId: string
      tripId: string
    }>,
  ) => Promise<void>
  /** Spec 169 RF12/RF13: remove sem apagar — mesma permissão de lançar. */
  removeCost: (input: Readonly<{ entryId: string; tripId: string }>) => Promise<void>
  /** Spec 169 P1: a receita lançada à mão — mesma trilha do gasto. */
  readRevenues: (tripId: string) => Promise<readonly TripRevenueEntry[]>
  recordRevenue: (
    input: Readonly<{
      amount: string
      description: string
      entryKindId: string
      tripId: string
    }>,
  ) => Promise<void>
  removeRevenue: (input: Readonly<{ entryId: string; tripId: string }>) => Promise<void>
  /** Spec 169 RF5: só as ativas do lado certo, na ordem cadastrada — para o seletor do lançamento. */
  readActiveEntryKinds: (side: CompanyEntryKindSide) => Promise<readonly CompanyEntryKind[]>
  /** Spec 169 P2: o cadastro inteiro da empresa (ativas e inativas), para a tela de configuração. */
  readEntryKinds: () => Promise<readonly CompanyEntryKind[]>
  createEntryKind: (
    input: Readonly<{ name: string; side: CompanyEntryKindSide }>,
  ) => Promise<CompanyEntryKind>
  deactivateEntryKind: (entryKindId: string) => Promise<void>
}>

export function createTripFinancialsClient(dependencies: ClientDependencies): TripFinancialsClient {
  return {
    async readResult(tripId) {
      return toTripFinancialResult(
        await request({ dependencies, method: 'GET', path: `/trips/${tripId}/financial-result` }),
      )
    },
    async readCosts(tripId) {
      return toTripCostEntries(
        await request({ dependencies, method: 'GET', path: `/trips/${tripId}/costs` }),
      )
    },
    /**
     * A prévia é `POST` e fica **fora** da árvore `/trips/:id`: a viagem ainda não existe. É o que
     * responde "vale a pena montar isto?" no momento em que a pergunta é feita.
     */
    async previewValuation(input) {
      return toTripValuation(
        await request({
          body: JSON.stringify({
            /** Spec 143 D4: ausente sugere pela duração — nunca `dailyAllowanceDays: undefined`. */
            ...(input.dailyAllowanceDays === undefined
              ? {}
              : { dailyAllowanceDays: input.dailyAllowanceDays }),
            driverIds: input.driverIds,
            nfeDocumentIds: input.nfeDocumentIds,
            stopOrder: input.stopOrder,
            vehicleId: input.vehicleId,
          }),
          dependencies,
          method: 'POST',
          path: '/trips/valuation-preview',
        }),
      )
    },
    async readValuation(tripId) {
      return toTripValuation(
        await request({ dependencies, method: 'GET', path: `/trips/${tripId}/valuation` }),
      )
    },
    async readSummary({ from, groupBy, to }) {
      const parameters = new URLSearchParams({ from, groupBy, to })
      return toFinancialSummary(
        await request({
          dependencies,
          method: 'GET',
          path: `${FINANCIAL_RESULTS_PATH}?${parameters.toString()}`,
        }),
      )
    },
    async recalculate({ reason, tripId }) {
      return toTripFinancialResult(
        await request({
          body: JSON.stringify({ reason }),
          dependencies,
          method: 'POST',
          path: `/trips/${tripId}/financial-result/recalculate`,
        }),
      )
    },
    async recordCost({ amount, description, entryKindId, tripId }) {
      await request({
        body: JSON.stringify({ amount, description, entryKindId }),
        dependencies,
        method: 'POST',
        path: `/trips/${tripId}/costs`,
      })
    },
    async removeCost({ entryId, tripId }) {
      await request({ dependencies, method: 'DELETE', path: `/trips/${tripId}/costs/${entryId}` })
    },
    async readRevenues(tripId) {
      return toTripRevenueEntries(
        await request({ dependencies, method: 'GET', path: `/trips/${tripId}/revenues` }),
      )
    },
    async recordRevenue({ amount, description, entryKindId, tripId }) {
      await request({
        body: JSON.stringify({ amount, description, entryKindId }),
        dependencies,
        method: 'POST',
        path: `/trips/${tripId}/revenues`,
      })
    },
    async removeRevenue({ entryId, tripId }) {
      await request({
        dependencies,
        method: 'DELETE',
        path: `/trips/${tripId}/revenues/${entryId}`,
      })
    },
    async readActiveEntryKinds(side) {
      return toCompanyEntryKinds(
        await request({
          dependencies,
          method: 'GET',
          path: `/company-settings/entry-kinds/active?side=${side}`,
        }),
      )
    },
    async readEntryKinds() {
      return toCompanyEntryKinds(
        await request({ dependencies, method: 'GET', path: '/company-settings/entry-kinds' }),
      )
    },
    async createEntryKind({ name, side }) {
      return toCompanyEntryKind(
        await request({
          body: JSON.stringify({ name, side }),
          dependencies,
          method: 'POST',
          path: '/company-settings/entry-kinds',
        }),
      )
    },
    async deactivateEntryKind(entryKindId) {
      await request({
        dependencies,
        method: 'DELETE',
        path: `/company-settings/entry-kinds/${entryKindId}`,
      })
    },
  }
}

export function getTripFinancialsClient(): TripFinancialsClient {
  return createTripFinancialsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'DELETE' | 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new Error('REQUEST_FAILED')
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new Error('RESPONSE_INVALID')
  }
  if (!response.ok) throw new Error(readErrorCode(payload))

  return payload
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'REQUEST_FAILED'
  const error = (payload as { readonly error?: { readonly code?: unknown } }).error
  return typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
}
