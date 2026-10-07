/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type RedactTripLocationsInput = {
  /**
   * O instante do ciclo. O corte de cada linha é `now - retention_days` **da empresa dela** (spec 239
   * D2), então o redator recebe o relógio e não uma data de corte única.
   */
  readonly now: Date
  readonly limit: number
}

export type PurgeStalePingsInput = {
  /** Ping anterior a este instante é apagado. */
  readonly before: Date
  readonly limit: number
}

/**
 * Spec 239 D3: quantas empresas estão com o expurgo ligado e com a carência vencida em `now`. É o mesmo
 * `now` dos redatores — um instante por ciclo —, e zero dispensa as cinco varreduras.
 */
export type CountEligibleCompanies = (input: { readonly now: Date }) => Promise<number>

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
export type PurgeStalePings = (input: PurgeStalePingsInput) => Promise<number>

/**
 * Spec 159 T11 (item 8): a posição da foto do comprovante cai no mesmo prazo da coordenada do evento
 * — latitude, longitude e precisão. O comprovante e o veredito de pontualidade ficam.
 */
export type RedactDeliveryProofLocations = (input: RedactTripLocationsInput) => Promise<number>

/**
 * Spec 196 D8: os três redatores das tabelas que ganharam o ponto do toque. Mesmo contrato do
 * redator de `trip_stop_events` — zera as quatro colunas, marca `expired`, nunca apaga o evento.
 */
export type RedactStatusEventLocations = (input: RedactTripLocationsInput) => Promise<number>
export type RedactStopOccurrenceLocations = (input: RedactTripLocationsInput) => Promise<number>
export type RedactDocumentOccurrenceLocations = (input: RedactTripLocationsInput) => Promise<number>
