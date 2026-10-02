/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 RF-A2/RF-A3: do maço de notas marcadas, o que o diálogo de conferência oferece — só o
 * canhoto que ainda espera veredito. Puro porque o teste desta app não tem DOM para a tela inteira:
 * o recorte, a contagem do que ficou de fora e o teto de itens se provam na função.
 */
import { CANHOTO_BATCH_MAX_ITEMS } from './canhotoBatch.constant'
import type { DeliveryProof } from './deliveryProof.service'
import type { TripDocumentDetail, TripStatus } from './trip.types'
import { tripDocumentLabel } from './tripDocument.service'

/** O item de `GET /trips/:id/delivery-proofs`: o comprovante de uma nota mais a nota a que pertence. */
export type TripDeliveryProof = DeliveryProof & Readonly<{ documentId: string }>

export type CanhotoBatchItem = Readonly<{
  documentId: string
  /** Número e série impressos na etiqueta — o nome com que o galpão chama a nota. */
  label: string
  proof: TripDeliveryProof
}>

export type CanhotoBatchSelection = Readonly<{
  /** O que o diálogo mostra, na ordem das notas da viagem e até o teto. */
  eligible: readonly CanhotoBatchItem[]
  /** Notas marcadas sem canhoto a conferir; `0` quando nada é oferecido, para o aviso não falar de um botão ausente. */
  excludedCount: number
  /** Canhotos pendentes que passaram do teto — ficam para a rodada seguinte, não são "de fora". */
  overflowCount: number
}>

type SelectionDocument = Pick<
  TripDocumentDetail,
  'freightCalculationId' | 'id' | 'nfeDocumentId' | 'nfeNumber' | 'nfeSeries' | 'releasedAt'
>

export type ResolveCanhotoBatchSelectionInput = Readonly<{
  documents: readonly SelectionDocument[]
  proofs: readonly TripDeliveryProof[]
  selectedIds: ReadonlySet<string>
  tripStatus: TripStatus
}>

/**
 * A rota de conferência (`lockCanhotoProof`) age sobre o canhoto **mais recente** da nota; escolher
 * outro aqui mostraria uma foto e aprovaria a de baixo. Só quem carrega `canhotoReview` é canhoto —
 * assinatura e foto de carga não têm a chave.
 */
function pickLatestCanhotoByDocument(
  proofs: readonly TripDeliveryProof[],
): ReadonlyMap<string, TripDeliveryProof> {
  const latest = new Map<string, TripDeliveryProof>()
  for (const proof of proofs) {
    if (proof.kind !== 'photo' || proof.canhotoReview === undefined) continue
    const current = latest.get(proof.documentId)
    const isNewer =
      current === undefined ||
      proof.createdAt > current.createdAt ||
      (proof.createdAt === current.createdAt && proof.id > current.id)
    if (isNewer) latest.set(proof.documentId, proof)
  }
  return latest
}

export function resolveCanhotoBatchSelection(
  input: ResolveCanhotoBatchSelectionInput,
): CanhotoBatchSelection {
  if (input.tripStatus === 'cancelled') return { eligible: [], excludedCount: 0, overflowCount: 0 }

  const latestCanhoto = pickLatestCanhotoByDocument(input.proofs)
  const markedDocuments = input.documents.filter((document) => input.selectedIds.has(document.id))
  const pending: CanhotoBatchItem[] = []
  for (const document of markedDocuments) {
    const proof = latestCanhoto.get(document.id)
    if (document.releasedAt !== null || proof?.canhotoReview !== 'pending') continue
    pending.push({ documentId: document.id, label: tripDocumentLabel(document), proof })
  }

  if (pending.length === 0) return { eligible: [], excludedCount: 0, overflowCount: 0 }
  return {
    eligible: pending.slice(0, CANHOTO_BATCH_MAX_ITEMS),
    excludedCount: markedDocuments.length - pending.length,
    overflowCount: Math.max(0, pending.length - CANHOTO_BATCH_MAX_ITEMS),
  }
}
