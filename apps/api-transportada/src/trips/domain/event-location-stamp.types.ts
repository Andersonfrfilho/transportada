/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { EventLocationState } from '../../database/event-location.schema.js'
import type { TripFieldChannel } from './trip-field-channel.constant.js'

/** O ponto que o aparelho leu. Estruturalmente igual a `ReportedLocation`, sem importar a aplicação. */
export type EventLocationPoint = {
  readonly accuracyMeters: string | null
  readonly capturedAt: string
  readonly latitude: string
  readonly longitude: string
}

/** As cinco colunas de posição de um evento (`buildEventLocationColumns`), prontas para o `INSERT`. */
export type EventLocationStampColumns = {
  readonly accuracyMeters: string | null
  readonly capturedAt: Date | null
  readonly latitude: string | null
  readonly locationState: EventLocationState | null
  readonly longitude: string | null
}

export type ResolveEventLocationStampParams = {
  readonly channel: TripFieldChannel
  /** `true` só no gesto que o motorista fez; a troca de status que ele deriva não é toque. */
  readonly isDriverTap: boolean
  readonly location: EventLocationPoint | null
}
