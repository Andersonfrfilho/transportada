/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutRequestPort } from '../application/cargo-layout-request.port.js'
import type {
  UpsertCargoLayoutRequestParams,
  UpsertCargoLayoutRequestResult,
} from '../application/cargo-layout-request.types.js'
import { upsertCargoLayoutRequest } from './cargo-layout-request.support.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleCargoLayoutRequestRepository implements CargoLayoutRequestPort {
  public constructor(private readonly database: TripDatabase) {}

  public async requestLayout(
    params: UpsertCargoLayoutRequestParams,
  ): Promise<UpsertCargoLayoutRequestResult> {
    return this.database.transaction((transaction) => upsertCargoLayoutRequest(transaction, params))
  }
}
