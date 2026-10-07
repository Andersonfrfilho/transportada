/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type {
  AvailableCargoDocument,
  CargoArrivalDetail,
  CargoArrivalFilters,
  CargoArrivalSummary,
  CargoContractor,
  CargoDocumentOutcome,
  CargoPage,
  CargoReceivingProfile,
  CargoTransitionTarget,
  CloseCargoArrivalResult,
  RegisterCargoArrivalInput,
  RegisterCargoArrivalResult,
} from './cargoArrival.types'
import { CARGO_ARRIVAL_LIMITS, CARGO_RECEIVING_PATHS } from './cargoReceiving.constant'
import {
  requestCargoReceivingApi,
  type CargoReceivingDependencies,
} from './cargoReceivingRequest.service'
import {
  toArrivalDetail,
  toArrivalPage,
  toAvailableDocumentPage,
  toBatchOutcomes,
  toCloseResult,
  toContractorPage,
  toReceivingProfilePage,
  toRegisterResult,
} from './cargoReceivingResponse.validation'

type Cursor = Readonly<{ cursor: string | null }>

export type CargoReceivingClient = Readonly<{
  assignRoute: (
    input: Readonly<{
      arrivalId: string
      documentIds: readonly string[]
      routeName: string | null
    }>,
  ) => Promise<readonly CargoDocumentOutcome[]>
  batchStatus: (
    input: Readonly<{
      arrivalId: string
      documentIds: readonly string[]
      to: CargoTransitionTarget
    }>,
  ) => Promise<readonly CargoDocumentOutcome[]>
  closeArrival: (arrivalId: string) => Promise<CloseCargoArrivalResult>
  getArrival: (arrivalId: string) => Promise<CargoArrivalDetail>
  listArrivals: (
    input: Cursor & Readonly<{ filters: CargoArrivalFilters }>,
  ) => Promise<CargoPage<CargoArrivalSummary>>
  listAvailableDocuments: (
    input: Cursor & Readonly<{ contractorId: string }>,
  ) => Promise<CargoPage<AvailableCargoDocument>>
  listContractors: (input: Cursor) => Promise<CargoPage<CargoContractor>>
  /** `enabled: true` só os com o recebimento ligado; sem ele, todos os perfis que existem. */
  listReceivingProfiles: (
    input: Cursor & Readonly<{ enabled: boolean | undefined }>,
  ) => Promise<CargoPage<CargoReceivingProfile>>
  registerArrival: (
    input: Readonly<{ idempotencyKey: string; input: RegisterCargoArrivalInput }>,
  ) => Promise<RegisterCargoArrivalResult>
}>

function buildQuery(entries: Readonly<Record<string, string | null | undefined>>): string {
  const parameters = new URLSearchParams({ limit: String(CARGO_ARRIVAL_LIMITS.pageSize) })
  for (const [name, value] of Object.entries(entries)) {
    if (value !== null && value !== undefined) parameters.set(name, value)
  }
  return parameters.toString()
}

/** `contractorId` e `status` repetem (`?status=open&status=closed`); `sort` e `direction` andam sempre com o cursor. */
function buildArrivalListQuery(
  input: Readonly<{ cursor: string | null; filters: CargoArrivalFilters }>,
): string {
  const { contractorIds, order, statuses } = input.filters
  const parameters = new URLSearchParams({ limit: String(CARGO_ARRIVAL_LIMITS.pageSize) })
  for (const contractorId of contractorIds) parameters.append('contractorId', contractorId)
  for (const status of statuses) parameters.append('status', status)
  if (order !== undefined) {
    parameters.set('sort', order.sort)
    parameters.set('direction', order.direction)
  }
  if (input.cursor !== null) parameters.set('cursor', input.cursor)
  return parameters.toString()
}

const arrivalPath = (arrivalId: string): string =>
  `${CARGO_RECEIVING_PATHS.arrivals}/${encodeURIComponent(arrivalId)}`

type ReadMethods = Pick<
  CargoReceivingClient,
  | 'getArrival'
  | 'listArrivals'
  | 'listAvailableDocuments'
  | 'listContractors'
  | 'listReceivingProfiles'
>
type WriteMethods = Omit<CargoReceivingClient, keyof ReadMethods>

function createReadMethods(dependencies: CargoReceivingDependencies): ReadMethods {
  return {
    async getArrival(arrivalId) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: arrivalPath(arrivalId),
      })
      return toArrivalDetail(body)
    },
    async listArrivals({ cursor, filters }) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${CARGO_RECEIVING_PATHS.arrivals}?${buildArrivalListQuery({ cursor, filters })}`,
      })
      return toArrivalPage(body)
    },
    async listAvailableDocuments({ contractorId, cursor }) {
      const query = buildQuery({ contractorId, cursor })
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${CARGO_RECEIVING_PATHS.availableDocuments}?${query}`,
      })
      return toAvailableDocumentPage(body)
    },
    async listContractors({ cursor }) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${CARGO_RECEIVING_PATHS.contractors}?${buildQuery({ cursor })}`,
      })
      return toContractorPage(body)
    },
    async listReceivingProfiles({ cursor, enabled }) {
      const query = buildQuery({
        cursor,
        enabled: enabled === undefined ? undefined : String(enabled),
      })
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${CARGO_RECEIVING_PATHS.receivingProfiles}?${query}`,
      })
      return toReceivingProfilePage(body)
    },
  }
}

function createWriteMethods(dependencies: CargoReceivingDependencies): WriteMethods {
  return {
    async assignRoute({ arrivalId, documentIds, routeName }) {
      const { body } = await requestCargoReceivingApi({
        body: { documentIds, routeName },
        dependencies,
        method: 'POST',
        path: `${arrivalPath(arrivalId)}/route-assignment`,
      })
      return toBatchOutcomes(body)
    },
    async batchStatus({ arrivalId, documentIds, to }) {
      const { body } = await requestCargoReceivingApi({
        body: { documentIds, to },
        dependencies,
        method: 'POST',
        path: `${arrivalPath(arrivalId)}/documents/batch-status`,
      })
      return toBatchOutcomes(body)
    },
    async closeArrival(arrivalId) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'POST',
        path: `${arrivalPath(arrivalId)}/close`,
      })
      return toCloseResult(body)
    },
    async registerArrival({ idempotencyKey, input }) {
      const { body, status } = await requestCargoReceivingApi({
        body: input,
        dependencies,
        idempotencyKey,
        method: 'POST',
        path: CARGO_RECEIVING_PATHS.arrivals,
      })
      return toRegisterResult({ payload: body, status })
    },
  }
}

export function createCargoReceivingClient(
  dependencies: CargoReceivingDependencies,
): CargoReceivingClient {
  return { ...createReadMethods(dependencies), ...createWriteMethods(dependencies) }
}

export function getCargoReceivingClient(): CargoReceivingClient {
  return createCargoReceivingClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
