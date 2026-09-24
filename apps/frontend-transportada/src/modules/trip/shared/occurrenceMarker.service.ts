/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 173: quem tem tratativa de ocorrência **aberta**, para a viagem marcar de relance.
 *
 * ⚠️ O campo é **opcional**: instalação com API anterior à spec 164 T15 não o manda. Ausente não é
 * "não tem ocorrência" — é "esta API não conta". As duas funções tratam a ausência como não marcar,
 * e a distinção fica aqui, num lugar só, em vez de virar `?? false` espalhado pela tela.
 */
export type OccurrenceMarkerSource = Readonly<{ openOccurrenceCase?: boolean }>

export function hasOpenOccurrenceMarker(document: OccurrenceMarkerSource): boolean {
  return document.openOccurrenceCase === true
}

/** Quantas notas da viagem estão com tratativa aberta — o número do resumo no cabeçalho. */
export function countDocumentsWithOpenOccurrence(
  documents: readonly OccurrenceMarkerSource[],
): number {
  return documents.filter(hasOpenOccurrenceMarker).length
}
