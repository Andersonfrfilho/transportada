/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread` da planta (spec 145 D9). O empacotamento é CPU puro — 17 s numa viagem de
 * 51 paradas — e no processo principal pararia a emissão de CT-e, MDF-e e NFS-e junto.
 *
 * Sem rede, sem banco e **sem log**: a entrada carrega rótulo de parada e cliente, que são PII.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { resolveCargoLayout, type ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import type { StoredCargoLayoutInput } from '../application/stored-cargo-layout-input.schema.js'

export type CargoLayoutWorkerData = Readonly<{
  budgetMs: number
  input: StoredCargoLayoutInput
}>

/**
 * O prazo nasce **aqui dentro**: calculado fora, o tempo de subir a thread e de clonar a entrada sairia
 * do orçamento do empacotador.
 */
export function computeCargoLayout(
  params: CargoLayoutWorkerData & { readonly now?: () => number },
): ResolvedCargoLayout | null {
  const now = params.now ?? Date.now
  const {
    bedDimensions,
    capacityM3,
    fallbackBoxVolumeM3,
    loadingAccess,
    measuredShapes,
    payloadRatio,
    securesCargo,
    stops,
  } = params.input

  return resolveCargoLayout({
    bedDimensions,
    capacityM3,
    deadline: now() + params.budgetMs,
    fallbackBoxVolumeM3,
    loadingAccess,
    measuredShapes,
    now,
    payloadRatio,
    securesCargo,
    stops,
  })
}

if (parentPort !== null) {
  const port = parentPort
  try {
    port.postMessage({ layout: computeCargoLayout(workerData as CargoLayoutWorkerData), ok: true })
  } catch (error: unknown) {
    // Só a forma do erro atravessa: a mensagem pode citar o rótulo da parada
    port.postMessage({ ok: false, reason: error instanceof Error ? error.name : 'unknown' })
  }
}
