/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type RedactTripLocationsInput = {
  /** Evento anterior a este instante perde a coordenada. */
  readonly before: Date
  readonly limit: number
}

/**
 * Apaga **a coordenada** — latitude, longitude, precisão e a hora da leitura do GPS, nunca o evento: a viagem continua auditável — quem chegou, quando entregou
 * — e o que some é onde a pessoa estava. Apagar o evento junto perderia a medição de tempo de
 * atendimento que a 058 e a 060 leem, e não é isso que a LGPD pede.
 */
export type RedactTripLocations = (input: RedactTripLocationsInput) => Promise<number>

/**
 * ADR-0056 §2: apaga o ping velho **tenha a viagem fechado ou não**. É o prazo que `purgeByTrip`
 * não dá — ele depende de alguém fechar a viagem, e é a viagem esquecida aberta que transforma o
 * rastro em histórico de deslocamento de uma pessoa.
 */
export type PurgeStalePings = (input: RedactTripLocationsInput) => Promise<number>
