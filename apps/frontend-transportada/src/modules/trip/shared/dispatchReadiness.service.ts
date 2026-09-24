/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentDetail } from './trip.types'

/**
 * Spec 185 T6.1 (D1, ADR-0074 §4): cópia por valor de `resolveDispatchReadiness`
 * (`apps/api-transportada/src/trips/domain/dispatch-readiness.policy.ts`) — a mesma conta de
 * "carga fechada", restatada aqui para o diálogo "leva todas" contar, no cliente, quantas notas o
 * botão vai carregar antes de a resposta do servidor chegar (mesmo espírito de
 * `cteSelection.service.ts`: cópia por valor, contrato dos dois lados). Se as duas divergirem, o
 * diálogo promete um número que o servidor não confirma.
 */
export type ResolveDispatchReadinessResult = Readonly<{
  /** Nenhuma nota deixada para trás e ao menos uma viva carregada. */
  isCargoClosed: boolean
  /** Notas vivas, não carregadas, com ocorrência que as tira da conta (`leavesBehindOnDispatch`). */
  leftBehindCount: number
  /** Notas vivas, não carregadas, sem ocorrência — as que "Despachar" vai separar e carregar. */
  toLoadCount: number
}>

function isAlive(document: TripDocumentDetail): boolean {
  return document.releasedAt === null && document.separationStatus !== 'returned'
}

function isLoadedOrDelivered(document: TripDocumentDetail): boolean {
  return document.separationStatus === 'loaded' || document.separationStatus === 'delivered'
}

export function resolveDispatchReadiness(input: {
  readonly documents: readonly TripDocumentDetail[]
}): ResolveDispatchReadinessResult {
  const alive = input.documents.filter(isAlive)

  let toLoadCount = 0
  let leftBehindCount = 0
  let loadedCount = 0

  for (const document of alive) {
    if (isLoadedOrDelivered(document)) {
      loadedCount += 1
      continue
    }
    /** Ausente é API anterior ao campo (spec 078 D2) — degrada para "não deixa a nota para trás". */
    if (document.leavesBehindOnDispatch === true) leftBehindCount += 1
    else toLoadCount += 1
  }

  return {
    isCargoClosed: toLoadCount === 0 && loadedCount >= 1,
    leftBehindCount,
    toLoadCount,
  }
}
