/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: a linha do tempo da ocorrência. Pura — recebe os fatos já lidos (registro, fotos,
 * tratativa da spec 164, e-mails da spec 143; as conversas das Fases 4–6 entram pela mesma porta) e
 * decide a ordem, o intervalo desde o evento anterior, os eventos-chave e os três tempos do topo.
 * **Leitura pura**: nada aqui decide a tratativa (spec 183 D4).
 */

import {
  CONTRACTOR_REPLY_STATUSES,
  CONTRACTOR_REPLY_WAITING_STATUSES,
} from '../../shared/occurrence-contractor-reply.constant.js'
import type { SystemResolutionPhraseKey } from './occurrence-resolution.types.js'

/** Os quatro atores, os mesmos dos balões das conversas — a cor é do ator, não do evento. */
export type OccurrenceTimelineActorKind = 'contractor' | 'driver' | 'operation' | 'system'

export type OccurrenceTimelineActor = {
  readonly kind: OccurrenceTimelineActorKind
  readonly name: null | string
}

/** Spec 278 D1: o resultado da conferência do boleto, como a linha do tempo o mostra. */
export const OCCURRENCE_TIMELINE_DOCUMENT_CHECK_RESULTS = [
  'confirmed',
  'not_confirmed',
  'without_text',
] as const
export type OccurrenceTimelineDocumentCheckResult =
  (typeof OCCURRENCE_TIMELINE_DOCUMENT_CHECK_RESULTS)[number]

/** Spec 278: por onde o documento foi ao motorista. */
export type OccurrenceTimelineDeliveryChannel = 'app_chat' | 'whatsapp'

/** Spec 278: o que o retorno pede — o boleto conferido (`boleto_pdf`) ou outro documento. */
export type OccurrenceTimelineDocumentKind = 'boleto' | 'document'

type SourceBase = {
  readonly actor: OccurrenceTimelineActor
  readonly id: string
  readonly occurredAt: string
}

export type OccurrenceTimelineSource =
  | (SourceBase & { readonly kind: 'occurrence.recorded' })
  | (SourceBase & { readonly kind: 'occurrence.photo'; readonly photoCount: number })
  | (SourceBase & { readonly kind: 'occurrence.cancelled'; readonly reason: string })
  | (SourceBase & {
      readonly fromStatus: null | string
      readonly kind: 'case.transition'
      readonly note: string
      readonly toStatus: string
    })
  | (SourceBase & {
      /**
       * Spec 278 D6: só na recebida — quantos anexos a mensagem da conversa (183) ligada a este e-mail trouxe;
       * `null` sem mensagem ligada. Ausente vale `null`.
       */
      readonly attachmentCount?: null | number
      /**
       * Spec 278 D6: calculado aqui, nunca lido — o e-mail chegou sem anexo com o retorno da 248 ainda aguardando
       * (a 276 T1 o ignora e o retorno segue esperando o documento). Só na recebida.
       */
      readonly awaitingAttachment?: boolean
      readonly deliveryStatus: null | string
      readonly interpretation: null | string
      readonly kind: 'contractor.mail.received' | 'contractor.mail.sent'
    })
  /** Spec 266 / ADR-0105: o escritório (ou a tratativa, como sistema) resolveu; `note` nulo no sistema. */
  | (SourceBase & {
      readonly kind: 'resolution.resolved'
      readonly note: null | string
      readonly phraseKey: null | SystemResolutionPhraseKey
    })
  /** Spec 266 / ADR-0105: o motorista reabriu respondendo; `messageId` é a mensagem que reabriu. */
  | (SourceBase & { readonly kind: 'resolution.reopened'; readonly messageId: string })
  /**
   * Spec 276 T3: o retorno da contratante (248) mudou de status — a abertura do retorno entra como
   * `awaiting_contractor`. Só o status e o motivo, nunca o anexo nem a nota do operador.
   */
  | (SourceBase & {
      readonly kind: 'contractor.reply'
      readonly reason: null | string
      readonly toStatus: string
    })
  /**
   * Spec 278 D1: o resultado da conferência do boleto (276 T2), lido do motivo do evento do retorno. `toStatus` é
   * o status a que o retorno foi com ela (ordena no mesmo instante); `invoiceNumber` é o número da nota.
   */
  | (SourceBase & {
      readonly invoiceNumber: null | string
      readonly kind: 'contractor.reply.document'
      readonly result: OccurrenceTimelineDocumentCheckResult
      readonly toStatus: string
    })
  /**
   * Spec 278 D5: uma tentativa de entrega do documento ao motorista (app ou WhatsApp), na ordem do retorno.
   * `driverName` é o motorista da conversa; nulo quando não houve mensagem (sem conta, por exemplo).
   */
  | (SourceBase & {
      readonly attempt: number
      readonly channel: OccurrenceTimelineDeliveryChannel
      readonly documentKind: OccurrenceTimelineDocumentKind
      readonly driverName: null | string
      readonly kind: 'contractor.reply.delivery'
      readonly reason: null | string
      readonly status: string
    })
  /** Spec 278 D4: o motorista leu a mensagem que a entrega gravou (`status_times.read`). */
  | (SourceBase & {
      readonly documentKind: OccurrenceTimelineDocumentKind
      readonly kind: 'contractor.reply.driver_read'
    })
  /**
   * Spec 281 T9: uma tentativa de mandar o boleto ao cliente por WhatsApp (o alvo `client_boleto_whatsapp`). Só o
   * status e o motivo: nunca o número, o texto nem o anexo.
   */
  | (SourceBase & {
      readonly kind: 'contractor.client.whatsapp'
      readonly reason: null | string
      readonly status: string
    })

export type OccurrenceTimelineEvent = OccurrenceTimelineSource & {
  readonly isKey: boolean
  /** `null` no primeiro evento; segundos inteiros desde o evento anterior. */
  readonly sincePreviousSeconds: null | number
}

/**
 * Os três tempos do topo, como instantes — a tela conta a duração com o relógio dela, e o tempo de
 * ocorrência aberta segue correndo sem nova leitura. `openUntil` nulo é ocorrência ainda aberta;
 * terminal da tratativa e cancelamento da ocorrência (spec 240) fecham o relógio.
 */
export type OccurrenceTimelineTimings = {
  readonly contractorAskedAt: null | string
  readonly contractorRepliedAt: null | string
  readonly driverReleasedAt: null | string
  readonly openSince: null | string
  readonly openUntil: null | string
  /** Spec 276 T3: quando a ocorrência ficou solucionada pela última vez; nulo se não está solucionada agora. */
  readonly resolvedAt: null | string
}

/** Spec 276 T3: os status da ocorrência, na ordem em que costumam acontecer. */
export const OCCURRENCE_STAGES = [
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
export type OccurrenceStage = (typeof OCCURRENCE_STAGES)[number]

const TERMINAL_STAGES: ReadonlySet<OccurrenceStage> = new Set(['cancelled', 'resolved'])

/**
 * Uma etapa: quando começou, quem a começou e quanto durou. A última não terminal tem `endedAt` nulo e a
 * tela conta a duração com o relógio dela; a terminal não tem duração (é o fim).
 */
export type OccurrenceTimelineStage = {
  readonly actor: OccurrenceTimelineActor
  readonly durationSeconds: null | number
  readonly endedAt: null | string
  /** Só em `awaiting_operator`: o motivo do retorno (ex.: `document_not_confirmed`). */
  readonly reason: null | string
  readonly stage: OccurrenceStage
  readonly startedAt: string
  readonly terminal: boolean
}

export type OccurrenceTimeline = {
  readonly events: readonly OccurrenceTimelineEvent[]
  readonly stages: readonly OccurrenceTimelineStage[]
  readonly timings: OccurrenceTimelineTimings
}

/** No mesmo instante o registro vem primeiro, depois as fotos, a tratativa, os e-mails e o cancelamento. */
const KIND_PRIORITY: Readonly<Record<OccurrenceTimelineSource['kind'], number>> = {
  'case.transition': 2,
  'contractor.mail.received': 4,
  'contractor.client.whatsapp': 5,
  'contractor.mail.sent': 3,
  'contractor.reply': 5,
  'contractor.reply.delivery': 5,
  'contractor.reply.document': 5,
  'contractor.reply.driver_read': 5,
  'occurrence.cancelled': 6,
  'occurrence.photo': 1,
  'occurrence.recorded': 0,
  'resolution.reopened': 8,
  'resolution.resolved': 7,
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

function replyStatusRank(status: string): number {
  const rank = (CONTRACTOR_REPLY_STATUSES as readonly string[]).indexOf(status)
  return rank === -1 ? CONTRACTOR_REPLY_STATUSES.length : rank
}

/**
 * O lugar de cada fato do retorno no mesmo instante: a conferência logo antes da transição que ela causou, a
 * entrega logo antes de "entregue", a leitura depois. `undefined` fora do retorno.
 */
function replyGroupRank(source: OccurrenceTimelineSource): number | undefined {
  const delivered = replyStatusRank('delivered') * 3
  switch (source.kind) {
    case 'contractor.reply.document':
      return replyStatusRank(source.toStatus) * 3
    case 'contractor.reply':
      return replyStatusRank(source.toStatus) * 3 + 1
    case 'contractor.reply.delivery':
      return delivered
    case 'contractor.reply.driver_read':
      return delivered + 2
    default:
      return undefined
  }
}

function compareSources(left: OccurrenceTimelineSource, right: OccurrenceTimelineSource): number {
  const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
  if (byTime !== 0) return byTime
  const byKind = KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind]
  if (byKind !== 0) return byKind
  /**
   * O retorno que recebe e entrega na mesma transação grava os eventos com o mesmo `now()`: a ordem é a do
   * vocabulário (conferido, recebido, entregue), nunca a do id aleatório.
   */
  const leftRank = replyGroupRank(left)
  const rightRank = replyGroupRank(right)
  if (leftRank !== undefined && rightRank !== undefined && leftRank !== rightRank) {
    return leftRank - rightRank
  }
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
  /** Spec 278: o boleto conferido e o documento entregue ao motorista são marcos. */
  if (source.kind === 'contractor.reply.document') return source.result === 'confirmed'
  if (source.kind === 'contractor.reply.delivery') return source.status === 'sent'
  if (source.kind === 'contractor.client.whatsapp') return source.status === 'sent'
  if (source.kind === 'resolution.resolved' || source.kind === 'resolution.reopened') return true
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

  const closedAt = [
    transitions.find((source) => CLOSING_STATUSES.has(source.toStatus)),
    sources.find((source) => source.kind === 'occurrence.cancelled'),
  ]
    .flatMap((source) => (source === undefined ? [] : [source.occurredAt]))
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0]

  return {
    contractorAskedAt: asked?.occurredAt ?? null,
    contractorRepliedAt: replied?.occurredAt ?? null,
    driverReleasedAt:
      transitions.find((source) => RELEASING_STATUSES.has(source.toStatus))?.occurredAt ?? null,
    openSince: recorded?.occurredAt ?? null,
    openUntil: closedAt ?? null,
    resolvedAt: null,
  }
}

const CASE_STAGE: Readonly<Record<string, OccurrenceStage>> = {
  awaiting_contractor: 'awaiting_contractor',
  closed: 'resolved',
  decided: 'reply_received',
  returned_to_warehouse: 'resolved',
  under_review: 'in_progress',
}

const REPLY_STAGE: Readonly<Record<string, OccurrenceStage>> = {
  awaiting_contractor: 'awaiting_contractor',
  awaiting_operator: 'awaiting_operator',
  delivered: 'delivered',
  handled: 'in_progress',
  needs_operator: 'awaiting_operator',
  overdue: 'awaiting_contractor',
  reply_received: 'reply_received',
}

/**
 * Para onde cada fato leva a ocorrência; `undefined` não muda a etapa. Com o retorno da 248 aberto, quem diz
 * se a contratante respondeu é ele — o e-mail "Solicitado" sem o documento não é a resposta.
 */
function stageAfter(
  source: OccurrenceTimelineSource,
  current: OccurrenceStage | undefined,
  hasContractorReply: boolean,
): OccurrenceStage | undefined {
  switch (source.kind) {
    case 'occurrence.recorded':
      return 'received'
    case 'occurrence.cancelled':
      return 'cancelled'
    case 'resolution.resolved':
      return 'resolved'
    case 'resolution.reopened':
      return 'reopened'
    case 'case.transition':
      return CASE_STAGE[source.toStatus]
    case 'contractor.reply':
      return REPLY_STAGE[source.toStatus]
    case 'contractor.mail.sent':
      return current === 'received' || current === 'in_progress' || current === 'reopened'
        ? 'awaiting_contractor'
        : undefined
    case 'contractor.mail.received':
      return !hasContractorReply &&
        current === 'awaiting_contractor' &&
        !NON_REPLY_INTERPRETATIONS.has(source.interpretation ?? '')
        ? 'reply_received'
        : undefined
    case 'occurrence.photo':
    case 'contractor.reply.delivery':
    case 'contractor.reply.document':
    case 'contractor.reply.driver_read':
    case 'contractor.client.whatsapp':
      return undefined
  }
}

function resolveStages(
  sources: readonly OccurrenceTimelineSource[],
): readonly OccurrenceTimelineStage[] {
  const hasContractorReply = sources.some((source) => source.kind === 'contractor.reply')
  const started: { source: OccurrenceTimelineSource; stage: OccurrenceStage }[] = []
  for (const source of sources) {
    const current = started.at(-1)?.stage
    /** Depois de cancelada nada reabre a etapa: o cancelamento vence o histórico (spec 266). */
    if (current === 'cancelled') break
    const next = stageAfter(source, current, hasContractorReply)
    if (next === undefined || next === current) continue
    started.push({ source, stage: next })
  }
  return started.map(({ source, stage }, index): OccurrenceTimelineStage => {
    const following = started[index + 1]
    const terminal = TERMINAL_STAGES.has(stage)
    const endedAt = following?.source.occurredAt ?? null
    return {
      actor: source.actor,
      durationSeconds:
        endedAt === null
          ? null
          : Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(source.occurredAt)) / 1000)),
      endedAt,
      /** Spec 278: só a ida ao operador tem motivo; o aceite guarda `document_confirmed`, que não é motivo de etapa. */
      reason:
        stage === 'awaiting_operator' &&
        source.kind === 'contractor.reply' &&
        source.toStatus === 'needs_operator'
          ? source.reason
          : null,
      stage,
      startedAt: source.occurredAt,
      terminal: terminal && following === undefined,
    }
  })
}

const WAITING_REPLY_STATUSES: ReadonlySet<string> = new Set(CONTRACTOR_REPLY_WAITING_STATUSES)

/**
 * Spec 278 D6: o e-mail recebido sem anexo enquanto o retorno aguardava — a 276 T1 o ignora, e o retorno segue
 * esperando o documento. O status do retorno é o do último evento dele até ali (a abertura entra como aguardando).
 */
function markAwaitingAttachment(
  ordered: readonly OccurrenceTimelineSource[],
): readonly OccurrenceTimelineSource[] {
  let replyStatus: string | undefined
  return ordered.map((source) => {
    if (source.kind === 'contractor.reply') replyStatus = source.toStatus
    if (source.kind !== 'contractor.mail.received') return source
    return {
      ...source,
      awaitingAttachment:
        source.attachmentCount === 0 &&
        replyStatus !== undefined &&
        WAITING_REPLY_STATUSES.has(replyStatus),
    }
  })
}

export function buildOccurrenceTimeline(input: {
  readonly sources: readonly OccurrenceTimelineSource[]
}): OccurrenceTimeline {
  const ordered = markAwaitingAttachment(mergePhotos([...input.sources].sort(compareSources)))
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
  const stages = resolveStages(ordered)
  const last = stages.at(-1)
  return {
    events,
    stages,
    timings: {
      ...resolveTimings(ordered),
      resolvedAt: last?.stage === 'resolved' ? last.startedAt : null,
    },
  }
}
