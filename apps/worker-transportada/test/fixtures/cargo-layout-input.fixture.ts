/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CARGO_LAYOUT_POLICY_VERSION, type CargoLayoutStop } from '@adatechnology/cargo-placement'
import { DAILY_19_STOPS } from '@adatechnology/cargo-placement/fixtures'

import type { StoredCargoLayoutInput } from '../../src/cargo-layout/application/stored-cargo-layout-input.schema.js'

/**
 * A Daily medida da spec 118, cortada nas primeiras paradas: carga real, só com números, pequena o
 * bastante para a thread responder em milissegundos.
 */
export function buildStoredCargoLayoutInput(input: {
  readonly stopCount: number
}): StoredCargoLayoutInput {
  const stops = new Map<number, CargoLayoutStop>()

  for (const [sequence, count, lengthMm, widthMm, heightMm] of DAILY_19_STOPS) {
    if (sequence > input.stopCount) continue
    const current = stops.get(sequence) ?? {
      boxes: [],
      clientName: `Cliente ${sequence}`,
      documentsWithoutVolume: 0,
      label: `Parada ${sequence}`,
      noteNumbers: [`${1000 + sequence}`],
      sequence,
      volumeM3: null,
    }
    stops.set(sequence, {
      ...current,
      boxes: [
        ...(current.boxes ?? []),
        { count, documentId: null, heightMm, label: `NF ${1000 + sequence}`, lengthMm, widthMm },
      ],
    })
  }

  return {
    bedDimensions: { heightM: '1.80', lengthM: '4.20', source: 'measured', widthM: '2.10' },
    capacityM3: '15.876',
    enclosedBody: false,
    fallbackBoxVolumeM3: null,
    loadingAccess: 'rear',
    measuredShapes: [],
    payloadRatio: '0.90',
    policyVersion: CARGO_LAYOUT_POLICY_VERSION,
    securesCargo: false,
    stops: [...stops.values()],
  }
}
