/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: a linha do tempo da ocorrência. Pura — recebe os fatos já lidos (registro, fotos,
 * tratativa da spec 164, e-mails da spec 143; as conversas das Fases 4–6 entram pela mesma porta) e
 * decide a ordem, o intervalo desde o evento anterior, os eventos-chave e os três tempos do topo.
 * **Leitura pura**: nada aqui decide a tratativa (spec 183 D4).
 */

/** Os quatro atores, os mesmos dos balões das conversas — a cor é do ator, não do evento. */
export type OccurrenceTimelineActorKind = 'contractor' | 'driver' | 'operation' | 'system'

export type OccurrenceTimelineActor = {
  readonly kind: OccurrenceTimelineActorKind
  readonly name: null | string
}

type SourceBase = {
  readonly actor: OccurrenceTimelineActor
  readonly id: string
  readonly occurredAt: string
}

export type OccurrenceTimelineSource =
  | (SourceBase & { readonly kind: 'occurrence.recorded' })
  | (SourceBase & { readonly kind: 'occurrence.photo'; readonly photoCount: number })
  | (SourceBase & {
      readonly fromStatus: null | string
      readonly kind: 'case.transition'
      readonly note: string
      readonly toStatus: string
    })
  | (SourceBase & {
      readonly deliveryStatus: null | string
      readonly interpretation: null | string
      readonly kind: 'contractor.mail.received' | 'contractor.mail.sent'
    })

export type OccurrenceTimelineEvent = OccurrenceTimelineSource & {
  readonly isKey: boolean
  /** `null` no primeiro evento; segundos inteiros desde o evento anterior. */
  readonly sincePreviousSeconds: null | number
}

/**
 * Os três tempos do topo, como instantes — a tela conta a duração com o relógio dela, e o tempo de
 * ocorrência aberta segue correndo sem nova leitura. `openUntil` nulo é ocorrência ainda aberta.
 */
export type OccurrenceTimelineTimings = {
  readonly contractorAskedAt: null | string
  readonly contractorRepliedAt: null | string
  readonly driverReleasedAt: null | string
  readonly openSince: null | string
  readonly openUntil: null | string
}

export type OccurrenceTimeline = {
  readonly events: readonly OccurrenceTimelineEvent[]
  readonly timings: OccurrenceTimelineTimings
}

/** No mesmo instante o registro vem primeiro, depois as fotos, a tratativa e os e-mails. */
const KIND_PRIORITY: Readonly<Record<OccurrenceTimelineSource['kind'], number>> = {
  'case.transition': 2,
  'contractor.mail.received': 4,
  'contractor.mail.sent': 3,
  'occurrence.photo': 1,
  'occurrence.recorded': 0,
}

/** Terminais da spec 164: a tratativa não sai mais deles. */
const CLOSING_STATUSES: ReadonlySet<string> = new Set([
  'cancelled',
  'closed',
  'returned_to_warehouse',
])

/**
 * Spec 183 RF19, definição desta task: o motorista está **liberado** quando a tratativa sai do
 * caminho dele — decidida pela contratante, devolvida ao barracão, encerrada ou cancelada. Antes
 * disso ele pode estar parado esperando a resposta.
 */
const RELEASING_STATUSES: ReadonlySet<string> = new Set([...CLOSING_STATUSES, 'decided'])

/** Resposta automática da contratante (férias, fora do escritório) não é resposta. */
const NON_REPLY_INTERPRETATIONS: ReadonlySet<string> = new Set(['ignored_auto_reply'])

function compareSources(left: OccurrenceTimelineSource, right: OccurrenceTimelineSource): number {
  const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
  if (byTime !== 0) return byTime
  const byKind = KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind]
  if (byKind !== 0) return byKind
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/** Fotos gravadas no mesmo instante (o mesmo envio) viram um evento só, com a contagem somada. */
function mergePhotos(
  sources: readonly OccurrenceTimelineSource[],
): readonly OccurrenceTimelineSource[] {
  const merged: OccurrenceTimelineSource[] = []
  for (const source of sources) {
    const previous = merged.at(-1)
    if (
      source.kind === 'occurrence.photo' &&
      previous?.kind === 'occurrence.photo' &&
      Date.parse(previous.occurredAt) === Date.parse(source.occurredAt)
    ) {
      merged[merged.length - 1] = {
        ...previous,
        photoCount: previous.photoCount + source.photoCount,
      }
      continue
    }
    merged.push(source)
  }
  return merged
}

function isKeyEvent(source: OccurrenceTimelineSource): boolean {
  if (source.kind === 'occurrence.recorded') return true
  return source.kind === 'case.transition' && source.toStatus === 'decided'
}

function resolveTimings(sources: readonly OccurrenceTimelineSource[]): OccurrenceTimelineTimings {
  const recorded = sources.find((source) => source.kind === 'occurrence.recorded')
  const transitions = sources.filter((source) => source.kind === 'case.transition')
  const asked = sources.find((source) => source.kind === 'contractor.mail.sent')
  const replied =
    asked === undefined
      ? undefined
      : sources.find(
          (source) =>
            source.kind === 'contractor.mail.received' &&
            Date.parse(source.occurredAt) >= Date.parse(asked.occurredAt) &&
            !NON_REPLY_INTERPRETATIONS.has(source.interpretation ?? ''),
        )

  return {
    contractorAskedAt: asked?.occurredAt ?? null,
    contractorRepliedAt: replied?.occurredAt ?? null,
    driverReleasedAt:
      transitions.find((source) => RELEASING_STATUSES.has(source.toStatus))?.occurredAt ?? null,
    openSince: recorded?.occurredAt ?? null,
    openUntil:
      transitions.find((source) => CLOSING_STATUSES.has(source.toStatus))?.occurredAt ?? null,
  }
}

export function buildOccurrenceTimeline(input: {
  readonly sources: readonly OccurrenceTimelineSource[]
}): OccurrenceTimeline {
  const ordered = mergePhotos([...input.sources].sort(compareSources))
  const events = ordered.map((source, index): OccurrenceTimelineEvent => {
    const previous = index === 0 ? undefined : ordered[index - 1]
    return {
      ...source,
      id: `${source.kind}:${source.id}`,
      isKey: isKeyEvent(source),
      sincePreviousSeconds:
        previous === undefined
          ? null
          : Math.max(
              0,
              Math.round((Date.parse(source.occurredAt) - Date.parse(previous.occurredAt)) / 1000),
            ),
    }
  })
  return { events, timings: resolveTimings(ordered) }
}
