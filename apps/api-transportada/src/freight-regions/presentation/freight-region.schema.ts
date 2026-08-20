/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FREIGHT_REGION_STATUSES } from '../../database/freight-region.schema.js'
import {
  hasFilter,
  optionalFilter,
  parseBody,
  parseContains,
  parseOption,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import type { FreightRegionFilters } from '../application/freight-region.port.js'
import {
  createRegionSchema,
  updateRegionSchema,
  type FreightRegionFields,
  type UpdateFreightRegionBody,
} from './freight-region-request.schema.js'

const REGION_QUERY_KEYS = new Set(['cursor', 'cityContains', 'limit', 'statusEq'])

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'

export async function parseCreateRegionRequest(request: Request): Promise<FreightRegionFields> {
  return parseBody(createRegionSchema, request)
}

export async function parseUpdateRegionRequest(request: Request): Promise<UpdateFreightRegionBody> {
  return parseBody(updateRegionSchema, request)
}

export function parseRegionList(url: URL): {
  readonly cursor: string | null
  readonly filters?: FreightRegionFilters
  readonly limit: number
} {
  const parameters = readListQuery(url, REGION_QUERY_KEYS)
  const filters: FreightRegionFilters = {
    ...optionalFilter('cityContains', parseContains(parameters.get('cityContains'))),
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), FREIGHT_REGION_STATUSES)),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}
