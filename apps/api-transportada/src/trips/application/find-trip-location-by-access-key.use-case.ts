/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'

export type TripLocationByAccessKey = {
  readonly documentId: string
  readonly separationStatus: TripDocumentSeparationStatus
  readonly stop: {
    readonly id: string
    readonly label: string
    readonly sequence: number
  } | null
  readonly tripId: string
  readonly tripStatus: TripStatus
}

export type FindTripLocationByAccessKeyPort = {
  /**
   * `null` quando a chave não resolve nesta empresa, ou resolve a uma nota que nunca foi
   * vinculada a nenhuma viagem — os dois casos são "não há onde localizar", e a spec 055 já trata
   * chave inexistente como página vazia, não erro.
   */
  findByAccessKey(input: {
    readonly accessKey: string
    readonly companyId: string
  }): Promise<TripLocationByAccessKey | null>
}

export type FindTripLocationByAccessKeyInput = {
  readonly accessKey: string
  readonly companyId: string
  readonly repository: FindTripLocationByAccessKeyPort
}

/**
 * P3 da spec 056: o separador bipa a DANFE e o painel responde onde a nota está, sem varrer lista.
 * `null` no resultado — nunca 404 — porque "essa nota não está em viagem nenhuma" é resposta
 * válida, não erro: é exatamente o estado antes de alguém bipar a etiqueta.
 */
export async function findTripLocationByAccessKey(
  input: FindTripLocationByAccessKeyInput,
): Promise<TripLocationByAccessKey | null> {
  return input.repository.findByAccessKey(input)
}
