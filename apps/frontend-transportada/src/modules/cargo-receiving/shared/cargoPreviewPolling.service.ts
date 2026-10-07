/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CARGO_PREVIEW_LIMITS, CARGO_PREVIEW_PENDING_STATUSES } from './cargoPreview.constant'
import type { CargoPreviewStatus } from './cargoPreview.types'

function isPending(status: CargoPreviewStatus): boolean {
  return CARGO_PREVIEW_PENDING_STATUSES.some((pending) => pending === status)
}

/**
 * O worker lê a planilha em segundos: enquanto alguma prévia está na fila ou sendo lida a tela repete a
 * leitura; assentou (pronta ou falhou), o intervalo vira `false` e a repetição para sozinha — nunca fica um
 * relógio ligado atrás de uma tela que já tem a resposta.
 */
export function resolveCargoPreviewRefetchInterval(
  statuses: readonly CargoPreviewStatus[],
): number | false {
  return statuses.some(isPending) ? CARGO_PREVIEW_LIMITS.refetchIntervalMs : false
}
