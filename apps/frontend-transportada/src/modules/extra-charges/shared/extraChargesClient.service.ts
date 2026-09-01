/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  CONTRACTORS_PATH,
  EXTRA_CHARGE_BATCHES_PATH,
  EXTRA_CHARGES_PATH,
  type Contractor,
  type DeliveryCharge,
  type ExtraChargeBatch,
  type ExtraChargeBatchReport,
} from './extraCharges.types'
import {
  toBatchReport,
  toBatchResponse,
  toChargePage,
  toContractors,
} from './extraChargesResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ExtraChargesClient = Readonly<{
  closeBatch: (
    input: Readonly<{ contractorId: string; periodEnd: string; periodStart: string }>,
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
  listCharges: (status: string) => Promise<readonly DeliveryCharge[]>
  listContractors: () => Promise<readonly Contractor[]>
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
  }
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
