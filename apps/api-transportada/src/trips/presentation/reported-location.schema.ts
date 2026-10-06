/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { EVENT_LOCATION_ACCURACY_MAX_METERS } from '../../database/event-location.schema.js'
import type { ReportedLocation } from '../application/driver-field-report.port.js'

/**
 * Coordenada anulável **inteira**, nunca meia: latitude sem longitude é dado que mente. O aparelho
 * manda as duas ou não manda nenhuma, e não mandar é o caso normal do galpão sem sinal.
 */
export const locationSchema = z
  .object({
    accuracyMeters: z.number().nonnegative().optional(),
    capturedAt: z.iso.datetime(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()

/**
 * A precisão vira texto decimal porque a coluna é `numeric` — `float` de precisão não é precisão. E
 * acima do teto de `numeric(10,2)` ela é gravada no teto: a posição foi lida, e recusá-la por causa
 * do tamanho do erro perderia o evento inteiro na fila.
 */
export function toReportedLocation(
  value: z.infer<typeof locationSchema> | null | undefined,
): ReportedLocation | null {
  if (value === null || value === undefined) return null

  return {
    accuracyMeters:
      value.accuracyMeters === undefined
        ? null
        : Math.min(value.accuracyMeters, EVENT_LOCATION_ACCURACY_MAX_METERS).toFixed(2),
    capturedAt: value.capturedAt,
    latitude: value.latitude.toFixed(7),
    longitude: value.longitude.toFixed(7),
  }
}
