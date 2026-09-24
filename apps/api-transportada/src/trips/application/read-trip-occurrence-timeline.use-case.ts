/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: a linha do tempo da ocorrência. O leitor devolve os fatos crus (registro, fotos,
 * tratativa, e-mails à contratante) e a política decide ordem, intervalos, eventos-chave e os três
 * tempos. **Leitura pura** (spec 183 D4).
 */
import {
  buildOccurrenceTimeline,
  type OccurrenceTimeline,
  type OccurrenceTimelineSource,
} from '../domain/occurrence-timeline.policy.js'
import { TripOccurrenceNotFoundError } from '../domain/trip.error.js'

export type TripOccurrenceTimelineReaderPort = {
  /** `null` quando a ocorrência não existe **na empresa do contexto**. */
  findSources(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<readonly OccurrenceTimelineSource[] | null>
}

export type ReadTripOccurrenceTimelineInput = {
  readonly context: { readonly companyId: string }
  readonly occurrenceId: string
}

export type ReadTripOccurrenceTimelineUseCase = {
  execute(input: ReadTripOccurrenceTimelineInput): Promise<OccurrenceTimeline>
}

/** Inexistente e de outra empresa respondem igual: a diferença confirmaria a existência. */
export function createReadTripOccurrenceTimelineUseCase(dependencies: {
  readonly reader: TripOccurrenceTimelineReaderPort
}): ReadTripOccurrenceTimelineUseCase {
  return {
    async execute(input: ReadTripOccurrenceTimelineInput): Promise<OccurrenceTimeline> {
      const sources = await dependencies.reader.findSources({
        companyId: input.context.companyId,
        occurrenceId: input.occurrenceId,
      })
      if (sources === null) throw new TripOccurrenceNotFoundError()
      return buildOccurrenceTimeline({ sources })
    },
  }
}
