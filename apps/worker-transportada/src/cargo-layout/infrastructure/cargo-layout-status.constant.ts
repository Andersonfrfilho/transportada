/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutStatus } from '../../database/trip-cargo-layout.schema.js'

/** Spec 145 D5: os estados de `trip_cargo_layouts.status` — cópia por valor da API, nunca import. */
export const CARGO_LAYOUT_STATUS = {
  failed: 'failed',
  queued: 'queued',
  ready: 'ready',
  running: 'running',
} as const satisfies Record<CargoLayoutStatus, CargoLayoutStatus>
