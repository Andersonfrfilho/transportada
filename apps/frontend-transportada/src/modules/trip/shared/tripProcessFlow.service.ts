/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentDetail, TripDocumentSeparationStatus } from './trip.types'

/**
 * As fases por onde a nota anda, na ordem da máquina de estados (ADR-0043 §1). `returned` fica de
 * fora: ela é **desvio**, não fase — pô-la na fila daria à fila um fim que não é o fim.
 */
export const TRIP_PROCESS_STAGES = ['pending', 'separated', 'loaded', 'delivered'] as const

export type TripProcessStage = (typeof TRIP_PROCESS_STAGES)[number]

export type TripProcessStageProgress = Readonly<{
  /** Quantas notas **já passaram** por esta fase — cumulativo, nunca só as paradas nela. */
  reached: number
  /** A fração que a alcançou, para a barra da fase avançar. */
  ratio: number
  stage: TripProcessStage
}>

export type TripProcessFlow = Readonly<{
  currentStage: TripProcessStage
  returned: number
  stages: readonly TripProcessStageProgress[]
  total: number
}>

const STAGE_INDEX: Readonly<Record<string, number>> = {
  delivered: 3,
  loaded: 2,
  pending: 0,
  separated: 1,
}

function reachedIndexOf(status: TripDocumentSeparationStatus): null | number {
  return STAGE_INDEX[status] ?? null
}

/**
 * A porcentagem por status dizia `Carregada 75% · Pendente 25%` — quatro números que somam cem e
 * não dizem em que fase a viagem está. Aqui a contagem é **cumulativa**: a nota carregada já passou
 * por separada, e contá-la só na coluna atual faria a fase anterior regredir enquanto o trabalho
 * anda.
 *
 * `null` quando não há nota: desenhar a fila vazia sugeriria viagem parada na primeira fase.
 */
export function buildTripProcessFlow(
  documents: readonly TripDocumentDetail[],
): null | TripProcessFlow {
  if (documents.length === 0) return null

  const total = documents.length
  const reachedByStage = TRIP_PROCESS_STAGES.map(() => 0)
  let returned = 0

  for (const document of documents) {
    const index = reachedIndexOf(document.separationStatus)
    if (index === null) {
      returned += 1
      continue
    }
    for (let stage = 0; stage <= index; stage += 1) {
      reachedByStage[stage] = (reachedByStage[stage] ?? 0) + 1
    }
  }

  const stages = TRIP_PROCESS_STAGES.map((stage, index) => ({
    ratio: total === 0 ? 0 : (reachedByStage[index] ?? 0) / total,
    reached: reachedByStage[index] ?? 0,
    stage,
  }))

  /** A fase atual é a última que **alguma** nota alcançou — é onde o trabalho está, não a média. */
  const lastReached = stages.reduce((found, stage, index) => (stage.reached > 0 ? index : found), 0)

  return {
    currentStage: TRIP_PROCESS_STAGES[lastReached] ?? 'pending',
    returned,
    stages,
    total,
  }
}
