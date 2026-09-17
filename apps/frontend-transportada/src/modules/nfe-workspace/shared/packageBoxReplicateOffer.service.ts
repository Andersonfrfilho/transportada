/* Copyright (c) 2026 Ada Technology. MIT License. */

export type ReplicateDimensions = Readonly<{
  heightMm: number
  lengthMm: number
  unitsPerBox: number
  widthMm: number
}>

export type ReplicateOfferBox = Readonly<{
  familyPendingCount: number
  id: string
  measuredAt: null | string
}>

export type ReplicateOffer = Readonly<{
  boxId: string
  dimensions: ReplicateDimensions
}>

/**
 * Spec 155 (D9, G010), T14 (revisão final, ALTO-2/MÉDIO-2): quantos pendentes sobram na família
 * **além da própria caixa** decide a oferta — extraída do efeito que reagia a `saveStatus` (o
 * painel chama esta função dentro do `onSuccess` de cada gravação, nunca mais por um efeito que
 * reage ao estado global da mutação).
 *
 * ⚠️ MÉDIO-2: `familyPendingCount` só inclui a própria caixa quando ela **ainda estava pendente**
 * antes desta gravação (`measuredAt === null`) — o contador da D9 já conta quem remede como medida,
 * nunca como pendente. Subtrair sempre fazia a oferta sumir ao remedir a penúltima caixa pendente
 * da família: a conta descontava uma caixa que o contador nunca tinha somado.
 */
export function resolveReplicateOffer(
  input: Readonly<{ box: ReplicateOfferBox; dimensions: ReplicateDimensions }>,
): ReplicateOffer | undefined {
  const otherPendingCount = input.box.familyPendingCount - (input.box.measuredAt === null ? 1 : 0)
  if (otherPendingCount < 1) return undefined
  return { boxId: input.box.id, dimensions: input.dimensions }
}

/**
 * Re-revisão (B1, spec 155 T3.5): uma oferta nova (do `onSuccess` de medir, ou de "aplicar a
 * todos") nunca substitui um diálogo já aberto nem entra por cima de uma réplica em gravação — a
 * troca de `boxId`/`dimensions` embaixo do conferente no meio da conferência é o próprio risco que
 * o diálogo existe para evitar (D5).
 */
export function shouldOpenReplicateDialog(
  input: Readonly<{ replicateDialogOpen: boolean; replicateSaving: boolean }>,
): boolean {
  return !input.replicateDialogOpen && !input.replicateSaving
}
