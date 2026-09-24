/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripTimelineItem } from './trip.types'

/**
 * Spec 180 RF16/RF17 (CA14/CA16): só oferece expandir quando o item tem algo a mostrar além de
 * título, hora e autoria — motivo da devolução, motivo do encerramento, observação ou foto da
 * ocorrência. Um controle que abre o vazio é pior que nenhum controle. Espelha as mesmas condições
 * que `TripTimeline.component.tsx` já usava para desenhar cada detalhe, só que testável sozinha e
 * reaproveitável para decidir se o botão de expandir aparece.
 */
export function hasTripTimelineExpandableDetail(item: TripTimelineItem): boolean {
  if (item.kind === 'document.returned' && item.returnReason !== null && item.returnReason !== '') {
    return true
  }

  if (
    item.kind === 'trip.status_changed' &&
    item.toStatus === 'completed' &&
    item.closeReason !== null &&
    item.closeReason !== ''
  ) {
    return true
  }

  if (item.kind === 'stop.occurrence' || item.kind === 'document.occurrence') {
    if (item.occurrence === null) return false
    const hasNote = item.occurrence.note !== ''
    const hasAttachments =
      item.occurrence.attachmentCount !== undefined && item.occurrence.attachmentCount > 0
    return hasNote || hasAttachments
  }

  return false
}
