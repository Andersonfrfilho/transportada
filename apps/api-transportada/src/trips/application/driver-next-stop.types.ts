/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF8/RF12: a próxima parada que a baixa do motorista oferece quando fecha a parada.
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import type { WhatsAppStopCandidate } from '../domain/driver-stop-resolution.policy.js'

export type DriverNextStop = {
  readonly address: string
  readonly coordinate: { readonly latitude: string; readonly longitude: string } | null
  readonly documents: readonly { readonly id: string; readonly number: string }[]
  readonly id: string
  readonly isAddressReliable: boolean
  readonly precision: GeocodingPrecision | null
  readonly recipientName: string
  readonly sequence: number
  readonly totalStops: number
}

/** A parada como o banco a entrega: o que a regra do "saí" lê, mais o que a oferta mostra. */
export type NextStopCandidate = Omit<WhatsAppStopCandidate, 'documents'> & {
  readonly address: string
  readonly documents: readonly {
    readonly id: string
    readonly number: string
    readonly separationStatus: string
  }[]
  readonly latitude: string | null
  readonly longitude: string | null
  readonly precision: GeocodingPrecision | null
  readonly recipientName: string
}

export type NextStopCandidates = {
  readonly stops: readonly NextStopCandidate[]
  readonly totalStops: number
}
