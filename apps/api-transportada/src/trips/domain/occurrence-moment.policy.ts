/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF0, T1b.1b): a regra pura do conjunto de momentos de um tipo de ocorrência.
 *
 * `stage` e `flow` continuam gravados no tipo, derivados do conjunto: são a rede do rollback e o
 * que os leitores antigos (painel, relatórios) usam. A derivação a partir deles é a gêmea do
 * backfill da migration `occurrence_type_moments` — é o que a leitura tolerante usa para um tipo
 * sem linha de momento (gravado por código antigo durante a janela de deploy).
 */
import {
  acceptsOccurrenceMoment,
  OCCURRENCE_MOMENT,
  OCCURRENCE_MOMENTS,
  OCCURRENCE_TYPE_FLOWS,
  TRIP_OCCURRENCE_STAGE,
  type OccurrenceMoment,
  type OccurrenceTypeFlow,
  type TripOccurrenceStage,
} from '../../shared/trip-occurrence.constant.js'
import {
  OccurrenceTypeMomentsDocumentAndStopError,
  OccurrenceTypeMomentsRequiredError,
} from './occurrence-moment.error.js'

export type OccurrenceStageAndFlow = {
  readonly flow?: OccurrenceTypeFlow | undefined
  readonly stage: TripOccurrenceStage
}

export type ResolveOccurrenceTypeMomentsParams = OccurrenceStageAndFlow & {
  /** O gravado; vazio ou ausente é tipo sem linha de momento (ou dublê de teste). */
  readonly moments?: readonly OccurrenceMoment[] | undefined
}

/** A ordem canônica de `OCCURRENCE_MOMENTS`, sem repetição — comparar conjuntos vira comparar listas. */
export function normalizeOccurrenceMoments(
  moments: readonly OccurrenceMoment[],
): readonly OccurrenceMoment[] {
  const present = new Set(moments)
  return OCCURRENCE_MOMENTS.filter((moment) => present.has(moment))
}

/** A gêmea do backfill: o que todo leitor de hoje entende do par `stage`/`flow` (D-c inclusive). */
export function deriveOccurrenceMomentsFromStageAndFlow(
  params: OccurrenceStageAndFlow,
): readonly OccurrenceMoment[] {
  /** O tipo de recebimento (spec 237) é da chegada: nenhuma guarda de rua o aceita. */
  if (params.stage === TRIP_OCCURRENCE_STAGE.receiving) return []
  const isStop = params.flow === OCCURRENCE_TYPE_FLOWS.stop
  if (params.stage === TRIP_OCCURRENCE_STAGE.separation) {
    return isStop
      ? [OCCURRENCE_MOMENT.separation, OCCURRENCE_MOMENT.stop]
      : [OCCURRENCE_MOMENT.separation]
  }
  return isStop
    ? [OCCURRENCE_MOMENT.stop, OCCURRENCE_MOMENT.office]
    : [OCCURRENCE_MOMENT.document, OCCURRENCE_MOMENT.office]
}

/** Leitura tolerante: o gravado vence; sem linha, os derivados de `stage`/`flow`. */
export function resolveOccurrenceTypeMoments(
  params: ResolveOccurrenceTypeMomentsParams,
): readonly OccurrenceMoment[] {
  if (params.moments !== undefined && params.moments.length > 0) {
    return normalizeOccurrenceMoments(params.moments)
  }
  return deriveOccurrenceMomentsFromStageAndFlow(params)
}

/**
 * O par gravado para um conjunto: `stage = 'separation'` se e só se o galpão está nele (mantém a
 * CHECK de `leaves_document_behind`); `flow = 'stop'` se e só se há parada e não há nota.
 */
export function deriveStageAndFlowFromMoments(moments: readonly OccurrenceMoment[]): {
  readonly flow: OccurrenceTypeFlow
  readonly stage: TripOccurrenceStage
} {
  const present = new Set(moments)
  const isStop = present.has(OCCURRENCE_MOMENT.stop) && !present.has(OCCURRENCE_MOMENT.document)
  return {
    flow: isStop ? OCCURRENCE_TYPE_FLOWS.stop : OCCURRENCE_TYPE_FLOWS.document,
    stage: present.has(OCCURRENCE_MOMENT.separation)
      ? TRIP_OCCURRENCE_STAGE.separation
      : TRIP_OCCURRENCE_STAGE.delivery,
  }
}

/** O conjunto que o cadastro aceita gravar: ao menos um momento (T1b.6), e nunca nota com parada. */
export function assertOccurrenceMomentsAreWritable(moments: readonly OccurrenceMoment[]): void {
  if (moments.length === 0) throw new OccurrenceTypeMomentsRequiredError()
  const present = new Set(moments)
  if (present.has(OCCURRENCE_MOMENT.document) && present.has(OCCURRENCE_MOMENT.stop)) {
    throw new OccurrenceTypeMomentsDocumentAndStopError()
  }
}

/** Se o par `stage`/`flow` diz o conjunto inteiro — senão o tipo tem "vários momentos" (T1b.1b). */
export function isExpressedByStageAndFlow(params: ResolveOccurrenceTypeMomentsParams): boolean {
  const stored = resolveOccurrenceTypeMoments(params)
  const derived = deriveOccurrenceMomentsFromStageAndFlow(params)
  return (
    stored.length === derived.length && stored.every((moment, index) => moment === derived[index])
  )
}

export type OccurrenceTypeAcceptsMomentParams = {
  readonly moment: OccurrenceMoment
  readonly type: ResolveOccurrenceTypeMomentsParams
}

/**
 * Spec 246 (RF0b, T1b.2): a guarda de cada caso de uso, sobre o conjunto resolvido — o momento é o
 * fixo do caso de uso, nunca "algum momento que o papel cobre".
 */
export function occurrenceTypeAcceptsMoment(params: OccurrenceTypeAcceptsMomentParams): boolean {
  return acceptsOccurrenceMoment({
    moment: params.moment,
    moments: resolveOccurrenceTypeMoments(params.type),
  })
}
