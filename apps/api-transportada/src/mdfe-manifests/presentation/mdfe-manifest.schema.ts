/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  hasFilter,
  optionalFilter,
  parseBody,
  parseOption,
  parseUuidFilter,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import { MDFE_MANIFEST_STATUSES } from '../../database/mdfe.schema.js'
import type { MdfeManifestFilters } from '../application/mdfe-manifest.port.js'
import {
  createManifestSchema,
  createTripManifestSchema,
  previewManifestSchema,
  type CreateManifestBody,
  type CreateTripManifestBody,
  type PreviewManifestBody,
} from './mdfe-manifest-request.schema.js'

const MANIFEST_QUERY_KEYS = new Set(['cursor', 'limit', 'statusEq', 'vehicleIdEq'])

type ManifestListing = {
  readonly cursor: string | null
  readonly filters?: MdfeManifestFilters
  readonly limit: number
}

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'

export async function parsePreviewManifestRequest(request: Request): Promise<PreviewManifestBody> {
  return parseBody(previewManifestSchema, request)
}

export async function parseCreateManifestRequest(request: Request): Promise<CreateManifestBody> {
  return parseBody(createManifestSchema, request)
}

export async function parseCreateTripManifestRequest(
  request: Request,
): Promise<CreateTripManifestBody> {
  return parseBody(createTripManifestSchema, request)
}

export function parseManifestList(url: URL): ManifestListing {
  const parameters = readListQuery(url, MANIFEST_QUERY_KEYS)
  const filters: MdfeManifestFilters = {
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), MDFE_MANIFEST_STATUSES)),
    ...optionalFilter('vehicleIdEq', parseUuidFilter(parameters.get('vehicleIdEq'))),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}
