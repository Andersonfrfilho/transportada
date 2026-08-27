/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type TripLocationPing = {
  readonly latitude: string
  readonly longitude: string
  readonly recordedAt: string
}

/**
 * O que a ingestão precisa saber antes de gravar: a viagem corrente do motorista e se ele consentiu.
 * `null` quando ele não tem viagem em rua — e é ausência, não erro: o celular do motorista continua
 * mandando posição por alguns minutos depois de a viagem fechar, e derrubar isso com 409 encheria o
 * log de falha inventada.
 */
export type DriverTrackingState = {
  readonly hasConsent: boolean
  readonly tripId: string
}

export type TripLocationRepositoryPort = {
  /** Apaga o rastro da viagem. Chamado no fechamento e no cancelamento (ADR-0050 §5). */
  purgeByTrip(input: { readonly companyId: string; readonly tripId: string }): Promise<void>
  readCurrentTracking(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<DriverTrackingState | null>
  /** A última posição da viagem, ou `null` quando não há rastro — nunca a identidade de quem dirige. */
  readLastPing(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripLocationPing | null>
  recordPing(input: {
    readonly companyId: string
    readonly driverId: string
    readonly latitude: string
    readonly longitude: string
    readonly tripId: string
  }): Promise<void>
  setConsent(input: {
    readonly accepted: boolean
    readonly companyId: string
    readonly driverId: string
  }): Promise<{ readonly acceptedAt: string | null }>
}
