/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  CARGO_PREVIEW_FORM_FIELDS,
  CARGO_PREVIEW_LIMITS,
  CARGO_PREVIEW_PATHS,
} from './cargoPreview.constant'
import type {
  CargoPreviewArrivalProposal,
  CargoPreviewDetail,
  CargoPreviewItemAction,
  CargoPreviewItemFilters,
  CargoPreviewItemOutcome,
  CargoPreviewListFilters,
  CargoPreviewPage,
  CargoPreviewProfileFlags,
  CargoPreviewSummary,
  UploadCargoPreviewInput,
  UploadCargoPreviewResult,
} from './cargoPreview.types'
import type { CargoPreviewTripDrafts } from './cargoPreviewTripDraft.types'
import {
  toItemOutcome,
  toPreviewDetail,
  toPreviewPage,
  toProfileFlags,
  toProposal,
  toTripDrafts,
  toUploadResult,
} from './cargoPreviewResponse.validation'
import {
  requestCargoReceivingApi,
  type CargoReceivingDependencies,
} from './cargoReceivingRequest.service'

export type CargoPreviewClient = Readonly<{
  getPreview: (
    input: Readonly<{ filters: CargoPreviewItemFilters; previewId: string }>,
  ) => Promise<CargoPreviewDetail>
  itemAction: (
    input: Readonly<{
      action: CargoPreviewItemAction
      documentId?: string
      itemId: string
      previewId: string
    }>,
  ) => Promise<CargoPreviewItemOutcome>
  listPreviews: (
    input: Readonly<{ cursor: string | null; filters: CargoPreviewListFilters }>,
  ) => Promise<CargoPreviewPage<CargoPreviewSummary>>
  /** Os rascunhos de viagem por roteiro (RF7). Só lê: criar viagem é do fluxo de viagem. */
  getTripDrafts: (previewId: string) => Promise<CargoPreviewTripDrafts>
  proposeArrival: (previewId: string) => Promise<CargoPreviewArrivalProposal>
  readProfileFlags: (contractorId: string) => Promise<CargoPreviewProfileFlags>
  uploadPreview: (
    input: Readonly<{ idempotencyKey: string; input: UploadCargoPreviewInput }>,
  ) => Promise<UploadCargoPreviewResult>
}>

function buildQuery(
  input: Readonly<{ entries: Readonly<Record<string, string | null | undefined>>; limit: number }>,
): string {
  const parameters = new URLSearchParams({ limit: String(input.limit) })
  for (const [name, value] of Object.entries(input.entries)) {
    if (value !== null && value !== undefined) parameters.set(name, value)
  }
  return parameters.toString()
}

const previewPath = (previewId: string): string =>
  `${CARGO_PREVIEW_PATHS.previews}/${encodeURIComponent(previewId)}`

function buildUploadForm(input: UploadCargoPreviewInput): FormData {
  const form = new FormData()
  form.set(CARGO_PREVIEW_FORM_FIELDS.contractorId, input.contractorId)
  form.set(CARGO_PREVIEW_FORM_FIELDS.file, input.file, input.file.name)
  return form
}

export function createCargoPreviewClient(
  dependencies: CargoReceivingDependencies,
): CargoPreviewClient {
  return {
    async getPreview({ filters, previewId }) {
      const query = buildQuery({
        entries: { ...filters },
        limit: CARGO_PREVIEW_LIMITS.itemsPageSize,
      })
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${previewPath(previewId)}?${query}`,
      })
      return toPreviewDetail(body)
    },
    async getTripDrafts(previewId) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${previewPath(previewId)}/trip-drafts`,
      })
      return toTripDrafts(body)
    },
    async itemAction({ action, documentId, itemId, previewId }) {
      const { body } = await requestCargoReceivingApi({
        ...(documentId === undefined ? {} : { body: { documentId } }),
        dependencies,
        method: 'POST',
        path: `${previewPath(previewId)}/items/${encodeURIComponent(itemId)}/${action}`,
      })
      return toItemOutcome(body)
    },
    async listPreviews({ cursor, filters }) {
      const query = buildQuery({
        entries: { ...filters, cursor },
        limit: CARGO_PREVIEW_LIMITS.pageSize,
      })
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${CARGO_PREVIEW_PATHS.previews}?${query}`,
      })
      return toPreviewPage(body)
    },
    async proposeArrival(previewId) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'POST',
        path: `${previewPath(previewId)}/propose-arrival`,
      })
      return toProposal(body)
    },
    async readProfileFlags(contractorId) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${CARGO_PREVIEW_PATHS.contractors}/${encodeURIComponent(contractorId)}/receiving-profile`,
      })
      return toProfileFlags(body)
    },
    async uploadPreview({ idempotencyKey, input }) {
      const { body, status } = await requestCargoReceivingApi({
        dependencies,
        formData: buildUploadForm(input),
        idempotencyKey,
        method: 'POST',
        path: CARGO_PREVIEW_PATHS.previews,
      })
      return toUploadResult(body, status)
    },
  }
}

export function getCargoPreviewClient(): CargoPreviewClient {
  return createCargoPreviewClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
