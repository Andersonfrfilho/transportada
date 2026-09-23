/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  CONTRACTORS_PATH,
  EXTRA_CHARGE_BATCHES_PATH,
  EXTRA_CHARGES_PATH,
  OCCURRENCE_CHARGES_REPORT_PATH,
  type Contractor,
  type DeliveryCharge,
  type ExtraChargeBatch,
  type ExtraChargeBatchReport,
  type OccurrenceChargeReportFilters,
  type OccurrenceChargeReportPage,
} from './extraCharges.types'
import {
  toBatchReport,
  toBatchResponse,
  toChargePage,
  toContractors,
  toOccurrenceChargeReportPage,
} from './extraChargesResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** RF29: o demonstrativo já gerado, servido como `application/pdf` — nunca refeito no cliente. */
export type OccurrenceStatementFile = Readonly<{ blob: Blob; fileName: string }>

export type ExtraChargesClient = Readonly<{
  closeBatch: (
    input: Readonly<{
      chargeIds?: readonly string[]
      contractorId: string
      periodEnd: string
      periodStart: string
    }>,
  ) => Promise<ExtraChargeBatch>
  confirmCharges: (
    charges: readonly Readonly<{ amount?: string; id: string }>[],
  ) => Promise<readonly DeliveryCharge[]>
  decideBatch: (
    input: Readonly<{
      batchId: string
      decisions: readonly Readonly<{ chargeId: string; decision: string; reason: string }>[]
    }>,
  ) => Promise<ExtraChargeBatchReport>
  dismissCharge: (input: Readonly<{ id: string; reason: string }>) => Promise<void>
  /** RF28, `trip.financials`: linhas de cobrança de ocorrência ainda sem lote. */
  downloadStatement: (batchId: string) => Promise<OccurrenceStatementFile>
  listCharges: (status: string) => Promise<readonly DeliveryCharge[]>
  listContractors: () => Promise<readonly Contractor[]>
  readOccurrenceChargeReport: (
    filters: OccurrenceChargeReportFilters,
  ) => Promise<OccurrenceChargeReportPage>
  readReport: (batchId: string) => Promise<ExtraChargeBatchReport>
}>

export function createExtraChargesClient(dependencies: ClientDependencies): ExtraChargesClient {
  return {
    async closeBatch(input) {
      return toBatchResponse(
        await request({
          body: JSON.stringify(input),
          dependencies,
          method: 'POST',
          path: EXTRA_CHARGE_BATCHES_PATH,
        }),
      )
    },
    async confirmCharges(charges) {
      return toChargePage(
        await request({
          body: JSON.stringify({ charges }),
          dependencies,
          method: 'POST',
          path: `${EXTRA_CHARGES_PATH}/confirm`,
        }),
      )
    },
    async decideBatch({ batchId, decisions }) {
      return toBatchReport(
        await request({
          body: JSON.stringify({ decisions }),
          dependencies,
          method: 'POST',
          path: `${EXTRA_CHARGE_BATCHES_PATH}/${batchId}/decisions`,
        }),
      )
    },
    async dismissCharge({ id, reason }) {
      await request({
        body: JSON.stringify({ reason }),
        dependencies,
        method: 'POST',
        path: `${EXTRA_CHARGES_PATH}/${id}/dismiss`,
      })
    },
    async listCharges(status) {
      return toChargePage(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXTRA_CHARGES_PATH}?status=${status}&limit=200`,
        }),
      )
    },
    async listContractors() {
      return toContractors(
        await request({ dependencies, method: 'GET', path: `${CONTRACTORS_PATH}?limit=100` }),
      )
    },
    async readReport(batchId) {
      return toBatchReport(
        await request({
          dependencies,
          method: 'GET',
          path: `${EXTRA_CHARGE_BATCHES_PATH}/${batchId}/report`,
        }),
      )
    },
    async readOccurrenceChargeReport(filters) {
      return toOccurrenceChargeReportPage(
        await request({
          dependencies,
          method: 'GET',
          path: `${OCCURRENCE_CHARGES_REPORT_PATH}?${serializeReportFilters(filters)}`,
        }),
      )
    },
    async downloadStatement(batchId) {
      return requestFile({
        dependencies,
        path: `${EXTRA_CHARGE_BATCHES_PATH}/${batchId}/statement`,
      })
    },
  }
}

function serializeReportFilters(filters: OccurrenceChargeReportFilters): string {
  const search = new URLSearchParams()
  if (filters.chargeType !== undefined) search.set('chargeType', filters.chargeType)
  if (filters.contractorId !== undefined) search.set('contractorId', filters.contractorId)
  if (filters.cursor !== undefined) search.set('cursor', filters.cursor)
  if (filters.from !== undefined) search.set('from', filters.from)
  if (filters.hasSettlement !== undefined) {
    search.set('hasSettlement', filters.hasSettlement ? 'true' : 'false')
  }
  if (filters.limit !== undefined) search.set('limit', String(filters.limit))
  if (filters.search !== undefined) search.set('search', filters.search)
  if (filters.status !== undefined) search.set('status', filters.status)
  if (filters.to !== undefined) search.set('to', filters.to)
  return search.toString()
}

/** O PDF não passa pelo `request()` de JSON — o corpo é binário e o nome vem do cabeçalho. */
async function requestFile(
  input: Readonly<{ dependencies: ClientDependencies; path: string }>,
): Promise<OccurrenceStatementFile> {
  const accessToken = await input.dependencies.getAccessToken()
  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
      }),
    )
  } catch {
    throw new Error('REQUEST_FAILED')
  }
  if (!response.ok) {
    let payload: unknown
    try {
      payload = JSON.parse(await response.text()) as unknown
    } catch {
      throw new Error('REQUEST_FAILED')
    }
    throw new Error(readErrorCode(payload))
  }
  const fileName = resolveAttachmentFileName(response.headers.get('content-disposition'))
  return { blob: await response.blob(), fileName }
}

function resolveAttachmentFileName(headerValue: null | string): string {
  const match = headerValue === null ? null : /filename="([^"]+)"/u.exec(headerValue)
  return match?.[1] ?? 'demonstrativo.pdf'
}

export function getExtraChargesClient(): ExtraChargesClient {
  return createExtraChargesClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'POST'
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
  /** O código sobe como veio: `EXTRA_CHARGE_BATCH_EMPTY` vira "não há nada a fechar neste período". */
  if (!response.ok) throw new Error(readErrorCode(payload))

  return payload
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'REQUEST_FAILED'
  const error = (payload as { readonly error?: { readonly code?: unknown } }).error
  return typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
}
