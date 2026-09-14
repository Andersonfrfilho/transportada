/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutRequestPort } from '../application/cargo-layout-request.port.js'
import type {
  CargoLayoutLeaseOptions,
  CargoLayoutRequestParams,
  ReopenStoredCargoLayoutParams,
  UpsertCargoLayoutRequestResult,
} from '../application/cargo-layout-request.types.js'
import { DEFAULT_CARGO_LAYOUT_LEASE_MS } from '../domain/cargo-layout-lease.policy.js'
import {
  reopenStoredCargoLayoutRequest,
  upsertCargoLayoutRequest,
} from './cargo-layout-request.support.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleCargoLayoutRequestRepository implements CargoLayoutRequestPort {
  public constructor(
    private readonly database: TripDatabase,
    private readonly options: CargoLayoutLeaseOptions = {
      cargoLayoutLeaseMs: DEFAULT_CARGO_LAYOUT_LEASE_MS,
    },
  ) {}

  public async requestLayout(
    params: CargoLayoutRequestParams,
  ): Promise<UpsertCargoLayoutRequestResult> {
    return this.database.transaction((transaction) =>
      upsertCargoLayoutRequest(transaction, {
        ...params,
        leaseMs: this.options.cargoLayoutLeaseMs,
      }),
    )
  }

  public async reopenStoredLayout(
    params: ReopenStoredCargoLayoutParams,
  ): Promise<UpsertCargoLayoutRequestResult | undefined> {
    return this.database.transaction((transaction) =>
      reopenStoredCargoLayoutRequest(transaction, {
        ...params,
        leaseMs: this.options.cargoLayoutLeaseMs,
      }),
    )
  }
}
