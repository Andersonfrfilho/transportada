/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentDetail, TripDocumentSeparationStatus, TripStatus } from './trip.types'

/**
 * As fases por onde a nota anda, na ordem da máquina de estados (ADR-0043 §1), mais "despachada"
 * (spec 185, ADR-0074 §6) entre "carregada" e "entregue". `returned` fica de fora: ela é **desvio**,
 * não fase — pô-la na fila daria à fila um fim que não é o fim.
 */
export const TRIP_PROCESS_STAGES = [
  'pending',
  'separated',
  'loaded',
  'dispatched',
  'delivered',
] as const

export type TripProcessStage = (typeof TRIP_PROCESS_STAGES)[number]

/** As quatro fases que a **nota**, sozinha, percorre — "despachada" não é uma delas (é da viagem). */
const DOCUMENT_STAGES = ['pending', 'separated', 'loaded', 'delivered'] as const

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
 * Spec 185 (ADR-0074 §6): `dispatched` passa a significar "carga fechada" — não existe
 * `separationStatus: 'dispatched'`, então a fase não vem de nota nenhuma: é a viagem inteira que a
 * alcança de uma vez, quando `trips.status` chega lá (nunca meio despachada).
 */
const TRIP_DISPATCHED_OR_BEYOND_STATUSES: ReadonlySet<TripStatus> = new Set([
  'dispatched',
  'in_transit',
  'on_delivery_route',
  'completed',
])

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
  tripStatus: TripStatus,
): null | TripProcessFlow {
  if (documents.length === 0) return null

  const total = documents.length
  const reachedByDocumentStage = DOCUMENT_STAGES.map(() => 0)
  let returned = 0

  for (const document of documents) {
    const index = reachedIndexOf(document.separationStatus)
    if (index === null) {
      returned += 1
      continue
    }
    for (let stage = 0; stage <= index; stage += 1) {
      reachedByDocumentStage[stage] = (reachedByDocumentStage[stage] ?? 0) + 1
    }
  }

  /**
   * A viagem despacha de uma vez — não há nota "meio despachada". Quando o status chega lá, toda
   * nota viva (a devolvida continua fora, mesma régua das outras fases) conta para a fase.
   */
  const isDispatched = TRIP_DISPATCHED_OR_BEYOND_STATUSES.has(tripStatus)
  const dispatchedReached = isDispatched ? total - returned : 0

  const stages = TRIP_PROCESS_STAGES.map((stage) => {
    const reached =
      stage === 'dispatched'
        ? dispatchedReached
        : (reachedByDocumentStage[DOCUMENT_STAGES.indexOf(stage)] ?? 0)
    return { ratio: total === 0 ? 0 : reached / total, reached, stage }
  })

  /** A fase atual é a última que **alguma** nota (ou a viagem, no caso de "despachada") alcançou. */
  const lastReached = stages.reduce((found, stage, index) => (stage.reached > 0 ? index : found), 0)

  return {
    currentStage: TRIP_PROCESS_STAGES[lastReached] ?? 'pending',
    returned,
    stages,
    total,
  }
}
