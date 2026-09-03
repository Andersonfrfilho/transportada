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
  /**
   * ADR-0056 §2: quando a viagem saiu. `null` é viagem que nunca foi despachada — e ela fecha a
   * janela igual ao teto estourado, para o celular não conseguir perguntar pelo estado da viagem.
   */
  readonly dispatchedAt: Date | null
  readonly hasConsent: boolean
  readonly tripId: string
}

export type TripLocationRepositoryPort = {
  /** Apaga o rastro da viagem. Chamado no fechamento e no cancelamento (ADR-0050 §5). */
  purgeByTrip(input: { readonly companyId: string; readonly tripId: string }): Promise<void>
  /**
   * ADR-0056 §2: apaga o ping velho **tenha a viagem fechado ou não**. É o prazo que `purgeByTrip`
   * não dá: ele depende de alguém fechar a viagem, e é justamente a viagem esquecida aberta que
   * transforma o rastro em histórico de deslocamento de uma pessoa.
   */
  purgeStalePings(input: { readonly before: Date; readonly limit: number }): Promise<number>
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
