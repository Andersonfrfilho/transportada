/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriverRegionScope } from '../../database/freight-region.schema.js'
import {
  FleetDriverRegionCityRequiredError,
  FleetDriverRegionCityUnexpectedError,
} from './freight-region.error.js'

const STATE_PATTERN = /^[A-Z]{2}$/

export type DriverCoverageShape = {
  readonly city: string
  readonly scope: FleetDriverRegionScope
  readonly state: string
}

/**
 * As duas metades do CHECK `fleet_driver_regions_city_check`, ditas na fronteira e com código
 * próprio: o operador precisa saber qual das duas linhas está errada, e um `23514` do Postgres
 * chega como 500 sem dizer nem qual entrada.
 */
export function assertDriverCoverage(entry: DriverCoverageShape): void {
  if (entry.scope === 'city') {
    if (entry.city.length === 0 || !STATE_PATTERN.test(entry.state)) {
      throw new FleetDriverRegionCityRequiredError()
    }
    return
  }
  if (entry.city.length > 0 || entry.state.length > 0) {
    throw new FleetDriverRegionCityUnexpectedError()
  }
}
