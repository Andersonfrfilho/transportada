/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: a linha do tempo da ocorrência, como a tela a lê. A API já entrega em ordem, com o
 * intervalo e os eventos-chave; aqui mora o que é de tela — o filtro por participante, a cor do ator
 * (a mesma dos balões, T704), a frase de cada evento e os três tempos contados com o relógio local.
 */

export type OccurrenceTimelineActorKind = 'contractor' | 'driver' | 'operation' | 'system'

export const OCCURRENCE_TIMELINE_ACTOR_KINDS: readonly OccurrenceTimelineActorKind[] = [
  'contractor',
  'driver',
  'operation',
  'system',
]

type EventBase = Readonly<{
  actor: Readonly<{ kind: OccurrenceTimelineActorKind; name: null | string }>
  id: string
  isKey: boolean
  occurredAt: string
  sincePreviousSeconds: null | number
}>

export type OccurrenceTimelineEvent =
  | (EventBase & Readonly<{ kind: 'occurrence.recorded' }>)
  | (EventBase & Readonly<{ kind: 'occurrence.photo'; photoCount: number }>)
  | (EventBase &
      Readonly<{
        fromStatus: null | string
        kind: 'case.transition'
        note: string
        toStatus: string
      }>)
  | (EventBase &
      Readonly<{
        deliveryStatus: null | string
        interpretation: null | string
        kind: 'contractor.mail.received' | 'contractor.mail.sent'
      }>)

export type OccurrenceTimelineTimings = Readonly<{
  contractorAskedAt: null | string
  contractorRepliedAt: null | string
  driverReleasedAt: null | string
  openSince: null | string
  openUntil: null | string
}>

export type OccurrenceTimeline = Readonly<{
  events: readonly OccurrenceTimelineEvent[]
  timings: OccurrenceTimelineTimings
}>

export type OccurrenceTimelineFilter = 'all' | 'contractor' | 'driver'

export const OCCURRENCE_TIMELINE_FILTERS: readonly OccurrenceTimelineFilter[] = [
  'all',
  'contractor',
  'driver',
]

/** A cor do ator é a do balão dele: operação é a enviada (cobre), sistema não tem balão. */
export type OccurrenceTimelineTone = 'contractor' | 'driver' | 'out' | 'system'

export const OCCURRENCE_TIMELINE_ACTOR_TONE: Readonly<
  Record<OccurrenceTimelineActorKind, OccurrenceTimelineTone>
> = {
  contractor: 'contractor',
  driver: 'driver',
  operation: 'out',
  system: 'system',
}

function isContractorMail(event: OccurrenceTimelineEvent): boolean {
  return event.kind === 'contractor.mail.received' || event.kind === 'contractor.mail.sent'
}

/**
 * Contratante: o que ela fez e a conversa com ela (os e-mails, nos dois sentidos, inclusive o aviso
 * automático). Motorista: o que ele fez. As conversas das Fases 4–6 entram pela mesma regra.
 */
export function filterOccurrenceTimelineEvents(
  events: readonly OccurrenceTimelineEvent[],
  filter: OccurrenceTimelineFilter,
): readonly OccurrenceTimelineEvent[] {
  if (filter === 'all') return events
  if (filter === 'contractor') {
    return events.filter((event) => event.actor.kind === 'contractor' || isContractorMail(event))
  }
  return events.filter((event) => event.actor.kind === 'driver')
}

export type OccurrenceTimelineSentence = Readonly<{
  key: string
  values: Readonly<Record<string, number | string>>
}>

/** A frase é chave de locale; o status da tratativa é a mesma chave da coluna da listagem. */
export function describeOccurrenceTimelineEvent(
  event: OccurrenceTimelineEvent,
): OccurrenceTimelineSentence {
  switch (event.kind) {
    case 'occurrence.recorded':
      return { key: 'occurrenceTimeline.event.recorded', values: {} }
    case 'occurrence.photo':
      return { key: 'occurrenceTimeline.event.photos', values: { count: event.photoCount } }
    case 'case.transition':
      return {
        key: 'occurrenceTimeline.event.caseTransition',
        values: { status: `occurrenceFeed.caseStatus.${event.toStatus}` },
      }
    case 'contractor.mail.sent':
      return {
        key:
          event.actor.kind === 'system'
            ? 'occurrenceTimeline.event.mailSentAutomatic'
            : 'occurrenceTimeline.event.mailSent',
        values: {},
      }
    case 'contractor.mail.received':
      return { key: 'occurrenceTimeline.event.mailReceived', values: {} }
  }
}

export type OccurrenceTimelineDuration = Readonly<{ running: boolean; seconds: number }>

export type OccurrenceTimelineDurations = Readonly<{
  contractorResponse: null | OccurrenceTimelineDuration
  driverRelease: null | OccurrenceTimelineDuration
  open: null | OccurrenceTimelineDuration
}>

function elapsed(
  from: null | string,
  until: null | string,
  now: Date,
): null | OccurrenceTimelineDuration {
  if (from === null) return null
  const end = until === null ? now.getTime() : Date.parse(until)
  return {
    running: until === null,
    seconds: Math.max(0, Math.floor((end - Date.parse(from)) / 1000)),
  }
}

/**
 * Os três tempos do topo. Aberta: do registro ao encerramento (ou agora). Resposta da contratante:
 * do primeiro envio à primeira resposta (ou agora) — sem envio, não há o que medir. Liberação do
 * motorista: do registro até a tratativa sair do caminho dele (ou agora).
 */
export function resolveOccurrenceTimelineDurations(
  timings: OccurrenceTimelineTimings,
  now: Date,
): OccurrenceTimelineDurations {
  return {
    contractorResponse: elapsed(timings.contractorAskedAt, timings.contractorRepliedAt, now),
    driverRelease: elapsed(timings.openSince, timings.driverReleasedAt, now),
    open: elapsed(timings.openSince, timings.openUntil, now),
  }
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compacto e sem casas decimais; as unidades (`min`, `h`, `d`) são as mesmas em pt-BR e em inglês. */
export function formatOccurrenceElapsed(seconds: number): string {
  if (seconds >= DAY) {
    const days = Math.floor(seconds / DAY)
    const hours = Math.floor((seconds % DAY) / HOUR)
    return hours === 0 ? `${days} d` : `${days} d ${hours} h`
  }
  if (seconds >= HOUR) {
    const hours = Math.floor(seconds / HOUR)
    const minutes = Math.floor((seconds % HOUR) / MINUTE)
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
  }
  return `${Math.floor(seconds / MINUTE)} min`
}

/** O intervalo desde o evento anterior; abaixo de um minuto não diz nada (o registro e as fotos). */
export function formatOccurrenceGap(seconds: null | number): null | string {
  if (seconds === null || seconds < MINUTE) return null
  return formatOccurrenceElapsed(seconds)
}
