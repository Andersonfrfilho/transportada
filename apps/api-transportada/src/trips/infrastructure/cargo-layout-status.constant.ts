/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutStatus } from '../../database/trip-cargo-layout.schema.js'

/** Spec 145 D5: os estados de `trip_cargo_layouts.status`, pelo nome — nunca literal solto na query. */
export const CARGO_LAYOUT_STATUS = {
  failed: 'failed',
  queued: 'queued',
  ready: 'ready',
  running: 'running',
} as const satisfies Record<CargoLayoutStatus, CargoLayoutStatus>

/** D14/D16/D18: o que o upsert reabre depois do lease — `ready` nunca. */
export const CARGO_LAYOUT_REOPENABLE_STATUSES = [
  CARGO_LAYOUT_STATUS.failed,
  CARGO_LAYOUT_STATUS.queued,
  CARGO_LAYOUT_STATUS.running,
] as const
