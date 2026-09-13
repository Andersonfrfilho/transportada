/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutLookupPort } from '../application/cargo-layout-lookup.port.js'
import type { CargoLayoutLeaseOptions } from '../application/cargo-layout-request.types.js'
import type {
  FindCargoLayoutByIdParams,
  FindCargoLayoutByInputHashParams,
} from '../application/read-cargo-layout.types.js'
import { DEFAULT_CARGO_LAYOUT_LEASE_MS } from '../domain/cargo-layout-lease.policy.js'
import type {
  StoredCargoLayoutRecord,
  StoredCargoLayoutRecordWithInput,
} from '../domain/cargo-layout-state.types.js'
import {
  readCargoLayoutById,
  readCargoLayoutByInputHash,
} from './stored-cargo-layout-read.support.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** Spec 145 T11: o lease decide se um pedido parado é reaberto — o mesmo do worker (D14). */
export class DrizzleCargoLayoutLookupRepository implements CargoLayoutLookupPort {
  public constructor(
    private readonly database: TripQueryable,
    private readonly options: CargoLayoutLeaseOptions = {
      cargoLayoutLeaseMs: DEFAULT_CARGO_LAYOUT_LEASE_MS,
    },
  ) {}

  public findById(
    params: FindCargoLayoutByIdParams,
  ): Promise<StoredCargoLayoutRecordWithInput | undefined> {
    return readCargoLayoutById(this.database, {
      ...params,
      leaseMs: this.options.cargoLayoutLeaseMs,
    })
  }

  public findByInputHash(
    params: FindCargoLayoutByInputHashParams,
  ): Promise<StoredCargoLayoutRecord | undefined> {
    return readCargoLayoutByInputHash(this.database, {
      ...params,
      leaseMs: this.options.cargoLayoutLeaseMs,
    })
  }
}
