/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { FLEET_DRIVER_REGION_SCOPES } from '../../database/freight-region.schema.js'
import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'
import type { FleetDriverRegionEntry } from '../application/freight-region.port.js'
import { assertDriverCoverage } from '../domain/driver-coverage.policy.js'
import { normalizeRegionCity } from '../domain/region-coverage.policy.js'

const CITY_MAX_LENGTH = 60

/**
 * Cidade e UF são opcionais na forma, obrigatórias na regra: quem decide é
 * `assertDriverCoverage`, que responde com código próprio. Exigi-las aqui devolveria o `400`
 * genérico de schema, e a tela não saberia dizer qual das duas linhas está errada.
 */
const entrySchema = z
  .object({
    city: z.string().trim().max(CITY_MAX_LENGTH).optional(),
    regionId: z.uuid(),
    scope: z.enum(FLEET_DRIVER_REGION_SCOPES),
    state: z.string().trim().toUpperCase().max(2).optional(),
  })
  .strict()

const replaceCoverageSchema = z
  .object({
    entries: z.array(entrySchema),
  })
  .strict()

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'

export async function parseReplaceDriverRegionsRequest(
  request: Request,
): Promise<readonly FleetDriverRegionEntry[]> {
  const { entries } = await parseBody(replaceCoverageSchema, request)
  const coverage = entries.map((entry) => {
    const value: FleetDriverRegionEntry = {
      city: entry.city ?? '',
      regionId: entry.regionId,
      scope: entry.scope,
      state: entry.state ?? '',
    }
    assertDriverCoverage(value)
    return value
  })

  const keys = new Set(
    coverage.map((entry) => `${entry.regionId}:${entry.scope}:${normalizeRegionCity(entry.city)}`),
  )
  if (keys.size !== coverage.length) throw invalidRequest()

  return coverage
}
