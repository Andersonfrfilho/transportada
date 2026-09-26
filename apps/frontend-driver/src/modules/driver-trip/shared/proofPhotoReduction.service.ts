/* Copyright (c) 2026 Ada Technology. MIT License. */
import { encodeImageToJpeg, loadImageFromFile } from './occurrencePhotoImage.service'
import type { QueuedAttachment } from './offlineAttachments.service'

/**
 * Spec 212: o canhoto usa a régua do envio pelo escritório (`fieldDeliveryImage.service.ts` do
 * painel): lado maior de 2000 px e JPEG em degraus de qualidade até ~900 KiB.
 */
export const PROOF_PHOTO_MAX_SIDE = 2000
export const PROOF_PHOTO_TARGET_BYTES = 900 * 1024
/**
 * Teto duro, cópia de `OFFICE_PROOF_MAX_BYTES` da API (960 KiB): o corpo inteiro da requisição para
 * em 1 MiB (413 antes da rota), e acima de 960 KiB o arquivo volta 422 `TOO_LARGE`.
 */
export const PROOF_PHOTO_MAX_BYTES = 960 * 1024
/** Acima do teto mesmo no piso de qualidade, o lado cai 20% por tentativa, até um canhoto legível. */
const PROOF_PHOTO_SIDE_STEP = 0.8
const PROOF_PHOTO_MINIMUM_SIDE = 640

export type ReducedProofPhoto = Readonly<{ blob: Blob; fileName: string }>

/**
 * Pedido do usuário (26/09): toda foto sai leve do aparelho. O canhoto subia no tamanho da câmera
 * (3–5 MB) e a API recusa o corpo acima de 1 MiB — a foto ficava presa na fila como recusada. Só a
 * **foto** reduz: assinatura já é PNG pequeno, e PDF anexado não é imagem.
 */
export function shouldReduceProofFile(input: { file: Blob; kind: string }): boolean {
  return input.kind === 'photo' && input.file.type.startsWith('image/')
}

/** Pura: 2000, 1600, 1280, 1024… até o lado mínimo. */
export function buildProofPhotoSideSequence(): readonly number[] {
  const sides: number[] = []
  for (
    let side = PROOF_PHOTO_MAX_SIDE;
    side >= PROOF_PHOTO_MINIMUM_SIDE;
    side = Math.round(side * PROOF_PHOTO_SIDE_STEP)
  ) {
    sides.push(side)
  }
  return sides
}

/**
 * A primeira tentativa que cabe no teto encerra; nenhuma coube, fica a menor — a drenagem ainda a
 * leva, e a recusa volta com causa, como antes. `encode` é injetado para a régua ser testável sem
 * canvas.
 */
export async function fitProofPhotoWithinCap(input: {
  readonly encode: (maxSide: number) => Promise<Blob>
}): Promise<Blob> {
  let smallest: Blob | undefined
  for (const side of buildProofPhotoSideSequence()) {
    const blob = await input.encode(side)
    if (smallest === undefined || blob.size < smallest.size) smallest = blob
    if (blob.size <= PROOF_PHOTO_MAX_BYTES) return blob
  }
  if (smallest === undefined) throw new Error('PROOF_PHOTO_ENCODE_FAILED')
  return smallest
}

/** Impura: decodifica uma vez e reencoda pelo canvas, que descarta o EXIF (e o GPS) sozinho. */
export async function reduceProofPhotoToJpeg(file: File): Promise<ReducedProofPhoto> {
  const image = await loadImageFromFile(file)
  const blob = await fitProofPhotoWithinCap({
    encode: (maxSide) =>
      encodeImageToJpeg({ image, maxSide, targetBytes: PROOF_PHOTO_TARGET_BYTES }),
  })
  const baseName = file.name.replace(/\.[^./\\]+$/u, '') || 'canhoto'
  return { blob, fileName: `${baseName}.jpg` }
}

/**
 * A foto espera a redução (`pendingReduction`) quando nasce, ou quando ficou presa grande demais —
 * a recusa `413 PAYLOAD_TOO_LARGE`/`TRIP_DELIVERY_PROOF_TOO_LARGE` só acontece com arquivo acima do
 * teto, então o tamanho é o critério. Recusada com arquivo pequeno é outra causa: não se mexe.
 */
export function needsProofPhotoReduction(attachment: QueuedAttachment): boolean {
  if (!shouldReduceProofFile({ file: attachment.blob, kind: attachment.kind })) return false
  return attachment.pendingReduction === true || attachment.blob.size > PROOF_PHOTO_MAX_BYTES
}

function withoutReductionMarks(input: {
  readonly item: QueuedAttachment
  readonly isReplaced: boolean
}): QueuedAttachment {
  const next: { -readonly [Key in keyof QueuedAttachment]: QueuedAttachment[Key] } = {
    ...input.item,
  }
  delete next.pendingReduction
  /** O arquivo trocado é outro: a recusa era do anterior, e a drenagem automática volta a levá-lo. */
  if (input.isReplaced) delete next.rejectionCause
  return next
}

/**
 * Troca o arquivo do anexo ainda na fila pela versão reduzida, pela `attachmentKey` — no molde de
 * `applyAttachmentLocation`. Anexo que já saiu da fila fica como está: nada a trocar.
 */
export function replaceAttachmentBlob(input: {
  attachmentKey: string
  blob: Blob
  fileName: string
  items: readonly QueuedAttachment[]
}): readonly QueuedAttachment[] {
  return input.items.map((item) =>
    item.attachmentKey === input.attachmentKey
      ? {
          ...withoutReductionMarks({ isReplaced: true, item }),
          blob: input.blob,
          fileName: input.fileName,
        }
      : item,
  )
}

/** A redução falhou ou não ganhou nada: tira a marca, e o original sobe como está. */
export function clearPendingReduction(input: {
  attachmentKey: string
  items: readonly QueuedAttachment[]
}): readonly QueuedAttachment[] {
  return input.items.map((item) =>
    item.attachmentKey === input.attachmentKey
      ? withoutReductionMarks({ isReplaced: false, item })
      : item,
  )
}
