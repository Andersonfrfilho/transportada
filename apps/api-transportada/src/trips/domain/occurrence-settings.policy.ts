/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: o que a tela de configuração do aviso mostra.
 */
import { TRIP_OCCURRENCE_TYPES } from '../../shared/trip-occurrence.constant.js'
import type {
  TripOccurrenceStage,
  TripOccurrenceType,
} from '../../shared/trip-occurrence.constant.js'

export type OccurrenceNotificationSettingRecord = {
  readonly notifies: boolean
  readonly type: string
}

export type OccurrenceNotificationEntry = {
  readonly notifies: boolean
  readonly stage: TripOccurrenceStage
  readonly type: TripOccurrenceType
}

/**
 * ⚠️ **Os sete tipos, sempre.** Listar só o que já foi configurado esconderia justamente os que
 * ninguém ligou — e são esses que o operador procura ao abrir esta tela.
 *
 * O **catálogo é a fonte**: configuração de tipo que saiu do catálogo não aparece, em vez de virar
 * uma linha órfã que ninguém sabe o que faz.
 */
export function buildOccurrenceNotificationView(input: {
  readonly settings: readonly OccurrenceNotificationSettingRecord[]
}): readonly OccurrenceNotificationEntry[] {
  const byType = new Map(input.settings.map((record) => [record.type, record.notifies]))

  return TRIP_OCCURRENCE_TYPES.map((entry) => ({
    notifies: byType.get(entry.type) ?? false,
    stage: entry.stage,
    type: entry.type,
  }))
}
