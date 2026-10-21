/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: a linha do tempo da ocorrência, como a tela a lê. A API já entrega em ordem, com o
 * intervalo e os eventos-chave; aqui mora o que é de tela — o filtro por participante, a cor do ator
 * (a mesma dos balões, T704), a frase de cada evento e os três tempos contados com o relógio local.
 */
import type { OccurrenceCancellation } from './trip.types'
import { formatPersonName } from '@/lib/personName'

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
  | (EventBase & Readonly<{ kind: 'occurrence.cancelled'; reason: string }>)
  | (EventBase &
      Readonly<{
        fromStatus: null | string
        kind: 'case.transition'
        note: string
        toStatus: string
      }>)
  | (EventBase &
      Readonly<{
        /** Spec 278: só na recebida — anexos da mensagem da conversa; ausente na API anterior. */
        attachmentCount?: null | number
        /** Spec 278: chegou sem anexo e o retorno segue aguardando o documento; ausente na API anterior. */
        awaitingAttachment?: boolean
        deliveryStatus: null | string
        interpretation: null | string
        kind: 'contractor.mail.received' | 'contractor.mail.sent'
      }>)
  | (EventBase &
      Readonly<{
        kind: 'resolution.resolved'
        note: null | string
        /** Spec 276 T3b: a causa da resolução do sistema; ausente é API anterior ao campo. */
        phraseKey?: null | string
      }>)
  | (EventBase & Readonly<{ kind: 'resolution.reopened' }>)
  /** Spec 276 T3: o retorno da contratante (248) mudou de status; `reason` só quando foi ao operador. */
  | (EventBase & Readonly<{ kind: 'contractor.reply'; reason: null | string; toStatus: string }>)
  /** Spec 278: o resultado da conferência do boleto (`confirmed`, `not_confirmed`, `without_text`). */
  | (EventBase &
      Readonly<{
        invoiceNumber: null | string
        kind: 'contractor.reply.document'
        result: string
        toStatus: string
      }>)
  /** Spec 278: uma tentativa de entregar o documento ao motorista, na ordem (`attempt`). */
  | (EventBase &
      Readonly<{
        attempt: number
        channel: string
        documentKind: string
        driverName: null | string
        kind: 'contractor.reply.delivery'
        reason: null | string
        status: string
      }>)
  /** Spec 278: o motorista leu a mensagem com o documento. */
  | (EventBase & Readonly<{ documentKind: string; kind: 'contractor.reply.driver_read' }>)

export type OccurrenceTimelineTimings = Readonly<{
  contractorAskedAt: null | string
  contractorRepliedAt: null | string
  driverReleasedAt: null | string
  openSince: null | string
  openUntil: null | string
  /** Spec 276 T3: quando ficou solucionada pela última vez; ausente na API anterior. */
  resolvedAt?: null | string
}>

/** Spec 276 T3: os status da ocorrência, na ordem em que costumam acontecer (a mesma lista da API). */
export const OCCURRENCE_TIMELINE_STAGES = [
  'received',
  'in_progress',
  'awaiting_contractor',
  'awaiting_operator',
  'reply_received',
  'delivered',
  'reopened',
  'resolved',
  'cancelled',
] as const
export type OccurrenceTimelineStageName = (typeof OCCURRENCE_TIMELINE_STAGES)[number]

/** Os motivos de ir ao operador que têm frase própria; outro motivo mostra só a etapa. */
export const OCCURRENCE_TIMELINE_STAGE_REASONS = [
  'document_not_confirmed',
  'document_without_text',
  'multiple_attachments',
  'no_accepted_attachment',
] as const

/** Spec 278: os motivos de a entrega ao motorista não sair que têm frase própria (os da API para o motorista). */
export const OCCURRENCE_TIMELINE_DELIVERY_REASONS = [
  'driver_without_account',
  'driver_unreachable',
  'whatsapp_window_closed',
  'send_failed',
] as const

export type OccurrenceTimelineStage = Readonly<{
  actor: EventBase['actor']
  durationSeconds: null | number
  endedAt: null | string
  reason: null | string
  stage: OccurrenceTimelineStageName
  startedAt: string
  terminal: boolean
}>

export type OccurrenceTimeline = Readonly<{
  events: readonly OccurrenceTimelineEvent[]
  /** Spec 276 T3: ausente na API anterior — a tela simplesmente não mostra as etapas. */
  stages?: readonly OccurrenceTimelineStage[]
  timings: OccurrenceTimelineTimings
}>

/** Spec 278: `automatic` é o que o sistema fez sozinho (ator Sistema). */
export type OccurrenceTimelineFilter = 'all' | 'automatic' | 'contractor' | 'driver'

export const OCCURRENCE_TIMELINE_FILTERS: readonly OccurrenceTimelineFilter[] = [
  'all',
  'contractor',
  'driver',
  'automatic',
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

/** O evento de cancelamento é o mesmo fato do `cancellation` do detalhe — lê pela mesma conta pura. */
export function toOccurrenceCancellation(
  event: Extract<OccurrenceTimelineEvent, { kind: 'occurrence.cancelled' }>,
): OccurrenceCancellation {
  return {
    cancelledAt: event.occurredAt,
    cancelledByName: event.actor.name === null ? null : formatPersonName(event.actor.name),
    reason: event.reason,
  }
}

function isContractorMail(event: OccurrenceTimelineEvent): boolean {
  return (
    event.kind === 'contractor.mail.received' ||
    event.kind === 'contractor.mail.sent' ||
    event.kind === 'contractor.reply' ||
    event.kind === 'contractor.reply.document'
  )
}

/**
 * Contratante: o que ela fez e a conversa com ela (os e-mails, nos dois sentidos, inclusive o aviso
 * automático, e a conferência do documento dela). Motorista: o que ele fez. Automático (spec 278): só o
 * que o sistema fez. As conversas das Fases 4–6 entram pela mesma regra.
 */
export function filterOccurrenceTimelineEvents(
  events: readonly OccurrenceTimelineEvent[],
  filter: OccurrenceTimelineFilter,
): readonly OccurrenceTimelineEvent[] {
  if (filter === 'all') return events
  if (filter === 'contractor') {
    return events.filter((event) => event.actor.kind === 'contractor' || isContractorMail(event))
  }
  if (filter === 'automatic') return events.filter((event) => event.actor.kind === 'system')
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
    case 'occurrence.cancelled':
      return { key: 'occurrenceTimeline.event.cancelled', values: {} }
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
    case 'resolution.resolved':
      if (event.actor.kind === 'system') {
        return {
          key:
            event.phraseKey === 'contractor_reply_delivered'
              ? 'occurrenceTimeline.event.resolvedOnDelivery'
              : 'occurrenceTimeline.event.resolvedAutomatic',
          values: {},
        }
      }
      return {
        key: 'occurrenceTimeline.event.resolvedInternal',
        values: { name: formatPersonName(event.actor.name ?? ''), note: event.note ?? '' },
      }
    case 'resolution.reopened':
      return {
        key: 'occurrenceTimeline.event.reopened',
        values: { name: formatPersonName(event.actor.name ?? '') },
      }
    case 'contractor.reply':
      return {
        key: 'occurrenceTimeline.event.contractorReply',
        values: { status: `occurrenceTimeline.replyStatus.${event.toStatus}` },
      }
    case 'contractor.reply.document':
      return {
        key:
          event.result === 'confirmed'
            ? 'occurrenceTimeline.event.documentConfirmed'
            : 'occurrenceTimeline.event.documentNotConfirmed',
        values: {},
      }
    case 'contractor.reply.delivery':
      return { key: `occurrenceTimeline.event.${deliveryTitleKey(event)}`, values: {} }
    case 'contractor.reply.driver_read':
      return {
        key:
          event.documentKind === 'boleto'
            ? 'occurrenceTimeline.event.driverReadBoleto'
            : 'occurrenceTimeline.event.driverReadDocument',
        values: {},
      }
  }
}

const FAILED_DELIVERY_STATUSES: ReadonlySet<string> = new Set(['failed', 'skipped'])

function deliveryTitleKey(
  event: Extract<OccurrenceTimelineEvent, { kind: 'contractor.reply.delivery' }>,
): string {
  if (event.status === 'sent') {
    return event.documentKind === 'boleto' ? 'deliveredBoleto' : 'deliveredDocument'
  }
  return FAILED_DELIVERY_STATUSES.has(event.status) ? 'deliveryFailed' : 'deliveryPending'
}

function describeDeliveryDetail(
  event: Extract<OccurrenceTimelineEvent, { kind: 'contractor.reply.delivery' }>,
): OccurrenceTimelineSentence {
  if (event.status === 'sent') {
    const channel = event.channel === 'whatsapp' ? 'deliveredWhatsapp' : 'deliveredAppChat'
    const name = event.driverName === null ? '' : formatPersonName(event.driverName)
    return name === ''
      ? { key: `occurrenceTimeline.detail.${channel}Unnamed`, values: {} }
      : { key: `occurrenceTimeline.detail.${channel}`, values: { name } }
  }
  const reason = OCCURRENCE_TIMELINE_DELIVERY_REASONS.find((known) => known === event.reason)
  return reason === undefined
    ? { key: 'occurrenceTimeline.detail.deliveryAttempt', values: { attempt: event.attempt } }
    : {
        key: 'occurrenceTimeline.detail.deliveryFailed',
        values: { attempt: event.attempt, reason: `occurrenceTimeline.deliveryReason.${reason}` },
      }
}

/**
 * Spec 278: a linha de detalhe sob o título — o que a conferência achou, por onde e para quem o documento foi, por
 * que a entrega falhou, e o e-mail sem anexo que deixou o retorno aguardando. `null` quando não há o que dizer.
 * `reason` chega como chave de locale, como o `status` do título.
 */
export function describeOccurrenceTimelineEventDetail(
  event: OccurrenceTimelineEvent,
): null | OccurrenceTimelineSentence {
  switch (event.kind) {
    case 'contractor.reply.document': {
      if (event.result === 'without_text') {
        return { key: 'occurrenceTimeline.detail.documentWithoutText', values: {} }
      }
      const base = event.result === 'confirmed' ? 'documentConfirmed' : 'documentNotConfirmed'
      return event.invoiceNumber === null || event.invoiceNumber === ''
        ? { key: `occurrenceTimeline.detail.${base}WithoutNote`, values: {} }
        : { key: `occurrenceTimeline.detail.${base}`, values: { note: event.invoiceNumber } }
    }
    case 'contractor.reply.delivery':
      return describeDeliveryDetail(event)
    case 'contractor.mail.received':
      return event.awaitingAttachment === true
        ? { key: 'occurrenceTimeline.detail.awaitingAttachment', values: {} }
        : null
    default:
      return null
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

/**
 * Spec 276 T3: quanto a etapa durou. A terminal não tem duração (é o fim); a última em aberto conta com o
 * relógio da tela.
 */
export function resolveOccurrenceStageDuration(
  stage: OccurrenceTimelineStage,
  now: Date,
): null | OccurrenceTimelineDuration {
  if (stage.terminal) return null
  if (stage.durationSeconds !== null) return { running: false, seconds: stage.durationSeconds }
  return elapsed(stage.startedAt, stage.endedAt, now)
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
